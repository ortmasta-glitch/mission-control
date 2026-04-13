import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { decrypt } from '@/lib/crypto-utils';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const STORAGE_BASE = process.env.DOCUMENTS_PATH || '/app/data/documents';

// GET /api/documents/[id]/download
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const db = getDb();
    const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(params.id) as {
      id: string; category: string; filename: string; original_name: string;
      mime_type: string | null; encrypted: number;
    } | undefined;

    if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const filePath = path.join(STORAGE_BASE, doc.category, doc.filename);
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: 'File not found on disk' }, { status: 404 });
    }

    const raw = fs.readFileSync(filePath);
    const data = doc.encrypted ? decrypt(raw) : raw;

    const contentType = doc.mime_type || 'application/octet-stream';
    const disposition = contentType === 'application/pdf'
      ? `inline; filename="${doc.original_name}"`
      : `attachment; filename="${doc.original_name}"`;

    return new NextResponse(new Uint8Array(data), {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': disposition,
        'Content-Length': String(data.length),
      },
    });
  } catch (error) {
    console.error('[documents download]', error);
    return NextResponse.json({ error: 'Download failed' }, { status: 500 });
  }
}
