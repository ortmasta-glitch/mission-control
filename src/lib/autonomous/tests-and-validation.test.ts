import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { queryAll, queryOne, run } from '@/lib/db';
import { getActiveConnectionCount, registerClient, unregisterClient } from '@/lib/events';
import { emitAutopilotActivity } from '@/lib/autopilot/activity';
import { recoverOrphanedCycles } from '@/lib/autopilot/recovery';
import { checkAndRunDueAutonomousGenerations } from '@/lib/autonomous/runner';
import { ensureAutonomousScheduled } from '@/lib/autonomous/scheduler';
import { POST as createTask } from '@/app/api/tasks/route';

function seedWorkspace(id: string, name = id) {
  run(
    `INSERT OR IGNORE INTO workspaces (id, name, slug, created_at, updated_at)
     VALUES (?, ?, ?, datetime('now'), datetime('now'))`,
    [id, name, id]
  );
}

function seedWorkflowTemplate(id: string, workspaceId: string) {
  run(
    `INSERT OR REPLACE INTO workflow_templates (id, workspace_id, name, description, stages, fail_targets, is_default, created_at, updated_at)
     VALUES (?, ?, 'Default', 'Default workflow', '[]', '{}', 1, datetime('now'), datetime('now'))`,
    [id, workspaceId]
  );
}

test('scheduler module loads and exposes ensureAutonomousScheduled in test env', async () => {
  const schedulerModule = await import('@/lib/autonomous/scheduler');
  assert.equal(typeof schedulerModule.ensureAutonomousScheduled, 'function');
});

test('emitAutopilotActivity persists activity and broadcasts to connected clients', () => {
  seedWorkspace('ws-product');
  run(
    `INSERT OR IGNORE INTO products (id, workspace_id, name, created_at, updated_at)
     VALUES ('product-1', 'ws-product', 'Mission Control', datetime('now'), datetime('now'))`
  );

  const controller = {
    enqueue(chunk: Uint8Array) {
      payloads.push(Buffer.from(chunk).toString('utf8'));
    },
  } as ReadableStreamDefaultController;
  const payloads: string[] = [];

  registerClient(controller);
  try {
    emitAutopilotActivity({
      productId: 'product-1',
      cycleId: 'cycle-1',
      cycleType: 'research',
      eventType: 'heartbeat',
      message: 'Cycle heartbeat',
      detail: 'Still running',
      costUsd: 1.25,
      tokensUsed: 321,
    });
  } finally {
    unregisterClient(controller);
  }

  const row = queryOne<{ event_type: string; message: string; detail: string | null; cost_usd: number | null; tokens_used: number | null }>(
    `SELECT event_type, message, detail, cost_usd, tokens_used
     FROM autopilot_activity_log
     WHERE product_id = 'product-1' AND cycle_id = 'cycle-1'
     ORDER BY created_at DESC LIMIT 1`
  );

  assert.equal(row?.event_type, 'heartbeat');
  assert.equal(row?.message, 'Cycle heartbeat');
  assert.equal(row?.detail, 'Still running');
  assert.equal(row?.cost_usd, 1.25);
  assert.equal(row?.tokens_used, 321);
  assert.equal(payloads.length, 1);
  assert.match(payloads[0], /autopilot_activity/);
  assert.equal(getActiveConnectionCount(), 0);
});

