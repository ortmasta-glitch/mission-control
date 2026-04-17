'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { ChevronLeft, TrendingUp, TrendingDown, DollarSign, RefreshCw, Loader2, BarChart2, AlertTriangle, Filter, Info, FileText, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import * as echarts from 'echarts/core';
import { BarChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { formatDistanceToNow, formatISO, parseISO } from 'date-fns';

echarts.use([BarChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer]);

interface MonthlySummary {
  month: string;
  revenue: number;
  costs: number;
  net: number;
  margin_pct: number;
  delta_absolute: number;
  delta_pct: number;
}

interface FinancialData {
  monthly: MonthlySummary[];
  projections: MonthlySummary[];
  projectionConfidence: 'none' | 'low' | 'normal';
  mtd: MonthlySummary | null;
  prevMonth: MonthlySummary | null;
  clinics: { clinic: string; revenue: number; costs: number; margin_pct: number }[];
  lastImport: string | null;
  lastParseTimestamp: string | null;
  lastParserVersion: string | null;
  lastImportMode: string | null;
  sourceFiles: { source_file: string; source_document_id: string | null; imported_at: string; parse_timestamp: string | null; parser_version: string | null; import_mode: string | null; rows_count: number }[];
  parseResults: { source_document_id: string; parse_timestamp: string; parser_version: string; import_mode: string; rows_imported: number }[];
  totalEntries: number;
  mtdTimestamp: string | null;
  priorMonthTimestamp: string | null;
}

function formatPLN(n: number): string {
  return n.toLocaleString('pl-PL', { style: 'currency', currency: 'PLN', maximumFractionDigits: 0 });
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return '—';
  try {
    const d = parseISO(iso);
    return formatISO(d, { representation: 'complete' }).replace('T', ' ').slice(0, 19);
  } catch {
    return iso;
  }
}

function deltaDisplay(current: number, prev: number): { pct: string; absolute: string; up: boolean } {
  if (!prev) return { pct: '—', absolute: '—', up: true };
  const d = ((current - prev) / Math.abs(prev)) * 100;
  const abs = current - prev;
  return { 
    pct: `${d > 0 ? '+' : ''}${d.toFixed(1)}%`, 
    absolute: `${abs >= 0 ? '+' : ''}${formatPLN(abs)}`,
    up: d >= 0 
  };
}

function RevenueChart({ monthly, projections }: { monthly: MonthlySummary[]; projections: MonthlySummary[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const inst = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    if (!inst.current) {
      inst.current = echarts.init(ref.current, undefined, { renderer: 'canvas' });
    }
    const chart = inst.current;

    const allMonths = [
      ...monthly.map(m => ({ ...m, projected: false })),
      ...projections.map(m => ({ ...m, projected: true })),
    ];

    chart.setOption({
      animation: true,
      grid: { top: 40, right: 20, bottom: 50, left: 70 },
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#161b22',
        borderColor: '#30363d',
        textStyle: { color: '#c9d1d9', fontSize: 12 },
        formatter: (params: unknown) => {
          const p = params as { name: string; seriesName: string; value: number }[];
          return `<b>${p[0].name}</b><br/>${p.map(x => `${x.seriesName}: <b>${formatPLN(x.value)}</b>`).join('<br/>')}`;
        },
      },
      legend: { top: 8, textStyle: { color: '#8b949e', fontSize: 11 }, data: ['Revenue', 'Costs'] },
      xAxis: {
        type: 'category',
        data: allMonths.map(m => m.month + (m.projected ? ' ▸' : '')),
        axisLine: { lineStyle: { color: '#30363d' } },
        axisLabel: { color: '#8b949e', fontSize: 10, rotate: 30 },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value',
        axisLine: { lineStyle: { color: '#30363d' } },
        axisLabel: { color: '#8b949e', fontSize: 10, formatter: (v: number) => `${(v / 1000).toFixed(0)}k` },
        splitLine: { lineStyle: { color: '#21262d' } },
      },
      series: [
        {
          name: 'Revenue',
          type: 'bar',
          data: allMonths.map(m => m.revenue),
          itemStyle: { color: (p: { dataIndex: number }) => allMonths[p.dataIndex].projected ? '#58a6ff55' : '#58a6ff' },
        },
        {
          name: 'Costs',
          type: 'bar',
          data: allMonths.map(m => m.costs),
          itemStyle: { color: (p: { dataIndex: number }) => allMonths[p.dataIndex].projected ? '#f8514955' : '#f85149' },
        },
      ],
    });

    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [monthly, projections]);

  useEffect(() => () => { inst.current?.dispose(); inst.current = null; }, []);

  return <div ref={ref} style={{ width: '100%', height: '280px' }} />;
}

export default function FinancialPage() {
  const [data, setData] = useState<FinancialData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clinicFilter, setClinicFilter] = useState<string>('all');
  const [showImportSummary, setShowImportSummary] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/financial');
      if (!res.ok) throw new Error('Failed to load');
      setData(await res.json());
    } catch {
      setError('Failed to load financial data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const isEmpty = !data?.totalEntries;
  const isLowConfidence = data?.projectionConfidence === 'low' || data?.projectionConfidence === 'none';
  const mtdMarginPct = data?.mtd ? (data.mtd.revenue > 0 ? ((data.mtd.revenue - data.mtd.costs) / data.mtd.revenue * 100) : 0) : 0;

  return (
    <div className="min-h-screen bg-mc-bg text-mc-text">
      {/* Header */}
      <header className="border-b border-mc-border bg-mc-bg-secondary px-4 py-3 flex items-center gap-3">
        <Link href="/" className="text-mc-text-secondary hover:text-mc-text transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <BarChart2 className="w-5 h-5 text-mc-accent" />
        <h1 className="font-semibold text-lg">Financial Planning</h1>
        <div className="ml-auto flex items-center gap-3">
          {data?.lastImport && (
            <span className="text-xs text-mc-text-secondary" title={`Parsed: ${formatTimestamp(data.lastParseTimestamp)} | Mode: ${data.lastImportMode}`}>
              Updated {formatDistanceToNow(parseISO(data.lastImport), { addSuffix: true })}
              <span className="ml-2 font-mono opacity-70">{formatTimestamp(data.lastParseTimestamp)}</span>
              {data.lastParserVersion && <span className="ml-1 opacity-50">v{data.lastParserVersion}</span>}
            </span>
          )}
          <button onClick={load} className="p-1.5 hover:bg-mc-bg-tertiary rounded text-mc-text-secondary">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <Link href="/documents?category=financial" className="text-xs px-3 py-1.5 bg-mc-accent/10 text-mc-accent border border-mc-accent/30 rounded hover:bg-mc-accent/20">
            Upload data →
          </Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-6 h-6 animate-spin text-mc-text-secondary" />
          </div>
        ) : error ? (
          <div className="text-center py-16 text-red-400">{error}</div>
        ) : isEmpty ? (
          <div className="text-center py-24 text-mc-text-secondary">
            <BarChart2 className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <h2 className="text-lg font-medium mb-2">No financial data yet</h2>
            <p className="text-sm mb-6 opacity-70">Upload a CSV or XLSX file in the Financial category of the Document Repository.</p>
            <Link href="/documents" className="px-5 py-2.5 bg-mc-accent text-mc-bg rounded-lg font-medium hover:bg-mc-accent/90">
              Go to Documents →
            </Link>
          </div>
        ) : (
          <>
            {/* Low-confidence warning */}
            {isLowConfidence && (
              <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded flex items-center gap-2 text-yellow-400 text-sm">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>
                  {data!.projectionConfidence === 'none' 
                    ? 'No projection available: insufficient historical data.' 
                    : 'Low-confidence projection: only ' + data!.monthly.length + ' month(s) of data. Projections are unreliable with fewer than 3 months of history.'}
                </span>
              </div>
            )}

            {/* Data provenance panel */}
            {data!.sourceFiles.length > 0 && (
              <details className="mb-6 bg-mc-bg-secondary border border-mc-border rounded-lg">
                <summary className="px-4 py-3 cursor-pointer text-sm font-medium text-mc-text-secondary hover:text-mc-text transition-colors flex items-center justify-between">
                  <span>📄 Data Sources ({data!.sourceFiles.length} file{data!.sourceFiles.length !== 1 ? 's' : ''})</span>
                  <button 
                    onClick={(e) => { e.stopPropagation(); setShowImportSummary(!showImportSummary); }}
                    className="text-xs px-2 py-1 bg-mc-accent/10 text-mc-accent rounded hover:bg-mc-accent/20"
                  >
                    {showImportSummary ? 'Hide import details' : 'Show import details'}
                  </button>
                </summary>
                <div className="px-4 pb-3">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-mc-text-secondary">
                        <th className="text-left py-1">Source File</th>
                        <th className="text-left py-1">Imported</th>
                        <th className="text-left py-1">Exact Timestamp</th>
                        <th className="text-left py-1">Parser</th>
                        <th className="text-right py-1">Rows</th>
                        <th className="text-left py-1">Mode</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data!.sourceFiles.map(sf => (
                        <tr key={sf.source_file + sf.imported_at} className="border-t border-mc-border/50">
                          <td className="py-1.5 font-mono">{sf.source_file}</td>
                          <td className="py-1.5">{formatDistanceToNow(parseISO(sf.imported_at), { addSuffix: true })}</td>
                          <td className="py-1.5 font-mono text-mc-text-secondary">{formatTimestamp(sf.parse_timestamp)}</td>
                          <td className="py-1.5">{sf.parser_version || '—'}</td>
                          <td className="py-1.5 text-right">{sf.rows_count}</td>
                          <td className="py-1.5"><span className="px-1.5 py-0.5 bg-mc-bg-tertiary rounded text-[10px]">{sf.import_mode || 'manual'}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  
                  {/* Import summary details */}
                  {showImportSummary && data!.parseResults.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-mc-border">
                      <h4 className="text-xs font-medium text-mc-text-secondary mb-2">Import Summary by Document</h4>
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-mc-text-secondary">
                            <th className="text-left py-1">Document ID</th>
                            <th className="text-left py-1">Parsed</th>
                            <th className="text-left py-1">Parser</th>
                            <th className="text-left py-1">Mode</th>
                            <th className="text-right py-1">Rows Imported</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data!.parseResults.map(pr => (
                            <tr key={pr.source_document_id} className="border-t border-mc-border/50">
                              <td className="py-1.5 font-mono text-[10px]">{pr.source_document_id.slice(0, 8)}…</td>
                              <td className="py-1.5 font-mono">{formatTimestamp(pr.parse_timestamp)}</td>
                              <td className="py-1.5">{pr.parser_version}</td>
                              <td className="py-1.5"><span className="px-1.5 py-0.5 bg-mc-bg-tertiary rounded text-[10px]">{pr.import_mode}</span></td>
                              <td className="py-1.5 text-right text-green-400">{pr.rows_imported}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </details>
            )}

            {/* Clinic filter */}
            {data!.clinics.length > 1 && (
              <div className="mb-4 flex items-center gap-2">
                <Filter className="w-4 h-4 text-mc-text-secondary" />
                <span className="text-xs text-mc-text-secondary">Clinic:</span>
                <select
                  value={clinicFilter}
                  onChange={e => setClinicFilter(e.target.value)}
                  className="text-xs px-2 py-1 bg-mc-bg-secondary border border-mc-border rounded focus:outline-none"
                >
                  <option value="all">All clinics</option>
                  {data!.clinics.map(c => (
                    <option key={c.clinic} value={c.clinic}>{c.clinic}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Summary cards with clearer deltas */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
              {[
                {
                  label: 'Revenue (MTD)',
                  value: formatPLN(data!.mtd?.revenue ?? 0),
                  delta: data?.prevMonth ? deltaDisplay(data.mtd!.revenue, data.prevMonth.revenue) : null,
                  icon: <DollarSign className="w-5 h-5" />,
                  color: 'text-mc-accent-cyan',
                  timestamp: data?.mtdTimestamp ? formatTimestamp(data.mtdTimestamp) : null,
                },
                {
                  label: 'Costs (MTD)',
                  value: formatPLN(data!.mtd?.costs ?? 0),
                  delta: data?.prevMonth ? deltaDisplay(data.mtd!.costs, data.prevMonth.costs) : null,
                  icon: <TrendingDown className="w-5 h-5" />,
                  color: 'text-red-400',
                  timestamp: data?.mtdTimestamp ? formatTimestamp(data.mtdTimestamp) : null,
                },
                {
                  label: 'Net (MTD)',
                  value: formatPLN(data!.mtd?.net ?? 0),
                  delta: data?.prevMonth ? deltaDisplay(data.mtd!.net, data.prevMonth.net) : null,
                  icon: <TrendingUp className="w-5 h-5" />,
                  color: (data?.mtd?.net ?? 0) >= 0 ? 'text-green-400' : 'text-red-400',
                  timestamp: data?.mtdTimestamp ? formatTimestamp(data.mtdTimestamp) : null,
                },
                {
                  label: 'Margin %',
                  value: `${mtdMarginPct.toFixed(1)}%`,
                  delta: null,
                  icon: <BarChart2 className="w-5 h-5" />,
                  color: mtdMarginPct >= 20 ? 'text-green-400' : mtdMarginPct >= 0 ? 'text-yellow-400' : 'text-red-400',
                  timestamp: null,
                },
                {
                  label: 'Avg Net / Month',
                  value: formatPLN(data!.monthly.length ? data!.monthly.reduce((s, m) => s + m.net, 0) / data!.monthly.length : 0),
                  delta: null,
                  icon: <BarChart2 className="w-5 h-5" />,
                  color: 'text-mc-accent',
                  timestamp: null,
                },
              ].map(card => (
                <div key={card.label} className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4">
                  <div className={`flex items-center gap-2 mb-2 ${card.color} opacity-70`}>
                    {card.icon}
                    <span className="text-xs uppercase tracking-wider">{card.label}</span>
                  </div>
                  <div className="text-2xl font-bold">{card.value}</div>
                  {card.delta && (
                    <div className={`text-xs mt-1 ${card.delta.up ? 'text-green-400' : 'text-red-400'}`}>
                      {card.delta.pct} <span className="opacity-70">({card.delta.absolute})</span> vs prior
                    </div>
                  )}
                  {card.timestamp && (
                    <div className="text-[10px] mt-1 text-mc-text-secondary font-mono">{card.timestamp}</div>
                  )}
                </div>
              ))}
            </div>

            {/* Chart */}
            <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4 mb-6">
              <h2 className="text-sm font-medium text-mc-text-secondary uppercase tracking-wider mb-4">
                Revenue vs Costs — last 12 months + 3-month projection
              </h2>
              <RevenueChart monthly={data!.monthly} projections={data!.projections} />
            </div>

            <div className="grid lg:grid-cols-2 gap-4">
              {/* Projection panel */}
              <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4">
                <h2 className="text-sm font-medium text-mc-text-secondary uppercase tracking-wider mb-4">
                  3-Month Linear Projection
                  {isLowConfidence && <span className="ml-2 text-yellow-400 font-normal">⚠ {data!.projectionConfidence === 'none' ? 'Unavailable' : 'Low confidence'}</span>}
                </h2>
                {data!.projections.length === 0 ? (
                  <p className="text-sm text-mc-text-secondary">Not enough data for projection</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-mc-text-secondary text-xs">
                        <th className="text-left py-1">Month</th>
                        <th className="text-right py-1">Revenue</th>
                        <th className="text-right py-1">Costs</th>
                        <th className="text-right py-1">Net</th>
                        <th className="text-right py-1">Margin</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data!.projections.map(p => {
                        const margin = p.revenue > 0 ? ((p.revenue - p.costs) / p.revenue * 100) : 0;
                        return (
                          <tr key={p.month} className="border-t border-mc-border/50">
                            <td className="py-2 font-mono">{p.month}</td>
                            <td className="py-2 text-right text-blue-400">{formatPLN(p.revenue)}</td>
                            <td className="py-2 text-right text-red-400">{formatPLN(p.costs)}</td>
                            <td className={`py-2 text-right font-medium ${p.net >= 0 ? 'text-green-400' : 'text-red-400'}`}>{formatPLN(p.net)}</td>
                            <td className={`py-2 text-right text-xs ${margin >= 20 ? 'text-green-400' : margin >= 0 ? 'text-yellow-400' : 'text-red-400'}`}>{margin.toFixed(1)}%</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Clinic breakdown */}
              <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4">
                <h2 className="text-sm font-medium text-mc-text-secondary uppercase tracking-wider mb-4">Clinic Breakdown</h2>
                {(clinicFilter === 'all' ? data!.clinics : data!.clinics.filter(c => c.clinic === clinicFilter)).length === 0 ? (
                  <p className="text-sm text-mc-text-secondary">No per-clinic data available</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-mc-text-secondary text-xs">
                        <th className="text-left py-1">Clinic</th>
                        <th className="text-right py-1">Revenue</th>
                        <th className="text-right py-1">Costs</th>
                        <th className="text-right py-1">Net</th>
                        <th className="text-right py-1">Margin</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(clinicFilter === 'all' ? data!.clinics : data!.clinics.filter(c => c.clinic === clinicFilter)).map(c => (
                        <tr key={c.clinic} className="border-t border-mc-border/50">
                          <td className="py-2">{c.clinic}</td>
                          <td className="py-2 text-right text-blue-400">{formatPLN(c.revenue)}</td>
                          <td className="py-2 text-right text-red-400">{formatPLN(c.costs)}</td>
                          <td className={`py-2 text-right font-medium ${c.revenue - c.costs >= 0 ? 'text-green-400' : 'text-red-400'}`}>{formatPLN(c.revenue - c.costs)}</td>
                          <td className={`py-2 text-right text-xs ${c.margin_pct >= 20 ? 'text-green-400' : c.margin_pct >= 0 ? 'text-yellow-400' : 'text-red-400'}`}>{c.margin_pct.toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
