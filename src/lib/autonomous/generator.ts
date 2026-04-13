/**
 * generator.ts — Build an LLM prompt from the workspace's goals + context
 * and parse the response into a list of TaskProposal objects.
 */

import { completeJSON } from '@/lib/autopilot/llm';
import type { ParsedGoals, StructuredGoals, TaskProposal } from './types';
import { formatGoalsForPrompt, formatStructuredGoalsForPrompt } from './parser';

/** Type guard: true when goals carries the full StructuredGoals fields. */
function isStructuredGoals(goals: ParsedGoals): goals is StructuredGoals {
  return 'productLanes' in goals;
}

const SYSTEM_PROMPT = `You are an autonomous task planner for a software development team.
You receive a workspace's long-term goals and current context, then generate a precise,
actionable daily task list.  Each task must be completable by a single AI agent working
autonomously (no human input required) in approximately 1–4 hours.`;

export interface GeneratorInput {
  goals: ParsedGoals;
  openTaskTitles: string[];
  recentCompletedTitles: string[];
  targetCount: number;
  workspaceName?: string;
}

export interface GeneratorOutput {
  proposals: TaskProposal[];
  model: string;
  promptTokens: number;
  completionTokens: number;
  raw: string;
}

/**
 * Call the LLM and return a list of task proposals.
 * Retries are handled by completeJSON → complete (3 retries with backoff).
 */
export async function generateDailyProposals(input: GeneratorInput): Promise<GeneratorOutput> {
  const prompt = buildPrompt(input);

  const result = await completeJSON<unknown>(prompt, {
    systemPrompt: SYSTEM_PROMPT,
    temperature: 0.6,
    maxTokens: 2048,
  });

  const proposals = parseProposals(result.data, input.targetCount);

  return {
    proposals,
    model: result.model,
    promptTokens: result.usage.promptTokens,
    completionTokens: result.usage.completionTokens,
    raw: result.raw,
  };
}

// ── Prompt builder ────────────────────────────────────────────────────────────

function buildPrompt(input: GeneratorInput): string {
  const { goals, openTaskTitles, recentCompletedTitles, targetCount, workspaceName } = input;
  const today = new Date().toISOString().slice(0, 10);

  const goalsBlock = isStructuredGoals(goals)
    ? formatStructuredGoalsForPrompt(goals)
    : formatGoalsForPrompt(goals);

  const openBlock = openTaskTitles.length > 0
    ? openTaskTitles.map(t => `- ${t}`).join('\n')
    : '(none)';

  const recentBlock = recentCompletedTitles.length > 0
    ? recentCompletedTitles.map(t => `- ${t}`).join('\n')
    : '(none)';

  return `Today is ${today}.${workspaceName ? `\nWorkspace: ${workspaceName}` : ''}

## Long-term Goals and Context
${goalsBlock}

## Currently Open Tasks (do NOT duplicate these)
${openBlock}

## Recently Completed Tasks (last 7 days — do NOT redo these)
${recentBlock}

## Your Task
Generate exactly ${targetCount} new tasks for today. Each task must:
1. Directly advance one or more stated long-term goals.
2. Be concrete and specific — a clear deliverable, not a vague direction.
3. NOT duplicate or substantially overlap with any open or recently completed task above.
4. Be achievable autonomously by an AI agent in 1–4 hours (no human input required mid-task).
5. Have a self-contained description that gives the agent everything it needs to start.

Return ONLY a JSON array with exactly ${targetCount} objects, no markdown, no commentary:
[
  {
    "title": "Short imperative title (< 80 chars)",
    "description": "2-4 sentences: what to build, where to put it, what done looks like.",
    "priority": "normal",
    "goal_rationale": "One sentence: which goal this advances and why."
  }
]

priority must be one of: "low", "normal", "high", "urgent".`;
}

// ── Response parser ───────────────────────────────────────────────────────────

const VALID_PRIORITIES = new Set(['low', 'normal', 'high', 'urgent']);

function parseProposals(data: unknown, targetCount: number): TaskProposal[] {
  const proposals: TaskProposal[] = [];

  const items = Array.isArray(data) ? data : (data && typeof data === 'object' && 'tasks' in (data as object)) ? (data as { tasks: unknown[] }).tasks : [];

  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;

    const title = (typeof obj.title === 'string' ? obj.title : '').trim();
    const description = (typeof obj.description === 'string' ? obj.description : '').trim();
    const rawPriority = typeof obj.priority === 'string' ? obj.priority.toLowerCase() : 'normal';
    const priority = VALID_PRIORITIES.has(rawPriority)
      ? (rawPriority as TaskProposal['priority'])
      : 'normal';
    const goal_rationale = (typeof obj.goal_rationale === 'string' ? obj.goal_rationale : '').trim();

    if (!title) continue;

    proposals.push({ title, description, priority, goal_rationale });
    if (proposals.length >= targetCount * 2) break; // sanity cap
  }

  return proposals;
}
