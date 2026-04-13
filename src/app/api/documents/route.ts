import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { encrypt } from '@/lib/crypto-utils';
import { parseFinancialBuffer } from '@/lib/parsers/financial-parser';
import { parseAdvertisingBuffer } from '@/lib/parsers/advertising-parser';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

export const dynamic = 'force-dynamic';

const STORAGE_BASE = process.env.DOCUMENTS_PATH || '/app/data/documents';
const VALID_CATEGORIES = ['financial', 'advertising', 'hr', 'legal', 'operations'];

function ensureCategoryDir(category: string): string {
  const dir = path.join(STORAGE_BASE, category);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// GET /api/documents?category=financial
export async function GET(request: NextRequest) {
  const category = request.nextUrl.searchParams.get('category');
  try {
    const db = getDb();
    let sql = 'SELECT * FROM documents ORDER BY uploaded_at DESC';
    const params: unknown[] = [];
    if (category) {
      sql = 'SELECT * FROM documents WHERE category = ? ORDER BY uploaded_at DESC';
      params.push(category);
    }
    const docs = db.prepare(sql).all(...params);
    return NextResponse.json(docs);
  } catch (error) {
    console.error('[documents GET]', error);
    return NextResponse.json({ error: 'Failed to list documents' }, { status: 500 });
  }
}

// POST /api/documents — multipart/form-data: file + category
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const category = (formData.get('category') as string | null)?.toLowerCase();

    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    if (!category || !VALID_CATEGORIES.includes(category)) {
      return NextResponse.json({ error: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}` }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const encrypted = encrypt(buffer);

    const id = uuidv4();
    const ext = path.extname(file.name) || '';
    const storedFilename = `${id}${ext}.enc`;
    const dir = ensureCategoryDir(category);
    fs.writeFileSync(path.join(dir, storedFilename), encrypted);

    const db = getDb();
    db.prepare(`
      INSERT INTO documents (id, category, filename, original_name, size_bytes, mime_type, uploaded_at, encrypted)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'), 1)
    `).run(id, category, storedFilename, file.name, file.size, file.type || null);

    // Trigger re-parse if financial or advertising
    const now = new Date().toISOString();
    let parse_status: string | null = null;
    let parse_error: string | null = null;

    if (category === 'financial') {
      try {
        const result = parseFinancialBuffer(buffer, file.name, { source_document_id: id, import_mode: 'manual' });
        const insert = db.prepare(`
          INSERT INTO financial_entries (id, clinic, month, revenue, costs, source_file, imported_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        for (const row of result.data) {
          insert.run(uuidv4(), row.clinic, row.month, row.revenue, row.costs, file.name, now);
        }
        parse_status = result.status;
        if (result.errors.length > 0) {
          parse_error = `${result.rows_failed} row(s) failed, ${result.rows_skipped} skipped`;
        }
      } catch (parseErr) {
        parse_status = 'failed';
        parse_error = parseErr instanceof Error ? parseErr.message : String(parseErr);
        console.warn('[documents POST] financial parse error:', parseErr);
      }
    }

    if (category === 'advertising') {
      try {
        const result = parseAdvertisingBuffer(buffer, file.name, { source_document_id: id, import_mode: 'manual' });
        const insert = db.prepare(`
          INSERT INTO ad_metrics (id, platform, period_start, period_end, spend, impressions, clicks, conversions, ctr, source_file, imported_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const row of result.data) {
          insert.run(uuidv4(), row.platform, row.period_start, row.period_end, row.spend, row.impressions, row.clicks, row.conversions, row.ctr, file.name, now);
        }
        parse_status = result.status;
        if (result.errors.length > 0) {
          parse_error = `${result.rows_failed} row(s) failed, ${result.rows_skipped} skipped`;
        }
      } catch (parseErr) {
        parse_status = 'failed';
        parse_error = parseErr instanceof Error ? parseErr.message : String(parseErr);
        console.warn('[documents POST] advertising parse error:', parseErr);
      }
    }

    // Store parse status on document
    if (parse_status) {
      try {
        db.prepare('UPDATE documents SET parse_status = ?, parse_error = ? WHERE id = ?').run(parse_status, parse_error, id);
      } catch { /* column may not exist yet */ }
    }

    const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(id);
    return NextResponse.json(doc, { status: 201 });
  } catch (error) {
    console.error('[documents POST]', error);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
