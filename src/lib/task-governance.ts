import { queryAll, queryOne, run, transaction } from '@/lib/db';
import { notifyLearner } from '@/lib/learner';
import type { Task } from '@/lib/types';

const ACTIVE_STATUSES = ['assigned', 'in_progress', 'convoy_active', 'testing', 'review', 'verification'];

export function hasStageEvidence(taskId: string): boolean {
  const deliverable = queryOne<{ count: number }>('SELECT COUNT(*) as count FROM task_deliverables WHERE task_id = ?', [taskId]);
  const activity = queryOne<{ count: number }>(
    `SELECT COUNT(*) as count FROM task_activities WHERE task_id = ? AND activity_type IN ('completed','file_created','updated')`,
    [taskId]
  );
  return Number(deliverable?.count || 0) > 0 && Number(activity?.count || 0) > 0;
}

export function canUseBoardOverride(request: Request): boolean {
  if (process.env.BOARD_OVERRIDE_ENABLED !== 'true') return false;
  return request.headers.get('x-mc-board-override') === 'true';
}

export function auditBoardOverride(taskId: string, fromStatus: string, toStatus: string, reason?: string): void {
  const now = new Date().toISOString();
  run(
    `INSERT INTO events (id, type, task_id, message, metadata, created_at)
     VALUES (lower(hex(randomblob(16))), 'system', ?, ?, ?, ?)`,
    [taskId, `Board override: ${fromStatus} → ${toStatus}`, JSON.stringify({ boardOverride: true, reason: reason || null }), now]
  );
}

export function getFailureCountInStage(taskId: string, stage: string): number {
  const row = queryOne<{ count: number }>(
    `SELECT COUNT(*) as count
     FROM task_activities
     WHERE task_id = ? AND activity_type = 'status_changed' AND message LIKE ?`,
    [taskId, `%Stage failed: ${stage}%`]
  );
  return Number(row?.count || 0);
}

export function ensureFixerExists(workspaceId: string): { id: string; name: string; created: boolean } {
  const existing = queryOne<{ id: string; name: string }>(
    `SELECT id, name FROM agents WHERE workspace_id = ? AND role IN ('fixer','senior') AND status != 'offline' ORDER BY role = 'fixer' DESC, updated_at DESC LIMIT 1`,
    [workspaceId]
  );
  if (existing) return { ...existing, created: false };

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const name = 'Auto Fixer';
  run(
    `INSERT INTO agents (id, name, role, description, avatar_emoji, status, is_master, workspace_id, source, created_at, updated_at)
     VALUES (?, ?, 'fixer', 'Auto-created fixer for repeated stage failures', '🛠️', 'standby', 0, ?, 'local', ?, ?)`,
    [id, name, workspaceId, now, now]
  );
  return { id, name, created: true };
}

export async function escalateFailureIfNeeded(taskId: string, stage: string): Promise<void> {
  const task = queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [taskId]);
  if (!task) return;

  if (getFailureCountInStage(taskId, stage) < 2) return;

  const fixer = ensureFixerExists(task.workspace_id);
  const now = new Date().toISOString();
  transaction(() => {
    run('UPDATE tasks SET assigned_agent_id = ?, status_reason = ?, updated_at = ? WHERE id = ?', [
      fixer.id,
      `Escalated after repeated failures in ${stage}`,
      now,
      taskId,
    ]);

    run(
      `INSERT OR REPLACE INTO task_roles (id, task_id, role, agent_id, created_at)
       VALUES (COALESCE((SELECT id FROM task_roles WHERE task_id = ? AND role = 'fixer'), lower(hex(randomblob(16)))), ?, 'fixer', ?, ?)`,
      [taskId, taskId, fixer.id, now]
    );

    run(
      `INSERT INTO task_activities (id, task_id, agent_id, activity_type, message, created_at)
       VALUES (lower(hex(randomblob(16))), ?, ?, 'status_changed', ?, ?)`,
      [taskId, fixer.id, `Escalated to ${fixer.name} after repeated failures in ${stage}`, now]
    );
  });

  if (fixer.created) {
    await notifyLearner(taskId, {
      previousStatus: stage,
      newStatus: stage,
      passed: true,
      context: `Auto-created fixer agent (${fixer.name}) due to repeated stage failures.`,
    });
  }
}

export async function recordLearnerOnTransition(taskId: string, previousStatus: string, newStatus: string, passed = true, failReason?: string): Promise<void> {
  await notifyLearner(taskId, { previousStatus, newStatus, passed, failReason });
}

