/**
 * runner.ts — Idempotent "run daily autonomous generation" service.
 *
 * Invariants:
 * - At most one successful run per (workspace_id, run_date).
 * - Stale "running" rows older than STALE_RUN_MINUTES are recovered and re-run.
 * - Tasks are inserted directly into the DB (no HTTP round-trip).
 * - On any error, the run row is marked 'failed' with an error_message.
 * - AUTONOMOUS.md is never written by this module.
 * - Completions are appended to tasks-log.md via log.ts.
 */

import { v4 as uuidv4 } from 'uuid';
import { queryOne, queryAll, run as dbRun, transaction } from '@/lib/db';
import { broadcast } from '@/lib/events';
import type { AutonomousConfig, AutonomousRun, GenerationResult } from './types';
import { parseStructuredGoals, resolveGoalsPath, recentLogEntries } from './parser';
import { logTaskCreated, logTaskSkipped } from './log';
import { deduplicateProposals } from './dedup';
import { generateDailyProposals } from './generator';
import {
  activeGoalTag,
  getCoordinatorIntegrationBoundaries,
  planCoordinatorLanes,
  resolveGoalTagFromStructuredGoals,
  toAutonomousTaskDraft,
} from './coordinator';
import { appendAutonomousMetadata } from './metadata';

// A "running" row older than this is considered crashed and will be re-run.
const STALE_RUN_MINUTES = 10;

// How far back to look for open tasks to avoid duplicating.
const OPEN_TASK_LOOKBACK_DAYS = 30;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Run the daily autonomous task generation for a single workspace.
 * Safe to call multiple times — idempotent for a given calendar day.
 *
 * Returns the GenerationResult, or null if the run was skipped (already done today).
 */
export async function runDailyAutonomousGeneration(
  workspaceId: string
): Promise<GenerationResult | null> {
  const runDate = todayUTC();

  // ── Stale-run recovery (runs regardless of enabled state) ────────────────
  // If a previous run is stuck in 'running' and older than STALE_RUN_MINUTES,
  // mark it failed so this call (or the next) can start fresh.
  const existingRun = queryOne<AutonomousRun>(
    `SELECT * FROM autonomous_runs WHERE workspace_id = ? AND run_date = ?`,
    [workspaceId, runDate]
  );
  if (existingRun?.status === 'running') {
    const ageMinutes = (Date.now() - new Date(existingRun.updated_at).getTime()) / 60000;
    if (ageMinutes >= STALE_RUN_MINUTES) {
      console.warn(`[Autonomous] Stale run ${existingRun.id} detected, marking failed`);
      updateRunStatus(existingRun.id, 'failed', { error_message: 'Stale run recovered' });
    }
  }

  // ── Enabled check ─────────────────────────────────────────────────────────
  const config = getOrCreateConfig(workspaceId);
  if (!config.enabled) {
    console.log(`[Autonomous] Workspace ${workspaceId} generation disabled — skipping`);
    return null;
  }

  // ── Idempotency guard ─────────────────────────────────────────────────────
  // Re-fetch after potential stale recovery above.
  const currentRun = queryOne<AutonomousRun>(
    `SELECT * FROM autonomous_runs WHERE workspace_id = ? AND run_date = ?`,
    [workspaceId, runDate]
  );
  if (currentRun?.status === 'completed') {
    console.log(`[Autonomous] Run for ${workspaceId}/${runDate} already completed — skipping`);
    return null;
  }
  if (currentRun?.status === 'running') {
    // Not stale (checked above) — another process is running it right now
    console.log(`[Autonomous] Run for ${workspaceId}/${runDate} already in progress — skipping`);
    return null;
  }

  // ── Create the run row ────────────────────────────────────────────────────
  // Reuse the existing row id if it was 'failed' (either from stale recovery or a prior error).
  const runId = currentRun?.status === 'failed' ? currentRun.id : uuidv4();
  const now = new Date().toISOString();

  if (currentRun?.status === 'failed') {
    dbRun(
      `UPDATE autonomous_runs SET status = 'running', error_message = NULL, updated_at = ? WHERE id = ?`,
      [now, runId]
    );
  } else {
    dbRun(
      `INSERT INTO autonomous_runs (id, workspace_id, run_date, status, created_at, updated_at)
       VALUES (?, ?, ?, 'running', ?, ?)`,
      [runId, workspaceId, runDate, now, now]
    );
  }

  // Update last_run_at on config
  dbRun(`UPDATE autonomous_configs SET last_run_at = ?, updated_at = ? WHERE workspace_id = ?`,
    [now, now, workspaceId]);

  try {
    const result = await executeGeneration(workspaceId, runId, config);
    return result;
  } catch (err) {
    const errorMessage = (err as Error).message || String(err);
    console.error(`[Autonomous] Generation failed for ${workspaceId}/${runDate}:`, errorMessage);
    updateRunStatus(runId, 'failed', { error_message: errorMessage.slice(0, 500) });
    return {
      runId,
      runDate,
      tasksCreated: 0,
      tasksSkipped: 0,
      taskIds: [],
      costUsd: 0,
      status: 'failed',
      error: errorMessage,
    };
  }
}

