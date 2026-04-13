/**
 * runner-integration.test.ts — Runner integration with structured goals.
 *
 * Focuses on:
 *  1. logTaskCreated: goalTag/lane/approvalState extras (backward-compatible)
 *  2. goalTag round-trip through parseTasksLog
 *  3. resolveGoalTagFromStructuredGoals: matches and fallbacks
 *  4. parseStructuredGoals: is a safe superset of parseGoalsFile (fallback path)
 *  5. appendAutonomousMetadata / extractAutonomousMetadata round-trip
 *  6. Coordinator draft assembly: goalTag + lane propagation
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { logTaskCreated, logTaskSkipped } from './log';
import { parseTasksLog, parseStructuredGoals } from './parser';
import { resolveGoalTagFromStructuredGoals, activeGoalTag, toAutonomousTaskDraft, planCoordinatorLanes } from './coordinator';
import { appendAutonomousMetadata, extractAutonomousMetadata, stripAutonomousMetadata } from './metadata';
import type { StructuredGoals, TaskProposal } from './types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function tmpFile(name: string): string {
  return path.join(os.tmpdir(), `mc-runner-integ-${process.pid}-${name}`);
}

/** Minimal AUTONOMOUS.md fixture with two product lanes. */
const GOALS_FIXTURE = `# Autonomous Goals

## Priority order
1. Mission Control internal tools
2. Financial Planning

## Product lanes

### Mission Control internal tools
Core platform improvements, agent workflow, task lifecycle.

### Financial Planning
Forecasting, budgeting, and cash-flow dashboards.

## Guardrails

### Allowed without approval
- Code changes inside existing modules
- Writing tests

### Must ask first
- Deleting production data
- Changing billing configuration

## Current active lane

### Mission Control internal tools

## Immediate generation preferences
- Prefer \`now\` lane for Mission Control tasks (1-2 per batch)
- Keep Financial Planning behind Mission Control unless sprint is complete
`;

// ── logTaskCreated: extras parameter (backward-compatible) ────────────────────

test('logTaskCreated: without extras — meta is run:<id> only', () => {
  const file = tmpFile('log-no-extras.md');
  logTaskCreated(file, 'task-001', 'Build something', 'run-abc');
  const entries = parseTasksLog(file);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].meta, 'run:run-abc');
  assert.ok(!entries[0].meta.includes('goal:'), 'no goal: key when extras omitted');
  fs.unlinkSync(file);
});

test('logTaskCreated: with goalTag — meta includes goal:<tag>', () => {
  const file = tmpFile('log-with-goal.md');
  logTaskCreated(file, 'task-002', 'Build something', 'run-abc', {
    goalTag: 'mission-control-internal-tools',
  });
  const entries = parseTasksLog(file);
  assert.equal(entries.length, 1);
  assert.ok(entries[0].meta.includes('run:run-abc'), 'run id still present');
  assert.ok(entries[0].meta.includes('goal:mission-control-internal-tools'), 'goalTag appended');
  fs.unlinkSync(file);
});

test('logTaskCreated: with lane and approvalState — all fields in meta', () => {
  const file = tmpFile('log-full-extras.md');
  logTaskCreated(file, 'task-003', 'Improve onboarding', 'run-xyz', {
    goalTag: 'mission-control-internal-tools',
    lane: 'now',
    approvalState: 'auto_approved',
  });
  const entries = parseTasksLog(file);
  assert.equal(entries.length, 1);
  const meta = entries[0].meta;
  assert.ok(meta.includes('run:run-xyz'));
  assert.ok(meta.includes('goal:mission-control-internal-tools'));
  assert.ok(meta.includes('lane:now'));
  assert.ok(meta.includes('approval:auto_approved'));
  fs.unlinkSync(file);
});

test('logTaskCreated: extras={} behaves the same as no extras', () => {
  const file1 = tmpFile('log-empty-extras-a.md');
  const file2 = tmpFile('log-empty-extras-b.md');
  logTaskCreated(file1, 'task-x', 'Title', 'run-1');
  logTaskCreated(file2, 'task-x', 'Title', 'run-1', {});
  const e1 = parseTasksLog(file1)[0];
  const e2 = parseTasksLog(file2)[0];
  assert.equal(e1.meta, e2.meta, 'empty extras object = same output as no extras');
  fs.unlinkSync(file1);
  fs.unlinkSync(file2);
});

// ── goalTag round-trip ────────────────────────────────────────────────────────

