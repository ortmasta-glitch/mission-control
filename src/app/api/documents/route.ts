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

const ACCEPTED_MIME_TYPES: Record<string, string[]> = {
  financial: ['text/csv', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/pdf'],
  advertising: ['text/csv', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/pdf'],
  hr: ['application/pdf', 'text/csv', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/jpeg', 'image/png'],
  legal: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/jpeg', 'image/png'],
  operations: ['application/pdf', 'text/csv', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'image/jpeg', 'image/png'],
};

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

// Dangerous extensions that should never be stored
const BLOCKED_EXTENSIONS = ['.exe', '.bat', '.cmd', '.ps1', '.sh', '.js', '.vbs', '.wsf', '.msi', '.dll', '.com', '.scr'];

function hasPathTraversal(filename: string): boolean {
  const normalized = filename.replace(/\\/g, '/');
  return normalized.includes('..') || normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized);
}

function sanitizeFilename(filename: string): string {
  // Remove directory components, null bytes, and leading dots
  let safe = path.basename(filename).replace(/\0/g, '').replace(/^\./, '_');
  // Strip any remaining path separators
  safe = safe.replace(/[/\\]/g, '_');
  return safe;
}

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

    // Server-side validation: MIME type
    const acceptedMimes = ACCEPTED_MIME_TYPES[category] || [];
    if (acceptedMimes.length > 0 && file.type && !acceptedMimes.includes(file.type) && file.type !== 'application/octet-stream') {
      return NextResponse.json({ error: `File type "${file.type}" not accepted for ${category}. Accepted: ${acceptedMimes.join(', ')}` }, { status: 400 });
    }

    // Server-side validation: file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is ${MAX_FILE_SIZE / 1024 / 1024} MB.` }, { status: 400 });
    }

    // Server-side validation: path traversal
    if (hasPathTraversal(file.name)) {
      return NextResponse.json({ error: 'Invalid filename: path traversal characters not allowed.' }, { status: 400 });
    }

    // Server-side validation: blocked extensions
    const ext = path.extname(file.name).toLowerCase();
    if (BLOCKED_EXTENSIONS.includes(ext)) {
      return NextResponse.json({ error: `File extension "${ext}" is not allowed for security reasons.` }, { status: 400 });
    }

    // Sanitize filename (server-generated storage uses UUID anyway, but original_name is stored)
    const safeOriginalName = sanitizeFilename(file.name);

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const encrypted = encrypt(buffer);

    // Use server-generated UUID for storage filename — never trust user-supplied names
    const id = uuidv4();
    const safeExt = ext || '';
    const storedFilename = `${id}${safeExt}.enc`;
    const dir = ensureCategoryDir(category);
    const filePath = path.join(dir, storedFilename);

    // Write encrypted file to disk
    fs.writeFileSync(filePath, encrypted);

    const db = getDb();
    db.prepare(`
      INSERT INTO documents (id, category, filename, original_name, size_bytes, mime_type, uploaded_at, encrypted)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'), 1)
    `).run(id, category, storedFilename, safeOriginalName, file.size, file.type || null);

    // Trigger re-parse if financial or advertising
    const now = new Date().toISOString();
    let parse_status: string | null = null;
    let parse_error: string | null = null;

    if (category === 'financial') {
      try {
        const result = parseFinancialBuffer(buffer, safeOriginalName, { source_document_id: id, import_mode: 'manual' });

        // Idempotent import: delete existing entries from same source file before re-importing
        db.prepare('DELETE FROM financial_entries WHERE source_file = ?').run(safeOriginalName);

        const insert = db.prepare(`
          INSERT INTO financial_entries (id, clinic, month, revenue, costs, source_file, imported_at, source_document_id, parse_timestamp, parser_version, import_mode)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const row of result.data) {
          insert.run(uuidv4(), row.clinic, row.month, row.revenue, row.costs, safeOriginalName, now, id, result.provenance.parse_timestamp, result.provenance.parser_version, result.provenance.import_mode);
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
        const result = parseAdvertisingBuffer(buffer, safeOriginalName, { source_document_id: id, import_mode: 'manual' });

        // Idempotent import: delete existing entries from same source file before re-importing
        db.prepare('DELETE FROM ad_metrics WHERE source_file = ?').run(safeOriginalName);

        const insert = db.prepare(`
          INSERT INTO ad_metrics (id, platform, period_start, period_end, spend, impressions, clicks, conversions, ctr, source_file, imported_at, source_document_id, parse_timestamp, parser_version, import_mode, cpc, cpa, cvr, raw_data)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const row of result.data) {
          insert.run(
            uuidv4(), row.platform, row.period_start, row.period_end,
            row.spend, row.impressions, row.clicks, row.conversions, row.ctr,
            safeOriginalName, now, id, result.provenance.parse_timestamp, result.provenance.parser_version, result.provenance.import_mode,
            row.cpc, row.cpa, row.cvr,
            row._raw ? JSON.stringify(row._raw) : null
          );
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

    // Store parse status on document (now with proper columns via migration 034)
    try {
      db.prepare('UPDATE documents SET parse_status = ?, parse_error = ? WHERE id = ?').run(parse_status, parse_error, id);
    } catch (updateErr) {
      console.warn('[documents POST] Could not update parse_status (migration may not have run):', updateErr);
    }

    const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(id);

    // Return import summary alongside document for dashboard trust cues
    const importSummary = (category === 'financial' || category === 'advertising') ? {
      rows_imported: category === 'financial'
        ? (db.prepare('SELECT COUNT(*) as count FROM financial_entries WHERE source_document_id = ?').get(id) as { count: number })?.count ?? 0
        : (db.prepare('SELECT COUNT(*) as count FROM ad_metrics WHERE source_document_id = ?').get(id) as { count: number })?.count ?? 0,
      parse_status,
      parse_error,
      parser_version: category === 'financial' ? '2.0.0' : '2.0.0',
    } : undefined;

    const responseObj = { ...(doc as Record<string, unknown>), import_summary: importSummary };
    return NextResponse.json(responseObj, { status: 201 });
  } catch (error) {
    console.error('[documents POST]', error);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}