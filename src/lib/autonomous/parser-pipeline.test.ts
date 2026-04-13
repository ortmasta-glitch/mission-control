/**
 * Tests for Tranche-2 parser and logging pipeline.
 *
 * Covers:
 *  1. parseStructuredGoals() against a fixture matching Tomek's real AUTONOMOUS.md shape
 *  2. slugifyGoalTag() determinism
 *  3. formatStructuredGoalsForPrompt() output structure
 *  4. Tranche-2 log helpers: APPROVED, REJECTED, DISPATCHED
 *  5. parseTasksLog() backward compat with new event types
 *  6. resolveGoalTagFromStructuredGoals() lane matching
 *  7. formatGoalsForPrompt() still works unchanged (regression guard)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

import {
  parseGoalsFile,
  parseStructuredGoals,
  formatGoalsForPrompt,
  formatStructuredGoalsForPrompt,
  slugifyGoalTag,
} from './parser';
import {
  appendLogLine,
  logTaskApproved,
  logTaskRejected,
  logTaskDispatched,
  logTaskCreated,
} from './log';
import { parseTasksLog } from './parser';
import { resolveGoalTagFromStructuredGoals, activeGoalTag } from './coordinator';
import type { TaskProposal } from './types';

// ── Test helpers ──────────────────────────────────────────────────────────────

function tmpFile(name: string): string {
  return path.join(os.tmpdir(), `mc-parser-pipeline-test-${process.pid}-${name}`);
}

/** Fixture that mirrors the real AUTONOMOUS.md structure. */
const AUTONOMOUS_FIXTURE = `# Goal-Driven Autonomous Source of Truth

## Mission and operating bias
- Mission Control internal tools are the top priority.
- Daily autonomous generation window: 06:00-08:00 Europe/Warsaw.
- Approval mode: autonomous by default, with high-impact tasks held for approval.
- Daily batches should be previewed inside Mission Control.
- Surprise mini-apps are allowed when they are clearly aligned with business goals.

## Priority order
1. Internal Mission Control tools and workflows.
2. Financial planning and Google Ads analysis.
3. Social and paid campaign execution.
4. Competitive and market analysis.

## Product lanes
### Mission Control internal tools
- Build and improve internal operating surfaces inside Mission Control.
- Favor features that improve planning, orchestration, approvals, visibility, logging, and operator control.

### Financial Planning
- Analyze finances, cash flow, planning assumptions, and revenue levers.
- Prioritize work that improves decision support for budgeting and business planning.

### Document Repository
- Organize, structure, ingest, and maintain internal documents and supporting records.
- Safe document handling inside the repository is allowed autonomously.

### Advertising Channels
- Focus on Instagram, Facebook, TikTok, and Google Ads.
- Prioritize analysis, reporting, creative planning, channel diagnostics, and optimization ideas.

### Sign-ups
- Improve acquisition funnels, conversion paths, and sign-up flow performance.
- Connect sign-up work to paid traffic and product positioning.

### Strategic Expansion
- Explore adjacent offers, market opportunities, partnerships, and scalable growth paths.
- Treat this as a structured research and planning lane, not a publishing lane.

## Product and packaging opportunities
### Mobile apps
- Plan iPhone and Android product paths.
- Favor roadmap, scope, packaging, and feasibility work before risky execution.

### Diagnostics and group therapy packaging
- Develop product packaging ideas around diagnostics and group therapy offers.
- Connect packaging work to sign-ups, positioning, and operational feasibility.

## Operations automation
- Automate call transcription workflows.
- Automate SMS-related operational support.
- Automate calendar coordination support.
- Improve internal records capture and retrieval.

## Autonomous permissions
### Allowed without approval
- Research.
- Drafting.
- Mission Control task work.
- Local analysis.
- Coding in approved repositories.
- Safe document repository handling.

### Must ask before acting
- External messages or outreach.
- Publishing or posting.
- Production changes.
- Spending money.
- Legal, tax, or compliance actions.
- Important business decisions.

## Approval guardrails
### High-impact work requiring approval
- Anything externally visible.
- Anything that changes live production behavior.
- Anything with financial, legal, tax, compliance, or strategic commitment risk.

## Current active lane
### Parser and Logging Pipeline
- Strengthen the AUTONOMOUS.md parser around stable business lane extraction.
- Encode goal tags and guardrails from this document as reliable structured context.
- Extend append-only logging so generated, skipped, approved, and completed autonomous tasks leave durable evidence.

## Immediate generation preferences
- Prefer 1-2 high-value internal Mission Control tasks in the \`now\` lane.
- Prefer finance and Google Ads analysis tasks next.
- Keep social campaign work behind internal tooling and analysis unless a strong opportunity is obvious.
- Keep competitive analysis visible but below execution-oriented internal tooling.
`;

