import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const STORAGE_BASE = process.env.DOCUMENTS_PATH || '/app/data/documents';

// DELETE /api/documents/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const db = getDb();
    const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(params.id) as {
      id: string; category: string; filename: string;
    } | undefined;

    if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const filePath = path.join(STORAGE_BASE, doc.category, doc.filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    db.prepare('DELETE FROM documents WHERE id = ?').run(params.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[documents DELETE]', error);
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
  }
}
