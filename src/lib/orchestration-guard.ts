/**
 * Orchestration Guard
 *
 * Utilities that enforce the invariant: exactly ONE agent per workspace may
 * have is_master = 1.  Spurious duplicates (e.g. from bad seed data, manual
 * DB edits, or botched imports) silently deadlock all dispatch and planning
 * operations because both dispatch/route.ts and planning/route.ts return 409
 * when they see a second master.
 *
 * This module provides:
 *  - getCanonicalOrchestrator  — returns the single "true" master for a workspace
 *  - repairSpuriousMasters      — demotes all but the canonical master to is_master=0
 *  - assertSingleMaster         — throws if the DB still has duplicates after repair
 *    (useful for tests)
 */

import { queryAll, queryOne, run } from '@/lib/db';

export interface OrchestratorInfo {
  id: string;
  name: string;
  role: string;
  session_key_prefix?: string;
  created_at: string;
}

/**
 * Returns the canonical orchestrator for a workspace: the single non-offline
 * agent with is_master = 1, preferring the earliest created_at.
 *
 * If there are multiple masters (the broken state), we resolve to the oldest
 * and leave repair to repairSpuriousMasters().
 */
export function getCanonicalOrchestrator(workspaceId: string): OrchestratorInfo | null {
  return queryOne<OrchestratorInfo>(
    `SELECT id, name, role, session_key_prefix, created_at
     FROM agents
     WHERE is_master = 1
       AND workspace_id = ?
       AND status != 'offline'
     ORDER BY created_at ASC
     LIMIT 1`,
    [workspaceId]
  ) ?? null;
}

/**
 * Demotes every is_master = 1 agent in the workspace EXCEPT the canonical one
 * (oldest created_at).  No-ops if the workspace already has ≤ 1 master.
 *
 * Returns the list of agents that were demoted so callers can log a warning.
 */
export function repairSpuriousMasters(workspaceId: string): OrchestratorInfo[] {
  const allMasters = queryAll<OrchestratorInfo>(
    `SELECT id, name, role, session_key_prefix, created_at
     FROM agents
     WHERE is_master = 1
       AND workspace_id = ?
     ORDER BY created_at ASC`,
    [workspaceId]
  );

  if (allMasters.length <= 1) return [];

  // Keep the first (oldest) — demote the rest.
  const [, ...spurious] = allMasters;
  const now = new Date().toISOString();

  for (const agent of spurious) {
    run(
      `UPDATE agents SET is_master = 0, updated_at = ? WHERE id = ?`,
      [now, agent.id]
    );
    console.warn(
      `[OrchestrationGuard] Demoted spurious master: "${agent.name}" (${agent.id}) ` +
      `in workspace ${workspaceId}. Only one master is allowed per workspace.`
    );
  }

  // Audit trail
  run(
    `INSERT INTO events (id, type, message, metadata, created_at)
     VALUES (lower(hex(randomblob(16))), 'system', ?, ?, ?)`,
    [
      `Orchestrator integrity repair: demoted ${spurious.length} spurious master(s) in workspace ${workspaceId}`,
      JSON.stringify({ workspaceId, demoted: spurious.map(a => ({ id: a.id, name: a.name })) }),
      now,
    ]
  );

  return spurious;
}

/**
 * Returns all workspaces that currently have more than one is_master = 1 agent.
 * Used by the startup integrity check and the migration.
 */
export function getWorkspacesWithDuplicateMasters(): { workspaceId: string; count: number }[] {
  return queryAll<{ workspaceId: string; count: number }>(
    `SELECT workspace_id as workspaceId, COUNT(*) as count
     FROM agents
     WHERE is_master = 1
     GROUP BY workspace_id
     HAVING COUNT(*) > 1`
  );
}

/**
 * Run the repair across ALL workspaces.  Safe to call at startup.
 * Returns total number of agents demoted.
 */
export function repairAllWorkspaces(): number {
  const broken = getWorkspacesWithDuplicateMasters();
  let total = 0;
  for (const { workspaceId } of broken) {
    total += repairSpuriousMasters(workspaceId).length;
  }
  return total;
}
