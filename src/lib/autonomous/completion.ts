/**
 * completion.ts — Autonomous task completion hook.
 *
 * Called from the task PATCH route when status transitions to 'done'.
 * Reads the AUTONOMOUS_META block from the task description and appends
 * a COMPLETE entry to the workspace's append-only tasks log.
 *
 * Design rules:
 * - No-op for non-autonomous tasks (extractAutonomousMetadata returns null).
 * - No-op when the task was already done before this transition (caller guards this).
 * - Never throws — all errors are caught and logged; the task update must not fail
 *   because the log write failed.
 */

import { extractAutonomousMetadata } from './metadata';
import { logTaskComplete } from './log';
import { resolveGoalsPath } from './parser';
import { getOrCreateConfig } from './runner';

export interface CompletionHookInput {
  taskId: string;
  taskTitle: string;
  taskDescription?: string | null;
  workspaceId: string;
  /** Agent that triggered the completion, or null for system/user actions. */
  agentId?: string | null;
}

export interface CompletionHookResult {
  logged: boolean;
  /** Reason for not logging, when logged=false */
  reason?: 'not_autonomous' | 'log_error';
}

/** Returns true only for a real status transition into done. */
export function shouldLogAutonomousCompletion(nextStatus?: string, previousStatus?: string | null): boolean {
  return nextStatus === 'done' && previousStatus !== 'done';
}

/**
 * Handle the autonomous completion event for a single task.
 *
 * Returns `{ logged: true }` when a COMPLETE line was appended.
 * Returns `{ logged: false, reason }` when no log was written (non-autonomous
 * task, or a non-fatal error during the write).
 *
 * Safe to call from the route handler directly; wraps all log I/O in try/catch.
 */
export function handleAutonomousCompletion(input: CompletionHookInput): CompletionHookResult {
  const { taskId, taskTitle, taskDescription, workspaceId, agentId } = input;

  const autonomousMeta = extractAutonomousMetadata(taskDescription);
  if (!autonomousMeta) {
    return { logged: false, reason: 'not_autonomous' };
  }

  try {
    const config = getOrCreateConfig(workspaceId);
    const logPath = resolveGoalsPath(config.log_file_path);
    logTaskComplete(logPath, taskId, taskTitle, agentId || 'system', {
      runId: autonomousMeta.autonomousRunId,
      goalTag: autonomousMeta.goalTag,
      lane: autonomousMeta.lane,
    });
    return { logged: true };
  } catch (err) {
    console.error('[Autonomous] completion log failed:', (err as Error).message);
    return { logged: false, reason: 'log_error' };
  }
}
