/**
 * anthropic-usage.ts — Client for the Anthropic Usage & Cost API.
 *
 * Requires an Admin API Key (sk-ant-admin...) set in ANTHROPIC_ADMIN_API_KEY.
 *
 * Real API response structure (both endpoints):
 *   { data: [ { starting_at, ending_at, results: [...] } ], has_more, next_page }
 *
 * Cost is returned as decimal string in cents (e.g. "1234" = $12.34).
 * Cost API only supports daily (1d) granularity — max 31 buckets per request.
 * Usage API supports 1m, 1h, 1d granularity — max 31 buckets/request for 1d.
 */

const ANTHROPIC_API_BASE = 'https://api.anthropic.com';
const ANTHROPIC_VERSION = '2023-06-01';
const MAX_PAGES = 50;

// ── Types ─────────────────────────────────────────────────────────────────────

/** A single model's usage within a time bucket */
interface UsageResult {
  model?: string;
  workspace_id?: string | null;
  api_key_id?: string | null;
  service_tier?: string;
  usage: {
    uncached_input_tokens: number;
    cached_input_tokens: number;
    cache_creation_input_tokens: number;
    output_tokens: number;
  };
}

/** A single cost entry within a time bucket */
interface CostResult {
  cost: string; // cents as decimal string
  workspace_id?: string | null;
  description?: string;
  model?: string;
}

/** A time bucket as returned by both APIs */
interface TimeBucket<T> {
  starting_at: string;
  ending_at: string;
  results: T[];
}

interface UsageApiResponse {
  data: TimeBucket<UsageResult>[];
  has_more: boolean;
  next_page?: string | null;
}

interface CostApiResponse {
  data: TimeBucket<CostResult>[];
  has_more: boolean;
  next_page?: string | null;
}

export interface AnthropicUsageSummary {
  period: { start: string; end: string };
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCachedTokens: number;
  totalCacheCreationTokens: number;
  totalCostUsd: number;
  byModel: ModelBreakdown[];
  dailyCosts: DailyCostEntry[];
  fetchedAt: string;
}

export interface ModelBreakdown {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  cacheCreationTokens: number;
  costUsd: number;
}

export interface DailyCostEntry {
  date: string; // YYYY-MM-DD
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
}

export type AnthropicFetchError =
  | { type: 'no_key' }
  | { type: 'unauthorized'; message: string }
  | { type: 'api_error'; status: number; message: string }
  | { type: 'network_error'; message: string };

// ── API helpers ───────────────────────────────────────────────────────────────

function getAdminKey(): string | null {
  return process.env.ANTHROPIC_ADMIN_API_KEY || null;
}

export function hasAdminKey(): boolean {
  return Boolean(getAdminKey());
}

