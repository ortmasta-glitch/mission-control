/**
 * parser.ts — Read and parse AUTONOMOUS.md and memory/tasks-log.md.
 *
 * Design rules:
 * - Never throws; always returns a safe default when files are missing.
 * - AUTONOMOUS.md is read-only from this module.
 * - tasks-log.md is read-only from this module (writes go through log.ts).
 */

import fs from 'fs';
import path from 'path';
import type { ParsedGoals, StructuredGoals, ProductLane, GenerationPreferences, LogEntry, LogEventType } from './types';

// ── AUTONOMOUS.md ─────────────────────────────────────────────────────────────

/**
 * Read and parse AUTONOMOUS.md from the given path.
 * Returns a safe empty result if the file doesn't exist.
 *
 * Sections are parsed by looking for `## Heading` markers.
 * Everything before the first heading lands in sections['_preamble'].
 */
export function parseGoalsFile(filePath: string): ParsedGoals {
  if (!filePath) return emptyGoals();

  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf-8');
  } catch {
    // File missing or unreadable — not an error, just empty
    return emptyGoals();
  }

  if (!raw.trim()) return emptyGoals();

  const sections: Record<string, string> = {};
  let currentHeading = '_preamble';
  const lines = raw.split('\n');

  for (const line of lines) {
    // Match ## or ### section headings (not # which is the doc title)
    const headingMatch = line.match(/^#{2,3}\s+(.+)/);
    if (headingMatch) {
      currentHeading = headingMatch[1].trim();
      sections[currentHeading] = sections[currentHeading] ?? '';
    } else {
      sections[currentHeading] = (sections[currentHeading] ?? '') + line + '\n';
    }
  }

  // Trim trailing whitespace in each section
  for (const k of Object.keys(sections)) {
    sections[k] = sections[k].trim();
  }

  return { raw, sections, isEmpty: false };
}

/**
 * Resolve the goals file path:
 * 1. If absolute → use as-is
 * 2. Otherwise → resolve relative to PROJECTS_PATH env var
 *    (falling back to process.cwd())
 */
export function resolveGoalsPath(configuredPath: string): string {
  if (path.isAbsolute(configuredPath)) return configuredPath;
  const base = process.env.PROJECTS_PATH || process.cwd();
  return path.join(base, configuredPath);
}

function emptyGoals(): ParsedGoals {
  return { raw: '', sections: {}, isEmpty: true };
}

// ── tasks-log.md ──────────────────────────────────────────────────────────────

/**
 * Read and parse memory/tasks-log.md.
 * Returns an empty array if the file doesn't exist.
 *
 * Line format:
 *   {ISO_TS} | {EVENT} | {task_id} | {title} | {meta}
 *
 * Lines not matching this format are silently ignored (comments, blank lines, etc.)
 */
export function parseTasksLog(filePath: string): LogEntry[] {
  if (!filePath) return [];

  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return [];
  }

  const entries: LogEntry[] = [];

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const parts = trimmed.split('|').map(p => p.trim());
    if (parts.length < 5) continue;

    const [timestamp, eventRaw, taskId, title, meta] = parts;
    const event = eventRaw as LogEventType;
    if (!['CREATED', 'COMPLETE', 'SKIPPED', 'APPROVED', 'REJECTED', 'DISPATCHED'].includes(event)) continue;
    if (!timestamp) continue;

    entries.push({ timestamp, event, taskId, title, meta });
  }

  return entries;
}

/**
 * Return only CREATED/COMPLETE log entries from the last N days.
 * Used by the generator to exclude recently-worked titles.
 */
export function recentLogEntries(filePath: string, daysBack = 7): LogEntry[] {
  const all = parseTasksLog(filePath);
  const cutoff = Date.now() - daysBack * 24 * 60 * 60 * 1000;
  return all.filter(e => {
    try {
      return new Date(e.timestamp).getTime() >= cutoff;
    } catch {
      return false;
    }
  });
}

/**
 * Extract a plain text summary of the goals file suitable for inclusion in an
 * LLM prompt.  Keeps it token-light by omitting empty sections.
 */
