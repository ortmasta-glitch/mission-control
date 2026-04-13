/**
 * completion.test.ts — Autonomous task completion hook tests.
 *
 * Covers:
 *  1. Autonomous task marked done → COMPLETE line appended to log
 *  2. Non-autonomous task → no log entry written (not_autonomous)
 *  3. Repeated done transition → no duplicate COMPLETE entry (caller's guard)
 *  4. Metadata extraction failure (corrupt block) → safe no-op
 *  5. Missing description (null/undefined) → safe no-op
 *  6. goalTag and lane propagated into COMPLETE log entry
 *  7. agentId used when present; falls back to 'system'
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { run } from '@/lib/db';

import { handleAutonomousCompletion, shouldLogAutonomousCompletion } from './completion';
import { appendAutonomousMetadata } from './metadata';
import { parseTasksLog } from './parser';
import { getOrCreateConfig, upsertConfig } from './runner';

// ── Helpers ───────────────────────────────────────────────────────────────────

function tmpFile(name: string): string {
  return path.join(os.tmpdir(), `mc-completion-test-${process.pid}-${name}`);
}

function seedWorkspace(id: string) {
  run(
    `INSERT OR IGNORE INTO workspaces (id, name, slug, created_at, updated_at)
     VALUES (?, ?, ?, datetime('now'), datetime('now'))`,
    [id, id, id]
  );
}

/**
 * Build a task description that includes a valid AUTONOMOUS_META block,
 * matching what the runner would produce.
 */
function makeAutonomousDescription(opts: {
  runId?: string;
  goalTag?: string;
  lane?: string;
  approvalState?: string;
} = {}): string {
  const {
    runId = 'run-test-001',
    goalTag = 'mission-control-internal-tools',
    lane = 'now',
    approvalState = 'auto_approved',
  } = opts;

  const base = 'Implement bulk task actions for the kanban board.';
  return appendAutonomousMetadata(base, {
    source: 'goal_daily_generation',
    autonomousRunId: runId,
    goalTag,
    lane: lane as 'now' | 'next' | 'later',
    approvalState: approvalState as 'auto_approved' | 'pending_approval',
    generatedAt: '2026-04-10T06:00:00.000Z',
  });
}

/** Point the workspace config at a temp log file for isolation. */
function configWithTempLog(workspaceId: string): string {
  seedWorkspace(workspaceId);
  getOrCreateConfig(workspaceId);
  const logFile = tmpFile(`${workspaceId}-log.md`);
  upsertConfig(workspaceId, { log_file_path: logFile });
  return logFile;
}

// ── Core: autonomous task reaches done ───────────────────────────────────────

test('completion hook: autonomous task done → COMPLETE entry appended', () => {
  const ws = 'ws-comp-1';
  const logFile = configWithTempLog(ws);

  const result = handleAutonomousCompletion({
    taskId: 'task-comp-001',
    taskTitle: 'Build kanban drag-and-drop',
    taskDescription: makeAutonomousDescription({ runId: 'run-comp-001', goalTag: 'mission-control-internal-tools', lane: 'now' }),
    workspaceId: ws,
    agentId: 'agent-builder',
  });

  assert.equal(result.logged, true);
  assert.equal(result.reason, undefined);

  const entries = parseTasksLog(logFile);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].event, 'COMPLETE');
  assert.equal(entries[0].taskId.trim(), 'task-comp-001');
  assert.ok(entries[0].meta.includes('agent:agent-builder'));
  assert.ok(entries[0].meta.includes('run:run-comp-001'));
  assert.ok(entries[0].meta.includes('goal:mission-control-internal-tools'));
  assert.ok(entries[0].meta.includes('lane:now'));

  fs.unlinkSync(logFile);
});

// ── Non-autonomous task → no-op ───────────────────────────────────────────────

