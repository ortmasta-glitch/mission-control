/**
 * ollama-usage.ts — Ollama Cloud token usage tracking.
 *
 * Live data:  GET /api/ps  (running models)
 *             GET /api/tags (available models)
 * Historical: /app/data/ollama-usage.json  (persistent accumulator written by POST /api/costs/ollama)
 *
 * Requires OLLAMA_API_KEY in env (Bearer token for https://ollama.com).
 * Requires OLLAMA_BASE_URL (default: https://ollama.com).
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import path from 'path';

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? 'https://ollama.com';
const STORE_PATH = process.env.OLLAMA_USAGE_STORE ?? '/app/data/ollama-usage.json';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface OllamaRunningModel {
  name: string;
  model: string;
  sizeBytes: number;
  sizeVram: number;
  family: string;
  parameterSize: string;
  quantization: string;
  expiresAt: string | null;
}

export interface OllamaAvailableModel {
  name: string;
  model: string;
  sizeBytes: number;
  family: string;
  parameterSize: string;
  quantization: string;
  modifiedAt: string;
}

export interface OllamaUsageRecord {
  timestamp: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  evalDurationNs: number;      // nanoseconds
  promptDurationNs: number;    // nanoseconds
  totalDurationNs: number;     // nanoseconds
  agentId?: string;
}

export interface OllamaModelBreakdown {
  model: string;
  inputTokens: number;
  outputTokens: number;
  requests: number;
  avgTokensPerSec: number;
  totalEvalDurationMs: number;
}

export interface OllamaUsageStore {
  sessions: OllamaUsageRecord[];
  updatedAt: string;
}

export interface OllamaUsageSummary {
  configured: boolean;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalRequests: number;
  avgTokensPerSec: number;
  byModel: OllamaModelBreakdown[];
  runningModels: OllamaRunningModel[];
  availableModels: OllamaAvailableModel[];
  recentSessions: OllamaUsageRecord[];
  fetchedAt: string;
}

export type OllamaFetchError =
  | { type: 'no_key' }
  | { type: 'unauthorized'; message: string }
  | { type: 'api_error'; status: number; message: string }
  | { type: 'network_error'; message: string };

// ── Helpers ───────────────────────────────────────────────────────────────────

function getApiKey(): string | null {
  return process.env.OLLAMA_API_KEY || null;
}

export function hasOllamaKey(): boolean {
  return Boolean(getApiKey());
}

async function ollamaGet<T>(path: string): Promise<T> {
  const key = getApiKey();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (key) headers['Authorization'] = `Bearer ${key}`;

  let res: Response;
  try {
    res = await fetch(`${OLLAMA_BASE_URL}${path}`, { headers, cache: 'no-store' });
  } catch (err) {
    throw { type: 'network_error', message: String(err) } as OllamaFetchError;
  }

  if (res.status === 401) {
    throw { type: 'unauthorized', message: await res.text().catch(() => '') } as OllamaFetchError;
  }
  if (!res.ok) {
    throw { type: 'api_error', status: res.status, message: await res.text().catch(() => '') } as OllamaFetchError;
  }

  return res.json() as Promise<T>;
}

// ── Live Ollama API ───────────────────────────────────────────────────────────

interface OllamaPsResponse {
  models?: Array<{
    name: string;
    model: string;
    size: number;
    size_vram?: number;
    expires_at?: string;
    details?: {
      family?: string;
      parameter_size?: string;
      quantization_level?: string;
    };
  }>;
}

interface OllamaTagsResponse {
  models?: Array<{
    name: string;
    model: string;
    size: number;
    modified_at: string;
    details?: {
      family?: string;
      parameter_size?: string;
      quantization_level?: string;
    };
  }>;
}

export async function fetchRunningModels(): Promise<OllamaRunningModel[]> {
  try {
    const data = await ollamaGet<OllamaPsResponse>('/api/ps');
    return (data.models ?? []).map(m => ({
      name: m.name,
      model: m.model,
      sizeBytes: m.size ?? 0,
      sizeVram: m.size_vram ?? 0,
      family: m.details?.family ?? 'unknown',
      parameterSize: m.details?.parameter_size ?? '?',
      quantization: m.details?.quantization_level ?? '?',
      expiresAt: m.expires_at ?? null,
    }));
  } catch {
    return [];
  }
}

export async function fetchAvailableModels(): Promise<OllamaAvailableModel[]> {
  try {
    const data = await ollamaGet<OllamaTagsResponse>('/api/tags');
    return (data.models ?? []).map(m => ({
      name: m.name,
      model: m.model,
      sizeBytes: m.size ?? 0,
      family: m.details?.family ?? 'unknown',
      parameterSize: m.details?.parameter_size ?? '?',
      quantization: m.details?.quantization_level ?? '?',
      modifiedAt: m.modified_at,
    }));
  } catch {
    return [];
  }
}

// ── Usage Store (persistent JSON accumulator) ─────────────────────────────────

export async function readUsageStore(): Promise<OllamaUsageStore> {
  try {
    const raw = await readFile(STORE_PATH, 'utf-8');
    return JSON.parse(raw) as OllamaUsageStore;
  } catch {
    return { sessions: [], updatedAt: new Date().toISOString() };
  }
}

export async function appendUsageRecord(record: OllamaUsageRecord): Promise<void> {
  const store = await readUsageStore();
  store.sessions.push(record);
  // Keep last 10,000 records to bound file size
  if (store.sessions.length > 10_000) {
    store.sessions = store.sessions.slice(-10_000);
  }
  store.updatedAt = new Date().toISOString();
  try {
    await mkdir(path.dirname(STORE_PATH), { recursive: true });
    await writeFile(STORE_PATH, JSON.stringify(store, null, 2), 'utf-8');
  } catch {
    // Non-fatal — dashboard degrades gracefully
  }
}

// ── Summary builder ───────────────────────────────────────────────────────────

function buildModelBreakdowns(sessions: OllamaUsageRecord[]): OllamaModelBreakdown[] {
  const map = new Map<string, OllamaModelBreakdown>();

  for (const s of sessions) {
    const existing = map.get(s.model) ?? {
      model: s.model,
      inputTokens: 0,
      outputTokens: 0,
      requests: 0,
      avgTokensPerSec: 0,
      totalEvalDurationMs: 0,
    };
    existing.inputTokens += s.inputTokens;
    existing.outputTokens += s.outputTokens;
    existing.requests += 1;
    existing.totalEvalDurationMs += s.evalDurationNs / 1_000_000;
    map.set(s.model, existing);
  }

  const result: OllamaModelBreakdown[] = [];
  map.forEach(m => {
    const durationSec = m.totalEvalDurationMs / 1000;
    m.avgTokensPerSec = durationSec > 0 ? m.outputTokens / durationSec : 0;
    result.push(m);
  });

  return result.sort((a, b) => b.outputTokens - a.outputTokens);
}

export async function buildUsageSummary(): Promise<OllamaUsageSummary> {
  const [store, runningModels, availableModels] = await Promise.all([
    readUsageStore(),
    fetchRunningModels(),
    fetchAvailableModels(),
  ]);

  const sessions = store.sessions;
  const totalInputTokens = sessions.reduce((s, r) => s + r.inputTokens, 0);
  const totalOutputTokens = sessions.reduce((s, r) => s + r.outputTokens, 0);
  const totalEvalDurationSec = sessions.reduce((s, r) => s + r.evalDurationNs / 1e9, 0);
  const avgTokensPerSec = totalEvalDurationSec > 0
    ? totalOutputTokens / totalEvalDurationSec
    : 0;

  return {
    configured: hasOllamaKey(),
    totalInputTokens,
    totalOutputTokens,
    totalRequests: sessions.length,
    avgTokensPerSec,
    byModel: buildModelBreakdowns(sessions),
    runningModels,
    availableModels,
    recentSessions: sessions.slice(-20).reverse(),
    fetchedAt: new Date().toISOString(),
  };
}
