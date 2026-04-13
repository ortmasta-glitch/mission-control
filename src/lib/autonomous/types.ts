/**
 * Types for the Goal-Driven Autonomous Task Generation feature.
 */

// ── DB row types ──────────────────────────────────────────────────────────────

export interface AutonomousConfig {
  id: string;
  workspace_id: string;
  /** Master on/off switch */
  enabled: boolean;
  /** Path to AUTONOMOUS.md (relative to PROJECTS_PATH or absolute) */
  goals_file_path: string;
  /** Path to append-only completion log */
  log_file_path: string;
  /** 5-field cron expression; default "0 8 * * *" = 8 AM every day */
  generation_cron: string;
  timezone: string;
  /** How many tasks to target per daily batch */
  target_task_count: number;
  /** 0 = auto-dispatch to inbox; 1 = hold for approval (tranche 2) */
  approval_required: boolean;
  last_run_at?: string;
  created_at: string;
  updated_at: string;
}

export type AutonomousRunStatus = 'running' | 'completed' | 'failed' | 'partial';

export interface AutonomousRun {
  id: string;
  workspace_id: string;
  /** ISO date YYYY-MM-DD; idempotency key (one run per workspace per day) */
  run_date: string;
  status: AutonomousRunStatus;
  tasks_proposed: number;
  tasks_created: number;
  tasks_skipped: number;
  error_message?: string;
  model?: string;
  prompt_tokens: number;
  completion_tokens: number;
  cost_usd: number;
  /** Raw LLM JSON proposal — stored for debugging / tranche-2 approval UI */
  raw_proposal?: string;
  created_at: string;
  updated_at: string;
}

// ── Parser types ──────────────────────────────────────────────────────────────

export interface ParsedGoals {
  /** Full raw text of AUTONOMOUS.md */
  raw: string;
  /** Map of section heading → section body */
  sections: Record<string, string>;
  /** True when the file was missing or empty */
  isEmpty: boolean;
}

/**
 * A single product lane extracted from ## Product lanes (or ## Product and packaging opportunities).
 */
export interface ProductLane {
  /** Heading name as it appears in AUTONOMOUS.md */
  name: string;
  /** Body text of the section */
  description: string;
  /** 1-based rank derived from ## Priority order (lower = higher priority; unranked lanes get rank 99) */
  priorityRank: number;
  /** Stable URL-safe tag derived from the heading, e.g. "mission-control-internal-tools" */
  goalTag: string;
}

/**
 * Parsed directional preferences from ## Immediate generation preferences.
 */
export interface GenerationPreferences {
  /** Items to bias toward the `now` lane */
  nowBias: string[];
  /** Items to bias toward the `next` lane */
  nextBias: string[];
  /** Items to keep behind higher-priority work */
  suppressBias: string[];
}

/**
 * Structured parse of AUTONOMOUS.md — superset of ParsedGoals.
 * All existing ParsedGoals callers continue to work unchanged.
 * Produced by parseStructuredGoals(); use parseGoalsFile() when only raw sections are needed.
 */
export interface StructuredGoals extends ParsedGoals {
  /** Priority-ordered product lanes (from ## Product lanes + ## Product and packaging opportunities) */
  productLanes: ProductLane[];
  /** Ordered priority items from ## Priority order as plain strings */
  priorityOrder: string[];
  /** Work items explicitly allowed without human approval */
  allowedWithoutApproval: string[];
  /** Work items that require approval before acting */
  mustAskFirst: string[];
  /** Operations automation focus areas from ## Operations automation */
  operationsAreas: string[];
  /** Advertising platforms mentioned in the Advertising Channels lane, e.g. ["Instagram", "Facebook"] */
  advertisingChannels: string[];
  /** Name of the heading under ## Current active lane, or null */
  currentActiveLane: string | null;
  /** Generation window string extracted from ## Mission and operating bias, e.g. "06:00-08:00 Europe/Warsaw" */
  generationWindow: string | null;
  /** Parsed generation preferences from ## Immediate generation preferences */
  generationPreferences: GenerationPreferences;
}

// ── Generator types ──────────────────────────────────────────────────────────

export interface TaskProposal {
  title: string;
  description: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  /** Why this task advances a stated long-term goal */
  goal_rationale: string;
}

export interface GenerationResult {
  runId: string;
  runDate: string;
  tasksCreated: number;
  tasksSkipped: number;
  /** IDs of tasks inserted into the tasks table */
  taskIds: string[];
  costUsd: number;
  status: 'completed' | 'failed' | 'partial';
  error?: string;
}

// ── Log types ─────────────────────────────────────────────────────────────────

/**
 * A parsed line from memory/tasks-log.md.
 *
 * Line format (pipe-delimited, grep-friendly):
 *   {ISO_TS} | CREATED  | {task_id} | {title} | run:{run_id}
 *   {ISO_TS} | COMPLETE | {task_id} | {title} | agent:{agent_id_or_system}
 *   {ISO_TS} | SKIPPED  | -         | {title} | reason:{reason}
 *
 * Pipes within the title field are replaced with U+2023 (‣) to avoid ambiguity.
 */
export type LogEventType =
  | 'CREATED'    // task inserted into DB in an autonomous run
  | 'COMPLETE'   // task transitioned to done
  | 'SKIPPED'    // proposal rejected before DB insert (duplicate / quality)
  | 'APPROVED'   // task approved from pending-approval queue
  | 'REJECTED'   // task rejected from pending-approval queue
  | 'DISPATCHED';// task sent to an agent for execution

export interface LogEntry {
  timestamp: string;
  event: LogEventType;
  taskId: string;
  title: string;
  meta: string;
}
