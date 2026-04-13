export {
  parseGoalsFile,
  parseStructuredGoals,
  resolveGoalsPath,
  parseTasksLog,
  recentLogEntries,
  formatGoalsForPrompt,
  formatStructuredGoalsForPrompt,
  slugifyGoalTag,
} from './parser';
export {
  appendLogLine,
  logTaskCreated,
  logTaskSkipped,
  logTaskComplete,
  logTaskApproved,
  logTaskRejected,
  logTaskDispatched,
} from './log';
export { isDuplicate, deduplicateProposals, tokenise, jaccardSimilarity } from './dedup';
export {
  getCoordinatorIntegrationBoundaries,
  inferLaneFromPriority,
  planCoordinatorLanes,
  toAutonomousTaskDraft,
  resolveGoalTagFromStructuredGoals,
  activeGoalTag,
} from './coordinator';
export { runDailyAutonomousGeneration, checkAndRunDueAutonomousGenerations, getOrCreateConfig, upsertConfig } from './runner';
export { ensureAutonomousScheduled } from './scheduler';
export { appendAutonomousMetadata, extractAutonomousMetadata, stripAutonomousMetadata } from './metadata';
export type { AutonomousTaskMetadata } from './metadata';
export { handleAutonomousCompletion } from './completion';
export type { CompletionHookInput, CompletionHookResult } from './completion';
export type {
  AutonomousConfig,
  AutonomousRun,
  ParsedGoals,
  StructuredGoals,
  ProductLane,
  GenerationPreferences,
  TaskProposal,
  GenerationResult,
  LogEntry,
  LogEventType,
} from './types';
export type {
  AutonomousApprovalState,
  AutonomousLane,
  AutonomousTaskDraft,
  AutonomousTaskSource,
  CoordinatorIntegrationBoundaries,
  CoordinatorLanePlan,
} from './coordinator';
