/**
 * GET /api/autonomous/config?workspace_id=...
 * PUT /api/autonomous/config?workspace_id=...
 *
 * Fetch or update the autonomous generation config for a workspace.
 * GET auto-creates a default config if none exists.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateConfig, upsertConfig } from '@/lib/autonomous/runner';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const workspaceId = request.nextUrl.searchParams.get('workspace_id') || 'default';

  try {
    const config = getOrCreateConfig(workspaceId);
    return NextResponse.json(config);
  } catch (err) {
    console.error('[Autonomous/config GET]', err);
    return NextResponse.json({ error: 'Failed to fetch config' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const workspaceId = request.nextUrl.searchParams.get('workspace_id') || 'default';

  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;

    const allowed = [
      'enabled', 'goals_file_path', 'log_file_path',
      'generation_cron', 'timezone', 'target_task_count', 'approval_required',
    ];

    const updates: Record<string, unknown> = {};
    for (const key of allowed) {
      if (key in body) updates[key] = body[key];
    }

    const config = upsertConfig(workspaceId, updates as Parameters<typeof upsertConfig>[1]);
    return NextResponse.json(config);
  } catch (err) {
    console.error('[Autonomous/config PUT]', err);
    return NextResponse.json({ error: 'Failed to update config' }, { status: 500 });
  }
}
