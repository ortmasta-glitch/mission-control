'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import {
  ChevronLeft, TrendingUp, TrendingDown, DollarSign, RefreshCw, Loader2,
  BarChart2, AlertTriangle, Filter, Info, ChevronDown, ChevronRight,
  ArrowUpRight, ArrowDownRight, Target, Wallet, Calendar
} from 'lucide-react';
import * as echarts from 'echarts/core';
import { BarChart, LineChart, PieChart } from 'echarts/charts';
import {
  GridComponent, TooltipComponent, LegendComponent,
  MarkLineComponent, DataZoomComponent
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { formatDistanceToNow, parseISO } from 'date-fns';

echarts.use([
  BarChart, LineChart, PieChart,
  GridComponent, TooltipComponent, LegendComponent,
  MarkLineComponent, DataZoomComponent, CanvasRenderer
]);

// ─── Types ───────────────────────────────────────────────────────────

interface MonthlySummary {
  month: string;
  revenue: number;
  costs: number;
  net: number;
  margin_pct: number;
  delta_absolute: number;
  delta_pct: number;
}

interface CostBreakdown {
  rent: number;
  utilities: number;
  marketing: number;
  office: number;
  salary_extras: number;
  other: number;
  taxes: number;
}

interface EnhancedMonthly {
  month: string;
  revenue: number;
  total_costs: number;
  operational_costs: number;
  net_cashflow: number;
  balance_end: number;
  margin_pct: number;
  yoy_revenue_growth: number | null;
  cost_breakdown: CostBreakdown;
}

interface YearlySummary {
  months: number;
  totalRevenue: number;
  totalCosts: number;
  totalNet: number;
  avgMonthlyRevenue: number;
  avgMonthlyCosts: number;
  avgMargin: number;
  bestMonth: string;
  worstMonth: string;
  avgBalance: number;
}

interface EnhancedData {
  metadata: { source: string; clinics: string[]; currency: string; dateRange: string };
  monthly: EnhancedMonthly[];
  yearlySummary: Record<string, YearlySummary>;
  kpiTargets: { revenue2026Target: number; marginTarget: number; monthlyRevenueTarget: number };
}

interface FinancialData {
  monthly: MonthlySummary[];
  projections: MonthlySummary[];
  projectionConfidence: 'none' | 'low' | 'normal';
  mtd: MonthlySummary | null;
  prevMonth: MonthlySummary | null;
  clinics: { clinic: string; revenue: number; costs: number; margin_pct: number }[];
  lastImport: string | null;
  totalEntries: number;
}

// ─── Constants ───────────────────────────────────────────────────────

const COLORS = {
  revenue: '#3b82f6',
  costs: '#f85149',
  net_pos: '#22c55e',
  net_neg: '#ef4444',
  accent: '#e6c364',
  rent: '#f97316',
  utilities: '#eab308',
  marketing: '#a855f7',
  office: '#6b7280',
  salary_extras: '#ec4899',
  other: '#64748b',
  taxes: '#ef4444',
  bg: '#0d1117',
  grid: '#21262d',
  border: '#30363d',
  text: '#c9d1d9',
  muted: '#8b949e',
};

const COST_LABELS: Record<keyof CostBreakdown, string> = {
  rent: 'Czynsz',
  utilities: 'Media',
  marketing: 'Marketing',
  office: 'Biuro',
  salary_extras: 'Dodatki',
  other: 'Inne',
  taxes: 'Podatki/ZUS',
};

const COST_COLORS: Record<keyof CostBreakdown, string> = {
  rent: COLORS.rent,
  utilities: COLORS.utilities,
  marketing: COLORS.marketing,
  office: COLORS.office,
  salary_extras: COLORS.salary_extras,
  other: COLORS.other,
  taxes: COLORS.taxes,
};

// ─── Helpers ─────────────────────────────────────────────────────────

function fmtPLN(n: number): string {
  return n.toLocaleString('pl-PL', { style: 'currency', currency: 'PLN', maximumFractionDigits: 0 });
}

function fmtK(n: number): string {
  return `${(n / 1000).toFixed(0)}k`;
}

function fmtPct(n: number): string {
  return `${n > 0 ? '+' : ''}${n.toFixed(1)}%`;
}

function marginColor(pct: number): string {
  if (pct >= 20) return 'text-green-400';
  if (pct >= 5) return 'text-yellow-400';
  if (pct >= 0) return 'text-orange-400';
  return 'text-red-400';
}

// ─── Chart Components ────────────────────────────────────────────────

function useChart(dataDeps: unknown[]) {
  const ref = useRef<HTMLDivElement>(null);
  const inst = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    if (!inst.current) inst.current = echarts.init(ref.current, undefined, { renderer: 'canvas' });
    const ro = new ResizeObserver(() => inst.current?.resize());
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => () => { inst.current?.dispose(); inst.current = null; }, []);

  const setOption = useCallback((opt: echarts.EChartsCoreOption) => {
    if (inst.current) inst.current.setOption(opt, { notMerge: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dataDeps);

  return { ref, setOption };
}

function RevenueTrendChart({ months }: { months: EnhancedMonthly[] }) {
  const { ref, setOption } = useChart([months]);

  useEffect(() => {
    if (!months.length) return;
    setOption({
      animation: true,
      grid: { top: 30, right: 20, bottom: 60, left: 65 },
      tooltip: {
        trigger: 'axis',
        backgroundColor: COLORS.bg,
        borderColor: COLORS.border,
        textStyle: { color: COLORS.text, fontSize: 12 },
        formatter: (p: unknown) => {
          const params = p as { name: string; value: number; seriesName: string }[];
          const m = months.find(x => x.month === params[0]?.name);
          return `<b>${params[0].name}</b><br/>Przychód: <b>${fmtPLN(params[0].value)}</b>` +
            (m ? `<br/>Marża: <b>${m.margin_pct.toFixed(1)}%</b>` : '');
        },
      },
      xAxis: {
        type: 'category',
        data: months.map(m => m.month),
        axisLine: { lineStyle: { color: COLORS.border } },
        axisLabel: { color: COLORS.muted, fontSize: 9, rotate: 45 },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value',
        axisLine: { lineStyle: { color: COLORS.border } },
        axisLabel: { color: COLORS.muted, fontSize: 10, formatter: (v: number) => fmtK(v) },
        splitLine: { lineStyle: { color: COLORS.grid } },
      },
      series: [{
        name: 'Przychód',
        type: 'line',
        data: months.map(m => m.revenue),
        smooth: true,
        symbol: 'none',
        lineStyle: { color: COLORS.revenue, width: 2 },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(59,130,246,0.35)' },
            { offset: 1, color: 'rgba(59,130,246,0.02)' },
          ]),
        },
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { color: COLORS.accent, type: 'dashed', width: 1.5 },
          label: { color: COLORS.accent, fontSize: 10, formatter: 'Cel 100K' },
          data: [{ yAxis: 100000 }],
        },
      }],
      dataZoom: [{
        type: 'inside',
        start: 0,
        end: 100,
      }],
    });
  }, [months, setOption]);

  return <div ref={ref} style={{ width: '100%', height: '280px' }} />;
}

