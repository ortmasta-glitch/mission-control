import type { TaskProposal, StructuredGoals, ProductLane } from './types';
import { slugifyGoalTag } from './parser';

export type AutonomousApprovalState = 'auto_approved' | 'pending_approval';
export type AutonomousTaskSource = 'goal_daily_generation';
export type AutonomousLane = 'now' | 'next' | 'later';

export interface AutonomousTaskDraft extends TaskProposal {
  source: AutonomousTaskSource;
  approvalState: AutonomousApprovalState;
  lane: AutonomousLane;
  autonomousRunId: string;
  goalTag?: string;
  dependencyHint?: string;
}

export interface CoordinatorLanePlan {
  now: AutonomousTaskDraft[];
  next: AutonomousTaskDraft[];
  later: AutonomousTaskDraft[];
}

export interface CoordinatorIntegrationBoundaries {
  taskStatusOnCreate: 'inbox' | 'pending_dispatch';
  requiresHumanApproval: boolean;
  shouldAutoDispatch: boolean;
  shouldBroadcastTaskCreated: boolean;
  shouldLogCreatedEvent: boolean;
}

/**
 * Tranche 2 groundwork: define how generated tasks enter Mission Control
 * without yet changing the database schema.
 */
export function getCoordinatorIntegrationBoundaries(
  approvalRequired: boolean
): CoordinatorIntegrationBoundaries {
  return {
    taskStatusOnCreate: approvalRequired ? 'pending_dispatch' : 'inbox',
    requiresHumanApproval: approvalRequired,
    shouldAutoDispatch: !approvalRequired,
    shouldBroadcastTaskCreated: true,
    shouldLogCreatedEvent: true,
  };
}

export function toAutonomousTaskDraft(
  proposal: TaskProposal,
  options: {
    autonomousRunId: string;
    approvalRequired: boolean;
    lane?: AutonomousLane;
    goalTag?: string;
    dependencyHint?: string;
  }
): AutonomousTaskDraft {
  return {
    ...proposal,
    source: 'goal_daily_generation',
    approvalState: options.approvalRequired ? 'pending_approval' : 'auto_approved',
    lane: options.lane ?? inferLaneFromPriority(proposal.priority),
    autonomousRunId: options.autonomousRunId,
    goalTag: options.goalTag,
    dependencyHint: options.dependencyHint,
  };
}

export function planCoordinatorLanes(
  drafts: AutonomousTaskDraft[],
  limits: { now?: number; next?: number } = {}
): CoordinatorLanePlan {
  const nowLimit = Math.max(0, limits.now ?? 2);
  const nextLimit = Math.max(0, limits.next ?? 3);

  const sorted = [...drafts].sort((a, b) => laneWeight(a) - laneWeight(b));
  const plan: CoordinatorLanePlan = { now: [], next: [], later: [] };

  for (const draft of sorted) {
    if (plan.now.length < nowLimit && draft.lane === 'now') {
      plan.now.push(draft);
      continue;
    }
    if (plan.next.length < nextLimit && (draft.lane === 'now' || draft.lane === 'next')) {
      plan.next.push({ ...draft, lane: 'next' });
      continue;
    }
    plan.later.push({ ...draft, lane: 'later' });
  }

  return plan;
}

export function inferLaneFromPriority(priority: TaskProposal['priority']): AutonomousLane {
  if (priority === 'urgent' || priority === 'high') return 'now';
  if (priority === 'normal') return 'next';
  return 'later';
}

function laneWeight(draft: AutonomousTaskDraft): number {
  return laneSortValue(draft.lane) * 10 + prioritySortValue(draft.priority);
}

function laneSortValue(lane: AutonomousLane): number {
  return lane === 'now' ? 0 : lane === 'next' ? 1 : 2;
}

function prioritySortValue(priority: TaskProposal['priority']): number {
  switch (priority) {
    case 'urgent': return 0;
    case 'high': return 1;
    case 'normal': return 2;
    case 'low': return 3;
  }
}

// ── Structured goal tag resolution ───────────────────────────────────────────

/**
 * Given a TaskProposal and a StructuredGoals, find the best-matching ProductLane
 * by word overlap between the proposal title/rationale and the lane name/description.
 * Returns the lane's goalTag, or undefined when no confident match is found.
 */
export function resolveGoalTagFromStructuredGoals(
  proposal: TaskProposal,
  goals: StructuredGoals
): string | undefined {
  if (!goals.productLanes.length) return undefined;

  const probeText = `${proposal.title} ${proposal.goal_rationale}`.toLowerCase();
  const probeWords = new Set(probeText.split(/\s+/).filter(w => w.length > 2));

  let bestLane: ProductLane | undefined;
  let bestScore = 0;

  for (const lane of goals.productLanes) {
    const laneWords = `${lane.name} ${lane.description}`.toLowerCase().split(/\s+/);
    let matches = 0;
    for (const word of laneWords) {
      if (word.length > 2 && probeWords.has(word)) matches++;
    }
    // Normalise by lane word count to avoid long descriptions always winning
    const score = laneWords.length > 0 ? matches / Math.sqrt(laneWords.length) : 0;
    if (score > bestScore) {
      bestScore = score;
      bestLane = lane;
    }
  }

  // Require at least one word match to assign a tag
  return bestScore > 0 ? bestLane?.goalTag : undefined;
}

/**
 * Derive the active-lane goal tag from StructuredGoals.currentActiveLane.
 * Returns undefined when no active lane is set.
 */
export function activeGoalTag(goals: StructuredGoals): string | undefined {
  return goals.currentActiveLane ? slugifyGoalTag(goals.currentActiveLane) : undefined;
}