/**
 * Check all enabled workspace configs and run generation for any that are due.
 * Called from the scheduler every minute.
 */
export async function checkAndRunDueAutonomousGenerations(): Promise<void> {
  const configs = queryAll<AutonomousConfig & { enabled: number }>(
    `SELECT * FROM autonomous_configs WHERE enabled = 1`
  );

  const nowLocal = new Date();

  for (const rawConfig of configs) {
    const config = coerceConfig(rawConfig);
    if (!isScheduledNow(config.generation_cron, nowLocal)) continue;

    // Skip if already ran in the last 55 minutes (prevents double-fire within cron window)
    if (config.last_run_at) {
      const msSince = Date.now() - new Date(config.last_run_at).getTime();
      if (msSince < 55 * 60 * 1000) continue;
    }

    console.log(`[Autonomous] Schedule triggered for workspace ${config.workspace_id}`);
    runDailyAutonomousGeneration(config.workspace_id).catch(err =>
      console.error(`[Autonomous] Scheduled run failed for ${config.workspace_id}:`, err)
    );
  }
}

// ── Core execution ────────────────────────────────────────────────────────────

async function executeGeneration(
  workspaceId: string,
  runId: string,
  config: AutonomousConfig
): Promise<GenerationResult> {
  const runDate = todayUTC();

  // 1. Read goals — structured parser is a superset of parseGoalsFile; all existing paths
  //    continue to work and the generator automatically uses the richer prompt when goals
  //    carry StructuredGoals fields.
  const goalsPath = resolveGoalsPath(config.goals_file_path);
  const goals = parseStructuredGoals(goalsPath);

  // 2. Collect context for duplicate detection
  const openTaskTitles = getOpenTaskTitles(workspaceId);
  const logPath = resolveGoalsPath(config.log_file_path);
  const recentEntries = recentLogEntries(logPath, 7);
  const recentCompletedTitles = recentEntries
    .filter(e => e.event === 'COMPLETE' || e.event === 'CREATED')
    .map(e => e.title);

  // 3. Generate proposals via LLM
  const workspace = queryOne<{ name: string }>(`SELECT name FROM workspaces WHERE id = ?`, [workspaceId]);
  const genOutput = await generateDailyProposals({
    goals,
    openTaskTitles,
    recentCompletedTitles,
    targetCount: config.target_task_count,
    workspaceName: workspace?.name,
  });

  // 4. Deduplicate
  const allExistingTitles = [...openTaskTitles, ...recentCompletedTitles];
  const { kept, skipped } = deduplicateProposals(genOutput.proposals, allExistingTitles);

  // 4b. Convert proposals into structured drafts so runner output carries
  //     stable goal tags, lanes, and approval metadata without needing DB changes.
  const boundaries = getCoordinatorIntegrationBoundaries(config.approval_required);
  const fallbackGoalTag = activeGoalTag(goals);
  const drafts = kept.map(proposal =>
    toAutonomousTaskDraft(proposal, {
      autonomousRunId: runId,
      approvalRequired: config.approval_required,
      goalTag: goals.isEmpty
        ? fallbackGoalTag
        : resolveGoalTagFromStructuredGoals(proposal, goals) ?? fallbackGoalTag,
    })
  );
  const lanePlan = planCoordinatorLanes(drafts);
  const orderedDrafts = [...lanePlan.now, ...lanePlan.next, ...lanePlan.later];

  // Save raw proposal for debugging
  dbRun(
    `UPDATE autonomous_runs SET tasks_proposed = ?, raw_proposal = ?, model = ?,
       prompt_tokens = ?, completion_tokens = ?, updated_at = ? WHERE id = ?`,
    [genOutput.proposals.length, genOutput.raw.slice(0, 8000), genOutput.model,
     genOutput.promptTokens, genOutput.completionTokens, new Date().toISOString(), runId]
  );

  // 5. Create tasks in DB
  const createdTaskIds: string[] = [];
  const createdDrafts: typeof orderedDrafts = [];
  const now = new Date().toISOString();

  // Get workspace's default workflow template
  const defaultTemplate = queryOne<{ id: string }>(
    `SELECT id FROM workflow_templates WHERE workspace_id = ? AND is_default = 1 LIMIT 1`,
    [workspaceId]
  );

  transaction(() => {
    for (const draft of orderedDrafts) {
      const taskId = uuidv4();
      const description = appendAutonomousMetadata([
        draft.description,
        draft.goal_rationale ? `\n**Goal:** ${draft.goal_rationale}` : '',
        draft.goalTag ? `\n**Goal tag:** \`${draft.goalTag}\`` : '',
        `\n**Autonomous lane:** ${draft.lane}`,
        `\n*Generated by autonomous daily run ${runId} on ${runDate}*`,
      ].filter(Boolean).join(''), {
        source: draft.source,
        autonomousRunId: draft.autonomousRunId,
        goalTag: draft.goalTag,
        lane: draft.lane,
        approvalState: draft.approvalState,
        generatedAt: now,
      });

      dbRun(
        `INSERT INTO tasks (id, title, description, status, priority, source, workspace_id, business_id,
           workflow_template_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'autonomous', ?, 'default', ?, ?, ?)`,
        [taskId, draft.title, description, boundaries.taskStatusOnCreate, draft.priority, workspaceId,
         defaultTemplate?.id || null, now, now]
      );

      createdTaskIds.push(taskId);
      createdDrafts.push(draft);
    }
  });

  // 6. Append log entries (outside transaction — non-fatal failures OK)
  for (let i = 0; i < createdDrafts.length; i++) {
    const draft = createdDrafts[i];
    logTaskCreated(logPath, createdTaskIds[i], draft.title, runId, {
      goalTag: draft.goalTag,
      lane: draft.lane,
      approvalState: draft.approvalState,
    });
  }
  for (const s of skipped) {
    logTaskSkipped(logPath, s.title, s.reason, runId);
  }

  // 7. Broadcast each created task so the kanban board updates in real-time
  for (const taskId of createdTaskIds) {
    const task = queryOne(`SELECT * FROM tasks WHERE id = ?`, [taskId]);
    if (task) broadcast({ type: 'task_created', payload: task as never });
  }

  // 8. Approximate cost (gateway uses anthropic pricing; rough estimate)
  const costUsd = estimateCost(genOutput.promptTokens, genOutput.completionTokens);

  // 9. Finalize run row
  const finalStatus = createdTaskIds.length > 0 ? 'completed' : 'partial';
  dbRun(
    `UPDATE autonomous_runs
     SET status = ?, tasks_created = ?, tasks_skipped = ?, cost_usd = ?, updated_at = ?
     WHERE id = ?`,
    [finalStatus, createdTaskIds.length, skipped.length, costUsd, new Date().toISOString(), runId]
  );

  console.log(
    `[Autonomous] Run ${runId} done: ${createdTaskIds.length} created, ${skipped.length} skipped`
  );

  return {
    runId,
    runDate,
    tasksCreated: createdTaskIds.length,
    tasksSkipped: skipped.length,
    taskIds: createdTaskIds,
    costUsd,
    status: finalStatus,
  };
}

