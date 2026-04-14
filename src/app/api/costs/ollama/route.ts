/**
 * GET /api/costs/ollama
 *   Returns OllamaUsageSummary — live running models + accumulated token stats.
 *
 * GET /api/costs/ollama?check=1
 *   Returns { configured: boolean }
 *
 * POST /api/costs/ollama
 *   Body: OllamaUsageRecord — append a usage event to the local store.
 *   Called by the openclaw gateway or external scripts after each model response.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  buildUsageSummary,
  appendUsageRecord,
  hasOllamaKey,
  type OllamaUsageRecord,
  type OllamaFetchError,
} from '@/lib/costs/ollama-usage';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  if (searchParams.get('check') === '1') {
    return NextResponse.json({ configured: hasOllamaKey() });
  }

  try {
    const summary = await buildUsageSummary();
    return NextResponse.json(summary);
  } catch (err) {
    const e = err as OllamaFetchError;
    if (e?.type === 'unauthorized') {
      return NextResponse.json(
        { error: 'Ollama API key is invalid', code: 'unauthorized' },
        { status: 401 }
      );
    }
    if (e?.type === 'no_key') {
      return NextResponse.json(
        { error: 'OLLAMA_API_KEY is not configured', code: 'no_key' },
        { status: 503 }
      );
    }
    console.error('[Ollama Usage API]', err);
    return NextResponse.json({ error: 'Failed to fetch Ollama usage data' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as OllamaUsageRecord;

    if (!body.model || typeof body.inputTokens !== 'number' || typeof body.outputTokens !== 'number') {
      return NextResponse.json({ error: 'Invalid usage record' }, { status: 400 });
    }

    const record: OllamaUsageRecord = {
      timestamp: body.timestamp || new Date().toISOString(),
      model: body.model,
      inputTokens: body.inputTokens,
      outputTokens: body.outputTokens,
      evalDurationNs: body.evalDurationNs || 0,
      promptDurationNs: body.promptDurationNs || 0,
      totalDurationNs: body.totalDurationNs || 0,
      agentId: body.agentId,
    };

    await appendUsageRecord(record);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
}
