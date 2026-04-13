/**
 * GET /api/autonomous/runs?workspace_id=...&limit=20
 *
 * Return recent autonomous run history for a workspace.
 * Includes the raw_proposal field so a future approval UI can display proposals.
 */

import { NextRequest, NextResponse } from 'next/server';
import { queryAll } from '@/lib/db';
import type { AutonomousRun } from '@/lib/autonomous/types';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const workspaceId = searchParams.get('workspace_id') || 'default';
  const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);

  try {
    const runs = queryAll<AutonomousRun>(
      `SELECT * FROM autonomous_runs
       WHERE workspace_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
      [workspaceId, limit]
    );

    return NextResponse.json(runs);
  } catch (err) {
    console.error('[Autonomous/runs GET]', err);
    return NextResponse.json({ error: 'Failed to fetch runs' }, { status: 500 });
  }
}