function CostWaterfallChart({ months }: { months: EnhancedMonthly[] }) {
  const { ref, setOption } = useChart([months]);

  useEffect(() => {
    if (!months.length) return;
    const last12 = months.slice(-12);
    const categories = Object.keys(COST_LABELS) as (keyof CostBreakdown)[];

    setOption({
      animation: true,
      grid: { top: 40, right: 20, bottom: 50, left: 65 },
      tooltip: {
        trigger: 'axis',
        backgroundColor: COLORS.bg,
        borderColor: COLORS.border,
        textStyle: { color: COLORS.text, fontSize: 11 },
        formatter: (p: unknown) => {
          const params = p as { seriesName: string; value: number; axisValue: string }[];
          let html = `<b>${params[0].axisValue}</b>`;
          let totalCosts = 0;
          for (const s of params) {
            if (s.seriesName === 'Net') continue;
            if (s.value > 0) {
              html += `<br/><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${COLORS[s.seriesName.toLowerCase().replace(' ', '_') as keyof typeof COLORS] || COLORS.muted};margin-right:4px"></span>${s.seriesName}: ${fmtPLN(s.value)}`;
              totalCosts += s.value;
            }
          }
          const m = last12.find(x => x.month === params[0].axisValue);
          if (m) html += `<br/><b>Przychód: ${fmtPLN(m.revenue)}</b><br/><b>Net: ${fmtPLN(m.net_cashflow)}</b>`;
          return html;
        },
      },
      legend: {
        top: 4,
        textStyle: { color: COLORS.muted, fontSize: 10 },
        data: ['Przychód', ...categories.map(k => COST_LABELS[k])],
      },
      xAxis: {
        type: 'category',
        data: last12.map(m => m.month),
        axisLine: { lineStyle: { color: COLORS.border } },
        axisLabel: { color: COLORS.muted, fontSize: 9, rotate: 30 },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value',
        axisLine: { lineStyle: { color: COLORS.border } },
        axisLabel: { color: COLORS.muted, fontSize: 10, formatter: (v: number) => fmtK(v) },
        splitLine: { lineStyle: { color: COLORS.grid } },
      },
      series: [
        {
          name: 'Przychód',
          type: 'bar',
          data: last12.map(m => m.revenue),
          itemStyle: { color: COLORS.revenue },
          barWidth: '60%',
        },
        ...categories.map(k => ({
          name: COST_LABELS[k],
          type: 'bar' as const,
          stack: 'costs',
          data: last12.map(m => m.cost_breakdown[k] || 0),
          itemStyle: { color: COST_COLORS[k] },
          barWidth: '60%',
        })),
        {
          name: 'Net',
          type: 'line',
          data: last12.map(m => m.net_cashflow),
          lineStyle: { color: COLORS.accent, width: 2 },
          itemStyle: { color: COLORS.accent },
          symbol: 'circle',
          symbolSize: 6,
        },
      ],
    });
  }, [months, setOption]);

  return <div ref={ref} style={{ width: '100%', height: '300px' }} />;
}

