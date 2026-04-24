/**
 * useGatewayStatus Hook
 *
 * Provides real-time gateway connection status to React components.
 * Uses two update channels:
 * 1. Custom DOM event from useSSE (real-time, pushed by server)
 * 2. Periodic /api/gateway/status poll (fallback + initial load)
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { GatewayConnectionState, GatewayStatusSnapshot } from '@/lib/gateway-status-store';

export interface GatewayStatusUI extends GatewayStatusSnapshot {
  /** Human-readable label for the connection state */
  label: string;
  /** Tailwind color class for the status dot */
  colorClass: string;
  /** Whether the gateway is functional (connected or degraded) */
  isFunctional: boolean;
}

const STATE_CONFIG: Record<GatewayConnectionState, { label: string; colorClass: string; isFunctional: boolean }> = {
  connected: { label: 'GATEWAY OK', colorClass: 'bg-mc-accent-green', isFunctional: true },
  degraded: { label: 'GATEWAY SLOW', colorClass: 'bg-yellow-400', isFunctional: true },
  connecting: { label: 'CONNECTING', colorClass: 'bg-yellow-400', isFunctional: false },
  disconnected: { label: 'GATEWAY DOWN', colorClass: 'bg-mc-accent-red', isFunctional: false },
  unconfigured: { label: 'NO GATEWAY', colorClass: 'bg-gray-500', isFunctional: false },
};

const POLL_INTERVAL = 30_000; // Refresh from API every 30s as fallback

const INITIAL_SNAPSHOT: GatewayStatusSnapshot = {
  connectionState: 'connecting',
  wsConnected: false,
  activeSessions: 0,
  agentCount: 0,
  primaryModel: null,
  gatewayVersion: null,
  latencyMs: null,
  lastSeenAt: null,
  lastError: null,
  lastPollAt: new Date().toISOString(),
  stateChangedAt: new Date().toISOString(),
  consecutiveFailures: 0,
};

export function useGatewayStatus(): GatewayStatusUI {
  const [snapshot, setSnapshot] = useState<GatewayStatusSnapshot>(INITIAL_SNAPSHOT);
  const pollTimerRef = useRef<NodeJS.Timeout>();

  // Periodic poll fallback
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/gateway/status');
      if (res.ok) {
        const data = await res.json();
        setSnapshot(data);
      }
    } catch {
      // Silently fail — SSE events or the next poll will update
    }
  }, []);

  // Listen for custom DOM event dispatched by useSSE (real-time updates)
  useEffect(() => {
    const handler = (e: Event) => {
      const payload = (e as CustomEvent).detail;
      if (payload) {
        setSnapshot((prev) => ({
          ...prev,
          connectionState: payload.connectionState ?? prev.connectionState,
          wsConnected: payload.wsConnected ?? prev.wsConnected,
          activeSessions: payload.activeSessions ?? prev.activeSessions,
          agentCount: payload.agentCount ?? prev.agentCount,
          latencyMs: payload.latencyMs ?? prev.latencyMs,
          lastError: payload.lastError ?? null,
          stateChangedAt: new Date().toISOString(),
          lastPollAt: new Date().toISOString(),
        }));
      }
    };
    window.addEventListener('gateway-status-changed', handler);
    return () => window.removeEventListener('gateway-status-changed', handler);
  }, []);

  // Fallback: poll on an interval (in case SSE is not working)
  useEffect(() => {
    fetchStatus();
    pollTimerRef.current = setInterval(fetchStatus, POLL_INTERVAL);
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [fetchStatus]);

  const config = STATE_CONFIG[snapshot.connectionState] ?? STATE_CONFIG.connecting;

  return {
    ...snapshot,
    label: config.label,
    colorClass: config.colorClass,
    isFunctional: config.isFunctional,
  };
}