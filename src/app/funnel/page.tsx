'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  ChevronLeft, RefreshCw, Loader2, Phone, Globe, Search, Users,
  TrendingUp, TrendingDown, DollarSign, ArrowRight, AlertCircle, Filter
} from 'lucide-react';
import * as echarts from 'echarts/core';
import {
  BarChart, LineChart, PieChart, FunnelChart,
  BarSeriesOption, LineSeriesOption, PieSeriesOption, FunnelSeriesOption
} from 'echarts/charts';
import {
  GridComponent, TooltipComponent, LegendComponent,
  TitleComponent, DataZoomComponent
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([
  BarChart, LineChart, PieChart, FunnelChart,
  GridComponent, TooltipComponent, LegendComponent,
  TitleComponent, DataZoomComponent,
  CanvasRenderer
]);

const DARK = {
  bg: '#0d1117', cardBg: '#161b22', border: '#30363d',
  text: '#c9d1d9', textMuted: '#8b949e', gold: '#e6c364',
  green: '#3fb950', red: '#f85149', blue: '#58a6ff',
  purple: '#bc8cff', orange: '#f0883e', gridLine: '#21262d',
};

const tooltipStyle = {
  backgroundColor: DARK.cardBg,
  borderColor: DARK.border,
  textStyle: { color: DARK.text, fontSize: 12 },
};

// --- Funnel stages based on WCP's actual patient journey ---
const FUNNEL_STAGES = [
  { id: 'impression', label: 'Impressions', icon: Eye, color: DARK.purple, source: 'Google Ads / ZnanyLekarz' },
  { id: 'click', label: 'Profile Clicks', icon: MousePointer, color: DARK.blue, source: 'Google Ads / ZnanyLekarz' },
  { id: 'contact', label: 'Phone / Form Contact', icon: Phone, color: DARK.orange, source: 'Website / ZL Profile' },
  { id: 'booked', label: 'Appointment Booked', icon: Calendar, color: DARK.gold, source: 'Booknetic / Phone' },
  { id: 'completed', label: 'Session Completed', icon: CheckCircle, color: DARK.green, source: 'Booknetic / Practice Manager' },
  { id: 'returning', label: 'Returning Patient', icon: Users, color: '#79c0ff', source: 'Practice Manager' },
];

// --- Static demo data (until real API connections are built) ---
const DEMO_DATA = {
  monthly: [
    { month: '2026-01', impressions: 12500, clicks: 620, contacts: 95, booked: 68, completed: 58, returning: 22 },
    { month: '2026-02', impressions: 13800, clicks: 710, contacts: 108, booked: 78, completed: 65, returning: 25 },
    { month: '2026-03', impressions: 15200, clicks: 780, contacts: 118, booked: 82, completed: 70, returning: 28 },
    { month: '2026-04', impressions: 14500, clicks: 740, contacts: 110, booked: 75, completed: 62, returning: 24 },
  ],
  byChannel: [
    { channel: 'ZnanyLekarz', leads: 45, booked: 32, completed: 28, revenue: 7000, cpa: 0 },
    { channel: 'Google Ads', leads: 35, booked: 22, completed: 18, revenue: 4500, cpa: 59.83 },
    { channel: 'Website Direct', leads: 20, booked: 15, completed: 12, revenue: 3000, cpa: 0 },
    { channel: 'Phone', leads: 15, booked: 12, completed: 10, revenue: 2500, cpa: 0 },
    { channel: 'Referral', leads: 10, booked: 9, completed: 9, revenue: 2250, cpa: 0 },
  ],
  byLocation: [
    { location: 'Olsztyn', leads: 80, booked: 58, completed: 48, revenue: 12000 },
    { location: 'Elbląg', leads: 30, booked: 20, completed: 16, revenue: 4000 },
    { location: 'Ostróda', leads: 15, booked: 12, completed: 10, revenue: 2500 },
  ],
  latest: {
    impressions: 14500, clicks: 740, contacts: 110, booked: 75, completed: 62, returning: 24,
  },
};

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

// Missing icon imports
function Eye(props: React.SVGProps<SVGSVGElement>) { return <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>; }
function MousePointer(props: React.SVGProps<SVGSVGElement>) { return <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="m3 3 7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/></svg>; }
function Calendar(props: React.SVGProps<SVGSVGElement>) { return <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>; }
function CheckCircle(props: React.SVGProps<SVGSVGElement>) { return <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg>; }

export default function FunnelPage() {
  const [tab, setTab] = useState<'funnel' | 'channels' | 'locations'>('funnel');

  const lt = DEMO_DATA.latest;
  const prev = DEMO_DATA.monthly[DEMO_DATA.monthly.length - 2];

  // Funnel chart
  const funnelChart: Record<string, unknown> = {
    backgroundColor: DARK.bg,
    tooltip: { ...tooltipStyle, trigger: 'item' },
    series: [{
      type: 'funnel' as const,
      left: '10%', right: '10%', top: 30, bottom: 30,
      sort: 'descending' as const, gap: 4,
      label: { show: true, position: 'inside', color: DARK.text, fontSize: 12, formatter: '{b}: {c}' },
      data: [
        { name: 'Impressions', value: lt.impressions, itemStyle: { color: DARK.purple } },
        { name: 'Clicks', value: lt.clicks, itemStyle: { color: DARK.blue } },
        { name: 'Contacts', value: lt.contacts, itemStyle: { color: DARK.orange } },
        { name: 'Booked', value: lt.booked, itemStyle: { color: DARK.gold } },
        { name: 'Completed', value: lt.completed, itemStyle: { color: DARK.green } },
      ],
    }],
  };

  // Channel comparison
  const channelBar: Record<string, unknown> = {
    backgroundColor: DARK.bg,
    grid: { top: 50, right: 20, bottom: 30, left: 60 },
    tooltip: { ...tooltipStyle, trigger: 'axis' },
    legend: { top: 8, textStyle: { color: DARK.textMuted, fontSize: 11 }, data: ['Leads', 'Booked', 'Completed'] },
    xAxis: {
      type: 'category' as const,
      data: DEMO_DATA.byChannel.map(c => c.channel),
      axisLabel: { color: DARK.textMuted, fontSize: 10 },
      axisLine: { lineStyle: { color: DARK.border } },
    },
    yAxis: {
      type: 'value' as const, name: 'Patients',
      axisLabel: { color: DARK.textMuted, fontSize: 10 },
      splitLine: { lineStyle: { color: DARK.gridLine } },
    },
    series: [
      { name: 'Leads', type: 'bar' as const, data: DEMO_DATA.byChannel.map(c => c.leads), itemStyle: { color: DARK.blue } },
      { name: 'Booked', type: 'bar' as const, data: DEMO_DATA.byChannel.map(c => c.booked), itemStyle: { color: DARK.gold } },
      { name: 'Completed', type: 'bar' as const, data: DEMO_DATA.byChannel.map(c => c.completed), itemStyle: { color: DARK.green } },
    ],
  };

  // Channel CPA pie
  const revenuePie: Record<string, unknown> = {
    backgroundColor: DARK.bg,
    tooltip: { ...tooltipStyle, trigger: 'item', formatter: '{b}: {c} PLN ({d}%)' },
    series: [{
      type: 'pie' as const, radius: ['30%', '60%'],
      data: DEMO_DATA.byChannel.map((c, i) => ({
        name: c.channel, value: c.revenue,
        itemStyle: { color: [DARK.blue, DARK.purple, DARK.orange, DARK.green, DARK.gold][i] },
      })),
      label: { color: DARK.text, fontSize: 11, formatter: '{b}\n{c} PLN' },
    }],
  };

  // Location funnel
  const locationChart: Record<string, unknown> = {
    backgroundColor: DARK.bg,
    grid: { top: 50, right: 20, bottom: 30, left: 60 },
    tooltip: { ...tooltipStyle, trigger: 'axis' },
    legend: { top: 8, textStyle: { color: DARK.textMuted, fontSize: 11 }, data: ['Leads', 'Booked', 'Completed'] },
    xAxis: {
      type: 'category' as const,
      data: DEMO_DATA.byLocation.map(l => l.location),
      axisLabel: { color: DARK.textMuted, fontSize: 10 },
      axisLine: { lineStyle: { color: DARK.border } },
    },
    yAxis: {
      type: 'value' as const, name: 'Patients',
      axisLabel: { color: DARK.textMuted, fontSize: 10 },
      splitLine: { lineStyle: { color: DARK.gridLine } },
    },
    series: [
      { name: 'Leads', type: 'bar' as const, data: DEMO_DATA.byLocation.map(l => l.leads), itemStyle: { color: DARK.blue } },
      { name: 'Booked', type: 'bar' as const, data: DEMO_DATA.byLocation.map(l => l.booked), itemStyle: { color: DARK.gold } },
      { name: 'Completed', type: 'bar' as const, data: DEMO_DATA.byLocation.map(l => l.completed), itemStyle: { color: DARK.green } },
    ],
  };

  // Conversion rates
  const convRates = {
    clickToContact: lt.clicks > 0 ? (lt.contacts / lt.clicks * 100).toFixed(1) : '—',
    contactToBooked: lt.contacts > 0 ? (lt.booked / lt.contacts * 100).toFixed(1) : '—',
    bookedToCompleted: lt.booked > 0 ? (lt.completed / lt.booked * 100).toFixed(1) : '—',
    overallConversion: lt.clicks > 0 ? (lt.completed / lt.clicks * 100).toFixed(1) : '—',
    returningRate: lt.completed > 0 ? (lt.returning / lt.completed * 100).toFixed(1) : '—',
  };

  return (
    <div className="min-h-screen bg-mc-bg text-mc-text">
      {/* Header */}
      <header className="border-b border-mc-border bg-mc-bg-secondary px-4 py-3 flex items-center gap-3">
        <Link href="/" className="text-mc-text-secondary hover:text-mc-text transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <Phone className="w-5 h-5 text-mc-accent" />
        <h1 className="font-semibold text-lg">Patient Funnel</h1>
        <span className="text-xs text-mc-text-secondary ml-1">
          Lead → Booking → Session · Demo data
        </span>
      </header>

      {/* Tabs */}
      <div className="border-b border-mc-border bg-mc-bg-secondary px-4 flex gap-1">
        {(['funnel', 'channels', 'locations'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t ? 'border-mc-accent text-mc-accent' : 'border-transparent text-mc-text-secondary hover:text-mc-text'
            }`}
          >
            {t === 'funnel' ? '🔄 Funnel' : t === 'channels' ? '📡 Channels' : '📍 Locations'}
          </button>
        ))}
      </div>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Conversion rate cards */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-3 text-center">
            <div className="text-[10px] uppercase tracking-wider text-mc-text-secondary mb-1">Click → Contact</div>
            <div className="font-mono text-lg font-bold text-blue-400">{convRates.clickToContact}%</div>
          </div>
          <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-3 text-center">
            <div className="text-[10px] uppercase tracking-wider text-mc-text-secondary mb-1">Contact → Booked</div>
            <div className="font-mono text-lg font-bold text-orange-400">{convRates.contactToBooked}%</div>
          </div>
          <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-3 text-center">
            <div className="text-[10px] uppercase tracking-wider text-mc-text-secondary mb-1">Booked → Completed</div>
            <div className="font-mono text-lg font-bold text-mc-accent">{convRates.bookedToCompleted}%</div>
          </div>
          <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-3 text-center">
            <div className="text-[10px] uppercase tracking-wider text-mc-text-secondary mb-1">Overall Conversion</div>
            <div className="font-mono text-lg font-bold text-green-400">{convRates.overallConversion}%</div>
          </div>
          <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-3 text-center">
            <div className="text-[10px] uppercase tracking-wider text-mc-text-secondary mb-1">Returning Rate</div>
            <div className="font-mono text-lg font-bold text-purple-400">{convRates.returningRate}%</div>
          </div>
        </div>

        {/* FUNNEL TAB */}
        {tab === 'funnel' && (
          <>
            <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4">
              <h2 className="text-sm font-medium text-mc-text-secondary uppercase tracking-wider mb-2">
                Patient Acquisition Funnel (Latest 30 Days)
              </h2>
              <EChart option={funnelChart} height={350} />
            </div>

            {/* Stage detail cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {FUNNEL_STAGES.map((stage, i) => {
                const val = lt[stage.id as keyof typeof lt];
                const prevVal = prev[stage.id as keyof typeof prev];
                const Icon = stage.icon;
                return (
                  <div key={stage.id} className="bg-mc-bg-secondary border border-mc-border rounded-lg p-3">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Icon className="w-3.5 h-3.5" style={{ color: stage.color }} />
                      <span className="text-[10px] uppercase tracking-wider text-mc-text-secondary">{stage.label}</span>
                    </div>
                    <div className="font-mono text-lg font-bold" style={{ color: stage.color }}>
                      {typeof val === 'number' ? val.toLocaleString() : val}
                    </div>
                    <div className="text-[10px] text-mc-text-secondary mt-1">{stage.source}</div>
                  </div>
                );
              })}
            </div>

            {/* Data source notice */}
            <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <AlertCircle className="w-4 h-4 text-mc-accent" />
                <span className="text-sm font-medium text-mc-accent">Data Integration Required</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                <div className="bg-mc-bg rounded-lg p-3 border border-green-500/20">
                  <div className="text-green-400 font-medium mb-1">✅ Google Ads</div>
                  <span className="text-mc-text-secondary">Impressions, clicks, conversions already flowing from XLSX audit data</span>
                </div>
                <div className="bg-mc-bg rounded-lg p-3 border border-blue-500/20">
                  <div className="text-blue-400 font-medium mb-1">🔗 ZnanyLekarz API</div>
                  <span className="text-mc-text-secondary">Needs Docplanner API access or scraping pipeline for profile views, clicks, bookings</span>
                </div>
                <div className="bg-mc-bg rounded-lg p-3 border border-purple-500/20">
                  <div className="text-purple-400 font-medium mb-1">🔗 Booknetic</div>
                  <span className="text-mc-text-secondary">Booking data available via Booknetic webhooks or WordPress REST API</span>
                </div>
                <div className="bg-mc-bg rounded-lg p-3 border border-orange-500/20">
                  <div className="text-orange-400 font-medium mb-1">🔗 Phone Tracking</div>
                  <span className="text-mc-text-secondary">GTM dataLayer tracks phone clicks; forward tracking number needed</span>
                </div>
                <div className="bg-mc-bg rounded-lg p-3 border border-mc-accent/30">
                  <div className="text-mc-accent font-medium mb-1">🔗 Practice Manager</div>
                  <span className="text-mc-text-secondary">Ewelina tracks completions manually; needs digitized intake process</span>
                </div>
                <div className="bg-mc-bg rounded-lg p-3 border border-mc-border">
                  <div className="text-mc-text-secondary font-medium mb-1">⏳ Website Analytics</div>
                  <span className="text-mc-text-secondary">Google Analytics 4 — needs GTM events mapped to funnel stages</span>
                </div>
              </div>
            </div>
          </>
        )}

        {/* CHANNELS TAB */}
        {tab === 'channels' && (
          <>
            <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4">
              <h2 className="text-sm font-medium text-mc-text-secondary uppercase tracking-wider mb-2">
                Channel Performance: Leads → Booked → Completed
              </h2>
              <EChart option={channelBar} height={280} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4">
                <h2 className="text-sm font-medium text-mc-text-secondary uppercase tracking-wider mb-2">
                  Revenue by Channel
                </h2>
                <EChart option={revenuePie} height={260} />
              </div>

              {/* Channel table */}
              <div className="bg-mc-bg-secondary border border-mc-border rounded-lg overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-mc-border text-mc-text-secondary">
                      <th className="text-left px-3 py-2">Channel</th>
                      <th className="text-right px-3 py-2">Leads</th>
                      <th className="text-right px-3 py-2">Booked</th>
                      <th className="text-right px-3 py-2">Completed</th>
                      <th className="text-right px-3 py-2">Conv. Rate</th>
                      <th className="text-right px-3 py-2">Revenue</th>
                      <th className="text-right px-3 py-2">CPA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {DEMO_DATA.byChannel.map(ch => (
                      <tr key={ch.channel} className="border-b border-mc-border/30 hover:bg-mc-bg-tertiary">
                        <td className="px-3 py-2 font-medium">{ch.channel}</td>
                        <td className="px-3 py-2 text-right font-mono">{ch.leads}</td>
                        <td className="px-3 py-2 text-right font-mono">{ch.booked}</td>
                        <td className="px-3 py-2 text-right font-mono text-green-400">{ch.completed}</td>
                        <td className="px-3 py-2 text-right font-mono">{ch.leads > 0 ? (ch.completed / ch.leads * 100).toFixed(0) : '—'}%</td>
                        <td className="px-3 py-2 text-right font-mono text-mc-accent">{ch.revenue.toLocaleString()} PLN</td>
                        <td className="px-3 py-2 text-right font-mono">{ch.cpa > 0 ? `${ch.cpa.toFixed(0)} PLN` : 'Free'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* LOCATIONS TAB */}
        {tab === 'locations' && (
          <>
            <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4">
              <h2 className="text-sm font-medium text-mc-text-secondary uppercase tracking-wider mb-2">
                Patient Acquisition by Location
              </h2>
              <EChart option={locationChart} height={280} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {DEMO_DATA.byLocation.map(loc => (
                <div key={loc.location} className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4">
                  <h3 className="font-medium text-sm mb-3">{loc.location}</h3>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-mc-text-secondary">Leads</span>
                      <span className="font-mono">{loc.leads}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-mc-text-secondary">Booked</span>
                      <span className="font-mono">{loc.booked}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-mc-text-secondary">Completed</span>
                      <span className="font-mono text-green-400">{loc.completed}</span>
                    </div>
                    <div className="flex justify-between border-t border-mc-border/50 pt-2">
                      <span className="text-mc-text-secondary">Revenue</span>
                      <span className="font-mono text-mc-accent">{loc.revenue.toLocaleString()} PLN</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-mc-text-secondary">Conv. Rate</span>
                      <span className="font-mono">{(loc.completed / loc.leads * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Footer */}
        <div className="text-center text-xs text-mc-text-secondary pt-4 border-t border-mc-border">
          Funnel data is currently demo/estimated · Real data requires: ZnanyLekarz API, Booknetic webhooks, Phone tracking, Practice Manager input
        </div>
      </main>
    </div>
  );
}