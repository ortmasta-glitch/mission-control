'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, BarChart2, Activity } from 'lucide-react';
import { AnthropicUsageDashboard } from '@/components/costs/AnthropicUsageDashboard';
import { UsageDashboard } from '@/components/usage/UsageDashboard';

type Tab = 'overview' | 'anthropic';

export default function UsagePage() {
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  return (
    <div className="min-h-screen bg-mc-bg">
      {/* Page header */}
      <div className="bg-mc-bg-secondary border-b border-mc-border px-4 py-3 flex items-center gap-3">
        <Link
          href="/"
          className="flex items-center gap-1.5 text-mc-text-secondary hover:text-mc-text transition-colors text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </Link>
        <div className="w-px h-4 bg-mc-border" />
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-mc-accent-cyan" />
          <h1 className="font-semibold text-mc-text text-sm">Usage &amp; Costs</h1>
        </div>

        {/* Tab switcher */}
        <div className="ml-auto flex items-center gap-1 bg-mc-bg-tertiary border border-mc-border rounded-lg p-1">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              activeTab === 'overview'
                ? 'bg-mc-accent text-mc-bg'
                : 'text-mc-text-secondary hover:text-mc-text'
            }`}
          >
            <span className="flex items-center gap-1.5">
              <BarChart2 className="w-3.5 h-3.5" />
              Overview
            </span>
          </button>
          <button
            onClick={() => setActiveTab('anthropic')}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              activeTab === 'anthropic'
                ? 'bg-mc-accent text-mc-bg'
                : 'text-mc-text-secondary hover:text-mc-text'
            }`}
          >
            Anthropic
          </button>
        </div>
      </div>

      {/* Dashboard content */}
      <div className="max-w-5xl mx-auto px-4 py-6">
        {activeTab === 'overview' ? (
          <UsageDashboard />
        ) : (
          <AnthropicUsageDashboard />
        )}
      </div>
    </div>
  );
}