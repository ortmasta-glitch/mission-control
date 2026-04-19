'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  ChevronLeft, RefreshCw, Loader2, Star, AlertTriangle,
  TrendingUp, TrendingDown, MessageSquare, Clock, Shield, ThumbsUp, ThumbsDown
} from 'lucide-react';
import * as echarts from 'echarts/core';
import {
  BarChart, LineChart, PieChart,
  BarSeriesOption, LineSeriesOption, PieSeriesOption
} from 'echarts/charts';
import {
  GridComponent, TooltipComponent, LegendComponent,
  TitleComponent, DataZoomComponent
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { formatDistanceToNow, format, parseISO } from 'date-fns';
import { pl } from 'date-fns/locale';

echarts.use([
  BarChart, LineChart, PieChart,
  GridComponent, TooltipComponent, LegendComponent,
  TitleComponent, DataZoomComponent,
  CanvasRenderer
]);

// --- Dark theme ---
const DARK = {
  bg: '#0d1117', cardBg: '#161b22', border: '#30363d',
  text: '#c9d1d9', textMuted: '#8b949e', gold: '#e6c364',
  green: '#3fb950', red: '#f85149', blue: '#58a6ff',
  purple: '#bc8cff', orange: '#f0883e', gridLine: '#21262d',
};

// --- Types ---
interface ReviewData {
  scrape_timestamp: string;
  total_reviews: number;
  scraped_reviews: number;
  rating: number;
  sources: {
    znanyLekarz: { total: number; scraped: number; rating: number };
    google: { total: number; scraped: number; rating: number; note?: string };
  };
  reviews: Review[];
  monthly_counts: Record<string, number>;
  sentiment_counts: { positive: number; negative: number; neutral: number };
  by_therapist: Record<string, { positive: number; negative: number; neutral: number; total: number; avg_rating: number }>;
  last_negative: Review | null;
}

interface Review {
  source: string;
  location: string;
  reviewer: string;
  date: string;
  text: string;
  therapist: string;
  rating: number;
  sentiment: string;
  verified: boolean;
}

// --- Chart component ---
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

// --- Main ---
export default function ReviewsPage() {
  const [data, setData] = useState<ReviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'positive' | 'negative' | 'neutral'>('all');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'znanyLekarz' | 'google'>('all');

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/reviews-data.json');
      if (!res.ok) throw new Error('Failed');
      setData(await res.json());
    } catch {
      setData(null);
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

  if (!data) return (
    <div className="min-h-screen bg-mc-bg flex items-center justify-center text-red-400">
      Failed to load review data
    </div>
  );

  const filtered = data.reviews.filter(r => {
    if (filter !== 'all' && r.sentiment !== filter) return false;
    if (sourceFilter !== 'all' && r.source !== sourceFilter) return false;
    return true;
  });

  // --- Charts ---
  const months = Object.keys(data.monthly_counts).sort();
  const reviewTimeline: Record<string, unknown> = {
    backgroundColor: DARK.bg,
    grid: { top: 40, right: 20, bottom: 30, left: 50 },
    tooltip: { ...tooltipStyle, trigger: 'axis' },
    xAxis: {
      type: 'category' as const, data: months,
      axisLabel: { color: DARK.textMuted, fontSize: 10, rotate: 30 },
      axisLine: { lineStyle: { color: DARK.border } },
    },
    yAxis: {
      type: 'value' as const, name: 'Reviews',
      axisLabel: { color: DARK.textMuted, fontSize: 10 },
      splitLine: { lineStyle: { color: DARK.gridLine } },
    },
    series: [{
      name: 'Reviews', type: 'bar' as const, data: months.map(m => data.monthly_counts[m]),
      itemStyle: { color: DARK.blue },
    }],
  };

  const sentimentPie: Record<string, unknown> = {
    backgroundColor: DARK.bg,
    tooltip: { ...tooltipStyle, trigger: 'item' },
    series: [{
      type: 'pie' as const, radius: ['35%', '60%'],
      data: [
        { name: 'Positive', value: data.sentiment_counts.positive, itemStyle: { color: DARK.green } },
        { name: 'Neutral', value: data.sentiment_counts.neutral, itemStyle: { color: DARK.orange } },
        { name: 'Negative', value: data.sentiment_counts.negative, itemStyle: { color: DARK.red } },
      ],
      label: { color: DARK.text, fontSize: 12, formatter: '{b}\n{c} ({d}%)' },
    }],
  };

  const therapistNames = Object.keys(data.by_therapist);
  const therapistBar: Record<string, unknown> = {
    backgroundColor: DARK.bg,
    grid: { top: 30, right: 20, bottom: 30, left: 160 },
    tooltip: { ...tooltipStyle, trigger: 'axis' },
    xAxis: { type: 'value' as const, name: 'Reviews', axisLabel: { color: DARK.textMuted, fontSize: 10 }, splitLine: { lineStyle: { color: DARK.gridLine } } },
    yAxis: {
      type: 'category' as const,
      data: therapistNames.map(n => n.length > 25 ? n.slice(0, 23) + '…' : n),
      axisLabel: { color: DARK.textMuted, fontSize: 10 },
    },
    series: [
      { name: 'Positive', type: 'bar' as const, stack: 'sent', data: therapistNames.map(n => data.by_therapist[n].positive), itemStyle: { color: DARK.green } },
      { name: 'Negative', type: 'bar' as const, stack: 'sent', data: therapistNames.map(n => data.by_therapist[n].negative), itemStyle: { color: DARK.red } },
    ],
  };

  const zlTotal = data.sources.znanyLekarz.total;
  const gTotal = data.sources.google.total;
  const total = zlTotal + gTotal;

  return (
    <div className="min-h-screen bg-mc-bg text-mc-text">
      {/* Header */}
      <header className="border-b border-mc-border bg-mc-bg-secondary px-4 py-3 flex items-center gap-3">
        <Link href="/" className="text-mc-text-secondary hover:text-mc-text transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <Star className="w-5 h-5 text-mc-accent" />
        <h1 className="font-semibold text-lg">Review Pulse</h1>
        <span className="text-xs text-mc-text-secondary ml-1">
          Last scan: {format(parseISO(data.scrape_timestamp), 'd MMM yyyy, HH:mm', { locale: pl })}
        </span>
        <div className="ml-auto">
          <button onClick={load} className="p-1.5 hover:bg-mc-bg-tertiary rounded text-mc-text-secondary">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* KPI row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Star className="w-3.5 h-3.5 text-mc-accent" />
              <span className="text-[10px] uppercase tracking-wider text-mc-text-secondary">Total Reviews</span>
            </div>
            <div className="font-mono text-lg font-bold text-mc-accent">{total}</div>
          </div>

          <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <MessageSquare className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-[10px] uppercase tracking-wider text-mc-text-secondary">ZnanyLekarz</span>
            </div>
            <div className="font-mono text-lg font-bold text-blue-400">{zlTotal}</div>
            <div className="text-[10px] text-mc-text-secondary">{data.sources.znanyLekarz.rating}/5 ⭐</div>
          </div>

          <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <MessageSquare className="w-3.5 h-3.5 text-red-400" />
              <span className="text-[10px] uppercase tracking-wider text-mc-text-secondary">Google</span>
            </div>
            <div className="font-mono text-lg font-bold text-red-400">{gTotal || '—'}</div>
            <div className="text-[10px] text-mc-text-secondary">{gTotal ? `${data.sources.google.rating}/5 ⭐` : 'Not connected'}</div>
          </div>

          <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <ThumbsUp className="w-3.5 h-3.5 text-green-400" />
              <span className="text-[10px] uppercase tracking-wider text-mc-text-secondary">Positive</span>
            </div>
            <div className="font-mono text-lg font-bold text-green-400">{data.sentiment_counts.positive}</div>
            <div className="text-[10px] text-mc-text-secondary">
              {data.scraped_reviews > 0 ? `${((data.sentiment_counts.positive / data.scraped_reviews) * 100).toFixed(0)}%` : '—'}
            </div>
          </div>

          <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <ThumbsDown className="w-3.5 h-3.5 text-red-400" />
              <span className="text-[10px] uppercase tracking-wider text-mc-text-secondary">Negative</span>
            </div>
            <div className="font-mono text-lg font-bold text-red-400">{data.sentiment_counts.negative}</div>
          </div>

          <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Shield className="w-3.5 h-3.5 text-mc-text-secondary" />
              <span className="text-[10px] uppercase tracking-wider text-mc-text-secondary">Verified</span>
            </div>
            <div className="font-mono text-lg font-bold text-mc-text">{data.reviews.filter(r => r.verified).length}</div>
            <div className="text-[10px] text-mc-text-secondary">of {data.scraped_reviews} scraped</div>
          </div>
        </div>

        {/* Alert: latest negative review */}
        {data.last_negative && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-red-400" />
              <span className="text-sm font-medium text-red-400">Latest Negative Review</span>
              <span className="text-xs text-mc-text-secondary ml-auto">
                {formatDistanceToNow(parseISO(data.last_negative.date), { addSuffix: true, locale: pl })}
              </span>
            </div>
            <p className="text-sm text-mc-text mb-2">&ldquo;{data.last_negative.text}&rdquo;</p>
            <div className="flex gap-3 text-xs text-mc-text-secondary">
              <span>📅 {data.last_negative.date}</span>
              <span>👤 {data.last_negative.therapist}</span>
              <span>📍 {data.last_negative.source}</span>
            </div>
            <div className="mt-2 text-xs text-mc-text-secondary">
              ⚡ Action: Respond within 48h. Consider reaching out directly to the patient.
            </div>
          </div>
        )}

        {/* Charts row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4">
            <h2 className="text-sm font-medium text-mc-text-secondary uppercase tracking-wider mb-2">
              Review Volume Over Time
            </h2>
            <EChart option={reviewTimeline} height={240} />
          </div>

          <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4">
            <h2 className="text-sm font-medium text-mc-text-secondary uppercase tracking-wider mb-2">
              Sentiment Breakdown
            </h2>
            <EChart option={sentimentPie} height={240} />
          </div>

          <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4">
            <h2 className="text-sm font-medium text-mc-text-secondary uppercase tracking-wider mb-2">
              Reviews by Therapist
            </h2>
            <EChart option={therapistBar} height={240} />
          </div>
        </div>

        {/* Google Business Profile - connect prompt */}
        {gTotal === 0 && (
          <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
                <MessageSquare className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h3 className="text-sm font-medium">Connect Google Business Profile</h3>
                <p className="text-xs text-mc-text-secondary mt-1">
                  Link your 3 Google Business accounts (Olsztyn, Elbląg, Ostróda) to auto-import Google reviews.
                  Requires Google Business Profile API access.
                </p>
              </div>
              <button className="ml-auto px-4 py-2 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-lg text-sm hover:bg-blue-500/30 transition-colors">
                Connect →
              </button>
            </div>
          </div>
        )}

        {/* Review feed */}
        <div className="bg-mc-bg-secondary border border-mc-border rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-mc-border flex items-center gap-3">
            <h2 className="text-sm font-medium">Latest Reviews</h2>
            <div className="ml-auto flex gap-1.5">
              {(['all', 'positive', 'negative'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-2.5 py-1 text-[10px] uppercase tracking-wider rounded transition-colors ${
                    filter === f
                      ? 'bg-mc-accent/20 text-mc-accent'
                      : 'text-mc-text-secondary hover:text-mc-text'
                  }`}
                >
                  {f === 'all' ? 'All' : f === 'positive' ? '👍 Positive' : '👎 Negative'}
                </button>
              ))}
              {(['all', 'znanyLekarz'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setSourceFilter(s)}
                  className={`px-2.5 py-1 text-[10px] uppercase tracking-wider rounded transition-colors ${
                    sourceFilter === s
                      ? 'bg-blue-500/20 text-blue-400'
                      : 'text-mc-text-secondary hover:text-mc-text'
                  }`}
                >
                  {s === 'all' ? 'All Sources' : 'ZnanyLekarz'}
                </button>
              ))}
            </div>
          </div>

          <div className="divide-y divide-mc-border/30">
            {filtered.length === 0 && (
              <div className="px-4 py-8 text-center text-mc-text-secondary text-sm">
                No reviews matching this filter
              </div>
            )}
            {filtered.map((review, i) => (
              <div key={i} className={`px-4 py-3 hover:bg-mc-bg-tertiary transition-colors ${
                review.sentiment === 'negative' ? 'bg-red-500/5' : ''
              }`}>
                <div className="flex items-start gap-3">
                  {/* Avatar */}
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    review.sentiment === 'positive' ? 'bg-green-500/20 text-green-400' :
                    review.sentiment === 'negative' ? 'bg-red-500/20 text-red-400' :
                    'bg-mc-bg text-mc-text-secondary'
                  }`}>
                    {review.sentiment === 'positive' ? '👍' : review.sentiment === 'negative' ? '👎' : '😐'}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium">{review.reviewer !== 'anonymous' ? review.reviewer : 'Patient'}</span>
                      <span className="text-[10px] text-mc-text-secondary">
                        {review.source === 'znanyLekarz' ? '🩺 ZnanyLekarz' : '🔍 Google'}
                      </span>
                      {review.verified && (
                        <span className="text-[10px] text-green-400 flex items-center gap-0.5">
                          <Shield className="w-2.5 h-2.5" /> Verified visit
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-mc-text mb-1">{review.text}</p>
                    <div className="flex gap-3 text-[10px] text-mc-text-secondary">
                      <span className="flex items-center gap-0.5">
                        <Clock className="w-2.5 h-2.5" />
                        {format(parseISO(review.date), 'd MMM yyyy', { locale: pl })}
                      </span>
                      <span>👤 {review.therapist}</span>
                      <span>{'⭐'.repeat(review.rating)}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-xs text-mc-text-secondary pt-4 border-t border-mc-border">
          ZnanyLekarz: {data.sources.znanyLekarz.scraped}/{data.sources.znanyLekarz.total} reviews scraped · 
          Google: {data.sources.google.scraped}/{data.sources.google.total} · 
          Auto-refresh: daily via cron · Competitor tracking: ANIMA (89 reviews)
        </div>
      </main>
    </div>
  );
}