function CostDonutChart({ month }: { month: EnhancedMonthly | null }) {
  const { ref, setOption } = useChart([month]);

  useEffect(() => {
    if (!month) return;
    const bd = month.cost_breakdown;
    const cats = Object.keys(COST_LABELS) as (keyof CostBreakdown)[];
    const total = cats.reduce((s, k) => s + (bd[k] || 0), 0);

    setOption({
      animation: true,
      tooltip: {
        trigger: 'item',
        backgroundColor: COLORS.bg,
        borderColor: COLORS.border,
        textStyle: { color: COLORS.text, fontSize: 12 },
        formatter: (p: { name: string; value: number; percent: number }) =>
          `${p.name}<br/><b>${fmtPLN(p.value)}</b> (${p.percent.toFixed(1)}%)`,
      },
      legend: {
        orient: 'vertical',
        right: 10,
        top: 'center',
        textStyle: { color: COLORS.muted, fontSize: 11 },
      },
      series: [{
        type: 'pie',
        radius: ['45%', '75%'],
        center: ['35%', '50%'],
        avoidLabelOverlap: false,
        label: { show: false },
        emphasis: {
          label: { show: true, fontSize: 14, fontWeight: 'bold', color: COLORS.text },
        },
        data: cats.map(k => ({
          name: COST_LABELS[k],
          value: bd[k] || 0,
          itemStyle: { color: COST_COLORS[k] },
        })),
      }],
      graphic: [{
        type: 'text',
        left: '28%',
        top: '42%',
        style: {
          text: fmtPLN(total),
          fontSize: 16,
          fontWeight: 'bold',
          fill: COLORS.text,
          textAlign: 'center',
        },
      }, {
        type: 'text',
        left: '30%',
        top: '52%',
        style: {
          text: 'koszty łącznie',
          fontSize: 10,
          fill: COLORS.muted,
          textAlign: 'center',
        },
      }],
    });
  }, [month, setOption]);

  return <div ref={ref} style={{ width: '100%', height: '260px' }} />;
}

