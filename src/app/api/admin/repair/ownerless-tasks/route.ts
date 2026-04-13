import { NextResponse } from 'next/server';
import { detectOwnerlessInProgress, repairOwnerlessInProgress } from '@/lib/task-governance';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/repair/ownerless-tasks
 * Returns the list of in_progress tasks with no assigned agent and no activity.
 */
export function GET() {
  const tasks = detectOwnerlessInProgress();
  return NextResponse.json({ count: tasks.length, tasks });
}

/**
 * POST /api/admin/repair/ownerless-tasks
 * Resets all ownerless in_progress tasks back to inbox.
 * Safe to call repeatedly — only targets tasks with no agent and no activity.
 */
export function POST() {
  const repaired = repairOwnerlessInProgress();
  return NextResponse.json({ repaired, message: `${repaired} task(s) reset to inbox` });
}
