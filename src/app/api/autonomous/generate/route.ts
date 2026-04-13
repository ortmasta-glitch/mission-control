/**
 * POST /api/autonomous/generate
 *
 * Manually trigger a daily autonomous task generation run for a workspace.
 * Body: { workspace_id?: string; force?: boolean }
 *
 * force=true overrides the "already ran today" guard (useful for testing).
 * Returns immediately with the GenerationResult or a 409 if already running.
 */

import { NextRequest, NextResponse } from 'next/server';
import { queryOne, run } from '@/lib/db';
import { runDailyAutonomousGeneration } from '@/lib/autonomous/runner';
import type { AutonomousRun } from '@/lib/autonomous/types';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({})) as { workspace_id?: string; force?: boolean };
    const workspaceId = body.workspace_id || 'default';
    const force = Boolean(body.force);

    // If force=true, delete any existing run for today so idempotency guard lets it through
    if (force) {
      const today = new Date().toISOString().slice(0, 10);
      run(
        `DELETE FROM autonomous_runs WHERE workspace_id = ? AND run_date = ?`,
        [workspaceId, today]
      );
    }

    // Guard: reject if already running (concurrent duplicate request)
    const today = new Date().toISOString().slice(0, 10);
    const inFlight = queryOne<AutonomousRun>(
      `SELECT * FROM autonomous_runs WHERE workspace_id = ? AND run_date = ? AND status = 'running'`,
      [workspaceId, today]
    );
    if (inFlight) {
      const ageMinutes = (Date.now() - new Date(inFlight.updated_at).getTime()) / 60000;
      if (ageMinutes < 10) {
        return NextResponse.json(
          { error: 'A generation run is already in progress', run_id: inFlight.id },
          { status: 409 }
        );
      }
    }

    const result = await runDailyAutonomousGeneration(workspaceId);

    if (!result) {
      // null = already completed today
      const completedRun = queryOne<AutonomousRun>(
        `SELECT * FROM autonomous_runs WHERE workspace_id = ? AND run_date = ? AND status = 'completed'`,
        [workspaceId, today]
      );
      return NextResponse.json({
        skipped: true,
        reason: 'Already completed today',
        existing_run: completedRun,
      });
    }

    return NextResponse.json(result, { status: result.status === 'failed' ? 500 : 200 });
  } catch (err) {
    console.error('[Autonomous/generate POST]', err);
    return NextResponse.json(
      { error: 'Generation failed: ' + (err as Error).message },
      { status: 500 }
    );
  }
}
