'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { ChevronLeft, RefreshCw, Loader2, Megaphone } from 'lucide-react';
import * as echarts from 'echarts/core';
import { BarChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { formatDistanceToNow } from 'date-fns';

echarts.use([BarChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer]);

const PLATFORM_ICONS: Record<string, string> = {
  'Google Ads': '🔍',
  'Instagram': '📸',
  'Facebook': '👍',
  'TikTok': '🎵',
};

const PLATFORM_COLORS: Record<string, string> = {
  'Google Ads': '#4285f4',
  'Instagram': '#e1306c',
  'Facebook': '#1877f2',
  'TikTok': '#ff0050',
};

interface ChannelSummary {
  platform: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  ctr: number;
  last_import: string | null;
  last_period_end: string | null;
  row_count: number;
  hasData: boolean;
}

interface AdData {
  channels: ChannelSummary[];
  recentByPlatform: Record<string, unknown[]>;
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatPLN(n: number): string {
  return `${n.toLocaleString('pl-PL', { maximumFractionDigits: 0 })} PLN`;
}

function dataFreshnessStatus(channel: ChannelSummary): { label: string; color: string } {
  if (!channel.hasData) return { label: '⚫ No data', color: 'text-mc-text-secondary' };
  if (!channel.last_import) return { label: '⚫ No data', color: 'text-mc-text-secondary' };
  const age = Date.now() - new Date(channel.last_import).getTime();
  const days = age / 86_400_000;
  if (days <= 7) return { label: '🟢 Active', color: 'text-green-400' };
  if (days <= 30) return { label: '🟡 Limited', color: 'text-yellow-400' };
  return { label: '🔴 Paused', color: 'text-red-400' };
}

function ComparisonChart({ channels }: { channels: ChannelSummary[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const inst = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    if (!inst.current) {
      inst.current = echarts.init(ref.current, undefined, { renderer: 'canvas' });
    }
    const chart = inst.current;
    const names = channels.map(c => c.platform);

    chart.setOption({
      animation: true,
      grid: { top: 40, right: 20, bottom: 30, left: 80 },
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#161b22',
        borderColor: '#30363d',
        textStyle: { color: '#c9d1d9', fontSize: 12 },
      },
      legend: {
        top: 8,
        textStyle: { color: '#8b949e', fontSize: 11 },
        data: ['Spend (PLN)', 'Conversions'],
      },
      xAxis: {
        type: 'category',
        data: names,
        axisLine: { lineStyle: { color: '#30363d' } },
        axisLabel: { color: '#8b949e', fontSize: 11 },
        splitLine: { show: false },
      },
      yAxis: [
        {
          type: 'value',
          name: 'Spend',
          axisLine: { lineStyle: { color: '#30363d' } },
          axisLabel: { color: '#8b949e', fontSize: 10 },
          splitLine: { lineStyle: { color: '#21262d' } },
        },
        {
          type: 'value',
          name: 'Conv.',
          axisLine: { lineStyle: { color: '#30363d' } },
          axisLabel: { color: '#8b949e', fontSize: 10 },
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: 'Spend (PLN)',
          type: 'bar',
          data: channels.map(c => c.spend),
          itemStyle: { color: '#58a6ff' },
        },
        {
          name: 'Conversions',
          type: 'bar',
          yAxisIndex: 1,
          data: channels.map(c => c.conversions),
          itemStyle: { color: '#3fb950' },
        },
      ],
    });

    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [channels]);

  useEffect(() => () => { inst.current?.dispose(); inst.current = null; }, []);

  return <div ref={ref} style={{ width: '100%', height: '240px' }} />;
}

export default function AdvertisingPage() {
  const [data, setData] = useState<AdData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/advertising');
      if (!res.ok) throw new Error('Failed');
      setData(await res.json());
    } catch {
      setError('Failed to load advertising data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const hasAnyData = data?.channels.some(c => c.hasData);

  return (
    <div className="min-h-screen bg-mc-bg text-mc-text">
      {/* Header */}
      <header className="border-b border-mc-border bg-mc-bg-secondary px-4 py-3 flex items-center gap-3">
        <Link href="/" className="text-mc-text-secondary hover:text-mc-text transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <Megaphone className="w-5 h-5 text-mc-accent" />
        <h1 className="font-semibold text-lg">Advertising Channels</h1>
        <div className="ml-auto flex items-center gap-3">
          <button onClick={load} className="p-1.5 hover:bg-mc-bg-tertiary rounded text-mc-text-secondary">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <Link href="/documents?category=advertising" className="text-xs px-3 py-1.5 bg-mc-accent/10 text-mc-accent border border-mc-accent/30 rounded hover:bg-mc-accent/20">
            Upload export →
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
        ) : (
          <>
            {/* 4 platform cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              {data!.channels.map(channel => {
                const status = dataFreshnessStatus(channel);
                const color = PLATFORM_COLORS[channel.platform] || '#8b949e';
                return (
                  <div
                    key={channel.platform}
                    className={`bg-mc-bg-secondary border rounded-lg p-4 ${
                      channel.hasData ? 'border-mc-border' : 'border-mc-border/50 opacity-70'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{PLATFORM_ICONS[channel.platform] || '📊'}</span>
                        <span className="font-medium text-sm">{channel.platform}</span>
                      </div>
                      <span className={`text-xs font-medium ${status.color}`}>{status.label}</span>
                    </div>

                    {!channel.hasData ? (
                      <p className="text-xs text-mc-text-secondary mt-4 text-center">
                        Drop your {channel.platform} export here to get started
                      </p>
                    ) : (
                      <>
                        <div className="space-y-2">
                          <div className="flex justify-between text-xs">
                            <span className="text-mc-text-secondary">Spend</span>
                            <span className="font-mono" style={{ color }}>{formatPLN(channel.spend)}</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-mc-text-secondary">Impressions</span>
                            <span className="font-mono">{formatNum(channel.impressions)}</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-mc-text-secondary">Clicks</span>
                            <span className="font-mono">{formatNum(channel.clicks)}</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-mc-text-secondary">CTR</span>
                            <span className="font-mono">{channel.ctr.toFixed(2)}%</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-mc-text-secondary">Conversions</span>
                            <span className="font-mono text-green-400">{channel.conversions.toFixed(1)}</span>
                          </div>
                        </div>
                        {channel.last_import && (
                          <p className="text-xs text-mc-text-secondary mt-3 pt-2 border-t border-mc-border/50">
                            Updated {formatDistanceToNow(new Date(channel.last_import), { addSuffix: true })}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Comparison chart */}
            {hasAnyData ? (
              <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4">
                <h2 className="text-sm font-medium text-mc-text-secondary uppercase tracking-wider mb-4">
                  Spend vs Conversions — all platforms
                </h2>
                <ComparisonChart channels={data!.channels} />
              </div>
            ) : (
              <div className="text-center py-12 bg-mc-bg-secondary border border-mc-border rounded-lg">
                <Megaphone className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-mc-text-secondary text-sm mb-4">No advertising data yet</p>
                <Link href="/documents" className="px-4 py-2 bg-mc-accent text-mc-bg rounded font-medium text-sm hover:bg-mc-accent/90">
                  Upload CSV/XLSX export →
                </Link>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