function MarginTrendChart({ months }: { months: EnhancedMonthly[] }) {
  const { ref, setOption } = useChart([months]);

  useEffect(() => {
    if (!months.length) return;
    const last12 = months.slice(-12);

    setOption({
      animation: true,
      grid: { top: 30, right: 20, bottom: 40, left: 50 },
      tooltip: {
        trigger: 'axis',
        backgroundColor: COLORS.bg,
        borderColor: COLORS.border,
        textStyle: { color: COLORS.text, fontSize: 12 },
        formatter: (p: unknown) => {
          const params = p as { name: string; value: number }[];
          return `<b>${params[0].name}</b><br/>Marża: <b>${params[0].value.toFixed(1)}%</b>`;
        },
      },
      xAxis: {
        type: 'category',
        data: last12.map(m => m.month),
        axisLine: { lineStyle: { color: COLORS.border } },
        axisLabel: { color: COLORS.muted, fontSize: 10, rotate: 30 },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value',
        axisLine: { lineStyle: { color: COLORS.border } },
        axisLabel: { color: COLORS.muted, fontSize: 10, formatter: '{value}%' },
        splitLine: { lineStyle: { color: COLORS.grid } },
      },
      series: [{
        name: 'Marża',
        type: 'line',
        data: last12.map(m => m.margin_pct),
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: { color: COLORS.accent, width: 2.5 },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(230,195,100,0.3)' },
            { offset: 1, color: 'rgba(230,195,100,0.01)' },
          ]),
        },
        itemStyle: {
          color: (p: { dataIndex: number }) =>
            last12[p.dataIndex].margin_pct >= 0 ? COLORS.net_pos : COLORS.net_neg,
        },
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { color: COLORS.net_pos, type: 'dashed', width: 1.5 },
          label: { color: COLORS.net_pos, fontSize: 10, formatter: 'Cel 25%' },
          data: [{ yAxis: 25 }],
        },
      }],
      visualMap: {
        show: false,
        pieces: [
          { lte: 0, color: COLORS.net_neg },
          { gt: 0, color: COLORS.net_pos },
        ],
        seriesIndex: 0,
        type: 'piecewise',
      },
    });
  }, [months, setOption]);

  return <div ref={ref} style={{ width: '100%', height: '240px' }} />;
}

function BalanceChart({ months }: { months: EnhancedMonthly[] }) {
  const { ref, setOption } = useChart([months]);

  useEffect(() => {
    if (!months.length) return;

    setOption({
      animation: true,
      grid: { top: 30, right: 20, bottom: 60, left: 65 },
      tooltip: {
        trigger: 'axis',
        backgroundColor: COLORS.bg,
        borderColor: COLORS.border,
        textStyle: { color: COLORS.text, fontSize: 12 },
        formatter: (p: unknown) => {
          const params = p as { name: string; value: number }[];
          return `<b>${params[0].name}</b><br/>Saldo: <b>${fmtPLN(params[0].value)}</b>`;
        },
      },
      xAxis: {
        type: 'category',
        data: months.map(m => m.month),
        axisLine: { lineStyle: { color: COLORS.border } },
        axisLabel: { color: COLORS.muted, fontSize: 9, rotate: 45 },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value',
        axisLine: { lineStyle: { color: COLORS.border } },
        axisLabel: { color: COLORS.muted, fontSize: 10, formatter: (v: number) => fmtK(v) },
        splitLine: { lineStyle: { color: COLORS.grid } },
      },
      series: [{
        name: 'Saldo bankowe',
        type: 'line',
        data: months.map(m => m.balance_end),
        smooth: true,
        symbol: 'none',
        lineStyle: { color: COLORS.revenue, width: 2 },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(59,130,246,0.25)' },
            { offset: 1, color: 'rgba(59,130,246,0.01)' },
          ]),
        },
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { color: '#eab308', type: 'dashed', width: 1.5 },
          label: { color: '#eab308', fontSize: 10, formatter: 'Bezpieczeństwo 20K' },
          data: [{ yAxis: 20000 }],
        },
      }],
      dataZoom: [{ type: 'inside', start: 0, end: 100 }],
    });
  }, [months, setOption]);

  return <div ref={ref} style={{ width: '100%', height: '250px' }} />;
}

// ─── Main Page ───────────────────────────────────────────────────────

