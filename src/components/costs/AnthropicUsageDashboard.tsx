'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, AlertCircle, Key, TrendingUp, Cpu, Layers, DollarSign } from 'lucide-react';
import type { AnthropicUsageSummary, ModelBreakdown, DailyCostEntry } from '@/lib/costs/anthropic-usage';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtUsd(usd: number): string {
  if (usd >= 1000) return `$${(usd / 1000).toFixed(2)}K`;
  if (usd >= 1) return `$${usd.toFixed(2)}`;
  return `$${usd.toFixed(4)}`;
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString();
}

function fmtModel(model: string): string {
  // e.g. "claude-sonnet-4-6" → "Claude Sonnet 4.6"
  return model
    .replace(/^claude-/, 'Claude ')
    .replace(/-(\d+)-(\d+)$/, ' $1.$2')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const PERIOD_OPTIONS = [
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
];

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-4 h-4 ${accent || 'text-mc-text-secondary'}`} />
        <span className="text-xs text-mc-text-secondary uppercase tracking-wide">{label}</span>
      </div>
      <div className={`text-2xl font-bold ${accent || 'text-mc-text'}`}>{value}</div>
      {sub && <div className="text-xs text-mc-text-secondary mt-1">{sub}</div>}
    </div>
  );
}

function ModelTable({ models }: { models: ModelBreakdown[] }) {
  if (models.length === 0) return <p className="text-mc-text-secondary text-sm">No model data yet.</p>;

  const maxCost = Math.max(...models.map(m => m.costUsd), 0.0001);

  return (
    <div className="space-y-2">
      {models.map(m => (
        <div key={m.model} className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-mc-text truncate max-w-[55%]">{fmtModel(m.model)}</span>
            <div className="flex items-center gap-4 text-mc-text-secondary text-xs shrink-0">
              <span title="Input tokens">{fmtTokens(m.inputTokens)} in</span>
              <span title="Output tokens">{fmtTokens(m.outputTokens)} out</span>
              {m.cachedTokens > 0 && (
                <span title="Cached tokens" className="text-mc-accent-cyan">{fmtTokens(m.cachedTokens)} cached</span>
              )}
              <span className="font-semibold text-mc-text w-16 text-right">{fmtUsd(m.costUsd)}</span>
            </div>
          </div>
          <div className="h-1.5 bg-mc-bg-tertiary rounded-full overflow-hidden">
            <div
              className="h-full bg-mc-accent-cyan rounded-full transition-all"
              style={{ width: `${(m.costUsd / maxCost) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function DailyCostChart({ days }: { days: DailyCostEntry[] }) {
  if (days.length === 0) return <p className="text-mc-text-secondary text-sm">No cost data yet.</p>;

  const maxCost = Math.max(...days.map(d => d.costUsd), 0.0001);

  return (
    <div className="flex items-end gap-1 h-24">
      {days.map(d => {
        const pct = (d.costUsd / maxCost) * 100;
        return (
          <div key={d.date} className="flex-1 flex flex-col items-center gap-1 group relative" title={`${fmtDate(d.date)}: ${fmtUsd(d.costUsd)}`}>
            {/* Tooltip */}
            <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:block z-10 pointer-events-none">
              <div className="bg-mc-bg-tertiary border border-mc-border rounded px-2 py-1 text-xs whitespace-nowrap">
                <span className="text-mc-text-secondary">{fmtDate(d.date)}</span>
                <br />
                <span className="font-semibold text-mc-accent-cyan">{fmtUsd(d.costUsd)}</span>
              </div>
            </div>
            <div
              className="w-full bg-mc-accent-cyan/70 hover:bg-mc-accent-cyan rounded-sm transition-all"
              style={{ height: `${Math.max(pct, 2)}%` }}
            />
          </div>
        );
      })}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function AnthropicUsageDashboard() {
  const [days, setDays] = useState(30);
  const [summary, setSummary] = useState<AnthropicUsageSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ code?: string; message: string } | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);

  const load = useCallback(async (d: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/costs/anthropic?days=${d}`);
      const data = await res.json();
      if (!res.ok) {
        setError({ code: data.code, message: data.error || 'Failed to load usage data' });
        setSummary(null);
      } else {
        setSummary(data as AnthropicUsageSummary);
      }
    } catch {
      setError({ message: 'Network error — could not reach server' });
    } finally {
      setLoading(false);
    }
  }, []);

  // Check key configuration on mount
  useEffect(() => {
    fetch('/api/costs/anthropic?check=1')
      .then(r => r.json())
      .then(d => setConfigured(Boolean(d.configured)))
      .catch(() => setConfigured(false));
  }, []);

  useEffect(() => {
    load(days);
  }, [days, load]);

  const cacheRate = summary
    ? summary.totalCachedTokens /
      Math.max(summary.totalInputTokens + summary.totalCachedTokens, 1)
    : 0;

  // ── Not configured ────────────────────────────────────────────────────────

  if (configured === false || (error?.code === 'no_key')) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
        <div className="w-12 h-12 rounded-full bg-mc-bg-secondary border border-mc-border flex items-center justify-center">
          <Key className="w-6 h-6 text-mc-text-secondary" />
        </div>
        <div>
          <h3 className="font-semibold text-mc-text mb-1">Admin API Key Required</h3>
          <p className="text-mc-text-secondary text-sm max-w-sm">
            To view Anthropic usage and cost data, add your Admin API key to{' '}
            <code className="text-mc-accent-cyan bg-mc-bg-tertiary px-1 rounded">.env.local</code>:
          </p>
        </div>
        <div className="bg-mc-bg-secondary border border-mc-border rounded-lg px-5 py-3 font-mono text-sm text-mc-accent-cyan select-all">
          ANTHROPIC_ADMIN_API_KEY=sk-ant-admin...
        </div>
        <p className="text-xs text-mc-text-secondary max-w-xs">
          Admin keys can be created in the{' '}
          <a
            href="https://console.anthropic.com/settings/admin-keys"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-mc-accent transition-colors"
          >
            Anthropic Console → Admin Keys
          </a>
          . They require the <strong>Organization Admin</strong> role.
        </p>
        <p className="text-xs text-mc-text-secondary">Restart Mission Control after adding the key.</p>
      </div>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────────

  if (error && error.code !== 'no_key') {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <AlertCircle className="w-8 h-8 text-mc-accent-red" />
        <p className="font-medium text-mc-text">{error.message}</p>
        {error.code === 'unauthorized' && (
          <p className="text-sm text-mc-text-secondary max-w-sm">
            Your Admin API key may be incorrect or may not have usage reporting permissions.
            Check the key in the Anthropic Console.
          </p>
        )}
        <button
          onClick={() => load(days)}
          className="mt-2 px-4 py-2 bg-mc-bg-secondary border border-mc-border rounded text-sm hover:bg-mc-bg-tertiary transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  // ── No data ────────────────────────────────────────────────────────────────

  const hasData = summary && (summary.totalInputTokens > 0 || summary.totalOutputTokens > 0 || summary.totalCostUsd > 0);

  if (!loading && summary && !hasData) {
    return (
      <div className="space-y-4">
        {/* Period tabs + refresh still visible */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-1 bg-mc-bg-secondary border border-mc-border rounded-lg p-1">
            {PERIOD_OPTIONS.map(opt => (
              <button
                key={opt.days}
                onClick={() => setDays(opt.days)}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  days === opt.days
                    ? 'bg-mc-accent-cyan text-mc-bg'
                    : 'text-mc-text-secondary hover:text-mc-text hover:bg-mc-bg-tertiary'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => load(days)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-mc-bg-secondary border border-mc-border rounded text-sm hover:bg-mc-bg-tertiary transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
        <div className="flex flex-col items-center gap-3 py-10 text-center border border-mc-border rounded-lg bg-mc-bg">
          <TrendingUp className="w-8 h-8 text-mc-text-secondary opacity-40" />
          <p className="font-medium text-mc-text">No API usage recorded for this period</p>
          <p className="text-sm text-mc-text-secondary max-w-sm">
            This dashboard tracks direct Anthropic API calls made with your{' '}
            <code className="text-mc-accent-cyan bg-mc-bg-tertiary px-1 rounded">sk-ant-api03-...</code> keys.
            Usage from Claude Code and claude.ai is billed separately and does not appear here.
          </p>
        </div>
      </div>
    );
  }

  // ── Dashboard ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        {/* Period tabs */}
        <div className="flex items-center gap-1 bg-mc-bg-secondary border border-mc-border rounded-lg p-1">
          {PERIOD_OPTIONS.map(opt => (
            <button
              key={opt.days}
              onClick={() => setDays(opt.days)}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                days === opt.days
                  ? 'bg-mc-accent-cyan text-mc-bg'
                  : 'text-mc-text-secondary hover:text-mc-text hover:bg-mc-bg-tertiary'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          {summary && (
            <span className="text-xs text-mc-text-secondary">
              Updated {new Date(summary.fetchedAt).toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={() => load(days)}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-mc-bg-secondary border border-mc-border rounded text-sm hover:bg-mc-bg-tertiary transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Summary cards */}
      {loading && !summary ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4 animate-pulse h-24" />
          ))}
        </div>
      ) : summary ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={DollarSign}
            label="Total Cost"
            value={fmtUsd(summary.totalCostUsd)}
            sub={`Last ${days} days`}
            accent="text-mc-accent-cyan"
          />
          <StatCard
            icon={Cpu}
            label="Input Tokens"
            value={fmtTokens(summary.totalInputTokens)}
            sub={`+${fmtTokens(summary.totalCacheCreationTokens)} cache writes`}
            accent="text-mc-accent-purple"
          />
          <StatCard
            icon={TrendingUp}
            label="Output Tokens"
            value={fmtTokens(summary.totalOutputTokens)}
            accent="text-mc-accent"
          />
          <StatCard
            icon={Layers}
            label="Cache Hit Rate"
            value={`${(cacheRate * 100).toFixed(1)}%`}
            sub={`${fmtTokens(summary.totalCachedTokens)} saved`}
            accent={cacheRate > 0.3 ? 'text-mc-accent-green' : 'text-mc-text-secondary'}
          />
        </div>
      ) : null}

      {/* Daily cost chart */}
      {summary && summary.dailyCosts.length > 0 && (
        <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-5">
          <h3 className="text-sm font-semibold text-mc-text mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-mc-accent-cyan" />
            Daily Cost
          </h3>
          <DailyCostChart days={summary.dailyCosts} />
          <div className="flex justify-between text-xs text-mc-text-secondary mt-2">
            <span>{fmtDate(summary.dailyCosts[0]?.date)}</span>
            <span>{fmtDate(summary.dailyCosts[summary.dailyCosts.length - 1]?.date)}</span>
          </div>
        </div>
      )}

      {/* Usage by model */}
      <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-5">
        <h3 className="text-sm font-semibold text-mc-text mb-4 flex items-center gap-2">
          <Cpu className="w-4 h-4 text-mc-accent-purple" />
          Usage by Model
        </h3>
        {loading && !summary ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-8 bg-mc-bg-tertiary rounded animate-pulse" />
            ))}
          </div>
        ) : (
          <ModelTable models={summary?.byModel ?? []} />
        )}
      </div>

      {/* Footer note */}
      <p className="text-xs text-mc-text-secondary text-center">
        Data from{' '}
        <a
          href="https://platform.claude.com/docs/en/build-with-claude/usage-cost-api"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-mc-accent"
        >
          Anthropic Usage & Cost API
        </a>
        . Costs appear within ~5 minutes of API calls. Cost allocation by model is estimated
        from token proportions when separate cost-per-model data is unavailable.
      </p>
    </div>
  );
}