function writeFixture(): string {
  const file = tmpFile('AUTONOMOUS.md');
  fs.writeFileSync(file, AUTONOMOUS_FIXTURE, 'utf-8');
  return file;
}

// ── slugifyGoalTag ─────────────────────────────────────────────────────────────

test('slugifyGoalTag: lowercases and hyphenates', () => {
  assert.equal(slugifyGoalTag('Mission Control internal tools'), 'mission-control-internal-tools');
  assert.equal(slugifyGoalTag('Financial Planning'), 'financial-planning');
  assert.equal(slugifyGoalTag('Sign-ups'), 'sign-ups');
});

test('slugifyGoalTag: strips special characters', () => {
  assert.equal(slugifyGoalTag('Diagnostics and group therapy packaging'), 'diagnostics-and-group-therapy-packaging');
});

test('slugifyGoalTag: stable on repeated calls', () => {
  const name = 'Advertising Channels';
  assert.equal(slugifyGoalTag(name), slugifyGoalTag(name));
  assert.equal(slugifyGoalTag(name), 'advertising-channels');
});

// ── parseStructuredGoals — product lanes ─────────────────────────────────────

test('parseStructuredGoals: extracts all product lanes', () => {
  const file = writeFixture();
  const goals = parseStructuredGoals(file);
  fs.unlinkSync(file);

  assert.equal(goals.isEmpty, false);
  assert.ok(goals.productLanes.length >= 6, `Expected ≥6 lanes, got ${goals.productLanes.length}`);

  const names = goals.productLanes.map(l => l.name);
  assert.ok(names.includes('Mission Control internal tools'), 'Missing MC lane');
  assert.ok(names.includes('Financial Planning'), 'Missing Financial Planning lane');
  assert.ok(names.includes('Advertising Channels'), 'Missing Advertising Channels lane');
  assert.ok(names.includes('Document Repository'), 'Missing Document Repository lane');
  assert.ok(names.includes('Sign-ups'), 'Missing Sign-ups lane');
  assert.ok(names.includes('Strategic Expansion'), 'Missing Strategic Expansion lane');
});

test('parseStructuredGoals: includes packaging opportunity lanes', () => {
  const file = writeFixture();
  const goals = parseStructuredGoals(file);
  fs.unlinkSync(file);

  const names = goals.productLanes.map(l => l.name);
  assert.ok(names.includes('Mobile apps'), 'Missing Mobile apps lane');
  assert.ok(names.includes('Diagnostics and group therapy packaging'), 'Missing diagnostics lane');
});

test('parseStructuredGoals: each lane has a goalTag', () => {
  const file = writeFixture();
  const goals = parseStructuredGoals(file);
  fs.unlinkSync(file);

  for (const lane of goals.productLanes) {
    assert.ok(lane.goalTag.length > 0, `Empty goalTag for lane: ${lane.name}`);
    assert.ok(/^[a-z0-9-]+$/.test(lane.goalTag), `Non-slug goalTag: ${lane.goalTag}`);
  }
});

test('parseStructuredGoals: Mission Control lane has priorityRank 1', () => {
  const file = writeFixture();
  const goals = parseStructuredGoals(file);
  fs.unlinkSync(file);

  const mcLane = goals.productLanes.find(l => l.name === 'Mission Control internal tools');
  assert.ok(mcLane, 'MC lane not found');
  assert.equal(mcLane!.priorityRank, 1, 'MC lane should have priority rank 1');
});

