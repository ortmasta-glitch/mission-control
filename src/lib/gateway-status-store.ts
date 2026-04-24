/**
 * Gateway Status Store
 *
 * Periodically polls the OpenClaw Gateway and maintains a real-time status
 * snapshot that API routes and UI components can query without blocking.
 *
 * Design:
 * - Singleton store, started once on first SSE connection (idempotent)
 * - Polls via the existing OpenClawClient WebSocket RPC methods
 * - Falls back to a lightweight HTTP check if the WS client is not connected
 * - Emits SSE events on status changes so the UI updates in real time
 * - Provides a `getSnapshot()` for synchronous reads (API routes)
 */

import { getOpenClawClient } from '@/lib/openclaw/client';
import { broadcast } from '@/lib/events';

// ---------- Types ----------

export type GatewayConnectionState = 'connected' | 'disconnected' | 'degraded' | 'connecting' | 'unconfigured';

export interface GatewayStatusSnapshot {
  /** Overall connection state */
  connectionState: GatewayConnectionState;
  /** Whether the WebSocket is live and authenticated */
  wsConnected: boolean;
  /** Number of active OpenClaw sessions reported by the gateway */
  activeSessions: number;
  /** Number of agents known to the gateway */
  agentCount: number;
  /** Primary model configured on the gateway (from config.get) */
  primaryModel: string | null;
  /** Gateway version string, if reported */
  gatewayVersion: string | null;
  /** Round-trip latency of the last successful health probe (ms) */
  latencyMs: number | null;
  /** Last time we successfully confirmed the gateway was alive */
  lastSeenAt: string | null;
  /** Last error message (cleared on next success) */
  lastError: string | null;
  /** ISO timestamp of the last poll attempt */
  lastPollAt: string;
  /** ISO timestamp of the last state change */
  stateChangedAt: string;
  /** How many consecutive poll failures */
  consecutiveFailures: number;
}

// ---------- Defaults ----------

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

const POLL_INTERVAL_MS = 15_000;       // poll every 15 s
const DEGRADED_THRESHOLD = 3;           // 3 consecutive failures → degraded
const DISCONNECTED_THRESHOLD = 6;       // 6 consecutive failures → disconnected
const FAST_POLL_MS = 5_000;             // faster poll when degraded/disconnected
const LATENCY_WARN_MS = 2_000;          // latency above this → degraded

// ---------- Store ----------

class GatewayStatusStore {
  private snapshot: GatewayStatusSnapshot = { ...INITIAL_SNAPSHOT };
  private timer: NodeJS.Timeout | null = null;
  private started = false;
  private polling = false; // lock to prevent concurrent polls

  // ---------- Public API ----------

  /** Start periodic polling. Idempotent — safe to call multiple times. */
  start(): void {
    if (this.started) return;
    this.started = true;
    console.log('[GatewayStatus] Starting periodic polling');
    this.poll();          // immediate first poll
    this.scheduleNext();  // then on interval
  }

