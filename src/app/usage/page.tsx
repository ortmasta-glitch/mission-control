'use client';

import Link from 'next/link';
import { ArrowLeft, BarChart2 } from 'lucide-react';
import { AnthropicUsageDashboard } from '@/components/costs/AnthropicUsageDashboard';

export default function UsagePage() {
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
          <BarChart2 className="w-4 h-4 text-mc-accent-cyan" />
          <h1 className="font-semibold text-mc-text text-sm">Anthropic Usage &amp; Cost</h1>
        </div>
      </div>

      {/* Dashboard */}
      <div className="max-w-5xl mx-auto px-4 py-6">
        <AnthropicUsageDashboard />
      </div>
    </div>
  );
}