test('parseStructuredGoals: Financial Planning lane has priorityRank 2', () => {
  const file = writeFixture();
  const goals = parseStructuredGoals(file);
  fs.unlinkSync(file);

  const lane = goals.productLanes.find(l => l.name === 'Financial Planning');
  assert.ok(lane, 'Financial Planning lane not found');
  assert.equal(lane!.priorityRank, 2);
});

test('parseStructuredGoals: product lanes are sorted by priorityRank ascending', () => {
  const file = writeFixture();
  const goals = parseStructuredGoals(file);
  fs.unlinkSync(file);

  const ranks = goals.productLanes.map(l => l.priorityRank);
  for (let i = 1; i < ranks.length; i++) {
    assert.ok(ranks[i] >= ranks[i - 1], `Lanes not sorted: rank[${i-1}]=${ranks[i-1]} > rank[${i}]=${ranks[i]}`);
  }
});

// ── parseStructuredGoals — priority order ─────────────────────────────────────

test('parseStructuredGoals: extracts priority order items', () => {
  const file = writeFixture();
  const goals = parseStructuredGoals(file);
  fs.unlinkSync(file);

  assert.equal(goals.priorityOrder.length, 4);
  assert.ok(goals.priorityOrder[0].toLowerCase().includes('mission control'));
  assert.ok(goals.priorityOrder[1].toLowerCase().includes('financial'));
});

// ── parseStructuredGoals — guardrails ─────────────────────────────────────────

test('parseStructuredGoals: extracts allowedWithoutApproval', () => {
  const file = writeFixture();
  const goals = parseStructuredGoals(file);
  fs.unlinkSync(file);

  assert.ok(goals.allowedWithoutApproval.length >= 4, `Expected ≥4 allowed items, got ${goals.allowedWithoutApproval.length}`);
  assert.ok(goals.allowedWithoutApproval.some(a => a.toLowerCase().includes('research')));
  assert.ok(goals.allowedWithoutApproval.some(a => a.toLowerCase().includes('coding')));
});

test('parseStructuredGoals: extracts mustAskFirst', () => {
  const file = writeFixture();
  const goals = parseStructuredGoals(file);
  fs.unlinkSync(file);

  assert.ok(goals.mustAskFirst.length >= 4, `Expected ≥4 must-ask items, got ${goals.mustAskFirst.length}`);
  assert.ok(goals.mustAskFirst.some(a => a.toLowerCase().includes('publishing') || a.toLowerCase().includes('posting')));
  assert.ok(goals.mustAskFirst.some(a => a.toLowerCase().includes('spending')));
});

// ── parseStructuredGoals — operations and channels ───────────────────────────

test('parseStructuredGoals: extracts operations automation areas', () => {
  const file = writeFixture();
  const goals = parseStructuredGoals(file);
  fs.unlinkSync(file);

  assert.ok(goals.operationsAreas.length >= 3, `Expected ≥3 ops areas, got ${goals.operationsAreas.length}`);
  assert.ok(goals.operationsAreas.some(a => a.toLowerCase().includes('transcription')));
  assert.ok(goals.operationsAreas.some(a => a.toLowerCase().includes('sms')));
});

test('parseStructuredGoals: extracts advertising channels', () => {
  const file = writeFixture();
  const goals = parseStructuredGoals(file);
  fs.unlinkSync(file);

  assert.ok(goals.advertisingChannels.length >= 4, `Expected ≥4 channels, got ${goals.advertisingChannels.length}`);
  assert.ok(goals.advertisingChannels.includes('Instagram'));
  assert.ok(goals.advertisingChannels.includes('Facebook'));
  assert.ok(goals.advertisingChannels.includes('TikTok'));
  assert.ok(goals.advertisingChannels.includes('Google Ads'));
});

// ── parseStructuredGoals — active lane and generation window ──────────────────

test('parseStructuredGoals: extracts current active lane name', () => {
  const file = writeFixture();
  const goals = parseStructuredGoals(file);
  fs.unlinkSync(file);

  assert.equal(goals.currentActiveLane, 'Parser and Logging Pipeline');
});

