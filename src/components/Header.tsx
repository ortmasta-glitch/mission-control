'use client';

import { useState, useEffect } from 'react';
import { useMissionControl } from '@/lib/store';
import { GatewayStatusIndicator } from '@/components/GatewayStatusIndicator';
import { ThemeToggle } from '@/components/theme-toggle';
import { format } from 'date-fns';

/**
 * Header — compact top bar that sits above the main content area.
 * Navigation is handled by the Sidebar. The Header shows:
 * - Gateway status (online/offline)
 * - Active agents / queued tasks counts
 * - Clock
 * - Theme toggle
 */
export function Header() {
  const { agents, tasks, isOnline } = useMissionControl();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [activeSubAgents, setActiveSubAgents] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const loadSubAgentCount = async () => {
      try {
        const res = await fetch('/api/openclaw/sessions?session_type=subagent&status=active');
        if (res.ok) {
          const sessions = await res.json();
          setActiveSubAgents(sessions.length);
        }
      } catch (error) {
        console.error('Failed to load sub-agent count:', error);
      }
    };

    loadSubAgentCount();
    const interval = setInterval(loadSubAgentCount, 30000);
    return () => clearInterval(interval);
  }, []);

  const workingAgents = agents.filter((a) => a.status === 'working').length;
  const activeAgents = workingAgents + activeSubAgents;
  const tasksInQueue = tasks.filter((t) => t.status !== 'done' && t.status !== 'review').length;

  return (
    <header className="flex shrink-0 items-center justify-between border-b border-mc-border bg-mc-bg-secondary px-4 py-2 text-xs md:px-6">
      {/* Left side — status badges */}
      <div className="flex items-center gap-2">
        <div
          className={`flex items-center gap-2 px-2 md:px-3 py-1 rounded border text-xs md:text-sm font-medium ${
            isOnline
              ? 'bg-mc-accent-green/20 border-mc-accent-green text-mc-accent-green'
              : 'bg-mc-accent-red/20 border-mc-accent-red text-mc-accent-red'
          }`}
        >
          <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-mc-accent-green animate-pulse' : 'bg-mc-accent-red'}`} />
          {isOnline ? 'ONLINE' : 'OFFLINE'}
        </div>
        <GatewayStatusIndicator />
      </div>

      {/* Center — stats */}
      <div className="hidden md:flex items-center gap-6">
        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-mc-accent-cyan font-semibold">{activeAgents}</span>
          <span className="text-mc-text-secondary">active agents</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-mc-accent-purple font-semibold">{tasksInQueue}</span>
          <span className="text-mc-text-secondary">queued tasks</span>
        </div>
      </div>

      {/* Right side — clock & theme */}
      <div className="flex items-center gap-2">
        <span className="hidden sm:block text-mc-text-secondary text-xs font-mono">{format(currentTime, 'HH:mm:ss')}</span>
        <ThemeToggle />
      </div>
    </header>
  );
}