test('completion hook: non-autonomous task → logged=false, reason=not_autonomous', () => {
  const ws = 'ws-comp-2';
  const logFile = configWithTempLog(ws);

  const result = handleAutonomousCompletion({
    taskId: 'task-manual-001',
    taskTitle: 'Manually created task',
    taskDescription: 'This is a plain task description with no AUTONOMOUS_META block.',
    workspaceId: ws,
    agentId: 'agent-builder',
  });

  assert.equal(result.logged, false);
  assert.equal(result.reason, 'not_autonomous');

  // No log file created (or file is empty if it already existed)
  const exists = fs.existsSync(logFile);
  if (exists) {
    const entries = parseTasksLog(logFile);
    assert.equal(entries.length, 0, 'no COMPLETE entries for non-autonomous tasks');
    fs.unlinkSync(logFile);
  }
});

test('completion hook: null description → not_autonomous (safe no-op)', () => {
  const ws = 'ws-comp-3';
  const logFile = configWithTempLog(ws);

  const result = handleAutonomousCompletion({
    taskId: 'task-null-desc',
    taskTitle: 'Task with null description',
    taskDescription: null,
    workspaceId: ws,
  });

  assert.equal(result.logged, false);
  assert.equal(result.reason, 'not_autonomous');

  if (fs.existsSync(logFile)) fs.unlinkSync(logFile);
});

test('completion hook: undefined description → not_autonomous (safe no-op)', () => {
  const ws = 'ws-comp-4';
  const logFile = configWithTempLog(ws);

  const result = handleAutonomousCompletion({
    taskId: 'task-undef-desc',
    taskTitle: 'Task with undefined description',
    taskDescription: undefined,
    workspaceId: ws,
  });

  assert.equal(result.logged, false);
  assert.equal(result.reason, 'not_autonomous');

  if (fs.existsSync(logFile)) fs.unlinkSync(logFile);
});

// ── Corrupt metadata block → safe no-op ──────────────────────────────────────

test('completion hook: corrupt AUTONOMOUS_META block → not_autonomous', () => {
  const ws = 'ws-comp-5';
  const logFile = configWithTempLog(ws);

  const corrupt = 'Build something.\n\n<!-- AUTONOMOUS_META {broken json -->';
  const result = handleAutonomousCompletion({
    taskId: 'task-corrupt',
    taskTitle: 'Task with corrupt meta',
    taskDescription: corrupt,
    workspaceId: ws,
  });

  assert.equal(result.logged, false);
  assert.equal(result.reason, 'not_autonomous', 'corrupt block → extractAutonomousMetadata returns null → not_autonomous');

  if (fs.existsSync(logFile)) fs.unlinkSync(logFile);
});

// ── agentId fallback ──────────────────────────────────────────────────────────

test('completion hook: no agentId → falls back to system in log meta', () => {
  const ws = 'ws-comp-6';
  const logFile = configWithTempLog(ws);

  handleAutonomousCompletion({
    taskId: 'task-comp-sys',
    taskTitle: 'System completed task',
    taskDescription: makeAutonomousDescription(),
    workspaceId: ws,
    // agentId omitted → should fall back to 'system'
  });

  const entries = parseTasksLog(logFile);
  assert.equal(entries.length, 1);
  assert.ok(entries[0].meta.includes('agent:system'), 'should use system when no agentId');

  fs.unlinkSync(logFile);
});

test('completion hook: null agentId → falls back to system', () => {
  const ws = 'ws-comp-7';
  const logFile = configWithTempLog(ws);

  handleAutonomousCompletion({
    taskId: 'task-comp-null-agent',
    taskTitle: 'Task with null agent',
    taskDescription: makeAutonomousMetadata(),
    workspaceId: ws,
    agentId: null,
  });

  const entries = parseTasksLog(logFile);
  if (entries.length > 0) {
    assert.ok(entries[0].meta.includes('agent:system'));
  }

  if (fs.existsSync(logFile)) fs.unlinkSync(logFile);
});

function makeAutonomousMetadata(): string {
  return makeAutonomousDescription();
}