// ── Config helpers ─────────────────────────────────────────────────────────────

/**
 * Get (or auto-create with defaults) the autonomous config for a workspace.
 */
export function getOrCreateConfig(workspaceId: string): AutonomousConfig {
  const existing = queryOne<Record<string, unknown>>(
    `SELECT * FROM autonomous_configs WHERE workspace_id = ?`,
    [workspaceId]
  );
  if (existing) return coerceConfig(existing);

  const id = uuidv4();
  const now = new Date().toISOString();
  dbRun(
    `INSERT INTO autonomous_configs
       (id, workspace_id, enabled, goals_file_path, log_file_path,
        generation_cron, timezone, target_task_count, approval_required,
        created_at, updated_at)
     VALUES (?, ?, 1, 'AUTONOMOUS.md', 'memory/tasks-log.md',
             '0 8 * * *', 'UTC', 5, 0, ?, ?)`,
    [id, workspaceId, now, now]
  );

  return coerceConfig(
    queryOne<Record<string, unknown>>(`SELECT * FROM autonomous_configs WHERE id = ?`, [id])!
  );
}

export function upsertConfig(workspaceId: string, updates: Partial<Omit<AutonomousConfig, 'id' | 'workspace_id' | 'created_at' | 'updated_at'>>): AutonomousConfig {
  getOrCreateConfig(workspaceId); // ensure row exists
  const now = new Date().toISOString();
  const fields: string[] = [];
  const values: unknown[] = [];

  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) continue;
    if (key === 'enabled' || key === 'approval_required') {
      fields.push(`${key} = ?`);
      values.push(value ? 1 : 0);
    } else {
      fields.push(`${key} = ?`);
      values.push(value);
    }
  }

  if (fields.length > 0) {
    fields.push('updated_at = ?');
    values.push(now);
    values.push(workspaceId);
    dbRun(`UPDATE autonomous_configs SET ${fields.join(', ')} WHERE workspace_id = ?`, values);
  }

  return getOrCreateConfig(workspaceId);
}

