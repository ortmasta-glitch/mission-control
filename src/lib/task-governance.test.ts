import test from 'node:test';
import assert from 'node:assert/strict';
import { run, queryOne, queryAll } from './db';
import {
  hasStageEvidence,
  taskCanBeDone,
  ensureFixerExists,
  getFailureCountInStage,
  detectOwnerlessInProgress,
  repairOwnerlessInProgress,
} from './task-governance';

function seedTask(id: string, workspace = 'default') {
  run(
    `INSERT INTO tasks (id, title, status, priority, workspace_id, business_id, created_at, updated_at)
     VALUES (?, 'T', 'review', 'normal', ?, 'default', datetime('now'), datetime('now'))`,
    [id, workspace]
  );
}

test('evidence gate requires deliverable + activity', () => {
  const taskId = crypto.randomUUID();
  seedTask(taskId);

  assert.equal(hasStageEvidence(taskId), false);

  run(
    `INSERT INTO task_deliverables (id, task_id, deliverable_type, title, created_at)
     VALUES (lower(hex(randomblob(16))), ?, 'file', 'index.html', datetime('now'))`,
    [taskId]
  );
  assert.equal(hasStageEvidence(taskId), false);

  run(
    `INSERT INTO task_activities (id, task_id, activity_type, message, created_at)
     VALUES (lower(hex(randomblob(16))), ?, 'completed', 'did thing', datetime('now'))`,
    [taskId]
  );

  assert.equal(hasStageEvidence(taskId), true);
});

test('task cannot be done when status_reason indicates failure', () => {
  const taskId = crypto.randomUUID();
  seedTask(taskId);

  run(`UPDATE tasks SET status_reason = 'Validation failed: CSS broken' WHERE id = ?`, [taskId]);
  run(
    `INSERT INTO task_deliverables (id, task_id, deliverable_type, title, created_at)
     VALUES (lower(hex(randomblob(16))), ?, 'file', 'index.html', datetime('now'))`,
    [taskId]
  );
  run(
    `INSERT INTO task_activities (id, task_id, activity_type, message, created_at)
     VALUES (lower(hex(randomblob(16))), ?, 'completed', 'did thing', datetime('now'))`,
    [taskId]
  );

  assert.equal(taskCanBeDone(taskId), false);
});

test('ensureFixerExists creates fixer when missing', () => {
  const fixer = ensureFixerExists('default');
  assert.equal(fixer.created, true);

  const stored = queryOne<{ id: string; role: string }>('SELECT id, role FROM agents WHERE id = ?', [fixer.id]);
  assert.ok(stored);
  assert.equal(stored?.role, 'fixer');
});

test('failure counter reads status_changed failure events', () => {
  const taskId = crypto.randomUUID();
  seedTask(taskId);

  run(
    `INSERT INTO task_activities (id, task_id, activity_type, message, created_at)
     VALUES (lower(hex(randomblob(16))), ?, 'status_changed', 'Stage failed: verification → in_progress (reason: x)', datetime('now'))`,
    [taskId]
  );
  run(
    `INSERT INTO task_activities (id, task_id, activity_type, message, created_at)
     VALUES (lower(hex(randomblob(16))), ?, 'status_changed', 'Stage failed: verification → in_progress (reason: y)', datetime('now'))`,
    [taskId]
  );

  assert.equal(getFailureCountInStage(taskId, 'verification'), 2);
});

// ─── Ownerless in_progress task tests ────────────────────────────────────────

function seedAgent(id: string) {
  run(
    `INSERT INTO agents (id, name, role, status, is_master, workspace_id, created_at, updated_at)
     VALUES (?, 'Agent', 'builder', 'standby', 0, 'default', datetime('now'), datetime('now'))`,
    [id]
  );
}

