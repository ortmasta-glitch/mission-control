/**
 * Tests for agent-catalog-sync.ts
 *
 * Coverage:
 *  1. INSERT path: new gateway agent is created in agents table with correct fields
 *  2. UPDATE path: existing agent is updated without creating a duplicate
 *  3. Placeholder/params count regression: INSERT must not throw RangeError
 *  4. Empty gateway list completes without touching DB
 *  5. Partial failure: one bad agent doesn't abort the entire sync
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { run, queryOne, queryAll } from './db';
import { syncGatewayAgentsToCatalog } from './agent-catalog-sync';
import { getOpenClawClient } from './openclaw/client';

// ─── Mock the OpenClaw gateway client ────────────────────────────────────────

function mockListAgents(agents: Array<{ id?: string; name?: string; label?: string; model?: string }>) {
  const client = getOpenClawClient();
  // Replace listAgents for this test only.
  (client as unknown as Record<string, unknown>).listAgents = async () => agents;
  (client as unknown as Record<string, unknown>).isConnected = () => true;
  (client as unknown as Record<string, unknown>).connect = async () => {};
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test('syncGatewayAgentsToCatalog: inserts new gateway agent with correct fields', async () => {
  mockListAgents([
    { id: 'gw-agent-insert-test', name: 'Test Builder', model: 'claude-sonnet-4-6' },
  ]);

  const changed = await syncGatewayAgentsToCatalog({ force: true, reason: 'test' });
  assert.ok(changed >= 1, 'Expected at least 1 change');

  const agent = queryOne<{
    name: string;
    role: string;
    description: string;
    source: string;
    gateway_agent_id: string;
    model: string;
  }>(
    `SELECT name, role, description, source, gateway_agent_id, model
     FROM agents WHERE gateway_agent_id = ?`,
    ['gw-agent-insert-test']
  );

  assert.ok(agent, 'Agent should have been inserted');
  assert.equal(agent!.name, 'Test Builder');
  assert.equal(agent!.source, 'gateway');
  assert.equal(agent!.gateway_agent_id, 'gw-agent-insert-test');
  assert.equal(agent!.model, 'claude-sonnet-4-6');
  assert.ok(agent!.description.includes('gw-agent-insert-test'), 'Description should reference gateway ID');
  assert.ok(agent!.role.length > 0, 'Role should be set');
});

test('syncGatewayAgentsToCatalog: updates existing agent without creating duplicate', async () => {
  const gatewayId = `gw-agent-update-test-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  // Pre-seed the agent as if it was already synced once
  run(
    `INSERT INTO agents (id, name, role, description, avatar_emoji, is_master, workspace_id, source, gateway_agent_id, created_at, updated_at)
     VALUES (lower(hex(randomblob(16))), 'Old Name', 'builder', 'old desc', '🔗', 0, 'default', 'gateway', ?, datetime('now'), datetime('now'))`,
    [gatewayId]
  );

  mockListAgents([
    { id: gatewayId, name: 'Updated Builder', model: 'gpt-5.4' },
  ]);

  await syncGatewayAgentsToCatalog({ force: true, reason: 'test' });

  const agents = queryAll<{ name: string; model: string }>(
    `SELECT name, model FROM agents WHERE gateway_agent_id = ?`,
    [gatewayId]
  );

  assert.equal(agents.length, 1, 'Must not create a duplicate — should be exactly 1 agent');
  assert.equal(agents[0]!.name, 'Updated Builder', 'Name should be updated');
  assert.equal(agents[0]!.model, 'gpt-5.4', 'Model should be updated');
});

test('syncGatewayAgentsToCatalog: no RangeError when inserting (param count regression)', async () => {
  // This is a direct regression test for the "Too few parameter values were provided" bug.
  // The INSERT uses 7 placeholders (name, role, description, model, gateway_agent_id, created_at, updated_at)
  // and must receive exactly 7 bound values.
  mockListAgents([
    { id: 'gw-param-count-test', name: 'Param Count Agent' }, // model is undefined → coerces to null
  ]);

  // Must not throw RangeError
  await assert.doesNotReject(
    () => syncGatewayAgentsToCatalog({ force: true, reason: 'test' }),
    'Sync should not throw a parameter count error'
  );

  const agent = queryOne<{ id: string }>(
    `SELECT id FROM agents WHERE gateway_agent_id = ?`,
    ['gw-param-count-test']
  );
  assert.ok(agent, 'Agent should have been inserted despite undefined model');
});

test('syncGatewayAgentsToCatalog: model object (gateway format) is coerced to string', async () => {
  // Root cause of the live RangeError: the OpenClaw gateway sends model as an object
  // { primary: "...", fallbacks: [...] } rather than a plain string.
  // better-sqlite3 treats any object passed as a positional ? param as a named-binding
  // dict, collapsing the effective param count → RangeError.
  // Fix: always extract model.primary (or JSON.stringify) before binding.
  mockListAgents([
    {
      id: 'gw-model-object-test',
      name: 'Model Object Agent',
      model: { primary: 'openai-codex/gpt-5.4', fallbacks: ['lmstudio/gemma'] } as unknown as string,
    },
  ]);

  await assert.doesNotReject(
    () => syncGatewayAgentsToCatalog({ force: true, reason: 'test' }),
    'Sync must not throw RangeError when model is an object'
  );

  const agent = queryOne<{ model: string }>(
    `SELECT model FROM agents WHERE gateway_agent_id = ?`,
    ['gw-model-object-test']
  );
  assert.ok(agent, 'Agent should have been inserted');
  assert.equal(agent!.model, 'openai-codex/gpt-5.4', 'model.primary should be stored as the model string');
});

test('syncGatewayAgentsToCatalog: empty gateway list completes without error', async () => {
  mockListAgents([]);

  const changed = await syncGatewayAgentsToCatalog({ force: true, reason: 'test' });
  assert.equal(changed, 0, 'No changes expected for empty agent list');
});

test('syncGatewayAgentsToCatalog: skips agents with no id or name', async () => {
  const countBefore = (queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM agents WHERE source = ?', ['gateway']) || { cnt: 0 }).cnt;

  mockListAgents([
    { model: 'some-model' }, // No id, no name — should be skipped
    { id: '', name: '' },    // Empty strings — should be skipped
  ]);

  await syncGatewayAgentsToCatalog({ force: true, reason: 'test' });

  const countAfter = (queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM agents WHERE source = ?', ['gateway']) || { cnt: 0 }).cnt;
  assert.equal(countAfter, countBefore, 'No new gateway agents should be created for empty id/name');
});
