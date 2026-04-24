/**
 * Memory browser shared types
 * Adapted from robsannaa/openclaw-mission-control
 */

export type VectorState = "indexed" | "stale" | "not_indexed" | "unknown";

export type DailyEntry = {
  name: string;
  date: string;
  size?: number;
  words?: number;
  mtime?: string;
  vectorState?: VectorState;
};

export type MemoryMd = {
  content: string;
  words: number;
  size: number;
  mtime?: string;
  fileName?: string;
  path?: string;
  vectorState?: VectorState;
  hasAltCaseFile?: boolean;
} | null;

export type AgentMemoryFile = {
  agentId: string;
  agentName: string;
  isDefault: boolean;
  workspace: string;
  exists: boolean;
  fileName: string;
  path: string;
  hasAltCaseFile?: boolean;
  words: number;
  size: number;
  mtime?: string;
  vectorState?: VectorState;
  dirty?: boolean;
  indexedFiles?: number;
  indexedChunks?: number;
  scanIssues?: string[];
  provider?: string;
  model?: string;
};

export type WorkspaceFile = {
  name: string;
  path: string;
  exists: boolean;
  size: number;
  mtime?: string;
  words: number;
  vectorState: VectorState;
};

export type DetailMeta = {
  title: string;
  words?: number;
  size?: number;
  fileKey: string;
  fileName?: string;
  mtime?: string;
  kind: "core" | "journal" | "agent-memory" | "workspace-file";
  vectorState?: VectorState;
  workspace?: string;
  agentId?: string;
};

export type CtxMenuState = { x: number; y: number; entry: DailyEntry } | null;