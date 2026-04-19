'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  ChevronLeft, RefreshCw, Loader2, Megaphone, TrendingUp, TrendingDown,
  DollarSign, MousePointer, Eye, Target, AlertTriangle
} from 'lucide-react';
import * as echarts from 'echarts/core';
import {
  BarChart, LineChart, PieChart, RadarChart,
  BarSeriesOption, LineSeriesOption, PieSeriesOption
} from 'echarts/charts';
import {
  GridComponent, TooltipComponent, LegendComponent,
  TitleComponent, DataZoomComponent, MarkLineComponent
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { formatDistanceToNow } from 'date-fns';

echarts.use([
  BarChart, LineChart, PieChart, RadarChart,
  GridComponent, TooltipComponent, LegendComponent,
  TitleComponent, DataZoomComponent, MarkLineComponent,
  CanvasRenderer
]);

// --- Dark theme constants ---
const DARK = {
  bg: '#0d1117',
  cardBg: '#161b22',
  border: '#30363d',
  text: '#c9d1d9',
  textMuted: '#8b949e',
  gold: '#e6c364',
  green: '#3fb950',
  red: '#f85149',
  blue: '#58a6ff',
  purple: '#bc8cff',
  orange: '#f0883e',
  gridLine: '#21262d',
};

const CAMP_COLORS: Record<string, string> = {
  'Olsztyn Campaign': '#58a6ff',
  'Elbląg Campaign': '#3fb950',
  'Ostróda Campaign': '#f0883e',
  '[Brand] Warmińskie Centrum Psychoterapii': '#bc8cff',
  '[Search] Terapia Indywidualna': '#f85149',
};

const CONV_COLORS = ['#58a6ff', '#3fb950', '#f0883e', '#bc8cff', '#f85149', '#e6c364', '#79c0ff'];

// --- Types ---
interface TimePoint {
  date: string;
  date_label: string;
  total: {
    impressions: number;
    clicks: number;
    spend: number;
    conversions: number;
    conversion_value: number;
    ctr: number;
    avg_cpc: number;
    cpa: number;
  };
  by_campaign: Record<string, CampaignMetrics>;
  by_adgroup: Record<string, AdGroupMetrics>;
  by_conv_type: Record<string, ConvTypeMetrics>;
  keywords: { total: number; enabled: number; paused: number };
  search_terms_total: number;
}

interface CampaignMetrics {
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
  ctr: number;
  avg_cpc: number;
  conv_rate: number;
  cost_per_conv: number;
  conv_value: number;
  search_is: number;
  budget_lost_is: number;
  rank_lost_is: number;
}

interface AdGroupMetrics {
  campaign: string;
  ad_group: string;
  status: string;
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
  ctr: number;
  avg_cpc: number;
}

interface ConvTypeMetrics {
  conversions: number;
  value: number;
  category: string;
}

// --- Helpers ---
function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(n % 1 === 0 ? 0 : 1);
}

function fmtPLN(n: number): string {
  return `${n.toLocaleString('pl-PL', { maximumFractionDigits: 0 })} PLN`;
}

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function deltaIcon(current: number, previous: number) {
  if (previous === 0) return null;
  const pct = ((current - previous) / previous) * 100;
  if (pct > 5) return <TrendingUp className="w-3.5 h-3.5 text-green-400" />;
  if (pct < -5) return <TrendingDown className="w-3.5 h-3.5 text-red-400" />;
  return null;
}

// --- Chart components ---
function EChart({ option, height = 280 }: { option: Record<string, unknown>; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const inst = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    if (!inst.current) inst.current = echarts.init(ref.current, undefined, { renderer: 'canvas' });
    inst.current.setOption(option, true);
    const ro = new ResizeObserver(() => inst.current?.resize());
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [option]);

  useEffect(() => () => { inst.current?.dispose(); inst.current = null; }, []);

  return <div ref={ref} style={{ width: '100%', height: `${height}px` }} />;
}

const tooltipStyle = {
  backgroundColor: DARK.cardBg,
  borderColor: DARK.border,
  textStyle: { color: DARK.text, fontSize: 12 },
};

