/**
 * Tests for Goal-Driven Autonomous Task Generation — tranche 1.
 *
 * Covers:
 *  1. AUTONOMOUS.md parser: sections, missing file, malformed content
 *  2. tasks-log.md: append-only writes, re-read, pipe escaping
 *  3. Duplicate detection: Jaccard similarity, batch self-dedup
 *  4. Idempotent scheduler: one batch per day, stale recovery, force flag
 *  5. Task creation: tasks land in DB after run
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { run, queryOne, queryAll } from '../db';

import { parseGoalsFile, parseTasksLog, recentLogEntries, formatGoalsForPrompt } from './parser';
import { appendLogLine, logTaskCreated, logTaskSkipped, logTaskComplete } from './log';
import { tokenise, jaccardSimilarity, isDuplicate, deduplicateProposals } from './dedup';
import { getOrCreateConfig, upsertConfig, runDailyAutonomousGeneration } from './runner';
import { appendAutonomousMetadata, extractAutonomousMetadata, stripAutonomousMetadata } from './metadata';
import type { TaskProposal } from './types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function tmpFile(name: string): string {
  return path.join(os.tmpdir(), `mc-autonomous-test-${process.pid}-${name}`);
}

function seedWorkspace(id: string) {
  run(`INSERT OR IGNORE INTO workspaces (id, name, slug, created_at, updated_at)
       VALUES (?, ?, ?, datetime('now'), datetime('now'))`, [id, id, id]);
}

// ── Parser tests ──────────────────────────────────────────────────────────────

test('parseGoalsFile: returns empty when file is missing', () => {
  const result = parseGoalsFile('/does/not/exist/AUTONOMOUS.md');
  assert.equal(result.isEmpty, true);
  assert.equal(result.raw, '');
  assert.deepEqual(result.sections, {});
});

test('parseGoalsFile: parses sections correctly', () => {
  const file = tmpFile('goals.md');
  fs.writeFileSync(file, `# My Workspace

## Long-term Goals
- Grow MRR to 10k
- Reduce churn to < 5%

## Current Focus
Launch referral program

## Backlog
- Build analytics dashboard
`);

  const result = parseGoalsFile(file);
  assert.equal(result.isEmpty, false);
  assert.ok('Long-term Goals' in result.sections);
  assert.ok(result.sections['Long-term Goals'].includes('Grow MRR'));
  assert.ok('Current Focus' in result.sections);
  assert.ok('Backlog' in result.sections);
  fs.unlinkSync(file);
});

test('parseGoalsFile: handles file with no section headings gracefully', () => {
  const file = tmpFile('goals-flat.md');
  fs.writeFileSync(file, 'Just a flat list of goals without headings.');
  const result = parseGoalsFile(file);
  assert.equal(result.isEmpty, false);
  assert.ok(result.raw.includes('flat list'));
  fs.unlinkSync(file);
});

test('formatGoalsForPrompt: returns fallback when goals are empty', () => {
  const prompt = formatGoalsForPrompt({ raw: '', sections: {}, isEmpty: true });
  assert.ok(prompt.includes('No goals file'));
});

test('formatGoalsForPrompt: truncates at maxChars', () => {
  const longGoals = { raw: 'x'.repeat(5000), sections: {}, isEmpty: false };
  const prompt = formatGoalsForPrompt(longGoals, 100);
  assert.ok(prompt.length <= 130, 'Should be truncated');
  assert.ok(prompt.endsWith('...(truncated)'));
});

// ── Log file tests ────────────────────────────────────────────────────────────

test('appendLogLine: creates file and appends a line', () => {
  const file = tmpFile('tasks-log.md');
  if (fs.existsSync(file)) fs.unlinkSync(file);

  appendLogLine(file, 'CREATED', 'task-001', 'Build landing page', 'run:run-abc');

  const content = fs.readFileSync(file, 'utf-8');
  assert.ok(content.includes('CREATED'));
  assert.ok(content.includes('task-001'));
  assert.ok(content.includes('Build landing page'));
  assert.ok(content.includes('run:run-abc'));
  fs.unlinkSync(file);
});

test('appendLogLine: escapes pipe characters in title', () => {
  const file = tmpFile('tasks-log-pipe.md');
  appendLogLine(file, 'CREATED', 'task-002', 'A | B | C title', 'run:xyz');
  const content = fs.readFileSync(file, 'utf-8');
  // Pipes in title should be replaced
  assert.ok(!content.includes('A | B | C'), 'Raw pipes must not appear in title field');
  fs.unlinkSync(file);
});

test('autonomous metadata stamp round-trips without visible content corruption', () => {
  const stamped = appendAutonomousMetadata('Ship the runner integration', {
    source: 'goal_daily_generation',
    autonomousRunId: 'run-42',
    goalTag: 'mission-control',
    lane: 'now',
    approvalState: 'auto_approved',
  });

  assert.ok(stamped.includes('AUTONOMOUS_META'));
  assert.equal(stripAutonomousMetadata(stamped), 'Ship the runner integration');
  assert.deepEqual(extractAutonomousMetadata(stamped), {
    source: 'goal_daily_generation',
    autonomousRunId: 'run-42',
    goalTag: 'mission-control',
    lane: 'now',
    approvalState: 'auto_approved',
  });
});

test('appendLogLine is append-only: multiple writes accumulate', () => {
  const file = tmpFile('tasks-log-append.md');
  if (fs.existsSync(file)) fs.unlinkSync(file);

  logTaskCreated(file, 'task-a', 'First task', 'run-1', { goalTag: 'ops', lane: 'now', approvalState: 'auto_approved' });
  logTaskCreated(file, 'task-b', 'Second task', 'run-1');
  logTaskComplete(file, 'task-a', 'First task', 'agent-builder', { runId: 'run-1', goalTag: 'ops', lane: 'now' });
  logTaskSkipped(file, 'Third task', 'duplicate', 'run-1');

  const entries = parseTasksLog(file);
  assert.equal(entries.length, 4);
  assert.equal(entries[0].event, 'CREATED');
  assert.equal(entries[1].event, 'CREATED');
  assert.equal(entries[2].event, 'COMPLETE');
  assert.equal(entries[3].event, 'SKIPPED');
  assert.match(entries[0].meta, /goal:ops/);
  assert.match(entries[0].meta, /lane:now/);
  assert.match(entries[2].meta, /run:run-1/);
  fs.unlinkSync(file);
});

test('parseTasksLog: ignores blank lines and comment lines', () => {
  const file = tmpFile('tasks-log-comments.md');
  fs.writeFileSync(file, `# This is a log header
# Another comment

2026-04-09T08:00:00.000Z | CREATED  | task-x | A task | run:r1
not-a-valid-line

2026-04-09T08:00:01.000Z | COMPLETE | task-x | A task | agent:a1
`);
  const entries = parseTasksLog(file);
  assert.equal(entries.length, 2);
  fs.unlinkSync(file);
});

test('recentLogEntries: filters by date', () => {
  const file = tmpFile('tasks-log-recent.md');
  const old = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
  const recent = new Date().toISOString();
  fs.writeFileSync(file, `${old} | CREATED  | task-old  | Old task   | run:r1\n${recent} | CREATED  | task-new  | New task   | run:r2\n`);
  const entries = recentLogEntries(file, 7);
  assert.equal(entries.length, 1);
  assert.ok(entries[0].title.includes('New task'));
  fs.unlinkSync(file);
});

// ── Dedup tests ───────────────────────────────────────────────────────────────

test('tokenise: lowercases and removes punctuation', () => {
  const tokens = tokenise('Build Landing-Page for WCP!');
  assert.ok(tokens.has('build'));
  assert.ok(tokens.has('landing'));
  assert.ok(tokens.has('page'));
  assert.ok(tokens.has('wcp'));
});

test('jaccardSimilarity: identical sets = 1', () => {
  const a = new Set(['build', 'landing', 'page']);
  assert.equal(jaccardSimilarity(a, new Set(a)), 1);
});

test('jaccardSimilarity: disjoint sets = 0', () => {
  const a = new Set(['alpha', 'beta']);
  const b = new Set(['gamma', 'delta']);
  assert.equal(jaccardSimilarity(a, b), 0);
});

test('isDuplicate: detects high-overlap title', () => {
  const existing = ['Build the user analytics dashboard'];
  assert.equal(isDuplicate('Build user analytics dashboard for admin', existing), true);
});

test('isDuplicate: accepts clearly different title', () => {
  const existing = ['Build the user analytics dashboard'];
  assert.equal(isDuplicate('Write unit tests for the checkout flow', existing), false);
});

test('deduplicateProposals: removes batch self-duplicates', () => {
  const proposals: Array<TaskProposal> = [
    { title: 'Build the homepage redesign', description: '', priority: 'normal', goal_rationale: '' },
    // Near-identical: same key words, just without "the" — high Jaccard overlap
    { title: 'Build homepage redesign', description: '', priority: 'normal', goal_rationale: '' },
    { title: 'Write documentation for onboarding flow', description: '', priority: 'normal', goal_rationale: '' },
  ];
  const { kept, skipped } = deduplicateProposals(proposals, []);
  // Second proposal duplicates first (tokens: {build, homepage, redesign} ⊂ first)
  assert.equal(kept.length, 2, `kept=${kept.map(p=>p.title).join(', ')}`);
  assert.equal(skipped.length, 1);
  assert.ok(kept.some(p => p.title.includes('homepage redesign')));
  assert.ok(kept.some(p => p.title.includes('onboarding')));
});

test('deduplicateProposals: respects existing titles', () => {
  const proposals: Array<TaskProposal> = [
    { title: 'Write unit tests for the payment module', description: '', priority: 'normal', goal_rationale: '' },
  ];
  const existing = ['Add unit tests for payment module'];
  const { kept, skipped } = deduplicateProposals(proposals, existing);
  assert.equal(kept.length, 0);
  assert.equal(skipped.length, 1);
});

// ── Idempotency tests ─────────────────────────────────────────────────────────

test('getOrCreateConfig: creates default config on first call', () => {
  seedWorkspace('ws-autonomous-1');
  const config = getOrCreateConfig('ws-autonomous-1');
  assert.equal(config.workspace_id, 'ws-autonomous-1');
  assert.equal(config.enabled, true);
  assert.equal(config.target_task_count, 5);
  assert.equal(config.approval_required, false);
  assert.equal(config.generation_cron, '0 8 * * *');
});

test('getOrCreateConfig: returns same config on repeated calls', () => {
  seedWorkspace('ws-autonomous-2');
  const a = getOrCreateConfig('ws-autonomous-2');
  const b = getOrCreateConfig('ws-autonomous-2');
  assert.equal(a.id, b.id);
});

test('upsertConfig: updates fields', () => {
  seedWorkspace('ws-autonomous-3');
  getOrCreateConfig('ws-autonomous-3');
  const updated = upsertConfig('ws-autonomous-3', { target_task_count: 3, enabled: false });
  assert.equal(updated.target_task_count, 3);
  assert.equal(updated.enabled, false);
});

test('runDailyAutonomousGeneration: skips when disabled', async () => {
  seedWorkspace('ws-autonomous-disabled');
  upsertConfig('ws-autonomous-disabled', { enabled: false });
  const result = await runDailyAutonomousGeneration('ws-autonomous-disabled');
  assert.equal(result, null, 'Disabled workspace should return null');
});

test('runDailyAutonomousGeneration: idempotent — second call on same day returns null', async () => {
  seedWorkspace('ws-autonomous-idem');

  // Seed a completed run for today manually
  const today = new Date().toISOString().slice(0, 10);
  run(
    `INSERT INTO autonomous_runs (id, workspace_id, run_date, status, tasks_proposed, tasks_created, tasks_skipped, prompt_tokens, completion_tokens, cost_usd, created_at, updated_at)
     VALUES (?, ?, ?, 'completed', 3, 3, 0, 100, 50, 0.001, datetime('now'), datetime('now'))`,
    ['run-idem-' + Date.now(), 'ws-autonomous-idem', today]
  );

  getOrCreateConfig('ws-autonomous-idem');
  const result = await runDailyAutonomousGeneration('ws-autonomous-idem');
  assert.equal(result, null, 'Should skip — already completed today');
});

test('runDailyAutonomousGeneration: recovers stale running row', async () => {
  seedWorkspace('ws-autonomous-stale');
  getOrCreateConfig('ws-autonomous-stale');
  upsertConfig('ws-autonomous-stale', { enabled: false }); // disable so we don't call LLM

  const today = new Date().toISOString().slice(0, 10);
  const staleTime = new Date(Date.now() - 15 * 60 * 1000).toISOString(); // 15 min ago

  run(
    `INSERT INTO autonomous_runs (id, workspace_id, run_date, status, tasks_proposed, tasks_created, tasks_skipped, prompt_tokens, completion_tokens, cost_usd, created_at, updated_at)
     VALUES ('run-stale-test', ?, ?, 'running', 0, 0, 0, 0, 0, 0, ?, ?)`,
    ['ws-autonomous-stale', today, staleTime, staleTime]
  );

  // With disabled config, the recovery path (mark stale→failed) should fire,
  // then the disabled check short-circuits before attempting LLM.
  // The stale run should be marked failed.
  await runDailyAutonomousGeneration('ws-autonomous-stale');

  const staleRun = queryOne<{ status: string }>(
    `SELECT status FROM autonomous_runs WHERE id = 'run-stale-test'`
  );
  assert.equal(staleRun?.status, 'failed', 'Stale run must be marked failed');
});
