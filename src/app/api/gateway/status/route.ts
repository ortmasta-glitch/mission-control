import { NextResponse } from 'next/server';
import { getGatewayStatusStore, startGatewayStatusPolling } from '@/lib/gateway-status-store';

export const dynamic = 'force-dynamic';

/**
 * GET /api/gateway/status
 *
 * Returns the current gateway status snapshot.
 * Starts the polling store if not already running.
 */
export async function GET() {
  try {
    // Ensure the store is running
    startGatewayStatusPolling();

    const store = getGatewayStatusStore();
    const snapshot = store.getSnapshot();

    return NextResponse.json({
      ok: true,
      ...snapshot,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        connectionState: 'disconnected',
        wsConnected: false,
        activeSessions: 0,
        agentCount: 0,
        primaryModel: null,
        gatewayVersion: null,
        latencyMs: null,
        lastSeenAt: null,
        lastError: error instanceof Error ? error.message : String(error),
        lastPollAt: new Date().toISOString(),
        stateChangedAt: new Date().toISOString(),
        consecutiveFailures: 0,
      },
      { status: 503 }
    );
  }
}