'use client';

import { useState } from 'react';
import { ArrowLeft, Brain, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { MemoryView } from '@/components/memory/memory-view';
import { BouncingDots } from '@/components/memory/utils';

export default function MemoryPage() {
  const [reindexingAll, setReindexingAll] = useState(false);

  const handleReindexAll = async () => {
    if (reindexingAll) return;
    setReindexingAll(true);
    try {
      await fetch('/api/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'index-memory', force: true }),
      });
    } catch {
      // handled by MemoryView internally
    } finally {
      setReindexingAll(false);
    }
  };

  return (
    <div className="min-h-screen bg-mc-bg flex flex-col">
      {/* Header */}
      <header className="border-b border-mc-border bg-mc-bg-secondary">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link href="/" className="text-mc-text-secondary hover:text-mc-text transition-colors">
                <ArrowLeft className="w-5 h-5" />
              </Link>
              <Brain className="w-6 h-6 text-mc-accent-purple" />
              <h1 className="text-xl font-bold text-mc-text">Memory</h1>
            </div>
            <button
              type="button"
              onClick={handleReindexAll}
              disabled={reindexingAll}
              className="inline-flex items-center gap-1.5 rounded-lg border border-mc-border bg-mc-bg-tertiary px-3 py-1.5 text-xs text-mc-text-secondary transition-colors hover:bg-mc-bg hover:text-mc-text disabled:opacity-50"
              title="Re-index all memory files into the vector store"
            >
              {reindexingAll ? <BouncingDots /> : <RefreshCw className="h-3.5 w-3.5" />}
              {reindexingAll ? "Reindexing..." : "Reindex All"}
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 flex flex-col overflow-hidden max-w-7xl mx-auto w-full">
        <MemoryView />
      </main>
    </div>
  );
}