test('goalTag round-trip: written by logTaskCreated, read back by parseTasksLog', () => {
  const file = tmpFile('log-roundtrip.md');

  logTaskCreated(file, 'task-rt-1', 'Build budget forecast dashboard', 'run-rt', {
    goalTag: 'financial-planning',
    lane: 'next',
  });
  logTaskCreated(file, 'task-rt-2', 'Analyse cash flow', 'run-rt', {
    goalTag: 'mission-control-internal-tools',
    lane: 'now',
  });
  logTaskSkipped(file, 'Duplicate task', 'duplicate', 'run-rt');

  const entries = parseTasksLog(file);
  assert.equal(entries.length, 3);

  assert.equal(entries[0].event, 'CREATED');
  assert.ok(entries[0].meta.includes('goal:financial-planning'));
  assert.ok(entries[0].meta.includes('lane:next'));

  assert.ok(entries[1].meta.includes('goal:mission-control-internal-tools'));
  assert.ok(entries[1].meta.includes('lane:now'));

  assert.equal(entries[2].event, 'SKIPPED');
  assert.ok(!entries[2].meta.includes('goal:'), 'SKIPPED entries have no goalTag');

  fs.unlinkSync(file);
});

// ── parseStructuredGoals: fallback safety ────────────────────────────────────

test('parseStructuredGoals: isEmpty=true on missing file, StructuredGoals shape preserved', () => {
  const result = parseStructuredGoals('/no/such/file/AUTONOMOUS.md');
  assert.equal(result.isEmpty, true);
  assert.deepEqual(result.productLanes, []);
  assert.deepEqual(result.priorityOrder, []);
  assert.deepEqual(result.allowedWithoutApproval, []);
  assert.deepEqual(result.mustAskFirst, []);
  assert.equal(result.currentActiveLane, null);
  assert.equal(result.generationWindow, null);
  // ParsedGoals contract still satisfied
  assert.equal(result.raw, '');
  assert.deepEqual(result.sections, {});
});

test('parseStructuredGoals: empty file yields isEmpty=true', () => {
  const file = tmpFile('empty-goals.md');
  fs.writeFileSync(file, '   \n');
  const result = parseStructuredGoals(file);
  assert.equal(result.isEmpty, true);
  fs.unlinkSync(file);
});

test('parseStructuredGoals result satisfies ParsedGoals interface', () => {
  const file = tmpFile('goals-superset.md');
  fs.writeFileSync(file, GOALS_FIXTURE);
  const goals = parseStructuredGoals(file);
  assert.ok(typeof goals.raw === 'string');
  assert.ok(typeof goals.sections === 'object');
  assert.ok(typeof goals.isEmpty === 'boolean');
  assert.ok(Array.isArray(goals.productLanes));
  assert.ok(Array.isArray(goals.priorityOrder));
  fs.unlinkSync(file);
});

// ── resolveGoalTagFromStructuredGoals ─────────────────────────────────────────

test('resolveGoalTagFromStructuredGoals: returns undefined when goals are empty', () => {
  const goals = parseStructuredGoals('/no/such/file/AUTONOMOUS.md') as StructuredGoals;
  const proposal: TaskProposal = {
    title: 'Improve Mission Control task board',
    description: '',
    priority: 'normal',
    goal_rationale: 'Advances the core platform',
  };
  assert.equal(resolveGoalTagFromStructuredGoals(proposal, goals), undefined);
});

test('resolveGoalTagFromStructuredGoals: matches Mission Control lane', () => {
  const file = tmpFile('goals-mc.md');
  fs.writeFileSync(file, GOALS_FIXTURE);
  const goals = parseStructuredGoals(file) as StructuredGoals;

  const proposal: TaskProposal = {
    title: 'Improve Mission Control task lifecycle',
    description: '',
    priority: 'high',
    goal_rationale: 'Advances Mission Control internal tooling',
  };
  assert.equal(resolveGoalTagFromStructuredGoals(proposal, goals), 'mission-control-internal-tools');
  fs.unlinkSync(file);
});

test('resolveGoalTagFromStructuredGoals: matches Financial Planning lane', () => {
  const file = tmpFile('goals-fp.md');
  fs.writeFileSync(file, GOALS_FIXTURE);
  const goals = parseStructuredGoals(file) as StructuredGoals;

  const proposal: TaskProposal = {
    title: 'Build cash-flow forecasting dashboard',
    description: '',
    priority: 'normal',
    goal_rationale: 'Advances Financial Planning dashboards',
  };
  assert.equal(resolveGoalTagFromStructuredGoals(proposal, goals), 'financial-planning');
  fs.unlinkSync(file);
});