/** Coerce SQLite row (integers for booleans) to typed AutonomousConfig. */
function coerceConfig(row: Record<string, unknown>): AutonomousConfig {
  return {
    ...row,
    enabled: Boolean(row.enabled),
    approval_required: Boolean(row.approval_required),
  } as AutonomousConfig;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

function updateRunStatus(
  runId: string,
  status: string,
  extra?: { error_message?: string; tasks_created?: number }
): void {
  const now = new Date().toISOString();
  const fields = ['status = ?', 'updated_at = ?'];
  const values: unknown[] = [status, now];
  if (extra?.error_message !== undefined) { fields.push('error_message = ?'); values.push(extra.error_message); }
  if (extra?.tasks_created !== undefined) { fields.push('tasks_created = ?'); values.push(extra.tasks_created); }
  values.push(runId);
  dbRun(`UPDATE autonomous_runs SET ${fields.join(', ')} WHERE id = ?`, values);
}

function getOpenTaskTitles(workspaceId: string): string[] {
  const cutoff = new Date(Date.now() - OPEN_TASK_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const rows = queryAll<{ title: string }>(
    `SELECT title FROM tasks
     WHERE workspace_id = ?
       AND status NOT IN ('done')
       AND created_at >= ?
     ORDER BY created_at DESC`,
    [workspaceId, cutoff]
  );
  return rows.map(r => r.title);
}

/**
 * Rough Anthropic Sonnet cost estimate: $3/1M input + $15/1M output tokens.
 * Used for informational display only — actual billing is on the gateway.
 */
function estimateCost(promptTokens: number, completionTokens: number): number {
  return (promptTokens / 1_000_000) * 3 + (completionTokens / 1_000_000) * 15;
}

/**
 * Minimal 5-field cron matcher (minute, hour, dom, month, dow).
 * Supports: wildcard (*), integer values, and step expressions (every-N syntax).
 */
function isScheduledNow(cron: string, date: Date): boolean {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  const [minute, hour, dom, month, dow] = parts;
  const checks = [
    { field: minute, value: date.getUTCMinutes() },
    { field: hour,   value: date.getUTCHours() },
    { field: dom,    value: date.getUTCDate() },
    { field: month,  value: date.getUTCMonth() + 1 },
    { field: dow,    value: date.getUTCDay() },
  ];
  return checks.every(({ field, value }) => {
    if (field === '*') return true;
    if (field.startsWith('*/')) return value % parseInt(field.slice(2), 10) === 0;
    if (field.includes(',')) return field.split(',').map(Number).includes(value);
    return parseInt(field, 10) === value;
  });
}
