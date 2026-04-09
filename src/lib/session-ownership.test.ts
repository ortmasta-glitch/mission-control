/**
 * Tests for session-reconciliation.ts and the ownership invariants it enforces.
 *
 * Failure modes covered:
 *  1. Reassignment A→B: old agent's session is closed, new agent starts clean
 *  2. Zombie recovery + re-dispatch: session cycles correctly
 *  3. Workflow handoff (builder→tester): tester gets fresh session, builder's closed
 *  4. Two historical sessions for same (agent, task): only newest counts
 *  5. Health sweeper ignores obsolete (ended) sessions when computing zombie state
 *  6. Agent reused after task completion: prior task session doesn't poison new task
 *  7. closeOrphanedAgentSessions cleans up after a crash/restart
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { run, queryOne, queryAll } from './db';
import {
  closeTaskSessions,
  closeAgentTaskSessions,
  closeOrphanedAgentSessions,
} from './session-reconciliation';
import { checkAgentHealth } from './agent-health';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function seedWorkspace(id: string) {
  run(
    `INSERT OR IGNORE INTO workspaces (id, name, slug, created_at, updated_at)
     VALUES (?, ?, ?, datetime('now'), datetime('now'))`,
    [id, id, id]
  );
}

function seedAgent(opts: {
  id: string;
  workspace: string;
  name?: string;
  status?: string;
  role?: string;
}) {
  const { id, workspace, name = id, status = 'standby', role = 'builder' } = opts;
  run(
    `INSERT INTO agents (id, name, role, status, is_master, workspace_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, 0, ?, datetime('now'), datetime('now'))`,
    [id, name, role, status, workspace]
  );
}

function seedTask(opts: {
  id: string;
  workspace: string;
  status?: string;
  assignedAgentId?: string | null;
  updatedSecondsAgo?: number;
}) {
  const { id, workspace, status = 'in_progress', assignedAgentId = null, updatedSecondsAgo = 300 } = opts;
  run(
    `INSERT INTO tasks (id, title, status, priority, workspace_id, business_id,
       assigned_agent_id, created_at, updated_at)
     VALUES (?, ?, ?, 'normal', ?, 'default', ?, datetime('now'), datetime('now', ?))`,
    [id, `Task ${id}`, status, workspace, assignedAgentId, `-${updatedSecondsAgo} seconds`]
  );
}

function seedSession(opts: {
  id: string;
  agentId: string;
  taskId?: string | null;
  status?: string;
  openclawSessionId?: string;
}) {
  const { id, agentId, taskId = null, status = 'active', openclawSessionId = `ocs-${id}` } = opts;
  run(
    `INSERT INTO openclaw_sessions (id, agent_id, openclaw_session_id, channel, status, task_id, created_at, updated_at)
     VALUES (?, ?, ?, 'mission-control', ?, ?, datetime('now'), datetime('now'))`,
    [id, agentId, openclawSessionId, status, taskId]
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test('closeAgentTaskSessions: closes active sessions for (agent, task), leaves others', () => {
  seedWorkspace('ws-so-1');
  seedAgent({ id: 'so-agent-a', workspace: 'ws-so-1' });
  seedAgent({ id: 'so-agent-b', workspace: 'ws-so-1' });
  seedTask({ id: 'so-task-1', workspace: 'ws-so-1', assignedAgentId: 'so-agent-a' });
  seedTask({ id: 'so-task-2', workspace: 'ws-so-1', assignedAgentId: 'so-agent-a' });

  // Agent A has active sessions for two tasks
  seedSession({ id: 'so-sess-1', agentId: 'so-agent-a', taskId: 'so-task-1', status: 'active' });
  seedSession({ id: 'so-sess-2', agentId: 'so-agent-a', taskId: 'so-task-2', status: 'active' });
  // Agent B has its own session for task 1 (e.g., old builder session)
  seedSession({ id: 'so-sess-3', agentId: 'so-agent-b', taskId: 'so-task-1', status: 'active' });

  const closed = closeAgentTaskSessions('so-agent-a', 'so-task-1');
  assert.equal(closed, 1, 'Should close exactly one session');

  const s1 = queryOne<{ status: string }>('SELECT status FROM openclaw_sessions WHERE id = ?', ['so-sess-1']);
  const s2 = queryOne<{ status: string }>('SELECT status FROM openclaw_sessions WHERE id = ?', ['so-sess-2']);
  const s3 = queryOne<{ status: string }>('SELECT status FROM openclaw_sessions WHERE id = ?', ['so-sess-3']);

  assert.equal(s1?.status, 'ended',  'so-sess-1 (agent-a, task-1) must be ended');
  assert.equal(s2?.status, 'active', 'so-sess-2 (agent-a, task-2) must stay active');
  assert.equal(s3?.status, 'active', 'so-sess-3 (agent-b, task-1) must stay active — different agent');
});

test('closeTaskSessions: closes all active sessions for a task across all agents', () => {
  seedWorkspace('ws-so-2');
  seedAgent({ id: 'so2-agent-a', workspace: 'ws-so-2' });
  seedAgent({ id: 'so2-agent-b', workspace: 'ws-so-2' });
  seedTask({ id: 'so2-task-1', workspace: 'ws-so-2' });
  seedTask({ id: 'so2-task-2', workspace: 'ws-so-2' });

  seedSession({ id: 'so2-s1', agentId: 'so2-agent-a', taskId: 'so2-task-1', status: 'active' });
  seedSession({ id: 'so2-s2', agentId: 'so2-agent-b', taskId: 'so2-task-1', status: 'active' });
  seedSession({ id: 'so2-s3', agentId: 'so2-agent-a', taskId: 'so2-task-2', status: 'active' });

  const closed = closeTaskSessions('so2-task-1');
  assert.equal(closed, 2, 'Should close both sessions bound to task-1');

  assert.equal(queryOne<{status:string}>('SELECT status FROM openclaw_sessions WHERE id=?', ['so2-s1'])?.status, 'ended');
  assert.equal(queryOne<{status:string}>('SELECT status FROM openclaw_sessions WHERE id=?', ['so2-s2'])?.status, 'ended');
  assert.equal(queryOne<{status:string}>('SELECT status FROM openclaw_sessions WHERE id=?', ['so2-s3'])?.status, 'active', 'task-2 session untouched');
});

test('closeTaskSessions with excludeAgentId: keeps new agent session, closes others', () => {
  seedWorkspace('ws-so-3');
  seedAgent({ id: 'so3-agent-old', workspace: 'ws-so-3' });
  seedAgent({ id: 'so3-agent-new', workspace: 'ws-so-3' });
  seedTask({ id: 'so3-task-1', workspace: 'ws-so-3', assignedAgentId: 'so3-agent-new' });

  // Old agent still has active session after handoff
  seedSession({ id: 'so3-old-sess', agentId: 'so3-agent-old', taskId: 'so3-task-1', status: 'active' });
  // New agent's fresh session
  seedSession({ id: 'so3-new-sess', agentId: 'so3-agent-new', taskId: 'so3-task-1', status: 'active' });

  const closed = closeTaskSessions('so3-task-1', { excludeAgentId: 'so3-agent-new' });
  assert.equal(closed, 1, 'Only old agent session should be closed');

  assert.equal(queryOne<{status:string}>('SELECT status FROM openclaw_sessions WHERE id=?', ['so3-old-sess'])?.status, 'ended');
  assert.equal(queryOne<{status:string}>('SELECT status FROM openclaw_sessions WHERE id=?', ['so3-new-sess'])?.status, 'active');
});

test('zombie grace period: recently assigned agent is not zombie even without session', () => {
  seedWorkspace('ws-so-4');
  seedAgent({ id: 'so4-agent', workspace: 'ws-so-4', status: 'working' });
  // updatedSecondsAgo = 10 — well within ZOMBIE_GRACE_SECONDS (90)
  seedTask({ id: 'so4-task', workspace: 'ws-so-4', assignedAgentId: 'so4-agent', status: 'in_progress', updatedSecondsAgo: 10 });
  // No session exists yet (dispatch in flight)

  const health = checkAgentHealth('so4-agent');
  assert.notEqual(health, 'zombie', 'Recently assigned agent without session must not be zombie');
  // Acceptable states during grace: 'working' (the grace period returns 'working')
  assert.equal(health, 'working', 'Grace period should return working');
});

test('zombie fires after grace period expires', () => {
  seedWorkspace('ws-so-5');
  seedAgent({ id: 'so5-agent', workspace: 'ws-so-5', status: 'working' });
  // updatedSecondsAgo = 200 — beyond ZOMBIE_GRACE_SECONDS (90)
  seedTask({ id: 'so5-task', workspace: 'ws-so-5', assignedAgentId: 'so5-agent', status: 'in_progress', updatedSecondsAgo: 200 });
  // Latest session for agent is ended (not active) — no task-bound session either
  seedSession({ id: 'so5-old-sess', agentId: 'so5-agent', taskId: null, status: 'ended' });

  const health = checkAgentHealth('so5-agent');
  assert.equal(health, 'zombie', 'Agent with expired grace and no active session must be zombie');
});

test('closeOrphanedAgentSessions: closes sessions whose task is now owned by another agent', () => {
  seedWorkspace('ws-so-6');
  seedAgent({ id: 'so6-agent-builder', workspace: 'ws-so-6' });
  seedAgent({ id: 'so6-agent-tester', workspace: 'ws-so-6' });
  // Task now owned by tester (after workflow handoff)
  seedTask({ id: 'so6-task', workspace: 'ws-so-6', assignedAgentId: 'so6-agent-tester', status: 'testing' });

  // Builder still has an active session from when it owned the task (was never closed)
  seedSession({ id: 'so6-builder-sess', agentId: 'so6-agent-builder', taskId: 'so6-task', status: 'active' });
  // Tester's legitimate session
  seedSession({ id: 'so6-tester-sess', agentId: 'so6-agent-tester', taskId: 'so6-task', status: 'active' });

  const closedForBuilder = closeOrphanedAgentSessions('so6-agent-builder');
  assert.equal(closedForBuilder, 1, 'Builder orphaned session must be closed');

  assert.equal(queryOne<{status:string}>('SELECT status FROM openclaw_sessions WHERE id=?', ['so6-builder-sess'])?.status, 'ended');
  assert.equal(queryOne<{status:string}>('SELECT status FROM openclaw_sessions WHERE id=?', ['so6-tester-sess'])?.status, 'active', 'Tester session untouched');
});

test('closeOrphanedAgentSessions: closes sessions for done tasks', () => {
  seedWorkspace('ws-so-7');
  seedAgent({ id: 'so7-agent', workspace: 'ws-so-7' });
  // Task is done — session should be cleaned up
  seedTask({ id: 'so7-done-task', workspace: 'ws-so-7', assignedAgentId: 'so7-agent', status: 'done' });
  // Active session still pointing at done task
  seedSession({ id: 'so7-stale-sess', agentId: 'so7-agent', taskId: 'so7-done-task', status: 'active' });

  const closed = closeOrphanedAgentSessions('so7-agent');
  assert.equal(closed, 1, 'Session for done task must be closed');
  assert.equal(queryOne<{status:string}>('SELECT status FROM openclaw_sessions WHERE id=?', ['so7-stale-sess'])?.status, 'ended');
});

test('agent reused after completion: prior task session does not cause zombie on new task', () => {
  seedWorkspace('ws-so-8');
  seedAgent({ id: 'so8-agent', workspace: 'ws-so-8', status: 'working' });

  // Completed task that still has an active session (crash/restart before cleanup)
  seedTask({ id: 'so8-done-task', workspace: 'ws-so-8', assignedAgentId: 'so8-agent', status: 'done' });
  seedSession({ id: 'so8-stale-sess', agentId: 'so8-agent', taskId: 'so8-done-task', status: 'active' });

  // New task freshly assigned — dispatch not yet run, but within grace period
  seedTask({ id: 'so8-new-task', workspace: 'ws-so-8', assignedAgentId: 'so8-agent', status: 'in_progress', updatedSecondsAgo: 5 });

  // Reconcile orphaned sessions (simulating what health cycle does)
  closeOrphanedAgentSessions('so8-agent');

  // Stale session for done task should now be ended
  assert.equal(queryOne<{status:string}>('SELECT status FROM openclaw_sessions WHERE id=?', ['so8-stale-sess'])?.status, 'ended');

  // Health check for new task: still in grace period → working
  const health = checkAgentHealth('so8-agent');
  assert.equal(health, 'working', 'Agent within grace period on new task must not be zombie');
});