async function anthropicGet<T>(
  path: string,
  params: Record<string, string | string[]>
): Promise<T> {
  const key = getAdminKey();
  if (!key) throw { type: 'no_key' } as AnthropicFetchError;

  const url = new URL(`${ANTHROPIC_API_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) {
      v.forEach(val => url.searchParams.append(k, val));
    } else if (v !== undefined && v !== '') {
      url.searchParams.set(k, v);
    }
  }

  const res = await fetch(url.toString(), {
    headers: {
      'x-api-key': key,
      'anthropic-version': ANTHROPIC_VERSION,
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    if (res.status === 401) throw { type: 'unauthorized', message: body } as AnthropicFetchError;
    throw { type: 'api_error', status: res.status, message: body } as AnthropicFetchError;
  }

  return res.json() as Promise<T>;
}

// ── Usage API ─────────────────────────────────────────────────────────────────

async function fetchUsageBuckets(options: {
  startingAt: string;
  endingAt: string;
  bucketWidth?: '1m' | '1h' | '1d';
  groupBy?: string[];
}): Promise<TimeBucket<UsageResult>[]> {
  const { startingAt, endingAt, bucketWidth = '1d', groupBy = ['model'] } = options;
  const all: TimeBucket<UsageResult>[] = [];
  let page: string | undefined;
  const limit = bucketWidth === '1d' ? '31' : '100';

  for (let i = 0; i < MAX_PAGES; i++) {
    const params: Record<string, string | string[]> = {
      starting_at: startingAt,
      ending_at: endingAt,
      bucket_width: bucketWidth,
      'group_by[]': groupBy,
      limit,
    };
    if (page) params.page = page;

    const res = await anthropicGet<UsageApiResponse>(
      '/v1/organizations/usage_report/messages',
      params
    );

    all.push(...res.data);
    if (!res.has_more || !res.next_page) break;
    page = res.next_page;
  }

  return all;
}

// ── Cost API ──────────────────────────────────────────────────────────────────

async function fetchCostBuckets(options: {
  startingAt: string;
  endingAt: string;
}): Promise<TimeBucket<CostResult>[]> {
  const { startingAt, endingAt } = options;
  const all: TimeBucket<CostResult>[] = [];
  let page: string | undefined;

  for (let i = 0; i < MAX_PAGES; i++) {
    const params: Record<string, string | string[]> = {
      starting_at: startingAt,
      ending_at: endingAt,
      limit: '31', // cost API is always daily; max 31 per request
    };
    if (page) params.page = page;

    const res = await anthropicGet<CostApiResponse>('/v1/organizations/cost_report', params);

    all.push(...res.data);
    if (!res.has_more || !res.next_page) break;
    page = res.next_page;
  }

  return all;
}

// ── Summary builder ───────────────────────────────────────────────────────────

export async function fetchUsageSummary(options: {
  startingAt: string;
  endingAt: string;
}): Promise<AnthropicUsageSummary> {
  const { startingAt, endingAt } = options;

  const [usageBuckets, costBuckets] = await Promise.all([
    fetchUsageBuckets({ startingAt, endingAt, bucketWidth: '1d', groupBy: ['model'] }),
    fetchCostBuckets({ startingAt, endingAt }).catch(() => [] as TimeBucket<CostResult>[]),
  ]);

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCachedTokens = 0;
  let totalCacheCreationTokens = 0;

  const modelMap = new Map<string, ModelBreakdown>();
  const dailyUsageMap = new Map<string, { inputTokens: number; outputTokens: number }>();

  for (const bucket of usageBuckets) {
    const date = bucket.starting_at.slice(0, 10);
    const dayUsage = dailyUsageMap.get(date) ?? { inputTokens: 0, outputTokens: 0 };

    for (const result of bucket.results) {
      if (!result.usage) continue;
      const u = result.usage;
      totalInputTokens += u.uncached_input_tokens;
      totalOutputTokens += u.output_tokens;
      totalCachedTokens += u.cached_input_tokens;
      totalCacheCreationTokens += u.cache_creation_input_tokens;
      dayUsage.inputTokens += u.uncached_input_tokens;
      dayUsage.outputTokens += u.output_tokens;

      const modelKey = result.model || 'unknown';
      const existing = modelMap.get(modelKey) ?? {
        model: modelKey,
        inputTokens: 0,
        outputTokens: 0,
        cachedTokens: 0,
        cacheCreationTokens: 0,
        costUsd: 0,
      };
      existing.inputTokens += u.uncached_input_tokens;
      existing.outputTokens += u.output_tokens;
      existing.cachedTokens += u.cached_input_tokens;
      existing.cacheCreationTokens += u.cache_creation_input_tokens;
      modelMap.set(modelKey, existing);
    }

    dailyUsageMap.set(date, dayUsage);
  }

  // Build daily cost series
  const dailyMap = new Map<string, DailyCostEntry>();
  let totalCostCents = 0;

  for (const bucket of costBuckets) {
    const date = bucket.starting_at.slice(0, 10);
    const existing = dailyMap.get(date) ?? { date, costUsd: 0, inputTokens: 0, outputTokens: 0 };

    for (const result of bucket.results) {
      const costCents = parseFloat(result.cost) || 0;
      totalCostCents += costCents;
      existing.costUsd += costCents / 100;
    }

    dailyMap.set(date, existing);
  }

  // Merge usage token counts into daily cost entries
  dailyUsageMap.forEach((usage, date) => {
    const existing = dailyMap.get(date) ?? { date, costUsd: 0, inputTokens: 0, outputTokens: 0 };
    existing.inputTokens += usage.inputTokens;
    existing.outputTokens += usage.outputTokens;
    dailyMap.set(date, existing);
  });

  const dailyCosts: DailyCostEntry[] = [];
  dailyMap.forEach(d => dailyCosts.push(d));
  dailyCosts.sort((a, b) => a.date.localeCompare(b.date));

  const totalCostUsd = totalCostCents / 100;
  const totalTokensForProration = totalInputTokens + totalOutputTokens;

  if (totalTokensForProration > 0) {
    modelMap.forEach(m => {
      const share = (m.inputTokens + m.outputTokens) / totalTokensForProration;
      m.costUsd = totalCostUsd * share;
    });
  }

  const byModel: ModelBreakdown[] = [];
  modelMap.forEach(m => byModel.push(m));
  byModel.sort((a, b) => b.costUsd - a.costUsd);

  return {
    period: { start: startingAt, end: endingAt },
    totalInputTokens,
    totalOutputTokens,
    totalCachedTokens,
    totalCacheCreationTokens,
    totalCostUsd,
    byModel,
    dailyCosts,
    fetchedAt: new Date().toISOString(),
  };
}

// ── Utilities ──────────────────────────────────────────────────────────────────

export function periodForDays(days: number): { startingAt: string; endingAt: string } {
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  return {
    startingAt: start.toISOString(),
    endingAt: end.toISOString(),
  };
}