test('recoverOrphanedCycles marks stale and max-retry cycles interrupted and recovers ideation completion', async () => {
  seedWorkspace('ws-recovery');
  run(
    `INSERT OR IGNORE INTO products (id, workspace_id, name, created_at, updated_at)
     VALUES ('product-recovery', 'ws-recovery', 'Recovery Product', datetime('now'), datetime('now'))`
  );

  const staleHeartbeat = new Date(Date.now() - 11 * 60 * 1000).toISOString();

  run(`DELETE FROM research_cycles WHERE id IN ('research-stale','research-max')`);
  run(`DELETE FROM ideation_cycles WHERE id = 'ideation-stored'`);

  run(
    `INSERT INTO research_cycles (id, product_id, status, current_phase, retry_count, last_heartbeat, started_at)
     VALUES
     ('research-stale', 'product-recovery', 'running', 'llm_polling', 0, ?, datetime('now')),
     ('research-max', 'product-recovery', 'running', 'init', 2, NULL, datetime('now'))`,
    [staleHeartbeat]
  );

  run(
    `INSERT INTO ideation_cycles (id, product_id, status, current_phase, retry_count, started_at)
     VALUES ('ideation-stored', 'product-recovery', 'running', 'ideas_stored', 0, datetime('now'))`
  );

  await recoverOrphanedCycles();

  const research = queryAll<{ id: string; status: string; error_message: string | null }>(
    `SELECT id, status, error_message FROM research_cycles WHERE id IN ('research-stale','research-max') ORDER BY id`
  );
  assert.deepEqual(research.map(r => [r.id, r.status]), [
    ['research-max', 'interrupted'],
    ['research-stale', 'interrupted'],
  ]);
  assert.match(research[0].error_message || '', /Max retries exceeded/);
  assert.match(research[1].error_message || '', /Heartbeat stale/);

  const ideation = queryOne<{ status: string; current_phase: string; completed_at: string | null }>(
    `SELECT status, current_phase, completed_at FROM ideation_cycles WHERE id = 'ideation-stored'`
  );
  assert.equal(ideation?.status, 'completed');
  assert.equal(ideation?.current_phase, 'completed');
  assert.ok(ideation?.completed_at);

  const recoveryEvents = queryAll<{ event_type: string; message: string }>(
    `SELECT event_type, message FROM autopilot_activity_log WHERE product_id = 'product-recovery' ORDER BY created_at ASC`
  );
  assert.ok(recoveryEvents.some(e => e.event_type === 'recovery_interrupted'));
  assert.ok(recoveryEvents.some(e => e.event_type === 'recovery_completed'));
});

test('POST /api/tasks creates task, event, and assigns default workflow template', async () => {
  seedWorkspace('ws-api', 'API Workspace');
  seedWorkflowTemplate('tpl-default', 'ws-api');

  const req = new NextRequest('http://localhost:4000/api/tasks', {
    method: 'POST',
    body: JSON.stringify({
      title: 'Validate task API flow',
      description: 'Create a task through the route',
      workspace_id: 'ws-api',
      priority: 'high',
    }),
    headers: { 'content-type': 'application/json' },
  });

  const response = await createTask(req);
  assert.equal(response.status, 201);
  const body = await response.json() as { id: string; title: string; workflow_template_id: string | null; workspace_id: string };

  assert.equal(body.title, 'Validate task API flow');
  assert.equal(body.workspace_id, 'ws-api');
  assert.equal(body.workflow_template_id, 'tpl-default');

  const persisted = queryOne<{ title: string; priority: string; workflow_template_id: string | null }>(
    `SELECT title, priority, workflow_template_id FROM tasks WHERE id = ?`,
    [body.id]
  );
  assert.equal(persisted?.title, 'Validate task API flow');
  assert.equal(persisted?.priority, 'high');
  assert.equal(persisted?.workflow_template_id, 'tpl-default');

  const event = queryOne<{ type: string; message: string }>(
    `SELECT type, message FROM events WHERE task_id = ? ORDER BY created_at DESC LIMIT 1`,
    [body.id]
  );
  assert.equal(event?.type, 'task_created');
  assert.match(event?.message || '', /Validate task API flow/);
});

test('POST /api/tasks rejects invalid payloads with 400', async () => {
  const req = new NextRequest('http://localhost:4000/api/tasks', {
    method: 'POST',
    body: JSON.stringify({ title: '' }),
    headers: { 'content-type': 'application/json' },
  });

  const response = await createTask(req);
  assert.equal(response.status, 400);
  const body = await response.json() as { error: string; details: unknown[] };
  assert.equal(body.error, 'Validation failed');
  assert.ok(Array.isArray(body.details));
});