export default function FinancialPage() {
  const [apiData, setApiData] = useState<FinancialData | null>(null);
  const [enhanced, setEnhanced] = useState<EnhancedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<string>('month');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [apiRes, enhRes] = await Promise.all([
        fetch('/api/financial'),
        fetch('/wcp-financial-enhanced.json'),
      ]);
      if (!apiRes.ok) throw new Error('API failed');
      setApiData(await apiRes.json());
      if (enhRes.ok) setEnhanced(await enhRes.json());
    } catch (e) {
      setError('Nie udało się załadować danych finansowych');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const months = enhanced?.monthly ?? [];
  const latestMonth = months[months.length - 1] ?? null;
  const prevMonth = months[months.length - 2] ?? null;
  const yoy = latestMonth?.yoy_revenue_growth;
  const kpiTarget = enhanced?.kpiTargets?.monthlyRevenueTarget ?? 100000;
  const revPctTarget = latestMonth ? Math.min((latestMonth.revenue / kpiTarget) * 100, 150) : 0;
  const yearly = enhanced?.yearlySummary ?? {};

  const sortedMonths = useCallback(() => {
    const m = [...months];
    const dir = sortDir === 'asc' ? 1 : -1;
    m.sort((a, b) => {
      const va = (a as unknown as Record<string, unknown>)[sortKey] as number;
      const vb = (b as unknown as Record<string, unknown>)[sortKey] as number;
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
      return a.month.localeCompare(b.month) * dir;
    });
    return m;
  }, [months, sortKey, sortDir]);

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const isEmpty = !apiData?.totalEntries && !enhanced;

  return (
    <div className="min-h-screen bg-mc-bg text-mc-text">
      {/* Header */}
      <header className="border-b border-mc-border bg-mc-bg-secondary px-4 py-3 flex items-center gap-3">
        <Link href="/" className="text-mc-text-secondary hover:text-mc-text transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <BarChart2 className="w-5 h-5 text-mc-accent" />
        <h1 className="font-semibold text-lg">Financial Health Report</h1>
        <span className="text-xs px-2 py-0.5 bg-mc-accent/10 text-mc-accent rounded border border-mc-accent/30">WCP</span>
        <span className="text-xs text-mc-text-secondary">PLN</span>
        <div className="ml-auto flex items-center gap-3">
          {apiData?.lastImport && (
            <span className="text-xs text-mc-text-secondary">
              Updated {formatDistanceToNow(parseISO(apiData.lastImport), { addSuffix: true })}
            </span>
          )}
          <button onClick={load} className="p-1.5 hover:bg-mc-bg-tertiary rounded text-mc-text-secondary">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-6 h-6 animate-spin text-mc-text-secondary" />
          </div>
        ) : error ? (
          <div className="text-center py-16 text-red-400">{error}</div>
        ) : isEmpty ? (
          <div className="text-center py-24 text-mc-text-secondary">
            <BarChart2 className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <h2 className="text-lg font-medium mb-2">Brak danych finansowych</h2>
            <p className="text-sm opacity-70">Importuj dane w sekcji Dokumentów.</p>
          </div>
        ) : (
          <>
            {/* ── KPI Cards ── */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
              {/* Revenue MTD */}
              <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-3">
                <div className="flex items-center gap-1 text-xs text-mc-text-secondary mb-1">
                  <DollarSign className="w-3 h-3" /> Przychód MTD
                </div>
                <div className="text-lg font-bold text-blue-400">
                  {latestMonth ? fmtPLN(latestMonth.revenue) : '—'}
                </div>
                {prevMonth && latestMonth && (
                  <div className={`text-xs flex items-center gap-1 mt-1 ${latestMonth.revenue >= prevMonth.revenue ? 'text-green-400' : 'text-red-400'}`}>
                    {latestMonth.revenue >= prevMonth.revenue ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                    {fmtPct(((latestMonth.revenue - prevMonth.revenue) / Math.max(prevMonth.revenue, 1)) * 100)}
                  </div>
                )}
              </div>

              {/* Costs MTD */}
              <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-3">
                <div className="flex items-center gap-1 text-xs text-mc-text-secondary mb-1">
                  <DollarSign className="w-3 h-3" /> Koszty MTD
                </div>
                <div className="text-lg font-bold text-red-400">
                  {latestMonth ? fmtPLN(latestMonth.total_costs) : '—'}
                </div>
                {prevMonth && latestMonth && (
                  <div className={`text-xs flex items-center gap-1 mt-1 ${latestMonth.total_costs <= prevMonth.total_costs ? 'text-green-400' : 'text-red-400'}`}>
                    {latestMonth.total_costs <= prevMonth.total_costs ? <ArrowDownRight className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />}
                    {fmtPct(((latestMonth.total_costs - prevMonth.total_costs) / Math.max(prevMonth.total_costs, 1)) * 100)}
                  </div>
                )}
              </div>

              {/* Net MTD */}
              <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-3">
                <div className="flex items-center gap-1 text-xs text-mc-text-secondary mb-1">
                  <DollarSign className="w-3 h-3" /> Net MTD
                </div>
                <div className={`text-lg font-bold ${latestMonth && latestMonth.net_cashflow >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {latestMonth ? fmtPLN(latestMonth.net_cashflow) : '—'}
                </div>
              </div>

              {/* Margin */}
              <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-3">
                <div className="flex items-center gap-1 text-xs text-mc-text-secondary mb-1">
                  <Target className="w-3 h-3" /> Marża
                </div>
                <div className={`text-lg font-bold ${latestMonth ? marginColor(latestMonth.margin_pct) : ''}`}>
                  {latestMonth ? `${latestMonth.margin_pct.toFixed(1)}%` : '—'}
                </div>
                <div className="text-xs text-mc-text-secondary mt-1">cel: 25%</div>
              </div>

              {/* Revenue vs Target */}
              <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-3">
                <div className="flex items-center gap-1 text-xs text-mc-text-secondary mb-1">
                  <Target className="w-3 h-3" /> vs Cel
                </div>
                <div className="text-lg font-bold text-mc-accent">
                  {latestMonth ? `${revPctTarget.toFixed(0)}%` : '—'}
                </div>
                <div className="w-full bg-mc-bg-tertiary rounded-full h-1.5 mt-1.5">
                  <div
                    className="h-1.5 rounded-full transition-all"
                    style={{
                      width: `${Math.min(revPctTarget, 100)}%`,
                      backgroundColor: revPctTarget >= 100 ? '#22c55e' : '#e6c364',
                    }}
                  />
                </div>
                <div className="text-xs text-mc-text-secondary mt-1">cel: {fmtPLN(kpiTarget)}/mies</div>
              </div>

              {/* Balance */}
              <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-3">
                <div className="flex items-center gap-1 text-xs text-mc-text-secondary mb-1">
                  <Wallet className="w-3 h-3" /> Saldo
                </div>
                <div className={`text-lg font-bold ${(latestMonth?.balance_end ?? 0) >= 20000 ? 'text-green-400' : (latestMonth?.balance_end ?? 0) >= 10000 ? 'text-yellow-400' : 'text-red-400'}`}>
                  {latestMonth ? fmtPLN(latestMonth.balance_end) : '—'}
                </div>
                {prevMonth && latestMonth && (
                  <div className={`text-xs flex items-center gap-1 mt-1 ${latestMonth.balance_end >= prevMonth.balance_end ? 'text-green-400' : 'text-red-400'}`}>
                    {latestMonth.balance_end >= prevMonth.balance_end ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                    {fmtPLN(latestMonth.balance_end - prevMonth.balance_end)}
                  </div>
                )}
              </div>

              {/* YoY Growth */}
              <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-3">
                <div className="flex items-center gap-1 text-xs text-mc-text-secondary mb-1">
                  <Calendar className="w-3 h-3" /> YoY
                </div>
                <div className={`text-lg font-bold ${yoy !== null && yoy >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {yoy !== null ? fmtPct(yoy) : '—'}
                </div>
                <div className="text-xs text-mc-text-secondary mt-1">r/r przychód</div>
              </div>

              {/* Avg Net/Month */}
              <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-3">
                <div className="flex items-center gap-1 text-xs text-mc-text-secondary mb-1">
                  <DollarSign className="w-3 h-3" /> Ø Net/mies
                </div>
                <div className={`text-lg font-bold ${months.length ? (months.reduce((s, m) => s + m.net_cashflow, 0) / months.length >= 0 ? 'text-green-400' : 'text-red-400') : ''}`}>
                  {months.length ? fmtPLN(months.reduce((s, m) => s + m.net_cashflow, 0) / months.length) : '—'}
                </div>
              </div>
            </div>

            {/* ── Revenue Trend (full history) ── */}
            <section className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4">
              <h2 className="text-sm font-medium text-mc-text-secondary uppercase tracking-wider mb-3">
                Przychód — Trend Historyczny (2023–2026)
              </h2>
              <RevenueTrendChart months={months} />
            </section>

            {/* ── Cost Waterfall + Donut (side by side) ── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <section className="lg:col-span-2 bg-mc-bg-secondary border border-mc-border rounded-lg p-4">
                <h2 className="text-sm font-medium text-mc-text-secondary uppercase tracking-wider mb-3">
                  Koszty — Struktura (12 miesięcy)
                </h2>
                <CostWaterfallChart months={months} />
              </section>
              <section className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4">
                <h2 className="text-sm font-medium text-mc-text-secondary uppercase tracking-wider mb-3">
                  Struktura Kosztów — {latestMonth?.month ?? '—'}
                </h2>
                <CostDonutChart month={latestMonth ?? null} />
              </section>
            </div>

            {/* ── Margin + Balance (side by side) ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <section className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4">
                <h2 className="text-sm font-medium text-mc-text-secondary uppercase tracking-wider mb-3">
                  Trend Marży (12 miesięcy)
                </h2>
                <MarginTrendChart months={months} />
              </section>
              <section className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4">
                <h2 className="text-sm font-medium text-mc-text-secondary uppercase tracking-wider mb-3">
                  Saldo Bankowe — Historyczne
                </h2>
                <BalanceChart months={months} />
              </section>
            </div>

            {/* ── Year-over-Year Comparison ── */}
            <section className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4">
              <h2 className="text-sm font-medium text-mc-text-secondary uppercase tracking-wider mb-4">
                Porównanie Roczne
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-mc-text-secondary text-xs border-b border-mc-border">
                      <th className="text-left py-2 px-2">Rok</th>
                      <th className="text-right py-2 px-2">Przychód</th>
                      <th className="text-right py-2 px-2">Koszty</th>
                      <th className="text-right py-2 px-2">Net</th>
                      <th className="text-right py-2 px-2">Ø Przychód/mies</th>
                      <th className="text-right py-2 px-2">Ø Marża</th>
                      <th className="text-right py-2 px-2">Najlepszy mies</th>
                      <th className="text-right py-2 px-2">Najgorszy mies</th>
                      <th className="text-right py-2 px-2">Ø Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(yearly).sort(([a], [b]) => a.localeCompare(b)).map(([year, y]) => (
                      <tr key={year} className="border-t border-mc-border/50 hover:bg-mc-bg-tertiary/50">
                        <td className="py-2.5 px-2 font-mono font-bold text-mc-accent">{year}{y.months < 12 ? ` (${y.months}m)` : ''}</td>
                        <td className="py-2.5 px-2 text-right text-blue-400 font-medium">{fmtPLN(y.totalRevenue)}</td>
                        <td className="py-2.5 px-2 text-right text-red-400">{fmtPLN(y.totalCosts)}</td>
                        <td className={`py-2.5 px-2 text-right font-bold ${y.totalNet >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {fmtPLN(y.totalNet)}
                        </td>
                        <td className="py-2.5 px-2 text-right text-blue-300">{fmtPLN(y.avgMonthlyRevenue)}</td>
                        <td className={`py-2.5 px-2 text-right font-medium ${marginColor(y.avgMargin)}`}>
                          {y.avgMargin.toFixed(1)}%
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono text-green-400">{y.bestMonth}</td>
                        <td className="py-2.5 px-2 text-right font-mono text-red-400">{y.worstMonth}</td>
                        <td className={`py-2.5 px-2 text-right ${y.avgBalance >= 20000 ? 'text-green-400' : y.avgBalance >= 10000 ? 'text-yellow-400' : 'text-red-400'}`}>
                          {fmtPLN(y.avgBalance)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* ── Monthly Detail Table ── */}
            <section className="bg-mc-bg-secondary border border-mc-border rounded-lg">
              <details open>
                <summary className="px-4 py-3 cursor-pointer text-sm font-medium text-mc-text-secondary hover:text-mc-text transition-colors flex items-center gap-2">
                  <ChevronRight className="w-4 h-4 open:rotate-90 transition-transform" />
                  Szczegóły Miesięczne ({months.length} miesięcy)
                </summary>
                <div className="overflow-x-auto px-4 pb-4">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-mc-text-secondary border-b border-mc-border">
                        {[
                          ['month', 'Miesiąc'],
                          ['revenue', 'Przychód'],
                          ['total_costs', 'Koszty'],
                          ['net_cashflow', 'Net'],
                          ['margin_pct', 'Marża%'],
                          ['balance_end', 'Saldo'],
                          ['yoy_revenue_growth', 'YoY'],
                        ].map(([key, label]) => (
                          <th
                            key={key}
                            className="text-right py-2 px-2 cursor-pointer hover:text-mc-text select-none whitespace-nowrap"
                            onClick={() => toggleSort(key)}
                          >
                            {label} {sortKey === key ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                          </th>
                        ))}
                        <th className="py-2 px-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedMonths().map(m => (
                        <>
                          <tr
                            key={m.month}
                            className="border-t border-mc-border/30 hover:bg-mc-bg-tertiary/30 cursor-pointer"
                            onClick={() => setExpandedMonth(expandedMonth === m.month ? null : m.month)}
                          >
                            <td className="py-2 px-2 text-left font-mono">{m.month}</td>
                            <td className="py-2 px-2 text-right text-blue-400">{fmtPLN(m.revenue)}</td>
                            <td className="py-2 px-2 text-right text-red-400">{fmtPLN(m.total_costs)}</td>
                            <td className={`py-2 px-2 text-right font-medium ${m.net_cashflow >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {fmtPLN(m.net_cashflow)}
                            </td>
                            <td className={`py-2 px-2 text-right ${marginColor(m.margin_pct)}`}>
                              {m.margin_pct.toFixed(1)}%
                            </td>
                            <td className={`py-2 px-2 text-right ${m.balance_end >= 20000 ? 'text-green-400' : m.balance_end >= 10000 ? 'text-yellow-400' : 'text-red-400'}`}>
                              {fmtPLN(m.balance_end)}
                            </td>
                            <td className="py-2 px-2 text-right">
                              {m.yoy_revenue_growth !== null ? (
                                <span className={m.yoy_revenue_growth >= 0 ? 'text-green-400' : 'text-red-400'}>
                                  {fmtPct(m.yoy_revenue_growth)}
                                </span>
                              ) : '—'}
                            </td>
                            <td className="py-2 px-1">
                              {expandedMonth === m.month
                                ? <ChevronDown className="w-3 h-3 text-mc-text-secondary" />
                                : <ChevronRight className="w-3 h-3 text-mc-text-secondary" />}
                            </td>
                          </tr>
                          {expandedMonth === m.month && (
                            <tr key={`${m.month}-detail`} className="bg-mc-bg-tertiary/20">
                              <td colSpan={8} className="py-3 px-4">
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                  {(Object.keys(COST_LABELS) as (keyof CostBreakdown)[]).map(k => (
                                    <div key={k} className="flex items-center gap-2">
                                      <span
                                        className="w-2.5 h-2.5 rounded-full shrink-0"
                                        style={{ backgroundColor: COST_COLORS[k] }}
                                      />
                                      <span className="text-mc-text-secondary">{COST_LABELS[k]}:</span>
                                      <span className="font-medium">{fmtPLN(m.cost_breakdown[k] || 0)}</span>
                                    </div>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </section>

            {/* ── 3-Month Projection ── */}
            {apiData && apiData.projections.length > 0 && (
              <section className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4">
                <h2 className="text-sm font-medium text-mc-text-secondary uppercase tracking-wider mb-4">
                  Projekcja 3-Miesięczna
                  {apiData.projectionConfidence === 'low' && (
                    <span className="ml-2 text-yellow-400 text-xs normal-case">(niska pewność)</span>
                  )}
                </h2>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-mc-text-secondary text-xs">
                      <th className="text-left py-1">Miesiąc</th>
                      <th className="text-right py-1">Przychód</th>
                      <th className="text-right py-1">Koszty</th>
                      <th className="text-right py-1">Net</th>
                      <th className="text-right py-1">Marża</th>
                    </tr>
                  </thead>
                  <tbody>
                    {apiData.projections.map(p => {
                      const margin = p.revenue > 0 ? ((p.revenue - p.costs) / p.revenue * 100) : 0;
                      return (
                        <tr key={p.month} className="border-t border-mc-border/50">
                          <td className="py-2 font-mono text-mc-text-secondary">{p.month} ▸</td>
                          <td className="py-2 text-right text-blue-400/70">{fmtPLN(p.revenue)}</td>
                          <td className="py-2 text-right text-red-400/70">{fmtPLN(p.costs)}</td>
                          <td className={`py-2 text-right font-medium ${p.net >= 0 ? 'text-green-400/70' : 'text-red-400/70'}`}>
                            {fmtPLN(p.net)}
                          </td>
                          <td className={`py-2 text-right text-xs ${marginColor(margin)}`}>
                            {margin.toFixed(1)}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </section>
            )}

            {/* ── Data Sources ── */}
            <section className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4 text-xs text-mc-text-secondary">
              <div className="flex items-center gap-2 mb-2">
                <Info className="w-3.5 h-3.5" />
                <span className="font-medium">Źródła danych</span>
              </div>
              <p>Bank: Santander — wyciągi z konta 1119 (styczeń 2020 – marzec 2026)</p>
              <p>Koszty: ANALIZA — arkusze analizy kosztów 2023–2026</p>
              <p>Place: Zestawienie terapeutów 2025–2026</p>
              <p className="mt-1 opacity-60">Dane łączony z wielu źródeł. Wyciągi bankowe = przychód rzeczywisty; ANALIZA = podział kosztów.</p>
            </section>
          </>
        )}
      </main>
    </div>
  );
}