test('resolveGoalTagFromStructuredGoals: returns undefined when no lane matches', () => {
  const file = tmpFile('goals-nomatch.md');
  fs.writeFileSync(file, GOALS_FIXTURE);
  const goals = parseStructuredGoals(file) as StructuredGoals;

  const proposal: TaskProposal = {
    title: 'Update privacy policy document',
    description: '',
    priority: 'low',
    goal_rationale: 'Legal compliance, no product lane overlap',
  };
  assert.equal(resolveGoalTagFromStructuredGoals(proposal, goals), undefined);
  fs.unlinkSync(file);
});

// ── activeGoalTag ─────────────────────────────────────────────────────────────

test('activeGoalTag: returns slug of currentActiveLane', () => {
  const file = tmpFile('goals-active.md');
  fs.writeFileSync(file, GOALS_FIXTURE);
  const goals = parseStructuredGoals(file);
  assert.equal(goals.currentActiveLane, 'Mission Control internal tools');
  assert.equal(activeGoalTag(goals as StructuredGoals), 'mission-control-internal-tools');
  fs.unlinkSync(file);
});

test('activeGoalTag: returns undefined when currentActiveLane is null', () => {
  const goals: StructuredGoals = {
    raw: '', sections: {}, isEmpty: true,
    productLanes: [], priorityOrder: [], allowedWithoutApproval: [], mustAskFirst: [],
    operationsAreas: [], advertisingChannels: [], currentActiveLane: null,
    generationWindow: null, generationPreferences: { nowBias: [], nextBias: [], suppressBias: [] },
  };
  assert.equal(activeGoalTag(goals), undefined);
});

// ── goalTag derivation across a batch ────────────────────────────────────────

test('goalTag derivation: different proposals get different tags from same goals', () => {
  const file = tmpFile('goals-multi.md');
  fs.writeFileSync(file, GOALS_FIXTURE);
  const goals = parseStructuredGoals(file) as StructuredGoals;

  const proposals: TaskProposal[] = [
    { title: 'Mission Control: improve task drag-and-drop', description: '', priority: 'high', goal_rationale: 'Core Mission Control UX' },
    { title: 'Add Financial Planning forecast charts', description: '', priority: 'normal', goal_rationale: 'Financial Planning lane deliverable' },
  ];
  const tags = proposals.map(p => resolveGoalTagFromStructuredGoals(p, goals));
  assert.equal(tags[0], 'mission-control-internal-tools');
  assert.equal(tags[1], 'financial-planning');

  fs.unlinkSync(file);
});

test('goalTag derivation: all proposals get undefined when goals are empty', () => {
  const goals = parseStructuredGoals('/no/such/path') as StructuredGoals;
  const proposals: TaskProposal[] = [
    { title: 'Task A', description: '', priority: 'normal', goal_rationale: '' },
    { title: 'Task B', description: '', priority: 'normal', goal_rationale: '' },
  ];
  const tags = goals.isEmpty
    ? proposals.map(() => undefined)
    : proposals.map(p => resolveGoalTagFromStructuredGoals(p, goals));
  assert.ok(tags.every(t => t === undefined), 'all tags undefined on empty goals');
});

// ── appendAutonomousMetadata / extractAutonomousMetadata ──────────────────────

test('appendAutonomousMetadata: appends parseable metadata block', () => {
  const desc = 'Build the reporting dashboard.';
  const result = appendAutonomousMetadata(desc, {
    source: 'goal_daily_generation',
    autonomousRunId: 'run-123',
    goalTag: 'mission-control-internal-tools',
    lane: 'now',
    approvalState: 'auto_approved',
    generatedAt: '2026-04-10T06:00:00.000Z',
  });
  assert.ok(result.includes('Build the reporting dashboard.'));
  assert.ok(result.includes('AUTONOMOUS_META'));

  const extracted = extractAutonomousMetadata(result);
  assert.ok(extracted !== null);
  assert.equal(extracted?.autonomousRunId, 'run-123');
  assert.equal(extracted?.goalTag, 'mission-control-internal-tools');
  assert.equal(extracted?.lane, 'now');
  assert.equal(extracted?.approvalState, 'auto_approved');
});