test('parseStructuredGoals: extracts generation window', () => {
  const file = writeFixture();
  const goals = parseStructuredGoals(file);
  fs.unlinkSync(file);

  assert.ok(goals.generationWindow !== null, 'generationWindow should not be null');
  assert.ok(goals.generationWindow!.includes('06:00'), `Expected window to contain 06:00, got: ${goals.generationWindow}`);
  assert.ok(goals.generationWindow!.includes('Warsaw'), `Expected window to contain Warsaw, got: ${goals.generationWindow}`);
});

// ── parseStructuredGoals — generation preferences ─────────────────────────────

test('parseStructuredGoals: extracts now-lane bias', () => {
  const file = writeFixture();
  const goals = parseStructuredGoals(file);
  fs.unlinkSync(file);

  assert.ok(goals.generationPreferences.nowBias.length >= 1, 'Expected at least one now-bias item');
  assert.ok(
    goals.generationPreferences.nowBias.some(p => p.toLowerCase().includes('mission control')),
    `nowBias should mention Mission Control. Got: ${goals.generationPreferences.nowBias.join(', ')}`
  );
});

test('parseStructuredGoals: extracts suppress bias', () => {
  const file = writeFixture();
  const goals = parseStructuredGoals(file);
  fs.unlinkSync(file);

  assert.ok(goals.generationPreferences.suppressBias.length >= 1, 'Expected at least one suppress-bias item');
  assert.ok(goals.generationPreferences.suppressBias.some(p => p.toLowerCase().includes('campaign') || p.toLowerCase().includes('competitive')));
});

// ── parseStructuredGoals — missing file ───────────────────────────────────────

test('parseStructuredGoals: returns safe empty result when file is missing', () => {
  const goals = parseStructuredGoals('/does/not/exist/AUTONOMOUS.md');
  assert.equal(goals.isEmpty, true);
  assert.deepEqual(goals.productLanes, []);
  assert.deepEqual(goals.priorityOrder, []);
  assert.equal(goals.currentActiveLane, null);
  assert.equal(goals.generationWindow, null);
  assert.deepEqual(goals.allowedWithoutApproval, []);
  assert.deepEqual(goals.mustAskFirst, []);
});

// ── formatStructuredGoalsForPrompt ────────────────────────────────────────────

test('formatStructuredGoalsForPrompt: includes active lane', () => {
  const file = writeFixture();
  const goals = parseStructuredGoals(file);
  fs.unlinkSync(file);

  const prompt = formatStructuredGoalsForPrompt(goals);
  assert.ok(prompt.includes('Parser and Logging Pipeline'), 'Active lane should appear in prompt');
});

test('formatStructuredGoalsForPrompt: includes priority order', () => {
  const file = writeFixture();
  const goals = parseStructuredGoals(file);
  fs.unlinkSync(file);

  const prompt = formatStructuredGoalsForPrompt(goals);
  assert.ok(prompt.includes('Mission Control'), 'Priority order should mention Mission Control');
  assert.ok(prompt.includes('Financial'), 'Priority order should mention Financial');
});

test('formatStructuredGoalsForPrompt: includes guardrails', () => {
  const file = writeFixture();
  const goals = parseStructuredGoals(file);
  fs.unlinkSync(file);

  const prompt = formatStructuredGoalsForPrompt(goals);
  assert.ok(prompt.toLowerCase().includes('must ask') || prompt.toLowerCase().includes('do not generate'), 'Guardrails should appear in prompt');
});

test('formatStructuredGoalsForPrompt: includes goal tags', () => {
  const file = writeFixture();
  const goals = parseStructuredGoals(file);
  fs.unlinkSync(file);

  const prompt = formatStructuredGoalsForPrompt(goals);
  assert.ok(prompt.includes('[mission-control-internal-tools]'), `Expected goalTag in prompt. Prompt: ${prompt.slice(0, 300)}`);
});

test('formatStructuredGoalsForPrompt: respects maxChars', () => {
  const file = writeFixture();
  const goals = parseStructuredGoals(file);
  fs.unlinkSync(file);

  const prompt = formatStructuredGoalsForPrompt(goals, 200);
  assert.ok(prompt.length <= 220, `Prompt too long: ${prompt.length}`);
  assert.ok(prompt.endsWith('...(truncated)'));
});