  /** Stop polling (e.g., on graceful shutdown). */
  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.started = false;
    console.log('[GatewayStatus] Stopped polling');
  }

  /** Read the current status snapshot. Always returns a copy. */
  getSnapshot(): GatewayStatusSnapshot {
    return { ...this.snapshot };
  }

  /** Force an immediate poll (e.g., after a reconnect event). */
  async forcePoll(): Promise<GatewayStatusSnapshot> {
    await this.poll();
    return this.getSnapshot();
  }

  // ---------- Internals ----------

  private scheduleNext(): void {
    if (this.timer) clearTimeout(this.timer);
    // Faster interval when degraded/disconnected to detect recovery sooner
    const interval =
      this.snapshot.connectionState === 'connected' ? POLL_INTERVAL_MS : FAST_POLL_MS;
    this.timer = setTimeout(() => {
      void this.poll().then(() => {
        if (this.started) this.scheduleNext();
      });
    }, interval);
  }

  private async poll(): Promise<void> {
    if (this.polling) return;
    this.polling = true;

    const pollStart = Date.now();
    const prev = this.snapshot.connectionState;
    let next: Partial<GatewayStatusSnapshot> = {};

    try {
      const client = getOpenClawClient();

      // Ensure WS connection
      if (!client.isConnected()) {
        try {
          await client.connect();
        } catch (connectErr) {
          const msg = connectErr instanceof Error ? connectErr.message : String(connectErr);
          // Check if it's because the gateway URL isn't configured
          const gatewayUrl = process.env.OPENCLAW_GATEWAY_URL;
          if (!gatewayUrl) {
            next = {
              connectionState: 'unconfigured',
              wsConnected: false,
              lastError: 'OPENCLAW_GATEWAY_URL not set',
              consecutiveFailures: this.snapshot.consecutiveFailures + 1,
            };
          } else {
            next = {
              connectionState: this.snapshot.consecutiveFailures + 1 >= DISCONNECTED_THRESHOLD ? 'disconnected' : 'connecting',
              wsConnected: false,
              lastError: `WS connect failed: ${msg}`,
              consecutiveFailures: this.snapshot.consecutiveFailures + 1,
            };
          }
          this.applyUpdate(prev, next, pollStart);
          return;
        }
      }

      // Probe: list sessions + agents + config in parallel
      const [sessions, agents, config] = await Promise.allSettled([
        client.listSessions().catch(() => []),
        client.listAgents().catch(() => []),
        client.getConfig().catch(() => ({})),
      ]);

      const latencyMs = Date.now() - pollStart;

      const activeSessions =
        sessions.status === 'fulfilled' && Array.isArray(sessions.value)
          ? sessions.value.filter((s: any) => s.status === 'active').length
          : 0;
      const totalSessions =
        sessions.status === 'fulfilled' && Array.isArray(sessions.value)
          ? sessions.value.length
          : 0;
      const agentCount =
        agents.status === 'fulfilled' && Array.isArray(agents.value)
          ? agents.value.length
          : 0;
      const primaryModel =
        config.status === 'fulfilled' && (config.value as any)?.config?.agents?.defaults?.model?.primary
          ? (config.value as any).config.agents.defaults.model.primary
          : null;

      // Determine connection state based on probe results
      let connectionState: GatewayConnectionState = 'connected';
      if (sessions.status === 'rejected' && agents.status === 'rejected') {
        // Both failed — likely a real connection issue
        connectionState = this.snapshot.consecutiveFailures + 1 >= DEGRADED_THRESHOLD ? 'disconnected' : 'degraded';
      } else if (latencyMs > LATENCY_WARN_MS) {
        connectionState = 'degraded';
      }

      // If any of the parallel calls failed, it's at least degraded
      const hasRejection = sessions.status === 'rejected' || agents.status === 'rejected';
      if (hasRejection && connectionState === 'connected') {
        connectionState = 'degraded';
      }

      const now = new Date().toISOString();
      next = {
        connectionState,
        wsConnected: client.isConnected(),
        activeSessions,
        agentCount,
        primaryModel,
        latencyMs,
        lastSeenAt: now,
        lastError: hasRejection
          ? `Partial failure: sessions=${sessions.status}, agents=${agents.status}`
          : null,
        consecutiveFailures: hasRejection ? this.snapshot.consecutiveFailures + 1 : 0,
      };

      this.applyUpdate(prev, next, pollStart);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      next = {
        connectionState: this.snapshot.consecutiveFailures + 1 >= DISCONNECTED_THRESHOLD ? 'disconnected' : 'degraded',
        wsConnected: false,
        lastError: `Poll error: ${msg}`,
        consecutiveFailures: this.snapshot.consecutiveFailures + 1,
      };
      this.applyUpdate(prev, next, pollStart);
    } finally {
      this.polling = false;
    }
  }

  /** Merge partial update into snapshot, detect state changes, broadcast SSE. */
  private applyUpdate(
    prevState: GatewayConnectionState,
    partial: Partial<GatewayStatusSnapshot>,
    pollStart: number,
  ): void {
    const now = new Date().toISOString();
    const merged: GatewayStatusSnapshot = {
      ...this.snapshot,
      ...partial,
      lastPollAt: now,
    };

    // If connectionState changed, update the timestamp
    if (merged.connectionState !== prevState) {
      merged.stateChangedAt = now;
    }

    const prev = this.snapshot;
    this.snapshot = merged;

    // Broadcast a gateway_status_changed SSE event on meaningful state changes
    const stateChanged = merged.connectionState !== prevState;
    const sessionCountChanged = merged.activeSessions !== prev.activeSessions;
    const wsStateChanged = merged.wsConnected !== prev.wsConnected;

    if (stateChanged || sessionCountChanged || wsStateChanged) {
      console.log(`[GatewayStatus] State: ${prevState} → ${merged.connectionState}` +
        (merged.lastError ? ` (${merged.lastError})` : '') +
        ` | sessions: ${merged.activeSessions} | latency: ${merged.latencyMs ?? '-'}ms`);

      broadcast({
        type: 'gateway_status_changed' as any,
        payload: {
          connectionState: merged.connectionState,
          wsConnected: merged.wsConnected,
          activeSessions: merged.activeSessions,
          agentCount: merged.agentCount,
          latencyMs: merged.latencyMs,
          lastError: merged.lastError,
        },
      });
    }
  }
}

// ---------- Singleton ----------

let storeInstance: GatewayStatusStore | null = null;

export function getGatewayStatusStore(): GatewayStatusStore {
  if (!storeInstance) {
    storeInstance = new GatewayStatusStore();
  }
  return storeInstance;
}

/** Convenience: start the store if not already started. Idempotent. */
export function startGatewayStatusPolling(): void {
  const store = getGatewayStatusStore();
  store.start();
}

/** Convenience: stop the store. */
export function stopGatewayStatusPolling(): void {
  const store = getGatewayStatusStore();
  store.stop();
}