export function taskCanBeDone(taskId: string): boolean {
  const task = queryOne<{ status: string; status_reason?: string }>('SELECT status, status_reason FROM tasks WHERE id = ?', [taskId]);
  if (!task) return false;
  const hasValidationFailure = (task.status_reason || '').toLowerCase().includes('fail');
  if (hasValidationFailure || !hasStageEvidence(taskId)) return false;

  const deliverables = queryAll<{ title?: string; path?: string; deliverable_type?: string }>(
    'SELECT title, path, deliverable_type FROM task_deliverables WHERE task_id = ?',
    [taskId]
  );
  const activities = queryAll<{ activity_type: string; message?: string }>(
    'SELECT activity_type, message FROM task_activities WHERE task_id = ?',
    [taskId]
  );

  const meaningfulDeliverable = deliverables.some(d => {
    const text = `${d.title || ''} ${d.path || ''}`.toLowerCase();
    return Boolean(d.deliverable_type) && !text.includes('placeholder') && !text.includes('todo');
  });

  const meaningfulCompletionActivity = activities.some(a => {
    const text = (a.message || '').toLowerCase();
    return ['completed', 'file_created', 'updated'].includes(a.activity_type)
      && !text.includes('dispatch failed')
      && !text.includes('zombie')
      && !text.includes('retry')
      && !text.includes('status drift');
  });

  return meaningfulDeliverable && meaningfulCompletionActivity;
}

export function isActiveStatus(status: string): boolean {
  return ACTIVE_STATUSES.includes(status);
}

/**
 * Find tasks that are stuck in_progress with no assigned agent and no activity.
 * These tasks can never make progress and need to be reset.
 */
export function detectOwnerlessInProgress(): Array<{ id: string; title: string; created_at: string }> {
  return queryAll<{ id: string; title: string; created_at: string }>(
    `SELECT t.id, t.title, t.created_at
     FROM tasks t
     LEFT JOIN task_activities ta ON ta.task_id = t.id
     WHERE t.status = 'in_progress'
       AND t.assigned_agent_id IS NULL
       AND ta.id IS NULL
     GROUP BY t.id`
  );
}

/**
 * Move ownerless in_progress tasks back to inbox so they can be re-dispatched.
 * Returns the number of tasks repaired.
 */
export function repairOwnerlessInProgress(): number {
  const stuck = detectOwnerlessInProgress();
  if (stuck.length === 0) return 0;

  const now = new Date().toISOString();
  transaction(() => {
    for (const task of stuck) {
      run(
        `UPDATE tasks SET status = 'inbox', status_reason = ?, updated_at = ? WHERE id = ? AND status = 'in_progress' AND assigned_agent_id IS NULL`,
        ['Repaired: was in_progress with no assigned agent and no activity', now, task.id]
      );
      run(
        `INSERT INTO events (id, type, task_id, message, created_at)
         VALUES (lower(hex(randomblob(16))), 'system', ?, 'Task reset to inbox: was ownerless in_progress', ?)`,
        [task.id, now]
      );
    }
  });
  return stuck.length;
}

export function pickDynamicAgent(taskId: string, stageRole?: string | null): { id: string; name: string } | null {
  const planningAgentsTask = queryOne<{ planning_agents?: string }>('SELECT planning_agents FROM tasks WHERE id = ?', [taskId]);
  const plannerCandidates: string[] = [];
  if (planningAgentsTask?.planning_agents) {
    try {
      const parsed = JSON.parse(planningAgentsTask.planning_agents) as Array<{ agent_id?: string; role?: string }>;
      for (const a of parsed) {
        if (a.role && stageRole && a.role.toLowerCase().includes(stageRole.toLowerCase()) && a.agent_id) plannerCandidates.push(a.agent_id);
      }
    } catch {}
  }

  const checked = new Set<string>();
  for (const candidateId of plannerCandidates) {
    const candidate = queryOne<{ id: string; name: string; is_master: number; status: string }>(
      'SELECT id, name, is_master, status FROM agents WHERE id = ? LIMIT 1',
      [candidateId]
    );
    if (!candidate || candidate.status === 'offline') continue;
    checked.add(candidate.id);
    return { id: candidate.id, name: candidate.name };
  }

  if (stageRole) {
    const byRole = queryOne<{ id: string; name: string }>(
      `SELECT id, name FROM agents WHERE role = ? AND status != 'offline' ORDER BY status = 'standby' DESC, updated_at DESC LIMIT 1`,
      [stageRole]
    );
    if (byRole) return byRole;
  }

  const fallback = queryOne<{ id: string; name: string }>(
    `SELECT id, name FROM agents WHERE status != 'offline' ORDER BY is_master ASC, updated_at DESC LIMIT 1`
  );
  if (fallback && !checked.has(fallback.id)) return fallback;

  return null;
}
