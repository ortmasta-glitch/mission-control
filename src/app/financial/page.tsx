'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { ChevronLeft, TrendingUp, TrendingDown, DollarSign, RefreshCw, Loader2, BarChart2 } from 'lucide-react';
import * as echarts from 'echarts/core';
import { BarChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { formatDistanceToNow } from 'date-fns';

echarts.use([BarChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer]);

interface MonthlySummary {
  month: string;
  revenue: number;
  costs: number;
  net: number;
}

interface FinancialData {
  monthly: MonthlySummary[];
  projections: MonthlySummary[];
  mtd: MonthlySummary | null;
  prevMonth: MonthlySummary | null;
  clinics: { clinic: string; revenue: number; costs: number }[];
  lastImport: string | null;
  totalEntries: number;
}

function formatPLN(n: number): string {
  return n.toLocaleString('pl-PL', { style: 'currency', currency: 'PLN', maximumFractionDigits: 0 });
}

function delta(current: number, prev: number): { pct: string; up: boolean } {
  if (!prev) return { pct: '—', up: true };
  const d = ((current - prev) / Math.abs(prev)) * 100;
  return { pct: `${d > 0 ? '+' : ''}${d.toFixed(1)}%`, up: d >= 0 };
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
      legend: {
        top: 8,
        textStyle: { color: '#8b949e', fontSize: 11 },
        data: ['Revenue', 'Costs'],
      },
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
          itemStyle: {
            color: (p: { dataIndex: number }) => allMonths[p.dataIndex].projected ? '#58a6ff55' : '#58a6ff',
          },
        },
        {
          name: 'Costs',
          type: 'bar',
          data: allMonths.map(m => m.costs),
          itemStyle: {
            color: (p: { dataIndex: number }) => allMonths[p.dataIndex].projected ? '#f8514955' : '#f85149',
          },
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
            <span className="text-xs text-mc-text-secondary">
              Updated {formatDistanceToNow(new Date(data.lastImport), { addSuffix: true })}
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
            {/* Summary cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              {[
                {
                  label: 'Revenue (MTD)',
                  value: formatPLN(data!.mtd?.revenue ?? 0),
                  delta: data?.prevMonth ? delta(data.mtd!.revenue, data.prevMonth.revenue) : null,
                  icon: <DollarSign className="w-5 h-5" />,
                  color: 'text-mc-accent-cyan',
                },
                {
                  label: 'Costs (MTD)',
                  value: formatPLN(data!.mtd?.costs ?? 0),
                  delta: data?.prevMonth ? delta(data.mtd!.costs, data.prevMonth.costs) : null,
                  icon: <TrendingDown className="w-5 h-5" />,
                  color: 'text-red-400',
                },
                {
                  label: 'Net (MTD)',
                  value: formatPLN(data!.mtd?.net ?? 0),
                  delta: data?.prevMonth ? delta(data.mtd!.net, data.prevMonth.net) : null,
                  icon: <TrendingUp className="w-5 h-5" />,
                  color: (data?.mtd?.net ?? 0) >= 0 ? 'text-green-400' : 'text-red-400',
                },
                {
                  label: 'Avg Net / Month',
                  value: formatPLN(data!.monthly.length ? data!.monthly.reduce((s, m) => s + m.net, 0) / data!.monthly.length : 0),
                  delta: null,
                  icon: <BarChart2 className="w-5 h-5" />,
                  color: 'text-mc-accent',
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
                      {card.delta.pct} vs prior month
                    </div>
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
                      </tr>
                    </thead>
                    <tbody>
                      {data!.projections.map(p => (
                        <tr key={p.month} className="border-t border-mc-border/50">
                          <td className="py-2 font-mono">{p.month}</td>
                          <td className="py-2 text-right text-blue-400">{formatPLN(p.revenue)}</td>
                          <td className="py-2 text-right text-red-400">{formatPLN(p.costs)}</td>
                          <td className={`py-2 text-right font-medium ${p.net >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {formatPLN(p.net)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Clinic breakdown */}
              <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4">
                <h2 className="text-sm font-medium text-mc-text-secondary uppercase tracking-wider mb-4">
                  Clinic Breakdown
                </h2>
                {data!.clinics.length === 0 ? (
                  <p className="text-sm text-mc-text-secondary">No per-clinic data available</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-mc-text-secondary text-xs">
                        <th className="text-left py-1">Clinic</th>
                        <th className="text-right py-1">Revenue</th>
                        <th className="text-right py-1">Costs</th>
                        <th className="text-right py-1">Net</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data!.clinics.map(c => (
                        <tr key={c.clinic} className="border-t border-mc-border/50">
                          <td className="py-2">{c.clinic}</td>
                          <td className="py-2 text-right text-blue-400">{formatPLN(c.revenue)}</td>
                          <td className="py-2 text-right text-red-400">{formatPLN(c.costs)}</td>
                          <td className={`py-2 text-right font-medium ${c.revenue - c.costs >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {formatPLN(c.revenue - c.costs)}
                          </td>
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
