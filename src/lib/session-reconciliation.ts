/**
 * session-reconciliation.ts
 *
 * Helpers for keeping openclaw_sessions consistent with the current task/agent
 * ownership model. Call these whenever ownership changes so stale sessions don't
 * confuse the zombie health detector.
 *
 * Design goals
 * ─────────────
 * • Synchronous (SQLite only) — safe to call inside any request handler.
 * • Idempotent — calling twice produces the same outcome.
 * • No side-effects beyond the openclaw_sessions table.
 */

import { run, queryAll } from '@/lib/db';
import type { OpenClawSession } from '@/lib/types';

/**
 * Close every active session bound to a task, except for one optional agent
 * that should keep its session (the newly dispatched agent).
 *
 * Use this inside dispatch/route.ts when a new agent-session is created so
 * any leftover active rows from prior agents are immediately retired.
 *
 * @returns Number of sessions closed.
 */
export function closeTaskSessions(
  taskId: string,
  options?: { excludeAgentId?: string; now?: string }
): number {
  const now = options?.now ?? new Date().toISOString();

  const stale = options?.excludeAgentId
    ? queryAll<{ id: string }>(
        `SELECT id FROM openclaw_sessions
         WHERE task_id = ? AND status = 'active' AND agent_id != ?`,
        [taskId, options.excludeAgentId]
      )
    : queryAll<{ id: string }>(
        `SELECT id FROM openclaw_sessions WHERE task_id = ? AND status = 'active'`,
        [taskId]
      );

  for (const { id } of stale) {
    run(
      `UPDATE openclaw_sessions SET status = 'ended', ended_at = ?, updated_at = ? WHERE id = ?`,
      [now, now, id]
    );
  }

  return stale.length;
}

/**
 * Close all active sessions for a specific (agent, task) pair.
 *
 * Use this inside workflow-engine.ts / task PATCH handler when task ownership
 * is transferred away from an agent, so the previous agent's session record
 * doesn't sit as active and cause false-zombie states on subsequent health checks.
 *
 * @returns Number of sessions closed.
 */
export function closeAgentTaskSessions(
  agentId: string,
  taskId: string,
  now?: string
): number {
  const ts = now ?? new Date().toISOString();

  const stale = queryAll<{ id: string }>(
    `SELECT id FROM openclaw_sessions
     WHERE agent_id = ? AND task_id = ? AND status = 'active'`,
    [agentId, taskId]
  );

  for (const { id } of stale) {
    run(
      `UPDATE openclaw_sessions SET status = 'ended', ended_at = ?, updated_at = ? WHERE id = ?`,
      [ts, ts, id]
    );
  }

  return stale.length;
}

/**
 * For a given agent, close every active session whose task_id no longer matches
 * the agent's currently assigned task.  This is a belt-and-suspenders sweep used
 * by the health cycle to retire sessions that were never explicitly closed.
 *
 * @returns Number of sessions closed.
 */
export function closeOrphanedAgentSessions(agentId: string, now?: string): number {
  const ts = now ?? new Date().toISOString();

  // Active sessions for this agent where the task is no longer assigned to them
  const orphaned = queryAll<{ id: string }>(
    `SELECT s.id
     FROM openclaw_sessions s
     LEFT JOIN tasks t ON s.task_id = t.id
     WHERE s.agent_id = ?
       AND s.status = 'active'
       AND (
         t.id IS NULL
         OR t.assigned_agent_id != s.agent_id
         OR t.status IN ('done', 'inbox')
       )`,
    [agentId]
  );

  for (const { id } of orphaned) {
    run(
      `UPDATE openclaw_sessions SET status = 'ended', ended_at = ?, updated_at = ? WHERE id = ?`,
      [ts, ts, id]
    );
  }

  return orphaned.length;
}
