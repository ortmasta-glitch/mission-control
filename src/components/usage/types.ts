/**
 * Usage ledger types — shared between client components and API routes.
 *
 * Adapted from openclaw-mission-control/src/lib/usage-types.ts
 * for the Mission Control implementation.
 */

export type UsageWindow = "last1h" | "last24h" | "last7d" | "allTime";

export type UsageApiBucket = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  sessions: number;
};

export type ProviderBillingFreshness = "fresh" | "stale" | "unknown";
export type ProviderBillingMode = "invoice_api" | "estimate_only";

export type ProviderBillingRow = {
  accountScope: string;
  fullModel: string | null;
  bucketStartMs: number;
  bucketEndMs: number;
  spendUsd: number | null;
  requests: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  isFinal: boolean;
};

export type ProviderBillingProviderSnapshot = {
  provider: string;
  available: boolean;
  reason?: string;
  requiredCredential?: string;
  billingMode: ProviderBillingMode;
  docsUrl?: string;
  setupHint?: string;
  freshness: ProviderBillingFreshness;
  bucketGranularity: "day" | null;
  latestBucketStartMs: number | null;
  totalUsd30d: number | null;
  currentMonthUsd: number | null;
  rows: ProviderBillingRow[];
};

export type UsageApiResponse = {
  ok: true;
  asOfMs: number;
  liveTelemetry: {
    totals: {
      sessions: number;
      agents: number;
      models: number;
      inputTokens: number;
      outputTokens: number;
      reasoningTokens: number;
      cacheReadTokens: number;
      cacheWriteTokens: number;
      totalTokens: number;
    };
    windows: Record<UsageWindow, UsageApiBucket>;
    byModel: Array<{
      fullModel: string;
      provider: string;
      sessions: number;
      totalTokens: number;
      inputTokens: number;
      outputTokens: number;
      estimatedCostUsd: number | null;
    }>;
    byAgent: Array<{
      agentId: string;
      sessions: number;
      totalTokens: number;
      estimatedCostUsd: number | null;
    }>;
    sourceLabel: "Local telemetry";
  };
  estimatedSpend: {
    totalUsd: number | null;
    windows: Record<UsageWindow, { usd: number | null; coveragePct: number }>;
    byModel: Array<{
      fullModel: string;
      usd: number | null;
      coveragePct: number;
    }>;
    sourceLabel: "Estimated from local telemetry and pricing";
  };
  providerBilling: {
    providers: ProviderBillingProviderSnapshot[];
    configuredProviders: string[];
  };
  coverage: {
    estimatedPricingCoveragePct: number;
    invoiceGradeProviders: string[];
    estimateOnlyProviders: string[];
  };
  diagnostics: {
    warnings: string[];
    sourceErrors: Array<{ source: string; error: string }>;
  };
};