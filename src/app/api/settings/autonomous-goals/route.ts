import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';

export const dynamic = 'force-dynamic';

const MAX_CHARS = 32_000;

function resolveGoalsPath(): string {
  // Resolve /app/workspace/AUTONOMOUS.md inside the container.
  // Outside Docker (local dev), fall back to the user's home directory equivalent.
  const candidates = [
    '/app/workspace/AUTONOMOUS.md',
    path.join(os.homedir(), '.openclaw', 'workspace', 'AUTONOMOUS.md'),
    path.join(process.cwd(), 'workspace', 'AUTONOMOUS.md'),
  ];
  // Return the first one that exists, or the primary path for writing
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return candidates[0];
}

// GET /api/settings/autonomous-goals
export async function GET() {
  try {
    const filePath = resolveGoalsPath();
    let content = '';
    let exists = false;

    if (fs.existsSync(filePath)) {
      content = fs.readFileSync(filePath, 'utf-8');
      exists = true;
    }

    return NextResponse.json({ content, filePath, exists, maxChars: MAX_CHARS });
  } catch (error) {
    console.error('[autonomous-goals GET]', error);
    return NextResponse.json({ error: 'Failed to read goals file' }, { status: 500 });
  }
}

// POST /api/settings/autonomous-goals
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const content: string = body.content ?? '';

    if (typeof content !== 'string') {
      return NextResponse.json({ error: 'content must be a string' }, { status: 400 });
    }

    if (content.length > MAX_CHARS) {
      return NextResponse.json(
        { error: `Content exceeds ${MAX_CHARS} character limit` },
        { status: 400 }
      );
    }

    const filePath = resolveGoalsPath();

    // Atomic write: write to a temp file then rename
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });

    const tmpPath = filePath + '.tmp.' + process.pid;
    fs.writeFileSync(tmpPath, content, 'utf-8');
    fs.renameSync(tmpPath, filePath);

    return NextResponse.json({ success: true, filePath, chars: content.length });
  } catch (error) {
    console.error('[autonomous-goals POST]', error);
    return NextResponse.json({ error: 'Failed to write goals file' }, { status: 500 });
  }
}