export function formatGoalsForPrompt(goals: ParsedGoals, maxChars = 3000): string {
  if (goals.isEmpty) return '(No goals file found — generate broadly useful tasks.)';

  // Prefer explicit sections over raw dump
  const relevant = Object.entries(goals.sections)
    .filter(([k, v]) => k !== '_preamble' && v.trim())
    .map(([k, v]) => `### ${k}\n${v.trim()}`)
    .join('\n\n');

  const text = relevant || goals.raw;
  return text.length > maxChars ? text.slice(0, maxChars) + '\n...(truncated)' : text;
}

// ── Structured goals parser ───────────────────────────────────────────────────

/**
 * Internal block representation from the two-level heading parser.
 * level 2 = ##, level 3 = ###
 */
interface HeadingBlock {
  level: 2 | 3;
  heading: string;
  body: string;
  /** For level-3 blocks: the nearest preceding level-2 heading */
  parent: string | null;
}

/**
 * Parse raw AUTONOMOUS.md text into a flat list of heading blocks,
 * preserving parent→child nesting for ## / ### pairs.
 */
function parseHeadingBlocks(raw: string): HeadingBlock[] {
  const blocks: HeadingBlock[] = [];
  let current: HeadingBlock | null = null;
  let currentL2: string | null = null;

  for (const line of raw.split('\n')) {
    // Exclude the document title (#) — only ## and ### are sections
    const h2 = line.match(/^##(?!#)\s+(.+)/);
    const h3 = line.match(/^###\s+(.+)/);

    if (h2) {
      if (current) blocks.push({ ...current, body: current.body.trim() });
      currentL2 = h2[1].trim();
      current = { level: 2, heading: currentL2, body: '', parent: null };
    } else if (h3) {
      if (current) blocks.push({ ...current, body: current.body.trim() });
      current = { level: 3, heading: h3[1].trim(), body: '', parent: currentL2 };
    } else if (current) {
      current.body += line + '\n';
    }
  }
  if (current) blocks.push({ ...current, body: current.body.trim() });
  return blocks;
}

/** Return all level-3 blocks whose parent matches the given level-2 heading. */
function childBlocks(blocks: HeadingBlock[], parentHeading: string): HeadingBlock[] {
  return blocks.filter(b => b.level === 3 && b.parent === parentHeading);
}

/** Return the single level-2 block with the given heading (case-insensitive). */
function l2Block(blocks: HeadingBlock[], heading: string): HeadingBlock | undefined {
  const lc = heading.toLowerCase();
  return blocks.find(b => b.level === 2 && b.heading.toLowerCase() === lc);
}

/**
 * Convert a heading string into a stable, URL-safe goal tag.
 * e.g. "Mission Control internal tools" → "mission-control-internal-tools"
 */
export function slugifyGoalTag(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Parse a markdown bullet/numbered list body into an array of trimmed strings. */
function parseListBody(body: string): string[] {
  return body
    .split('\n')
    .map(l => l.replace(/^[\s]*[-*\d.]+\s+/, '').trim())
    .filter(Boolean);
}

/**
 * Derive a priority rank (1-based) for a lane name by matching it against
 * the numbered items in the ## Priority order section body.
 * Returns 99 for lanes not mentioned in the priority list.
 */
function derivePriorityRank(laneName: string, priorityItems: string[]): number {
  const laneWords = new Set(laneName.toLowerCase().split(/\s+/).filter(w => w.length > 2));

  for (let i = 0; i < priorityItems.length; i++) {
    const itemWords = priorityItems[i].toLowerCase();
    // Check if any meaningful word from the lane name appears in the priority item
    let matched = false;
    laneWords.forEach(word => { if (itemWords.includes(word)) matched = true; });
    if (matched) return i + 1;
  }
  return 99;
}

/**
 * Extract advertising platform names from a body string.
 * Looks for lines containing "Focus on ..." or comma-separated platform names.
 */
function extractChannelNames(body: string): string[] {
  const platforms: string[] = [];
  const knownPlatforms = ['Instagram', 'Facebook', 'TikTok', 'Google Ads', 'YouTube', 'LinkedIn', 'Twitter', 'X'];

  for (const platform of knownPlatforms) {
    if (body.includes(platform)) platforms.push(platform);
  }
  return platforms;
}

/**
 * Extract the generation window from the ## Mission and operating bias body.
 * Looks for a line like "Daily autonomous generation window: 06:00-08:00 Europe/Warsaw."
 */
function extractGenerationWindow(body: string): string | null {
  const match = body.match(/generation window[:\s]+([^\n.]+)/i);
  return match ? match[1].trim().replace(/\.$/, '') : null;
}

/**
 * Parse ## Immediate generation preferences into structured bias lists.
 * Lines starting with "Prefer" → nowBias/nextBias; "Keep ... behind" → suppressBias.
 */
function parseGenerationPreferences(body: string): GenerationPreferences {
  const nowBias: string[] = [];
  const nextBias: string[] = [];
  const suppressBias: string[] = [];

  for (const line of body.split('\n')) {
    const text = line.replace(/^[-*\s]+/, '').trim();
    if (!text) continue;

    const lc = text.toLowerCase();
    if (lc.startsWith('prefer') && (lc.includes('`now`') || lc.includes('now lane') || lc.includes('1-2'))) {
      nowBias.push(text);
    } else if (lc.startsWith('prefer') && (lc.includes('next') || lc.includes('finance') || lc.includes('analysis'))) {
      nextBias.push(text);
    } else if (lc.startsWith('keep') && (lc.includes('behind') || lc.includes('below') || lc.includes('unless'))) {
      suppressBias.push(text);
    } else if (lc.startsWith('prefer')) {
      nextBias.push(text); // default prefer → next
    }
  }

  return { nowBias, nextBias, suppressBias };
}

/**
 * Parse AUTONOMOUS.md into a StructuredGoals object.
 *
 * This is a superset of parseGoalsFile() — it returns the same raw/sections/isEmpty
 * fields plus all structured extractions.  Safe to use everywhere ParsedGoals is
 * accepted because StructuredGoals extends ParsedGoals.
 *
 * Never throws; returns a structurally empty result when the file is missing.
 */
export function parseStructuredGoals(filePath: string): StructuredGoals {
  const base = parseGoalsFile(filePath);

  if (base.isEmpty) {
    return {
      ...base,
      productLanes: [],
      priorityOrder: [],
      allowedWithoutApproval: [],
      mustAskFirst: [],
      operationsAreas: [],
      advertisingChannels: [],
      currentActiveLane: null,
      generationWindow: null,
      generationPreferences: { nowBias: [], nextBias: [], suppressBias: [] },
    };
  }

  const blocks = parseHeadingBlocks(base.raw);

  // ── Priority order ─────────────────────────────────────────────────────────
  const priorityBlock = l2Block(blocks, 'Priority order');
  const priorityOrder = priorityBlock ? parseListBody(priorityBlock.body) : [];

  // ── Product lanes (## Product lanes + ## Product and packaging opportunities) ─
  const laneParents = ['Product lanes', 'Product and packaging opportunities'];
  const laneBlocks = blocks.filter(
    b => b.level === 3 && b.parent !== null && laneParents.includes(b.parent)
  );

  const productLanes: ProductLane[] = laneBlocks.map(b => ({
    name: b.heading,
    description: b.body,
    priorityRank: derivePriorityRank(b.heading, priorityOrder),
    goalTag: slugifyGoalTag(b.heading),
  }));

  // Sort by rank ascending (unranked 99 sinks to end)
  productLanes.sort((a, b) => a.priorityRank - b.priorityRank);

  // ── Guardrails ─────────────────────────────────────────────────────────────
  const allowedBlock = blocks.find(b => b.level === 3 && b.heading.toLowerCase().includes('allowed without approval'));
  const mustAskBlock = blocks.find(b => b.level === 3 && b.heading.toLowerCase().includes('must ask'));

  const allowedWithoutApproval = allowedBlock ? parseListBody(allowedBlock.body) : [];
  const mustAskFirst = mustAskBlock ? parseListBody(mustAskBlock.body) : [];

  // ── Operations automation ──────────────────────────────────────────────────
  const opsBlock = l2Block(blocks, 'Operations automation');
  const operationsAreas = opsBlock ? parseListBody(opsBlock.body) : [];

  // ── Advertising channels ───────────────────────────────────────────────────
  const adsLane = laneBlocks.find(b => b.heading.toLowerCase().includes('advertising'));
  const advertisingChannels = adsLane ? extractChannelNames(adsLane.body) : [];

  // ── Current active lane ────────────────────────────────────────────────────
  const activeLaneBlock = l2Block(blocks, 'Current active lane');
  const activeLaneChildren = activeLaneBlock
    ? childBlocks(blocks, 'Current active lane')
    : [];
  const currentActiveLane = activeLaneChildren.length > 0
    ? activeLaneChildren[0].heading
    : (activeLaneBlock ? activeLaneBlock.body.split('\n').find(l => l.trim())?.trim() ?? null : null);

  // ── Generation window ──────────────────────────────────────────────────────
  const biasBlock = l2Block(blocks, 'Mission and operating bias');
  const generationWindow = biasBlock ? extractGenerationWindow(biasBlock.body) : null;

  // ── Generation preferences ─────────────────────────────────────────────────
  const prefBlock = l2Block(blocks, 'Immediate generation preferences');
  const generationPreferences = prefBlock
    ? parseGenerationPreferences(prefBlock.body)
    : { nowBias: [], nextBias: [], suppressBias: [] };

  return {
    ...base,
    productLanes,
    priorityOrder,
    allowedWithoutApproval,
    mustAskFirst,
    operationsAreas,
    advertisingChannels,
    currentActiveLane,
    generationWindow,
    generationPreferences,
  };
}

/**
 * Format a StructuredGoals into a richer, better-organised LLM prompt block.
 *
 * Produces a more structured prompt than formatGoalsForPrompt() by surfacing
 * priority ranking, active lane, guardrails, and generation bias explicitly.
 * Falls back to formatGoalsForPrompt() when called with a plain ParsedGoals.
 */
export function formatStructuredGoalsForPrompt(goals: StructuredGoals, maxChars = 3500): string {
  if (goals.isEmpty) return formatGoalsForPrompt(goals, maxChars);

  const parts: string[] = [];

  // Active lane — most important context for today's batch
  if (goals.currentActiveLane) {
    parts.push(`**Active lane today:** ${goals.currentActiveLane}`);
  }

  // Priority order
  if (goals.priorityOrder.length > 0) {
    parts.push(`**Priority order:**\n${goals.priorityOrder.map((p, i) => `${i + 1}. ${p}`).join('\n')}`);
  }

  // Product lanes (top 6 by rank)
  if (goals.productLanes.length > 0) {
    const lanesText = goals.productLanes.slice(0, 6).map(l => {
      const desc = l.description ? `\n  ${l.description.split('\n').slice(0, 2).join('\n  ')}` : '';
      return `- **${l.name}** [${l.goalTag}]${desc}`;
    }).join('\n');
    parts.push(`**Product lanes:**\n${lanesText}`);
  }

  // Advertising channel emphasis
  if (goals.advertisingChannels.length > 0) {
    parts.push(`**Advertising channel focus:** ${goals.advertisingChannels.join(', ')}`);
  }

  // Operations areas
  if (goals.operationsAreas.length > 0) {
    parts.push(`**Operations automation:**\n${goals.operationsAreas.map(a => `- ${a}`).join('\n')}`);
  }

  // Generation preferences
  const prefs = goals.generationPreferences;
  const prefLines = [
    ...prefs.nowBias.map(p => `- [NOW] ${p}`),
    ...prefs.nextBias.map(p => `- [NEXT] ${p}`),
    ...prefs.suppressBias.map(p => `- [LATER] ${p}`),
  ];
  if (prefLines.length > 0) {
    parts.push(`**Generation preferences:**\n${prefLines.join('\n')}`);
  }

  // Guardrails — keep these visible so LLM avoids approval-needed work
  if (goals.mustAskFirst.length > 0) {
    parts.push(`**Must ask before acting (do NOT generate tasks for these):**\n${goals.mustAskFirst.map(g => `- ${g}`).join('\n')}`);
  }

  const text = parts.join('\n\n');
  return text.length > maxChars ? text.slice(0, maxChars) + '\n...(truncated)' : text;
}