// --- Main component ---
export default function AdvertisingPage() {
  const [ts, setTs] = useState<TimePoint[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'overview' | 'campaigns' | 'adgroups' | 'conversions'>('overview');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/ads-chart-data.json');
      if (!res.ok) throw new Error('Failed');
      const json = await res.json();
      setTs(json.time_series);
    } catch {
      setError('Failed to load advertising data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) return (
    <div className="min-h-screen bg-mc-bg flex items-center justify-center">
      <Loader2 className="w-6 h-6 animate-spin text-mc-text-secondary" />
    </div>
  );

  if (error || !ts) return (
    <div className="min-h-screen bg-mc-bg flex items-center justify-center text-red-400">{error}</div>
  );

  const latest = ts[ts.length - 1];
  const prev = ts.length > 1 ? ts[ts.length - 2] : null;
  const lt = latest.total;

  // --- Time series chart options ---
  const spendOverTime: Record<string, unknown> = {
    backgroundColor: DARK.bg,
    grid: { top: 50, right: 60, bottom: 40, left: 70 },
    tooltip: { ...tooltipStyle, trigger: 'axis' },
    legend: { top: 8, textStyle: { color: DARK.textMuted, fontSize: 11 }, data: ['Spend (PLN)', 'Conversions'] },
    xAxis: {
      type: 'category' as const,
      data: ts.map(t => t.date_label),
      axisLine: { lineStyle: { color: DARK.border } },
      axisLabel: { color: DARK.textMuted, fontSize: 11 },
    },
    yAxis: [
      { type: 'value' as const, name: 'PLN', axisLabel: { color: DARK.textMuted, fontSize: 10 }, splitLine: { lineStyle: { color: DARK.gridLine } } },
      { type: 'value' as const, name: 'Conv.', axisLabel: { color: DARK.textMuted, fontSize: 10 }, splitLine: { show: false } },
    ],
    series: [
      {
        name: 'Spend (PLN)', type: 'bar' as const, data: ts.map(t => t.total.spend),
        itemStyle: { color: DARK.blue }, barWidth: '40%',
      },
      {
        name: 'Conversions', type: 'line' as const, yAxisIndex: 1,
        data: ts.map(t => t.total.conversions), smooth: true,
        lineStyle: { color: DARK.green, width: 2 }, symbol: 'circle', symbolSize: 6,
        itemStyle: { color: DARK.green },
      },
    ],
  };

  // Campaign spend breakdown (latest)
  const campaignNames = Object.keys(latest.by_campaign);
  const campaignSpendPie: Record<string, unknown> = {
    backgroundColor: DARK.bg,
    tooltip: { ...tooltipStyle, trigger: 'item', formatter: '{b}: {c} PLN ({d}%)' },
    series: [{
      type: 'pie' as const, radius: ['35%', '65%'],
      data: campaignNames.map((name, i) => ({
        name, value: latest.by_campaign[name].spend,
        itemStyle: { color: CAMP_COLORS[name] || CONV_COLORS[i % CONV_COLORS.length] },
      })),
      label: { color: DARK.text, fontSize: 11 },
      emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.5)' } },
    }],
  };

  // Campaign metrics comparison (multi-bar)
  const campaignCompare: Record<string, unknown> = {
    backgroundColor: DARK.bg,
    grid: { top: 50, right: 20, bottom: 40, left: 70 },
    tooltip: { ...tooltipStyle, trigger: 'axis' },
    legend: { top: 8, textStyle: { color: DARK.textMuted, fontSize: 11 } },
    xAxis: {
      type: 'category' as const,
      data: campaignNames.map(n => n.length > 20 ? n.slice(0, 18) + '…' : n),
      axisLabel: { color: DARK.textMuted, fontSize: 10, rotate: 15 },
      axisLine: { lineStyle: { color: DARK.border } },
    },
    yAxis: [
      { type: 'value' as const, name: 'Spend (PLN)', axisLabel: { color: DARK.textMuted, fontSize: 10 }, splitLine: { lineStyle: { color: DARK.gridLine } } },
      { type: 'value' as const, name: 'Conversions', axisLabel: { color: DARK.textMuted, fontSize: 10 }, splitLine: { show: false } },
    ],
    series: [
      {
        name: 'Spend', type: 'bar' as const,
        data: campaignNames.map(n => latest.by_campaign[n].spend),
        itemStyle: { color: DARK.blue },
      },
      {
        name: 'Conversions', type: 'bar' as const, yAxisIndex: 1,
        data: campaignNames.map(n => latest.by_campaign[n].conversions),
        itemStyle: { color: DARK.green },
      },
    ],
  };

  // CTR & CPC trend
  const ctrCpcTrend: Record<string, unknown> = {
    backgroundColor: DARK.bg,
    grid: { top: 50, right: 60, bottom: 40, left: 70 },
    tooltip: { ...tooltipStyle, trigger: 'axis' },
    legend: { top: 8, textStyle: { color: DARK.textMuted, fontSize: 11 } },
    xAxis: {
      type: 'category' as const, data: ts.map(t => t.date_label),
      axisLabel: { color: DARK.textMuted, fontSize: 11 },
      axisLine: { lineStyle: { color: DARK.border } },
    },
    yAxis: [
      { type: 'value' as const, name: 'CTR %', axisLabel: { color: DARK.textMuted, fontSize: 10 }, splitLine: { lineStyle: { color: DARK.gridLine } } },
      { type: 'value' as const, name: 'CPC (PLN)', axisLabel: { color: DARK.textMuted, fontSize: 10 }, splitLine: { show: false } },
    ],
    series: [
      {
        name: 'CTR %', type: 'line' as const, data: ts.map(t => +(t.total.ctr * 100).toFixed(2)),
        smooth: true, lineStyle: { color: DARK.purple, width: 2 },
        itemStyle: { color: DARK.purple }, symbol: 'circle', symbolSize: 6,
      },
      {
        name: 'Avg CPC', type: 'line' as const, yAxisIndex: 1,
        data: ts.map(t => t.total.avg_cpc),
        smooth: true, lineStyle: { color: DARK.orange, width: 2 },
        itemStyle: { color: DARK.orange }, symbol: 'diamond', symbolSize: 6,
      },
    ],
  };

  // Impression Share breakdown
  const isData = campaignNames.map(n => ({
    name: n.length > 20 ? n.slice(0, 18) + '…' : n,
    search_is: latest.by_campaign[n].search_is * 100,
    budget_lost: latest.by_campaign[n].budget_lost_is * 100,
    rank_lost: latest.by_campaign[n].rank_lost_is * 100,
    available: 100 - (latest.by_campaign[n].search_is * 100) - (latest.by_campaign[n].budget_lost_is * 100) - (latest.by_campaign[n].rank_lost_is * 100),
  }));

  const impressionShareChart: Record<string, unknown> = {
    backgroundColor: DARK.bg,
    grid: { top: 50, right: 20, bottom: 40, left: 70 },
    tooltip: { ...tooltipStyle, trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { top: 8, textStyle: { color: DARK.textMuted, fontSize: 11 }, data: ['Won IS', 'Lost to Budget', 'Lost to Rank', 'Other'] },
    xAxis: {
      type: 'category' as const, data: isData.map(d => d.name),
      axisLabel: { color: DARK.textMuted, fontSize: 10, rotate: 15 },
      axisLine: { lineStyle: { color: DARK.border } },
    },
    yAxis: { type: 'value' as const, name: '%', max: 100, axisLabel: { color: DARK.textMuted }, splitLine: { lineStyle: { color: DARK.gridLine } } },
    series: [
      { name: 'Won IS', type: 'bar' as const, stack: 'share', data: isData.map(d => +d.search_is.toFixed(1)), itemStyle: { color: DARK.green } },
      { name: 'Lost to Budget', type: 'bar' as const, stack: 'share', data: isData.map(d => +d.budget_lost.toFixed(1)), itemStyle: { color: DARK.red } },
      { name: 'Lost to Rank', type: 'bar' as const, stack: 'share', data: isData.map(d => +d.rank_lost.toFixed(1)), itemStyle: { color: DARK.orange } },
      { name: 'Other', type: 'bar' as const, stack: 'share', data: isData.map(d => Math.max(0, +d.available.toFixed(1))), itemStyle: { color: DARK.gridLine } },
    ],
  };

  // Conversion funnel
  const convTypes = Object.entries(latest.by_conv_type).sort((a, b) => b[1].conversions - a[1].conversions);
  const convPie: Record<string, unknown> = {
    backgroundColor: DARK.bg,
    tooltip: { ...tooltipStyle, trigger: 'item', formatter: '{b}<br/>{c} conversions ({d}%)' },
    series: [{
      type: 'pie' as const, radius: ['30%', '60%'], center: ['50%', '55%'],
      data: convTypes.map(([name, d], i) => ({
        name: name.length > 30 ? name.slice(0, 28) + '…' : name,
        value: d.conversions,
        itemStyle: { color: CONV_COLORS[i % CONV_COLORS.length] },
      })),
      label: { color: DARK.text, fontSize: 10, formatter: '{b}\n{c} conv' },
    }],
  };

  // Ad Group spend bar (latest)
  const agEntries = Object.entries(latest.by_adgroup)
    .filter(([, d]) => d.spend > 0)
    .sort((a, b) => b[1].spend - a[1].spend);
  const adGroupBar: Record<string, unknown> = {
    backgroundColor: DARK.bg,
    grid: { top: 30, right: 20, bottom: 10, left: 200 },
    tooltip: { ...tooltipStyle, trigger: 'axis' },
    xAxis: { type: 'value' as const, name: 'PLN', axisLabel: { color: DARK.textMuted, fontSize: 10 }, splitLine: { lineStyle: { color: DARK.gridLine } } },
    yAxis: {
      type: 'category' as const,
      data: agEntries.map(([k]) => k.length > 30 ? k.slice(0, 28) + '…' : k),
      axisLabel: { color: DARK.textMuted, fontSize: 10 },
    },
    series: [{
      type: 'bar' as const,
      data: agEntries.map(([k, d]) => ({
        value: d.spend,
        itemStyle: { color: CAMP_COLORS[d.campaign] || DARK.blue },
      })),
      barWidth: '60%',
    }],
  };

  // KPI cards
  const kpis = [
    { label: 'Spend (30d)', value: fmtPLN(lt.spend), icon: DollarSign, color: DARK.blue, delta: prev ? lt.spend - prev.total.spend : null },
    { label: 'Impressions', value: fmt(lt.impressions), icon: Eye, color: DARK.purple, delta: prev ? lt.impressions - prev.total.impressions : null },
    { label: 'Clicks', value: fmt(lt.clicks), icon: MousePointer, color: DARK.orange, delta: prev ? lt.clicks - prev.total.clicks : null },
    { label: 'Conversions', value: fmt(lt.conversions), icon: Target, color: DARK.green, delta: prev ? lt.conversions - prev.total.conversions : null },
    { label: 'CTR', value: `${(lt.ctr * 100).toFixed(2)}%`, icon: TrendingUp, color: DARK.purple, delta: prev ? lt.ctr - prev.total.ctr : null },
    { label: 'Avg CPC', value: `${lt.avg_cpc.toFixed(2)} PLN`, icon: DollarSign, color: DARK.orange, delta: prev ? lt.avg_cpc - prev.total.avg_cpc : null },
    { label: 'CPA', value: lt.cpa > 0 ? `${lt.cpa.toFixed(2)} PLN` : '—', icon: DollarSign, color: DARK.red, delta: prev && lt.cpa > 0 && prev.total.cpa > 0 ? lt.cpa - prev.total.cpa : null },
    { label: 'Conv. Value', value: fmtPLN(lt.conversion_value), icon: DollarSign, color: DARK.gold, delta: prev ? lt.conversion_value - prev.total.conversion_value : null },
  ];

  return (
    <div className="min-h-screen bg-mc-bg text-mc-text">
      {/* Header */}
      <header className="border-b border-mc-border bg-mc-bg-secondary px-4 py-3 flex items-center gap-3">
        <Link href="/" className="text-mc-text-secondary hover:text-mc-text transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <Megaphone className="w-5 h-5 text-mc-accent" />
        <h1 className="font-semibold text-lg">Google Ads Breakdown</h1>
        <span className="text-xs text-mc-text-secondary ml-1">
          Last audit: {latest.date} · 8 snapshots
        </span>
        <div className="ml-auto flex items-center gap-3">
          <button onClick={load} className="p-1.5 hover:bg-mc-bg-tertiary rounded text-mc-text-secondary">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <Link href="/documents?category=advertising" className="text-xs px-3 py-1.5 bg-mc-accent/10 text-mc-accent border border-mc-accent/30 rounded hover:bg-mc-accent/20">
            Upload export →
          </Link>
        </div>
      </header>

      {/* Tabs */}
      <div className="border-b border-mc-border bg-mc-bg-secondary px-4 flex gap-1">
        {(['overview', 'campaigns', 'adgroups', 'conversions'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t
                ? 'border-mc-accent text-mc-accent'
                : 'border-transparent text-mc-text-secondary hover:text-mc-text'
            }`}
          >
            {t === 'overview' ? '📊 Overview' : t === 'campaigns' ? '🏪 Campaigns' : t === 'adgroups' ? '📂 Ad Groups' : '🎯 Conversions'}
          </button>
        ))}
      </div>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* === OVERVIEW TAB === */}
        {tab === 'overview' && (
          <>
            {/* KPI cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
              {kpis.map(kpi => (
                <div key={kpi.label} className="bg-mc-bg-secondary border border-mc-border rounded-lg p-3">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <kpi.icon className="w-3.5 h-3.5" style={{ color: kpi.color }} />
                    <span className="text-[10px] uppercase tracking-wider text-mc-text-secondary">{kpi.label}</span>
                  </div>
                  <div className="font-mono text-sm font-bold" style={{ color: kpi.color }}>{kpi.value}</div>
                  {kpi.delta !== null && kpi.delta !== 0 && (
                    <div className="flex items-center gap-1 mt-1 text-[10px]">
                      {deltaIcon(lt.spend, prev?.total.spend ?? 0)}
                      <span className={kpi.delta > 0 ? 'text-green-400' : 'text-red-400'}>
                        {kpi.delta > 0 ? '+' : ''}{kpi.delta.toFixed(0)}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Spend + Conversions over time */}
            <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4">
              <h2 className="text-sm font-medium text-mc-text-secondary uppercase tracking-wider mb-2">
                Spend & Conversions — 8 Audit Snapshots (Mar–Apr 2026)
              </h2>
              <EChart option={spendOverTime} height={260} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Campaign spend pie */}
              <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4">
                <h2 className="text-sm font-medium text-mc-text-secondary uppercase tracking-wider mb-2">
                  Campaign Spend Distribution (Latest)
                </h2>
                <EChart option={campaignSpendPie} height={260} />
              </div>

              {/* CTR & CPC trend */}
              <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4">
                <h2 className="text-sm font-medium text-mc-text-secondary uppercase tracking-wider mb-2">
                  CTR & CPC Trend
                </h2>
                <EChart option={ctrCpcTrend} height={260} />
              </div>
            </div>

            {/* Impression Share */}
            <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4">
              <h2 className="text-sm font-medium text-mc-text-secondary uppercase tracking-wider mb-2">
                Search Impression Share Breakdown (Latest)
              </h2>
              <EChart option={impressionShareChart} height={240} />
            </div>

            {/* Keyword & Search Term Summary */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-mc-accent">{latest.keywords.total}</div>
                <div className="text-xs text-mc-text-secondary mt-1">Total Keywords</div>
              </div>
              <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-green-400">{latest.keywords.enabled}</div>
                <div className="text-xs text-mc-text-secondary mt-1">Enabled Keywords</div>
              </div>
              <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-mc-text-secondary">{latest.keywords.paused}</div>
                <div className="text-xs text-mc-text-secondary mt-1">Paused Keywords</div>
              </div>
            </div>

            <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-purple-400">{latest.search_terms_total}</div>
              <div className="text-xs text-mc-text-secondary mt-1">Search Terms Triggering Ads (Latest 30d)</div>
            </div>
          </>
        )}

        {/* === CAMPAIGNS TAB === */}
        {tab === 'campaigns' && (
          <>
            <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4">
              <h2 className="text-sm font-medium text-mc-text-secondary uppercase tracking-wider mb-2">
                Campaign Spend vs Conversions (Latest Snapshot)
              </h2>
              <EChart option={campaignCompare} height={280} />
            </div>

            {/* Campaign detail cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {campaignNames.map((name, i) => {
                const c = latest.by_campaign[name];
                const color = CAMP_COLORS[name] || CONV_COLORS[i];
                return (
                  <div key={name} className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                      <h3 className="font-medium text-sm truncate" title={name}>{name}</h3>
                    </div>
                    <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-xs">
                      <div><span className="text-mc-text-secondary">Impressions</span><br/><span className="font-mono">{fmt(c.impressions)}</span></div>
                      <div><span className="text-mc-text-secondary">Clicks</span><br/><span className="font-mono">{fmt(c.clicks)}</span></div>
                      <div><span className="text-mc-text-secondary">Spend</span><br/><span className="font-mono" style={{ color }}>{fmtPLN(c.spend)}</span></div>
                      <div><span className="text-mc-text-secondary">Conversions</span><br/><span className="font-mono text-green-400">{c.conversions}</span></div>
                      <div><span className="text-mc-text-secondary">CTR</span><br/><span className="font-mono">{(c.ctr * 100).toFixed(2)}%</span></div>
                      <div><span className="text-mc-text-secondary">Avg CPC</span><br/><span className="font-mono">{c.avg_cpc.toFixed(2)} PLN</span></div>
                      <div><span className="text-mc-text-secondary">CPC/Conv</span><br/><span className="font-mono">{c.cost_per_conv > 0 ? fmtPLN(c.cost_per_conv) : '—'}</span></div>
                      <div><span className="text-mc-text-secondary">Conv. Value</span><br/><span className="font-mono text-mc-accent">{c.conv_value > 0 ? fmtPLN(c.conv_value) : '—'}</span></div>
                    </div>
                    {/* Impression Share bar */}
                    <div className="mt-3 pt-2 border-t border-mc-border/50">
                      <div className="text-[10px] text-mc-text-secondary mb-1">Search Impression Share</div>
                      <div className="h-2 rounded-full bg-mc-bg overflow-hidden flex">
                        <div className="h-full bg-green-500 rounded-l-full" style={{ width: `${c.search_is * 100}%` }} title={`Won: ${(c.search_is * 100).toFixed(1)}%`} />
                        <div className="h-full bg-red-500" style={{ width: `${c.budget_lost_is * 100}%` }} title={`Lost to Budget: ${(c.budget_lost_is * 100).toFixed(1)}%`} />
                        <div className="h-full bg-orange-500" style={{ width: `${c.rank_lost_is * 100}%` }} title={`Lost to Rank: ${(c.rank_lost_is * 100).toFixed(1)}%`} />
                      </div>
                      <div className="flex justify-between text-[9px] text-mc-text-secondary mt-1">
                        <span>Won {(c.search_is * 100).toFixed(0)}%</span>
                        <span>Budget {(c.budget_lost_is * 100).toFixed(0)}%</span>
                        <span>Rank {(c.rank_lost_is * 100).toFixed(0)}%</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* === AD GROUPS TAB === */}
        {tab === 'adgroups' && (
          <>
            <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4">
              <h2 className="text-sm font-medium text-mc-text-secondary uppercase tracking-wider mb-2">
                Ad Group Spend (Latest Snapshot)
              </h2>
              <EChart option={adGroupBar} height={Math.max(280, agEntries.length * 28 + 40)} />
            </div>

            {/* Ad Group table */}
            <div className="bg-mc-bg-secondary border border-mc-border rounded-lg overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-mc-border text-mc-text-secondary">
                    <th className="text-left px-3 py-2">Campaign</th>
                    <th className="text-left px-3 py-2">Ad Group</th>
                    <th className="text-left px-3 py-2">Status</th>
                    <th className="text-right px-3 py-2">Impressions</th>
                    <th className="text-right px-3 py-2">Clicks</th>
                    <th className="text-right px-3 py-2">CTR</th>
                    <th className="text-right px-3 py-2">CPC</th>
                    <th className="text-right px-3 py-2">Spend</th>
                    <th className="text-right px-3 py-2">Conversions</th>
                  </tr>
                </thead>
                <tbody>
                  {agEntries.map(([key, d]) => (
                    <tr key={key} className="border-b border-mc-border/30 hover:bg-mc-bg-tertiary">
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: CAMP_COLORS[d.campaign] || DARK.blue }} />
                          <span className="truncate max-w-[120px]" title={d.campaign}>{d.campaign}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 font-medium">{d.ad_group}</td>
                      <td className="px-3 py-2">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                          d.status === 'enabled' ? 'bg-green-500/20 text-green-400' : 'bg-mc-bg text-mc-text-secondary'
                        }`}>{d.status}</span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono">{fmt(d.impressions)}</td>
                      <td className="px-3 py-2 text-right font-mono">{fmt(d.clicks)}</td>
                      <td className="px-3 py-2 text-right font-mono">{(d.ctr * 100).toFixed(1)}%</td>
                      <td className="px-3 py-2 text-right font-mono">{d.avg_cpc.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right font-mono" style={{ color: CAMP_COLORS[d.campaign] || DARK.blue }}>{d.spend.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right font-mono text-green-400">{d.conversions}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* === CONVERSIONS TAB === */}
        {tab === 'conversions' && (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4">
                <h2 className="text-sm font-medium text-mc-text-secondary uppercase tracking-wider mb-2">
                  Conversion Types (Latest Snapshot)
                </h2>
                <EChart option={convPie} height={300} />
              </div>

              {/* Conversion value summary */}
              <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4">
                <h2 className="text-sm font-medium text-mc-text-secondary uppercase tracking-wider mb-4">
                  Conversion Value Breakdown
                </h2>
                <div className="space-y-3">
                  {convTypes.map(([name, d], i) => (
                    <div key={name} className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: CONV_COLORS[i % CONV_COLORS.length] }} />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium truncate" title={name}>{name}</div>
                        <div className="text-[10px] text-mc-text-secondary">{d.category}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-mono">{d.conversions} conv</div>
                        <div className="text-xs font-mono text-mc-accent">{fmtPLN(d.value)}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 pt-3 border-t border-mc-border/50 flex justify-between">
                  <span className="text-sm font-medium">Total</span>
                  <div className="text-right">
                    <span className="font-mono text-green-400">{convTypes.reduce((s, [, d]) => s + d.conversions, 0)} conv</span>
                    <span className="mx-2 text-mc-text-secondary">·</span>
                    <span className="font-mono text-mc-accent">{fmtPLN(convTypes.reduce((s, [, d]) => s + d.value, 0))}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Conversion trends over time */}
            <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4">
              <h2 className="text-sm font-medium text-mc-text-secondary uppercase tracking-wider mb-2">
                Total Conversions & Value Over Time
              </h2>
              <EChart option={{
                backgroundColor: DARK.bg,
                grid: { top: 50, right: 60, bottom: 40, left: 70 },
                tooltip: { ...tooltipStyle, trigger: 'axis' },
                legend: { top: 8, textStyle: { color: DARK.textMuted, fontSize: 11 } },
                xAxis: {
                  type: 'category' as const, data: ts.map(t => t.date_label),
                  axisLabel: { color: DARK.textMuted, fontSize: 11 },
                  axisLine: { lineStyle: { color: DARK.border } },
                },
                yAxis: [
                  { type: 'value' as const, name: 'Conversions', axisLabel: { color: DARK.textMuted, fontSize: 10 }, splitLine: { lineStyle: { color: DARK.gridLine } } },
                  { type: 'value' as const, name: 'Value (PLN)', axisLabel: { color: DARK.textMuted, fontSize: 10 }, splitLine: { show: false } },
                ],
                series: [
                  {
                    name: 'Conversions', type: 'bar' as const,
                    data: ts.map(t => Object.values(t.by_conv_type).reduce((s, d) => s + d.conversions, 0)),
                    itemStyle: { color: DARK.green },
                  },
                  {
                    name: 'Conv. Value', type: 'line' as const, yAxisIndex: 1, smooth: true,
                    data: ts.map(t => Object.values(t.by_conv_type).reduce((s, d) => s + d.value, 0)),
                    lineStyle: { color: DARK.gold, width: 2 },
                    itemStyle: { color: DARK.gold }, symbol: 'circle', symbolSize: 6,
                  },
                ],
              }} height={260} />
            </div>
          </>
        )}

        {/* Data source footer */}
        <div className="text-center text-xs text-mc-text-secondary pt-4 border-t border-mc-border">
          Data from 8 Google Ads Script audits (2026-03-12 → 2026-04-17) · Account 709-550-9131 · LAST_30_DAYS range per audit
        </div>
      </main>
    </div>
  );
}