test('formatStructuredGoalsForPrompt: falls back gracefully on empty goals', () => {
  const goals = parseStructuredGoals('/does/not/exist/AUTONOMOUS.md');
  const prompt = formatStructuredGoalsForPrompt(goals);
  assert.ok(prompt.includes('No goals file'), 'Should use fallback text for empty goals');
});

// ── Regression: formatGoalsForPrompt still works unchanged ────────────────────

test('formatGoalsForPrompt: still works with plain ParsedGoals (regression guard)', () => {
  const file = writeFixture();
  const goals = parseGoalsFile(file); // returns ParsedGoals, not StructuredGoals
  fs.unlinkSync(file);

  const prompt = formatGoalsForPrompt(goals);
  assert.ok(prompt.length > 0);
  assert.ok(!prompt.includes('No goals file'));
  assert.ok(prompt.includes('Mission Control'));
});

// ── StructuredGoals is a valid ParsedGoals (type compat regression) ───────────

test('parseStructuredGoals result is usable as ParsedGoals', () => {
  const file = writeFixture();
  const goals = parseStructuredGoals(file); // StructuredGoals
  fs.unlinkSync(file);

  // formatGoalsForPrompt accepts ParsedGoals — should accept StructuredGoals too
  const prompt = formatGoalsForPrompt(goals);
  assert.ok(prompt.length > 0);
  assert.equal(goals.isEmpty, false);
  assert.ok(typeof goals.raw === 'string');
  assert.ok(typeof goals.sections === 'object');
});

// ── Tranche-2 log helpers ─────────────────────────────────────────────────────

test('logTaskApproved: writes APPROVED line', () => {
  const file = tmpFile('log-approved.md');
  if (fs.existsSync(file)) fs.unlinkSync(file);

  logTaskApproved(file, 'task-001', 'Build dashboard widget', 'tomek');

  const content = fs.readFileSync(file, 'utf-8');
  assert.ok(content.includes('APPROVED'), 'Line should contain APPROVED');
  assert.ok(content.includes('task-001'));
  assert.ok(content.includes('by:tomek'));
  fs.unlinkSync(file);
});

test('logTaskRejected: writes REJECTED line', () => {
  const file = tmpFile('log-rejected.md');
  if (fs.existsSync(file)) fs.unlinkSync(file);

  logTaskRejected(file, 'task-002', 'Spam proposal', 'not aligned');

  const content = fs.readFileSync(file, 'utf-8');
  assert.ok(content.includes('REJECTED'));
  assert.ok(content.includes('task-002'));
  assert.ok(content.includes('reason:not aligned'));
  fs.unlinkSync(file);
});

test('logTaskDispatched: writes DISPATCHED line with agent and run', () => {
  const file = tmpFile('log-dispatched.md');
  if (fs.existsSync(file)) fs.unlinkSync(file);

  logTaskDispatched(file, 'task-003', 'Analyze Google Ads performance', 'agent-nina', 'run-abc123');

  const content = fs.readFileSync(file, 'utf-8');
  assert.ok(content.includes('DISPATCHED'));
  assert.ok(content.includes('agent:agent-nina'));
  assert.ok(content.includes('run:run-abc123'));
  fs.unlinkSync(file);
});

test('parseTasksLog: parses all six event types', () => {
  const file = tmpFile('log-all-events.md');
  const ts = new Date().toISOString();
  fs.writeFileSync(file, [
    `${ts} | CREATED   | task-a | First task  | run:r1`,
    `${ts} | SKIPPED   | -      | Dupe task   | reason:duplicate run:r1`,
    `${ts} | APPROVED  | task-a | First task  | by:tomek`,
    `${ts} | DISPATCHED| task-a | First task  | agent:nina run:r1`,
    `${ts} | COMPLETE  | task-a | First task  | agent:nina`,
    `${ts} | REJECTED  | task-b | Bad task    | reason:not aligned`,
  ].join('\n') + '\n');

  const entries = parseTasksLog(file);
  assert.equal(entries.length, 6, `Expected 6 entries, got ${entries.length}`);
  const events = entries.map(e => e.event);
  assert.ok(events.includes('CREATED'));
  assert.ok(events.includes('SKIPPED'));
  assert.ok(events.includes('APPROVED'));
  assert.ok(events.includes('DISPATCHED'));
  assert.ok(events.includes('COMPLETE'));
  assert.ok(events.includes('REJECTED'));
  fs.unlinkSync(file);
});