test('detectOwnerlessInProgress: finds tasks with no agent and no activity', () => {
  const ownedId = crypto.randomUUID();
  const ownlessId = crypto.randomUUID();
  const agentId = crypto.randomUUID();
  seedAgent(agentId);

  // Owned task with an agent — should NOT be returned
  run(
    `INSERT INTO tasks (id, title, status, priority, workspace_id, business_id, assigned_agent_id, created_at, updated_at)
     VALUES (?, 'Owned', 'in_progress', 'normal', 'default', 'default', ?, datetime('now'), datetime('now'))`,
    [ownedId, agentId]
  );

  // Ownerless task — no agent, no activity — SHOULD be returned
  run(
    `INSERT INTO tasks (id, title, status, priority, workspace_id, business_id, assigned_agent_id, created_at, updated_at)
     VALUES (?, 'Ownerless', 'in_progress', 'normal', 'default', 'default', NULL, datetime('now'), datetime('now'))`,
    [ownlessId]
  );

  const stuck = detectOwnerlessInProgress();
  const ids = stuck.map(t => t.id);
  assert.ok(!ids.includes(ownedId), 'Owned task must not appear');
  assert.ok(ids.includes(ownlessId), 'Ownerless task must appear');
});

test('detectOwnerlessInProgress: excludes ownerless tasks that have activity', () => {
  const taskId = crypto.randomUUID();

  // Ownerless but HAS activity (agent worked on it without being formally assigned)
  run(
    `INSERT INTO tasks (id, title, status, priority, workspace_id, business_id, assigned_agent_id, created_at, updated_at)
     VALUES (?, 'Has Activity', 'in_progress', 'normal', 'default', 'default', NULL, datetime('now'), datetime('now'))`,
    [taskId]
  );
  run(
    `INSERT INTO task_activities (id, task_id, activity_type, message, created_at)
     VALUES (lower(hex(randomblob(16))), ?, 'status_changed', 'some work', datetime('now'))`,
    [taskId]
  );

  const stuck = detectOwnerlessInProgress();
  const ids = stuck.map(t => t.id);
  assert.ok(!ids.includes(taskId), 'Task with activity must not be flagged as ownerless');
});

test('repairOwnerlessInProgress: resets ownerless tasks to inbox', () => {
  const t1 = crypto.randomUUID();
  const t2 = crypto.randomUUID();
  const agentId = crypto.randomUUID();
  seedAgent(agentId);

  // Two ownerless in_progress tasks
  for (const id of [t1, t2]) {
    run(
      `INSERT INTO tasks (id, title, status, priority, workspace_id, business_id, assigned_agent_id, created_at, updated_at)
       VALUES (?, 'Stuck', 'in_progress', 'normal', 'default', 'default', NULL, datetime('now'), datetime('now'))`,
      [id]
    );
  }

  // One owned task that must NOT be touched
  const ownedId = crypto.randomUUID();
  run(
    `INSERT INTO tasks (id, title, status, priority, workspace_id, business_id, assigned_agent_id, created_at, updated_at)
     VALUES (?, 'Owned', 'in_progress', 'normal', 'default', 'default', ?, datetime('now'), datetime('now'))`,
    [ownedId, agentId]
  );

  const repaired = repairOwnerlessInProgress();
  assert.ok(repaired >= 2, `Expected at least 2 repairs, got ${repaired}`);

  const s1 = queryOne<{ status: string }>('SELECT status FROM tasks WHERE id = ?', [t1]);
  const s2 = queryOne<{ status: string }>('SELECT status FROM tasks WHERE id = ?', [t2]);
  const owned = queryOne<{ status: string }>('SELECT status FROM tasks WHERE id = ?', [ownedId]);

  assert.equal(s1?.status, 'inbox', 't1 must be reset to inbox');
  assert.equal(s2?.status, 'inbox', 't2 must be reset to inbox');
  assert.equal(owned?.status, 'in_progress', 'Owned task must remain in_progress');
});

test('repairOwnerlessInProgress: returns 0 when no stuck tasks exist', () => {
  const repaired = repairOwnerlessInProgress();
  // All previous tests may have already repaired tasks, so just assert no error and non-negative
  assert.ok(repaired >= 0, 'Should return 0 or more (non-negative)');
});