test('appendAutonomousMetadata: replaces existing metadata block on re-stamp', () => {
  const desc = 'Some task.';
  const first = appendAutonomousMetadata(desc, {
    source: 'goal_daily_generation',
    autonomousRunId: 'run-001',
    goalTag: 'financial-planning',
  });
  const second = appendAutonomousMetadata(first, {
    source: 'goal_daily_generation',
    autonomousRunId: 'run-002',
    goalTag: 'mission-control-internal-tools',
  });

  // Only one metadata block should be present
  const count = (second.match(/AUTONOMOUS_META/g) || []).length;
  assert.equal(count, 1, 'should have exactly one metadata block after re-stamp');

  const extracted = extractAutonomousMetadata(second);
  assert.equal(extracted?.autonomousRunId, 'run-002');
  assert.equal(extracted?.goalTag, 'mission-control-internal-tools');
});

test('extractAutonomousMetadata: returns null for plain descriptions', () => {
  assert.equal(extractAutonomousMetadata('No metadata here.'), null);
  assert.equal(extractAutonomousMetadata(''), null);
  assert.equal(extractAutonomousMetadata(null), null);
  assert.equal(extractAutonomousMetadata(undefined), null);
});

test('extractAutonomousMetadata: returns null for malformed block', () => {
  const corrupt = 'Some task.\n\n<!-- AUTONOMOUS_META {bad json -->';
  assert.equal(extractAutonomousMetadata(corrupt), null);
});

test('stripAutonomousMetadata: removes block and returns clean description', () => {
  const desc = 'Build the dashboard.';
  const withMeta = appendAutonomousMetadata(desc, {
    source: 'goal_daily_generation',
    autonomousRunId: 'run-abc',
  });
  const stripped = stripAutonomousMetadata(withMeta);
  assert.equal(stripped, desc);
  assert.ok(!stripped.includes('AUTONOMOUS_META'));
});

// ── toAutonomousTaskDraft: goalTag + lane propagation ─────────────────────────

test('toAutonomousTaskDraft: carries goalTag and lane from structured goals', () => {
  const proposal: TaskProposal = {
    title: 'Mission Control: add bulk task actions',
    description: 'Implement select-all and bulk status change.',
    priority: 'high',
    goal_rationale: 'Improves Mission Control internal tools efficiency.',
  };

  const draft = toAutonomousTaskDraft(proposal, {
    autonomousRunId: 'run-draft-test',
    approvalRequired: false,
    goalTag: 'mission-control-internal-tools',
    lane: 'now',
  });

  assert.equal(draft.goalTag, 'mission-control-internal-tools');
  assert.equal(draft.lane, 'now');
  assert.equal(draft.approvalState, 'auto_approved');
  assert.equal(draft.autonomousRunId, 'run-draft-test');
  assert.equal(draft.source, 'goal_daily_generation');
});

test('toAutonomousTaskDraft: infers lane from priority when lane not specified', () => {
  const proposal: TaskProposal = {
    title: 'Routine maintenance task',
    description: '',
    priority: 'low',
    goal_rationale: '',
  };
  const draft = toAutonomousTaskDraft(proposal, {
    autonomousRunId: 'run-infer',
    approvalRequired: false,
  });
  assert.equal(draft.lane, 'later', 'low priority → later lane');
});

test('toAutonomousTaskDraft: approvalRequired=true sets pending_approval state', () => {
  const proposal: TaskProposal = {
    title: 'High-impact refactor',
    description: '',
    priority: 'normal',
    goal_rationale: '',
  };
  const draft = toAutonomousTaskDraft(proposal, {
    autonomousRunId: 'run-approval',
    approvalRequired: true,
  });
  assert.equal(draft.approvalState, 'pending_approval');
});

// ── planCoordinatorLanes: respects limits ─────────────────────────────────────

test('planCoordinatorLanes: distributes drafts across now/next/later', () => {
  const proposals: TaskProposal[] = [
    { title: 'T1', description: '', priority: 'urgent', goal_rationale: '' },
    { title: 'T2', description: '', priority: 'high', goal_rationale: '' },
    { title: 'T3', description: '', priority: 'normal', goal_rationale: '' },
    { title: 'T4', description: '', priority: 'normal', goal_rationale: '' },
    { title: 'T5', description: '', priority: 'low', goal_rationale: '' },
  ];
  const drafts = proposals.map((p, i) =>
    toAutonomousTaskDraft(p, { autonomousRunId: `run-${i}`, approvalRequired: false })
  );
  const plan = planCoordinatorLanes(drafts, { now: 2, next: 2 });

  assert.ok(plan.now.length <= 2, 'now must not exceed limit');
  assert.ok(plan.next.length <= 2, 'next must not exceed limit');
  // All drafts must appear in the plan
  const total = plan.now.length + plan.next.length + plan.later.length;
  assert.equal(total, drafts.length, 'no drafts lost');
});
