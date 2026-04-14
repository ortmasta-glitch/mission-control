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
      id: string; category: string; filename: string; original_name: string;
    } | undefined;

    if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Delete related parsed data (provenance link)
    if (doc.category === 'financial') {
      const deleted = db.prepare('DELETE FROM financial_entries WHERE source_document_id = ?').run(params.id);
      console.log(`[documents DELETE] Removed ${deleted.changes} financial_entries for document ${params.id}`);
    }
    if (doc.category === 'advertising') {
      const deleted = db.prepare('DELETE FROM ad_metrics WHERE source_document_id = ?').run(params.id);
      console.log(`[documents DELETE] Removed ${deleted.changes} ad_metrics for document ${params.id}`);
    }

    // Delete encrypted file from disk
    const filePath = path.join(STORAGE_BASE, doc.category, doc.filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Delete document record
    db.prepare('DELETE FROM documents WHERE id = ?').run(params.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[documents DELETE]', error);
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
  }
}