test('parseTasksLog: backward compat — old logs with only CREATED/COMPLETE/SKIPPED still parse', () => {
  const file = tmpFile('log-old-format.md');
  const ts = new Date().toISOString();
  fs.writeFileSync(file, [
    `${ts} | CREATED  | task-x | Old task A | run:r1`,
    `${ts} | COMPLETE | task-x | Old task A | agent:builder`,
    `${ts} | SKIPPED  | -      | Old task B | reason:duplicate run:r1`,
  ].join('\n') + '\n');

  const entries = parseTasksLog(file);
  assert.equal(entries.length, 3);
  assert.equal(entries[0].event, 'CREATED');
  assert.equal(entries[1].event, 'COMPLETE');
  assert.equal(entries[2].event, 'SKIPPED');
  fs.unlinkSync(file);
});

test('log helpers are append-only across all event types', () => {
  const file = tmpFile('log-mixed-append.md');
  if (fs.existsSync(file)) fs.unlinkSync(file);

  logTaskCreated(file, 'task-x', 'Run diagnostics', 'run-1');
  logTaskApproved(file, 'task-x', 'Run diagnostics', 'tomek');
  logTaskDispatched(file, 'task-x', 'Run diagnostics', 'agent-main', 'run-1');

  const entries = parseTasksLog(file);
  assert.equal(entries.length, 3);
  assert.equal(entries[0].event, 'CREATED');
  assert.equal(entries[1].event, 'APPROVED');
  assert.equal(entries[2].event, 'DISPATCHED');
  fs.unlinkSync(file);
});

// ── resolveGoalTagFromStructuredGoals ─────────────────────────────────────────

test('resolveGoalTagFromStructuredGoals: matches Mission Control proposal', () => {
  const file = writeFixture();
  const goals = parseStructuredGoals(file);
  fs.unlinkSync(file);

  const proposal: TaskProposal = {
    title: 'Add approval queue panel to Mission Control',
    description: 'Build a panel inside Mission Control for reviewing pending autonomous tasks.',
    priority: 'high',
    goal_rationale: 'Advances Mission Control internal tooling and operator control.',
  };

  const tag = resolveGoalTagFromStructuredGoals(proposal, goals);
  assert.ok(tag !== undefined, 'Should resolve a tag');
  assert.ok(tag!.includes('mission-control'), `Expected MC tag, got: ${tag}`);
});

test('resolveGoalTagFromStructuredGoals: matches Financial Planning proposal', () => {
  const file = writeFixture();
  const goals = parseStructuredGoals(file);
  fs.unlinkSync(file);

  const proposal: TaskProposal = {
    title: 'Analyze cash flow and revenue assumptions for Q2',
    description: 'Review financial planning assumptions and produce a cash flow projection.',
    priority: 'normal',
    goal_rationale: 'Advances financial planning and decision support.',
  };

  const tag = resolveGoalTagFromStructuredGoals(proposal, goals);
  assert.ok(tag !== undefined, 'Should resolve a tag');
  assert.ok(tag!.includes('financial'), `Expected financial tag, got: ${tag}`);
});

test('resolveGoalTagFromStructuredGoals: returns undefined when no match', () => {
  const goals = parseStructuredGoals('/does/not/exist/AUTONOMOUS.md');

  const proposal: TaskProposal = {
    title: 'Something completely unrelated',
    description: '',
    priority: 'low',
    goal_rationale: '',
  };

  const tag = resolveGoalTagFromStructuredGoals(proposal, goals);
  assert.equal(tag, undefined);
});

// ── activeGoalTag ─────────────────────────────────────────────────────────────

test('activeGoalTag: returns slugified current active lane', () => {
  const file = writeFixture();
  const goals = parseStructuredGoals(file);
  fs.unlinkSync(file);

  const tag = activeGoalTag(goals);
  assert.equal(tag, 'parser-and-logging-pipeline');
});

test('activeGoalTag: returns undefined when no active lane', () => {
  const goals = parseStructuredGoals('/does/not/exist/AUTONOMOUS.md');
  assert.equal(activeGoalTag(goals), undefined);
});