// ── goalTag and lane propagation ──────────────────────────────────────────────

test('completion hook: goalTag and lane from metadata appear in COMPLETE entry', () => {
  const ws = 'ws-comp-8';
  const logFile = configWithTempLog(ws);

  handleAutonomousCompletion({
    taskId: 'task-comp-tagged',
    taskTitle: 'Financial Planning dashboard',
    taskDescription: makeAutonomousDescription({
      runId: 'run-fp-001',
      goalTag: 'financial-planning',
      lane: 'next',
    }),
    workspaceId: ws,
    agentId: 'agent-builder',
  });

  const entries = parseTasksLog(logFile);
  assert.equal(entries.length, 1);
  assert.ok(entries[0].meta.includes('goal:financial-planning'));
  assert.ok(entries[0].meta.includes('lane:next'));
  assert.ok(entries[0].meta.includes('run:run-fp-001'));

  fs.unlinkSync(logFile);
});

// ── Repeated done transition: no duplicate ────────────────────────────────────

test('completion hook: repeated done transition is blocked by the route-level guard', () => {
  const ws = 'ws-comp-9';
  const logFile = configWithTempLog(ws);
  const desc = makeAutonomousDescription({ runId: 'run-dedup-001' });

  if (shouldLogAutonomousCompletion('done', 'review')) {
    handleAutonomousCompletion({ taskId: 'task-dedup', taskTitle: 'Task', taskDescription: desc, workspaceId: ws });
  }
  if (shouldLogAutonomousCompletion('done', 'done')) {
    handleAutonomousCompletion({ taskId: 'task-dedup', taskTitle: 'Task', taskDescription: desc, workspaceId: ws });
  }

  const entries = parseTasksLog(logFile);
  assert.equal(entries.length, 1, 'repeated done PATCH must not append a duplicate COMPLETE entry');
  assert.equal(entries[0].event, 'COMPLETE');

  fs.unlinkSync(logFile);
});

// ── Route-level guard: existing.status !== 'done' ────────────────────────────

test('route guard: completion is only triggered when transitioning INTO done, not when already done', () => {
  assert.equal(shouldLogAutonomousCompletion('done', 'review'), true);
  assert.equal(shouldLogAutonomousCompletion('done', 'testing'), true);
  assert.equal(shouldLogAutonomousCompletion('done', 'verification'), true);
  assert.equal(shouldLogAutonomousCompletion('done', 'done'), false, 'same-to-same transition must be blocked');
  assert.equal(shouldLogAutonomousCompletion('in_progress', 'assigned'), false);
  assert.equal(shouldLogAutonomousCompletion('testing', 'in_progress'), false);
});

// ── Multiple tasks in the same log ───────────────────────────────────────────

test('completion hook: multiple autonomous tasks append to the same log file', () => {
  const ws = 'ws-comp-10';
  const logFile = configWithTempLog(ws);

  const tasks = [
    { taskId: 'task-multi-1', goalTag: 'mission-control-internal-tools', lane: 'now' },
    { taskId: 'task-multi-2', goalTag: 'financial-planning', lane: 'next' },
    { taskId: 'task-multi-3', goalTag: 'mission-control-internal-tools', lane: 'later' },
  ];

  for (const t of tasks) {
    handleAutonomousCompletion({
      taskId: t.taskId,
      taskTitle: `Task ${t.taskId}`,
      taskDescription: makeAutonomousDescription({ goalTag: t.goalTag, lane: t.lane }),
      workspaceId: ws,
      agentId: 'agent-builder',
    });
  }

  const entries = parseTasksLog(logFile);
  assert.equal(entries.length, 3, 'all three tasks logged');
  assert.ok(entries.every(e => e.event === 'COMPLETE'), 'all events are COMPLETE');
  assert.ok(entries[0].meta.includes('goal:mission-control-internal-tools'));
  assert.ok(entries[1].meta.includes('goal:financial-planning'));

  fs.unlinkSync(logFile);
});
