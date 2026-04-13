/**
 * log.ts — Append-only writer for memory/tasks-log.md.
 *
 * Rules:
 * - Subagents / external callers MUST NEVER write to AUTONOMOUS.md.
 * - All completion evidence goes to tasks-log.md only.
 * - The log is append-only: no lines are ever modified or deleted.
 * - Title pipes are escaped so the pipe-delimited format stays parseable.
 *
 * Log line format (one per line):
 *   {ISO_TS} | {EVENT} | {task_id} | {title_escaped} | {meta}
 *
 * EVENT values:
 *   CREATED   — task was created in an autonomous run
 *   COMPLETE  — task was marked done (call this from task completion webhook)
 *   SKIPPED   — proposed task was not created (duplicate / quality filter)
 *
 * title_escaped: pipe characters replaced with U+2023 (‣)
 */

import fs from 'fs';
import path from 'path';
import type { LogEventType } from './types';

const PIPE_ESCAPE = '‣'; // U+2023 triangular bullet — visually similar, unambiguous

function escapeTitle(title: string): string {
  return title.replace(/\|/g, PIPE_ESCAPE).replace(/\n/g, ' ').trim();
}

/**
 * Append a single line to the tasks log.
 * Creates the file (and parent directories) if they don't exist.
 * Safe for concurrent calls — uses synchronous append which is atomic per line
 * on POSIX filesystems.
 */
export function appendLogLine(
  filePath: string,
  event: LogEventType,
  taskId: string,
  title: string,
  meta: string
): void {
  const ts = new Date().toISOString();
  const line = `${ts} | ${event.padEnd(8)} | ${taskId.padEnd(36)} | ${escapeTitle(title)} | ${meta}\n`;

  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.appendFileSync(filePath, line, 'utf-8');
  } catch (err) {
    // Log write failures are non-fatal — the task is already in the DB.
    console.error(`[AutonomousLog] Failed to append to ${filePath}:`, (err as Error).message);
  }
}

/**
 * Record that a task was created in an autonomous run.
 * goalTag is optional; when present it is appended as `goal:<tag>` in the meta field.
 * Existing callers that omit goalTag continue to produce the same output.
 */
export function logTaskCreated(
  filePath: string,
  taskId: string,
  title: string,
  runId: string,
  extras?: { goalTag?: string; lane?: string; approvalState?: string }
): void {
  const metaParts = [`run:${runId}`];
  if (extras?.goalTag) metaParts.push(`goal:${extras.goalTag}`);
  if (extras?.lane) metaParts.push(`lane:${extras.lane}`);
  if (extras?.approvalState) metaParts.push(`approval:${extras.approvalState}`);
  appendLogLine(filePath, 'CREATED', taskId, title, metaParts.join(' '));
}

/** Record that a proposed task was skipped (duplicate / quality filter). */
export function logTaskSkipped(filePath: string, title: string, reason: string, runId: string): void {
  appendLogLine(filePath, 'SKIPPED', '-', title, `reason:${reason} run:${runId}`);
}

/**
 * Record a task completion.
 * Call this from the task status-change handler when status → 'done'
 * and the task was created by an autonomous run (task.autonomous_run_id != null).
 *
 * agentId: the agent that completed the task, or 'system' if triggered automatically.
 */
export function logTaskComplete(
  filePath: string,
  taskId: string,
  title: string,
  agentId: string,
  extras?: { runId?: string; goalTag?: string; lane?: string }
): void {
  const metaParts = [`agent:${agentId}`];
  if (extras?.runId) metaParts.push(`run:${extras.runId}`);
  if (extras?.goalTag) metaParts.push(`goal:${extras.goalTag}`);
  if (extras?.lane) metaParts.push(`lane:${extras.lane}`);
  appendLogLine(filePath, 'COMPLETE', taskId, title, metaParts.join(' '));
}

// ── Tranche-2 lifecycle helpers ───────────────────────────────────────────────

/**
 * Record that a pending-approval task was approved by a human reviewer.
 * approvedBy: user identifier or 'system' for automatic approval.
 */
export function logTaskApproved(filePath: string, taskId: string, title: string, approvedBy: string): void {
  appendLogLine(filePath, 'APPROVED', taskId, title, `by:${approvedBy}`);
}

/**
 * Record that a pending-approval task was rejected and removed from the queue.
 * reason: short description, e.g. "not aligned", "duplicate", "deferred".
 */
export function logTaskRejected(filePath: string, taskId: string, title: string, reason: string): void {
  appendLogLine(filePath, 'REJECTED', taskId, title, `reason:${reason}`);
}

/**
 * Record that a task was dispatched to an agent for execution.
 * runId: the autonomous_run_id that produced the task (for traceability).
 */
export function logTaskDispatched(
  filePath: string,
  taskId: string,
  title: string,
  agentId: string,
  runId: string,
  extras?: { goalTag?: string; lane?: string }
): void {
  const metaParts = [`agent:${agentId}`, `run:${runId}`];
  if (extras?.goalTag) metaParts.push(`goal:${extras.goalTag}`);
  if (extras?.lane) metaParts.push(`lane:${extras.lane}`);
  appendLogLine(filePath, 'DISPATCHED', taskId, title, metaParts.join(' '));
}
