/**
 * GET /api/costs/anthropic?days=30
 *   Fetch live Anthropic usage summary from the admin API.
 *   Returns an AnthropicUsageSummary object.
 *
 * GET /api/costs/anthropic?check=1
 *   Returns { configured: boolean } — used by the UI to show/hide the API key prompt.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  fetchUsageSummary,
  hasAdminKey,
  periodForDays,
  type AnthropicFetchError,
} from '@/lib/costs/anthropic-usage';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  // Key status check (no API call)
  if (searchParams.get('check') === '1') {
    return NextResponse.json({ configured: hasAdminKey() });
  }

  if (!hasAdminKey()) {
    return NextResponse.json(
      { error: 'ANTHROPIC_ADMIN_API_KEY is not configured', code: 'no_key' },
      { status: 503 }
    );
  }

  const days = Math.min(Math.max(parseInt(searchParams.get('days') || '30', 10), 1), 90);

  try {
    const { startingAt, endingAt } = periodForDays(days);
    const summary = await fetchUsageSummary({ startingAt, endingAt });
    return NextResponse.json(summary);
  } catch (err) {
    const e = err as AnthropicFetchError;
    if (e?.type === 'unauthorized') {
      return NextResponse.json(
        { error: 'Admin API key is invalid or lacks permissions', code: 'unauthorized' },
        { status: 401 }
      );
    }
    if (e?.type === 'api_error') {
      return NextResponse.json(
        { error: `Anthropic API error (${e.status})`, code: 'api_error', detail: e.message },
        { status: 502 }
      );
    }
    console.error('[Anthropic Usage API]', err);
    return NextResponse.json({ error: 'Failed to fetch usage data' }, { status: 500 });
  }
}
