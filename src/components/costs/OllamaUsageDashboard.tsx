'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, AlertCircle, Key, Zap, Cpu, Activity, Database, Server } from 'lucide-react';
import type {
  OllamaUsageSummary,
  OllamaModelBreakdown,
  OllamaRunningModel,
  OllamaAvailableModel,
  OllamaUsageRecord,
} from '@/lib/costs/ollama-usage';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTokens(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString();
}

function fmtSpeed(tps: number): string {
  if (tps === 0) return '—';
  return `${tps.toFixed(1)} tok/s`;
}

function fmtBytes(bytes: number): string {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(0)} MB`;
  return `${bytes} B`;
}

function fmtModel(model: string): string {
  return model.replace(/:latest$/, '');
}

function fmtRelTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

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
    <div className="bg-mc-bg border border-mc-border rounded-lg p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-4 h-4 ${accent ?? 'text-mc-text-secondary'}`} />
        <span className="text-xs text-mc-text-secondary uppercase tracking-wide">{label}</span>
      </div>
      <div className={`text-2xl font-bold ${accent ?? 'text-mc-text'}`}>{value}</div>
      {sub && <div className="text-xs text-mc-text-secondary mt-1">{sub}</div>}
    </div>
  );
}

function ModelBreakdownTable({ models }: { models: OllamaModelBreakdown[] }) {
  if (models.length === 0) {
    return <p className="text-mc-text-secondary text-sm">No usage recorded yet. Records appear after agent calls are logged.</p>;
  }
  const maxOut = Math.max(...models.map(m => m.outputTokens), 1);

  return (
    <div className="space-y-3">
      {models.map(m => (
        <div key={m.model} className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-mc-text truncate max-w-[45%]">{fmtModel(m.model)}</span>
            <div className="flex items-center gap-3 text-mc-text-secondary text-xs shrink-0">
              <span title="Input tokens">{fmtTokens(m.inputTokens)} in</span>
              <span title="Output tokens">{fmtTokens(m.outputTokens)} out</span>
              <span title="Avg speed" className="text-mc-accent-green">{fmtSpeed(m.avgTokensPerSec)}</span>
              <span className="text-mc-text-secondary">{m.requests} req</span>
            </div>
          </div>
          <div className="h-1.5 bg-mc-bg-tertiary rounded-full overflow-hidden">
            <div
              className="h-full bg-mc-accent-green rounded-full transition-all"
              style={{ width: `${(m.outputTokens / maxOut) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function RunningModelsList({ models }: { models: OllamaRunningModel[] }) {
  if (models.length === 0) {
    return <p className="text-mc-text-secondary text-sm">No models currently loaded in memory.</p>;
  }
  return (
    <div className="space-y-2">
      {models.map(m => (
        <div key={m.name} className="flex items-center justify-between rounded-lg border border-mc-accent-green/30 bg-mc-accent-green/5 px-3 py-2.5">
          <div className="min-w-0">
            <div className="font-medium text-sm text-mc-text truncate">{fmtModel(m.name)}</div>
            <div className="text-xs text-mc-text-secondary">
              {m.family} · {m.parameterSize} · {m.quantization}
            </div>
          </div>
          <div className="text-right shrink-0 ml-3">
            <div className="text-xs font-medium text-mc-accent-green">LOADED</div>
            <div className="text-[11px] text-mc-text-secondary">{fmtBytes(m.sizeVram || m.sizeBytes)} VRAM</div>
            {m.expiresAt && (
              <div className="text-[11px] text-mc-text-secondary">
                expires {fmtRelTime(m.expiresAt)}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function AvailableModelsList({ models }: { models: OllamaAvailableModel[] }) {
  if (models.length === 0) return null;
  return (
    <div className="space-y-1">
      {models.map(m => (
        <div key={m.name} className="flex items-center justify-between text-sm py-1.5 border-b border-mc-border last:border-0">
          <span className="font-medium text-mc-text truncate max-w-[55%]">{fmtModel(m.name)}</span>
          <div className="flex items-center gap-3 text-mc-text-secondary text-xs shrink-0">
            <span>{m.parameterSize}</span>
            <span>{m.quantization}</span>
            <span>{fmtBytes(m.sizeBytes)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function RecentSessionsList({ sessions }: { sessions: OllamaUsageRecord[] }) {
  if (sessions.length === 0) {
    return (
      <p className="text-mc-text-secondary text-sm">
        No sessions recorded yet. Sessions are logged via POST to{' '}
        <code className="text-mc-accent-green bg-mc-bg-tertiary px-1 rounded">/api/costs/ollama</code>.
      </p>
    );
  }
  return (
    <div className="space-y-1 max-h-52 overflow-y-auto">
      {sessions.map((s, i) => {
        const durationSec = s.evalDurationNs / 1e9;
        const tps = durationSec > 0 ? s.outputTokens / durationSec : 0;
        return (
          <div key={i} className="flex items-center justify-between text-xs py-1.5 border-b border-mc-border last:border-0">
            <div className="flex items-center gap-2 min-w-0">
              {s.agentId && (
                <span className="px-1.5 py-0.5 rounded bg-mc-bg-tertiary text-mc-text-secondary shrink-0">
                  {s.agentId}
                </span>
              )}
              <span className="text-mc-text truncate">{fmtModel(s.model)}</span>
            </div>
            <div className="flex items-center gap-3 text-mc-text-secondary shrink-0 ml-2">
              <span>{fmtTokens(s.inputTokens)} in</span>
              <span>{fmtTokens(s.outputTokens)} out</span>
              {tps > 0 && <span className="text-mc-accent-green">{tps.toFixed(1)} t/s</span>}
              <span>{fmtRelTime(s.timestamp)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function OllamaUsageDashboard() {
  const [summary, setSummary] = useState<OllamaUsageSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ code?: string; message: string } | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [activeTab, setActiveTab] = useState<'usage' | 'models' | 'recent'>('usage');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/costs/ollama');
      const data = await res.json();
      if (!res.ok) {
        setError({ code: data.code, message: data.error || 'Failed to load Ollama data' });
        setSummary(null);
      } else {
        setSummary(data as OllamaUsageSummary);
      }
    } catch {
      setError({ message: 'Network error — could not reach server' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch('/api/costs/ollama?check=1')
      .then(r => r.json())
      .then(d => setConfigured(Boolean(d.configured)))
      .catch(() => setConfigured(false));
  }, []);

  useEffect(() => {
    load();
    // Auto-refresh running models every 30s
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, [load]);

  // ── No API key ─────────────────────────────────────────────────────────────

  if (configured === false || error?.code === 'no_key') {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
        <div className="w-12 h-12 rounded-full bg-mc-bg border border-mc-border flex items-center justify-center">
          <Key className="w-6 h-6 text-mc-text-secondary" />
        </div>
        <div>
          <h3 className="font-semibold text-mc-text mb-1">Ollama API Key Required</h3>
          <p className="text-mc-text-secondary text-sm max-w-sm">
            Add your Ollama Cloud API key to{' '}
            <code className="text-mc-accent-green bg-mc-bg-tertiary px-1 rounded">.env</code>:
          </p>
        </div>
        <div className="bg-mc-bg border border-mc-border rounded-lg px-5 py-3 font-mono text-sm text-mc-accent-green select-all">
          OLLAMA_API_KEY=your_key_here
        </div>
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
        <button
          onClick={load}
          className="mt-2 px-4 py-2 bg-mc-bg-secondary border border-mc-border rounded text-sm hover:bg-mc-bg-tertiary transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  // ── Dashboard ──────────────────────────────────────────────────────────────

  const runningCount = summary?.runningModels.length ?? 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          {runningCount > 0 && (
            <span className="text-xs px-2 py-1 rounded border border-mc-accent-green/40 bg-mc-accent-green/10 text-mc-accent-green">
              {runningCount} model{runningCount !== 1 ? 's' : ''} loaded
            </span>
          )}
          {summary && (
            <span className="text-xs text-mc-text-secondary">
              Updated {new Date(summary.fetchedAt).toLocaleTimeString()}
            </span>
          )}
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-mc-bg border border-mc-border rounded text-sm hover:bg-mc-bg-tertiary transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Stat cards */}
      {loading && !summary ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-mc-bg border border-mc-border rounded-lg p-4 animate-pulse h-24" />
          ))}
        </div>
      ) : summary ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={Cpu}
            label="Input Tokens"
            value={fmtTokens(summary.totalInputTokens)}
            sub="cumulative"
            accent="text-mc-accent-purple"
          />
          <StatCard
            icon={Activity}
            label="Output Tokens"
            value={fmtTokens(summary.totalOutputTokens)}
            sub="cumulative"
            accent="text-mc-accent"
          />
          <StatCard
            icon={Zap}
            label="Avg Speed"
            value={fmtSpeed(summary.avgTokensPerSec)}
            sub="tokens / second"
            accent="text-mc-accent-green"
          />
          <StatCard
            icon={Database}
            label="Requests"
            value={summary.totalRequests.toLocaleString()}
            sub="total logged"
            accent="text-mc-text"
          />
        </div>
      ) : null}

      {/* Tab nav */}
      <div className="flex items-center gap-1 bg-mc-bg border border-mc-border rounded-lg p-1 w-fit">
        {([
          { key: 'usage', label: 'By Model' },
          { key: 'models', label: `Models (${summary?.availableModels.length ?? 0})` },
          { key: 'recent', label: 'Recent Sessions' },
        ] as const).map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'bg-mc-accent-green text-mc-bg'
                : 'text-mc-text-secondary hover:text-mc-text hover:bg-mc-bg-tertiary'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Running models (always visible) */}
      {summary && summary.runningModels.length > 0 && (
        <div className="bg-mc-bg border border-mc-border rounded-lg p-4">
          <h3 className="text-sm font-semibold text-mc-text mb-3 flex items-center gap-2">
            <Server className="w-4 h-4 text-mc-accent-green" />
            Running Now
          </h3>
          <RunningModelsList models={summary.runningModels} />
        </div>
      )}

      {/* Tab content */}
      {summary && (
        <div className="bg-mc-bg border border-mc-border rounded-lg p-4">
          {activeTab === 'usage' && (
            <>
              <h3 className="text-sm font-semibold text-mc-text mb-4 flex items-center gap-2">
                <Cpu className="w-4 h-4 text-mc-accent-purple" />
                Token Usage by Model
              </h3>
              <ModelBreakdownTable models={summary.byModel} />
            </>
          )}
          {activeTab === 'models' && (
            <>
              <h3 className="text-sm font-semibold text-mc-text mb-4 flex items-center gap-2">
                <Server className="w-4 h-4 text-mc-accent" />
                Available Models
              </h3>
              <AvailableModelsList models={summary.availableModels} />
            </>
          )}
          {activeTab === 'recent' && (
            <>
              <h3 className="text-sm font-semibold text-mc-text mb-4 flex items-center gap-2">
                <Activity className="w-4 h-4 text-mc-accent" />
                Recent Sessions
              </h3>
              <RecentSessionsList sessions={summary.recentSessions} />
            </>
          )}
        </div>
      )}

      {/* Footer */}
      <p className="text-xs text-mc-text-secondary text-center">
        Live model data from{' '}
        <span className="text-mc-accent-green">Ollama Cloud</span>
        {' '}· Token metrics tracked via{' '}
        <code className="bg-mc-bg-tertiary px-1 rounded">POST /api/costs/ollama</code>
        {' '}using{' '}
        <code className="bg-mc-bg-tertiary px-1 rounded">prompt_eval_count</code>
        {' '}·{' '}
        <code className="bg-mc-bg-tertiary px-1 rounded">eval_count</code>
        {' '}·{' '}
        <code className="bg-mc-bg-tertiary px-1 rounded">eval_duration</code>
      </p>
    </div>
  );
}
