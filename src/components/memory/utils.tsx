/**
 * Memory browser utility functions
 * Adapted from robsannaa/openclaw-mission-control
 */

import {
  CheckCircle2,
  AlertTriangle,
  CircleDashed,
} from "lucide-react";
import type { VectorState, DailyEntry } from "./types";

export function vectorBadge(entry: { vectorState?: VectorState }): {
  label: string;
  className: string;
  Icon: React.ComponentType<{ className?: string }>;
} | null {
  switch (entry.vectorState) {
    case "indexed":
      return {
        label: "Indexed",
        className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
        Icon: CheckCircle2,
      };
    case "stale":
      return {
        label: "Stale",
        className: "border-amber-500/30 bg-amber-500/10 text-amber-300",
        Icon: AlertTriangle,
      };
    case "not_indexed":
      return {
        label: "Not Indexed",
        className: "border-zinc-500/30 bg-zinc-500/10 text-zinc-300",
        Icon: CircleDashed,
      };
    default:
      return null;
  }
}

export function formatBytes(n: number) {
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  if (n < 1024) return `${n} B`;
  return `${(n / 1024).toFixed(1)} KB`;
}

export function formatAgo(d?: string) {
  if (!d) return "";
  const now = new Date();
  const diff = now.getTime() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `about ${hours}h ago`;
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

export function shortWorkspace(path: string): string {
  const clean = String(path || "").trim();
  if (!clean) return "workspace";
  const bits = clean.split("/").filter(Boolean);
  return bits[bits.length - 1] || clean;
}

export function normalizeMemoryPath(rawPath: string): string {
  const trimmed = rawPath.trim().replace(/^\/+/, "");
  if (trimmed.startsWith("memory/")) return trimmed.slice("memory/".length);
  return trimmed;
}

export const JOURNAL_PREFIX = "journal:";
export const AGENT_MEMORY_PREFIX = "agent-memory:";

export function journalKey(file: string): string {
  return `${JOURNAL_PREFIX}${file}`;
}

export function agentMemoryKey(agentId: string): string {
  return `${AGENT_MEMORY_PREFIX}${agentId}`;
}

export function selectedJournalFile(selected: string | null): string | null {
  if (!selected || !selected.startsWith(JOURNAL_PREFIX)) return null;
  return selected.slice(JOURNAL_PREFIX.length);
}

export function selectedAgentId(selected: string | null): string | null {
  if (!selected || !selected.startsWith(AGENT_MEMORY_PREFIX)) return null;
  return selected.slice(AGENT_MEMORY_PREFIX.length);
}

const PERIOD_ORDER = ["Today", "Yesterday", "This Week", "This Month"] as const;

export function parseDateLike(dateStr: string): Date {
  const isoDateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s-])/.exec(dateStr);
  if (isoDateOnlyMatch) {
    const year = Number(isoDateOnlyMatch[1]);
    const month = Number(isoDateOnlyMatch[2]);
    const day = Number(isoDateOnlyMatch[3]);
    return new Date(year, month - 1, day);
  }
  return new Date(dateStr);
}

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function getPeriodKey(dateStr: string): string {
  const d = parseDateLike(dateStr);
  if (isNaN(d.getTime())) return "Other";
  const now = startOfLocalDay(new Date());
  const date = startOfLocalDay(d);
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return "This Week";
  if (days < 30) return "This Month";
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export function groupByPeriod(entries: DailyEntry[]): { key: string; entries: DailyEntry[] }[] {
  const groups: Record<string, DailyEntry[]> = {};
  for (const e of entries) {
    const key = getPeriodKey(e.date);
    if (!groups[key]) groups[key] = [];
    groups[key].push(e);
  }
  const ordered: { key: string; entries: DailyEntry[] }[] = [];
  for (const key of PERIOD_ORDER) {
    if (groups[key]?.length) ordered.push({ key, entries: groups[key] });
  }
  const restKeys = Object.keys(groups).filter(
    (k) => !PERIOD_ORDER.includes(k as (typeof PERIOD_ORDER)[number])
  );
  restKeys.sort((a, b) => {
    const dateA = groups[a]?.[0]?.date ?? "";
    const dateB = groups[b]?.[0]?.date ?? "";
    return dateB.localeCompare(dateA);
  });
  for (const key of restKeys) {
    if (groups[key]?.length) ordered.push({ key, entries: groups[key] });
  }
  return ordered;
}

/** Bouncing dots spinner for inline loading states */
export function BouncingDots() {
  return (
    <span className="inline-flex items-center gap-0.5">
      <span className="h-1 w-1 animate-bounce rounded-full bg-current [animation-delay:0ms]" />
      <span className="h-1 w-1 animate-bounce rounded-full bg-current [animation-delay:150ms]" />
      <span className="h-1 w-1 animate-bounce rounded-full bg-current [animation-delay:300ms]" />
    </span>
  );
}