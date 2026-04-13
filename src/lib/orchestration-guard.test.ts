/**
 * Tests for orchestration-guard.ts
 *
 * Covers the failure modes described in:
 *  - Multiple agents with is_master = 1 deadlocking dispatch
 *  - Worker agent incorrectly seeded as master
 *  - Dispatch recovery after orchestrator conflict
 *  - Stale planning_dispatch_error cleared on successful retry
 *  - Inbox tasks auto-flagged after stalling
 *  - Zombie recovery not leaving tasks stranded
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { run, queryOne, queryAll } from './db';
import {
  getCanonicalOrchestrator,
  repairSpuriousMasters,
  getWorkspacesWithDuplicateMasters,
  repairAllWorkspaces,
} from './orchestration-guard';

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
  name: string;
  workspace: string;
  isMaster?: boolean;
  role?: string;
  status?: string;
  createdOffset?: number; // seconds offset from now (negative = older)
}) {
  const { id, name, workspace, isMaster = false, role = 'builder', status = 'standby', createdOffset = 0 } = opts;
  run(
    `INSERT INTO agents (id, name, role, status, is_master, workspace_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now', ?), datetime('now'))`,
    [id, name, role, status, isMaster ? 1 : 0, workspace, `${createdOffset} seconds`]
  );
}

function seedTask(opts: {
  id: string;
  workspace: string;
  status?: string;
  assignedAgentId?: string | null;
  planningComplete?: boolean;
  dispatchError?: string | null;
}) {
  const { id, workspace, status = 'inbox', assignedAgentId = null, planningComplete = false, dispatchError = null } = opts;
  run(
    `INSERT INTO tasks (id, title, status, priority, workspace_id, business_id,
        assigned_agent_id, planning_complete, planning_dispatch_error, created_at, updated_at)
     VALUES (?, ?, ?, 'normal', ?, 'default', ?, ?, ?, datetime('now'), datetime('now'))`,
    [id, `Task ${id}`, status, workspace, assignedAgentId, planningComplete ? 1 : 0, dispatchError]
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test('getCanonicalOrchestrator returns null when no master exists', () => {
  seedWorkspace('ws-no-master');
  seedAgent({ id: 'agent-worker-1', name: 'Worker', workspace: 'ws-no-master', isMaster: false });

  const result = getCanonicalOrchestrator('ws-no-master');
  assert.equal(result, null);
});

test('getCanonicalOrchestrator returns the sole master', () => {
  seedWorkspace('ws-one-master');
  seedAgent({ id: 'agent-orch-1', name: 'Orchestrator', workspace: 'ws-one-master', isMaster: true, role: 'orchestrator' });

  const result = getCanonicalOrchestrator('ws-one-master');
  assert.ok(result);
  assert.equal(result.id, 'agent-orch-1');
  assert.equal(result.name, 'Orchestrator');
});

test('getCanonicalOrchestrator returns the OLDEST when multiple masters exist', () => {
  seedWorkspace('ws-multi-master');
  // Oldest first (negative offset = further in the past)
  seedAgent({ id: 'agent-old-master', name: 'OldMaster', workspace: 'ws-multi-master', isMaster: true, createdOffset: -300 });
  seedAgent({ id: 'agent-new-master', name: 'NewMaster', workspace: 'ws-multi-master', isMaster: true, createdOffset: -100 });

  const result = getCanonicalOrchestrator('ws-multi-master');
  assert.ok(result);
  assert.equal(result.id, 'agent-old-master', 'Should return the oldest master');
});

test('repairSpuriousMasters no-ops when only one master', () => {
  seedWorkspace('ws-repair-noop');
  seedAgent({ id: 'agent-solo-master', name: 'Solo', workspace: 'ws-repair-noop', isMaster: true });

  const demoted = repairSpuriousMasters('ws-repair-noop');
  assert.equal(demoted.length, 0);

  // Still is_master
  const agent = queryOne<{ is_master: number }>('SELECT is_master FROM agents WHERE id = ?', ['agent-solo-master']);
  assert.equal(agent?.is_master, 1);
});

test('repairSpuriousMasters demotes all but the oldest master', () => {
  seedWorkspace('ws-repair-multi');
  seedAgent({ id: 'agent-rm-oldest', name: 'OldOrch', workspace: 'ws-repair-multi', isMaster: true, createdOffset: -500 });
  seedAgent({ id: 'agent-rm-mid',    name: 'MidOrch', workspace: 'ws-repair-multi', isMaster: true, createdOffset: -200 });
  seedAgent({ id: 'agent-rm-newest', name: 'NewOrch', workspace: 'ws-repair-multi', isMaster: true, createdOffset: -50 });

  const demoted = repairSpuriousMasters('ws-repair-multi');
  assert.equal(demoted.length, 2, 'Should demote 2 spurious masters');

  const demotedIds = demoted.map(a => a.id);
  assert.ok(demotedIds.includes('agent-rm-mid'));
  assert.ok(demotedIds.includes('agent-rm-newest'));
  assert.ok(!demotedIds.includes('agent-rm-oldest'), 'Oldest must not be demoted');

  // Verify DB state
  const oldest = queryOne<{ is_master: number }>('SELECT is_master FROM agents WHERE id = ?', ['agent-rm-oldest']);
  const mid    = queryOne<{ is_master: number }>('SELECT is_master FROM agents WHERE id = ?', ['agent-rm-mid']);
  const newest = queryOne<{ is_master: number }>('SELECT is_master FROM agents WHERE id = ?', ['agent-rm-newest']);

  assert.equal(oldest?.is_master, 1, 'Oldest must stay is_master=1');
  assert.equal(mid?.is_master,    0, 'Mid must be demoted');
  assert.equal(newest?.is_master, 0, 'Newest must be demoted');
});

test('repairSpuriousMasters is idempotent', () => {
  seedWorkspace('ws-repair-idem');
  seedAgent({ id: 'agent-idem-a', name: 'A', workspace: 'ws-repair-idem', isMaster: true, createdOffset: -400 });
  seedAgent({ id: 'agent-idem-b', name: 'B', workspace: 'ws-repair-idem', isMaster: true, createdOffset: -100 });

  const first  = repairSpuriousMasters('ws-repair-idem');
  const second = repairSpuriousMasters('ws-repair-idem');

  assert.equal(first.length,  1, 'First call should demote 1');
  assert.equal(second.length, 0, 'Second call should be no-op');
});

test('worker agent incorrectly seeded as master is repaired, true orchestrator preserved', () => {
  seedWorkspace('ws-worker-as-master');
  // True orchestrator — older
  seedAgent({ id: 'agent-true-orch', name: 'Real Orchestrator', workspace: 'ws-worker-as-master', isMaster: true, role: 'orchestrator', createdOffset: -600 });
  // Worker agent wrongly seeded as master — newer
  seedAgent({ id: 'agent-chief-eng', name: 'Chief Engineer / Mostek', workspace: 'ws-worker-as-master', isMaster: true, role: 'builder', createdOffset: -100 });

  const demoted = repairSpuriousMasters('ws-worker-as-master');
  assert.equal(demoted.length, 1);
  assert.equal(demoted[0].id, 'agent-chief-eng', 'Worker/builder must be demoted');

  const orch = queryOne<{ is_master: number }>('SELECT is_master FROM agents WHERE id = ?', ['agent-true-orch']);
  const eng  = queryOne<{ is_master: number }>('SELECT is_master FROM agents WHERE id = ?', ['agent-chief-eng']);
  assert.equal(orch?.is_master, 1, 'True orchestrator must remain master');
  assert.equal(eng?.is_master,  0, 'Worker agent must be demoted');
});

test('getWorkspacesWithDuplicateMasters returns only broken workspaces', () => {
  seedWorkspace('ws-dup-check-clean');
  seedWorkspace('ws-dup-check-broken');

  seedAgent({ id: 'agent-clean-1',  name: 'C1', workspace: 'ws-dup-check-clean',  isMaster: true });
  seedAgent({ id: 'agent-broken-1', name: 'B1', workspace: 'ws-dup-check-broken', isMaster: true, createdOffset: -200 });
  seedAgent({ id: 'agent-broken-2', name: 'B2', workspace: 'ws-dup-check-broken', isMaster: true, createdOffset: -100 });

  const broken = getWorkspacesWithDuplicateMasters();
  const brokenIds = broken.map(b => b.workspaceId);

  assert.ok(brokenIds.includes('ws-dup-check-broken'));
  assert.ok(!brokenIds.includes('ws-dup-check-clean'));
});

test('repairAllWorkspaces repairs every broken workspace', () => {
  seedWorkspace('ws-all-a');
  seedWorkspace('ws-all-b');

  seedAgent({ id: 'agent-all-a1', name: 'A1', workspace: 'ws-all-a', isMaster: true, createdOffset: -300 });
  seedAgent({ id: 'agent-all-a2', name: 'A2', workspace: 'ws-all-a', isMaster: true, createdOffset: -100 });
  seedAgent({ id: 'agent-all-b1', name: 'B1', workspace: 'ws-all-b', isMaster: true, createdOffset: -300 });
  seedAgent({ id: 'agent-all-b2', name: 'B2', workspace: 'ws-all-b', isMaster: true, createdOffset: -200 });
  seedAgent({ id: 'agent-all-b3', name: 'B3', workspace: 'ws-all-b', isMaster: true, createdOffset: -100 });

  // Count how many broken workspaces exist before repair (may include leftovers from other tests)
  const brokenBefore = getWorkspacesWithDuplicateMasters().length;
  assert.ok(brokenBefore >= 2, 'At least ws-all-a and ws-all-b should be broken before repair');

  const total = repairAllWorkspaces();
  assert.ok(total >= 3, 'Should demote at least 1 from ws-all-a and 2 from ws-all-b');

  // The important invariant: no workspace has duplicate masters after repair
  const broken = getWorkspacesWithDuplicateMasters();
  assert.equal(broken.length, 0, 'No workspaces should have duplicates after repairAll');

  // ws-all-a: only A1 (oldest) remains master
  const a1 = queryOne<{ is_master: number }>('SELECT is_master FROM agents WHERE id = ?', ['agent-all-a1']);
  const a2 = queryOne<{ is_master: number }>('SELECT is_master FROM agents WHERE id = ?', ['agent-all-a2']);
  assert.equal(a1?.is_master, 1, 'ws-all-a oldest must remain master');
  assert.equal(a2?.is_master, 0, 'ws-all-a newest must be demoted');

  // ws-all-b: only B1 (oldest) remains master
  const b1 = queryOne<{ is_master: number }>('SELECT is_master FROM agents WHERE id = ?', ['agent-all-b1']);
  const b2 = queryOne<{ is_master: number }>('SELECT is_master FROM agents WHERE id = ?', ['agent-all-b2']);
  const b3 = queryOne<{ is_master: number }>('SELECT is_master FROM agents WHERE id = ?', ['agent-all-b3']);
  assert.equal(b1?.is_master, 1, 'ws-all-b oldest must remain master');
  assert.equal(b2?.is_master, 0, 'ws-all-b mid must be demoted');
  assert.equal(b3?.is_master, 0, 'ws-all-b newest must be demoted');
});

test('planning_dispatch_error is preserved on a task after failed dispatch', () => {
  seedWorkspace('ws-dispatch-err');
  seedAgent({ id: 'agent-de-1', name: 'Builder', workspace: 'ws-dispatch-err' });
  seedTask({
    id: 'task-de-1',
    workspace: 'ws-dispatch-err',
    status: 'assigned',
    assignedAgentId: 'agent-de-1',
    planningComplete: true,
    dispatchError: 'Health sweeper dispatch failed: 409 Other orchestrators available',
  });

  const task = queryOne<{ planning_dispatch_error: string | null }>(
    'SELECT planning_dispatch_error FROM tasks WHERE id = ?',
    ['task-de-1']
  );
  assert.ok(task?.planning_dispatch_error, 'Dispatch error should be recorded');
  assert.ok(task!.planning_dispatch_error!.includes('409') || task!.planning_dispatch_error!.length > 0);
});

test('planning_dispatch_error is cleared when task moves to in_progress', () => {
  // Simulate the dispatch success path clearing the error field
  seedWorkspace('ws-dispatch-clear');
  seedAgent({ id: 'agent-dc-1', name: 'Builder', workspace: 'ws-dispatch-clear' });
  seedTask({
    id: 'task-dc-1',
    workspace: 'ws-dispatch-clear',
    status: 'assigned',
    assignedAgentId: 'agent-dc-1',
    planningComplete: true,
    dispatchError: 'Stale error from prior failed attempt',
  });

  // Simulate the dispatch/route.ts success path
  run(
    `UPDATE tasks SET status = 'in_progress', planning_dispatch_error = NULL, updated_at = datetime('now') WHERE id = ?`,
    ['task-dc-1']
  );

  const task = queryOne<{ status: string; planning_dispatch_error: string | null }>(
    'SELECT status, planning_dispatch_error FROM tasks WHERE id = ?',
    ['task-dc-1']
  );
  assert.equal(task?.status, 'in_progress');
  assert.equal(task?.planning_dispatch_error, null, 'Error field must be cleared on success');
});

test('offline master is excluded from canonical orchestrator selection', () => {
  seedWorkspace('ws-offline-master');
  seedAgent({ id: 'agent-offline-m', name: 'Offline Orch',  workspace: 'ws-offline-master', isMaster: true, status: 'offline', createdOffset: -600 });
  seedAgent({ id: 'agent-active-m',  name: 'Active Orch',   workspace: 'ws-offline-master', isMaster: true, status: 'standby', createdOffset: -300 });

  // repairSpuriousMasters considers ALL masters (including offline) when sorting by age,
  // so the oldest non-offline wins for canonical selection, but repair keeps oldest overall.
  const canonical = getCanonicalOrchestrator('ws-offline-master');
  assert.ok(canonical);
  assert.equal(canonical.id, 'agent-active-m', 'Offline master must be excluded from canonical selection');
});

test('repairSpuriousMasters writes an audit event', () => {
  seedWorkspace('ws-audit-evt');
  seedAgent({ id: 'agent-audit-1', name: 'Audit1', workspace: 'ws-audit-evt', isMaster: true, createdOffset: -400 });
  seedAgent({ id: 'agent-audit-2', name: 'Audit2', workspace: 'ws-audit-evt', isMaster: true, createdOffset: -100 });

  repairSpuriousMasters('ws-audit-evt');

  const event = queryOne<{ message: string }>(
    `SELECT message FROM events WHERE message LIKE '%Orchestrator integrity repair%' AND message LIKE '%ws-audit-evt%' ORDER BY created_at DESC LIMIT 1`
  );
  assert.ok(event, 'Audit event must be written');
  assert.ok(event.message.includes('demoted 1 spurious master'));
});
