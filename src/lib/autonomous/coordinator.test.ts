import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getCoordinatorIntegrationBoundaries,
  inferLaneFromPriority,
  planCoordinatorLanes,
  toAutonomousTaskDraft,
} from './coordinator';

test('approval-required config parks generated tasks for review', () => {
  const boundaries = getCoordinatorIntegrationBoundaries(true);
  assert.equal(boundaries.requiresHumanApproval, true);
  assert.equal(boundaries.taskStatusOnCreate, 'pending_dispatch');
  assert.equal(boundaries.shouldAutoDispatch, false);
});

test('auto-approved config keeps direct inbox insertion path', () => {
  const boundaries = getCoordinatorIntegrationBoundaries(false);
  assert.equal(boundaries.requiresHumanApproval, false);
  assert.equal(boundaries.taskStatusOnCreate, 'inbox');
  assert.equal(boundaries.shouldAutoDispatch, true);
});

test('priority maps to sensible default lane', () => {
  assert.equal(inferLaneFromPriority('urgent'), 'now');
  assert.equal(inferLaneFromPriority('high'), 'now');
  assert.equal(inferLaneFromPriority('normal'), 'next');
  assert.equal(inferLaneFromPriority('low'), 'later');
});

test('task drafts capture tranche 2 metadata without mutating the proposal shape', () => {
  const draft = toAutonomousTaskDraft(
    {
      title: 'Add completion logging hook',
      description: 'Wire done-state transitions into autonomous completion logging.',
      priority: 'high',
      goal_rationale: 'Closes the loop between execution and future planning.',
    },
    {
      autonomousRunId: 'run-123',
      approvalRequired: true,
      goalTag: 'resilience',
      dependencyHint: 'needs task status transition hook',
    }
  );

  assert.equal(draft.autonomousRunId, 'run-123');
  assert.equal(draft.approvalState, 'pending_approval');
  assert.equal(draft.source, 'goal_daily_generation');
  assert.equal(draft.lane, 'now');
  assert.equal(draft.goalTag, 'resilience');
  assert.equal(draft.dependencyHint, 'needs task status transition hook');
});

test('lane planning caps active work and pushes overflow safely downstream', () => {
  const drafts = [
    toAutonomousTaskDraft({ title: 'A', description: '', priority: 'urgent', goal_rationale: '' }, { autonomousRunId: 'run', approvalRequired: false }),
    toAutonomousTaskDraft({ title: 'B', description: '', priority: 'high', goal_rationale: '' }, { autonomousRunId: 'run', approvalRequired: false }),
    toAutonomousTaskDraft({ title: 'C', description: '', priority: 'normal', goal_rationale: '' }, { autonomousRunId: 'run', approvalRequired: false }),
    toAutonomousTaskDraft({ title: 'D', description: '', priority: 'low', goal_rationale: '' }, { autonomousRunId: 'run', approvalRequired: false }),
  ];

  const plan = planCoordinatorLanes(drafts, { now: 1, next: 2 });

  assert.deepEqual(plan.now.map(task => task.title), ['A']);
  assert.deepEqual(plan.next.map(task => task.title), ['B', 'C']);
  assert.deepEqual(plan.later.map(task => task.title), ['D']);
  assert.ok(plan.next.every(task => task.lane === 'next'));
  assert.ok(plan.later.every(task => task.lane === 'later'));
});
