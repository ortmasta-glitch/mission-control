import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { decrypt } from '@/lib/crypto-utils';
import { parseFinancialBuffer } from '@/lib/parsers/financial-parser';
import { parseAdvertisingBuffer } from '@/lib/parsers/advertising-parser';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const STORAGE_BASE = process.env.DOCUMENTS_PATH || '/app/data/documents';

// POST /api/documents/[id]/parse — re-parse a document (e.g., after failure or with updated parser)
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const db = getDb();
    const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(params.id) as {
      id: string; category: string; filename: string; original_name: string;
      encrypted: number; parse_status: string | null;
    } | undefined;

    if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Only financial and advertising documents can be re-parsed
    if (doc.category !== 'financial' && doc.category !== 'advertising') {
      return NextResponse.json({ error: 'Only financial and advertising documents can be re-parsed' }, { status: 400 });
    }

    // Get import mode from request body (defaults to 'retry')
    let import_mode: 'manual' | 'scheduled' | 'retry' = 'retry';
    try {
      const body = await request.json();
      if (body.import_mode && ['manual', 'scheduled', 'retry'].includes(body.import_mode)) {
        import_mode = body.import_mode;
      }
    } catch {
      // No body or invalid JSON, use default
    }

    // Read and decrypt the file
    const filePath = path.join(STORAGE_BASE, doc.category, doc.filename);
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: 'File not found on disk' }, { status: 404 });
    }

    const raw = fs.readFileSync(filePath);
    const buffer = doc.encrypted ? decrypt(raw) : raw;

    const now = new Date().toISOString();
    let parse_status: string;
    let parse_error: string | null = null;
    let rows_imported = 0;
    let rows_failed = 0;

    if (doc.category === 'financial') {
      try {
        const result = parseFinancialBuffer(buffer, doc.original_name, {
          source_document_id: doc.id,
          import_mode,
        });

        // Idempotent: clear old entries from this source, then re-import
        db.prepare('DELETE FROM financial_entries WHERE source_document_id = ?').run(doc.id);

        const insert = db.prepare(`
          INSERT INTO financial_entries (id, clinic, month, revenue, costs, source_file, imported_at, source_document_id, parse_timestamp, parser_version, import_mode)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const row of result.data) {
          insert.run(uuidv4(), row.clinic, row.month, row.revenue, row.costs, doc.original_name, now, doc.id, result.provenance.parse_timestamp, result.provenance.parser_version, result.provenance.import_mode);
        }
        parse_status = result.status;
        rows_imported = result.rows_imported;
        rows_failed = result.rows_failed;
        if (result.errors.length > 0) {
          parse_error = `${result.rows_failed} row(s) failed, ${result.rows_skipped} skipped`;
        }
      } catch (parseErr) {
        parse_status = 'failed';
        parse_error = parseErr instanceof Error ? parseErr.message : String(parseErr);
        rows_failed = 1;
      }
    } else if (doc.category === 'advertising') {
      try {
        const result = parseAdvertisingBuffer(buffer, doc.original_name, {
          source_document_id: doc.id,
          import_mode,
        });

        // Idempotent: clear old entries from this source, then re-import
        db.prepare('DELETE FROM ad_metrics WHERE source_document_id = ?').run(doc.id);

        const insert = db.prepare(`
          INSERT INTO ad_metrics (id, platform, period_start, period_end, spend, impressions, clicks, conversions, ctr, source_file, imported_at, source_document_id, parse_timestamp, parser_version, import_mode, cpc, cpa, cvr, raw_data)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const row of result.data) {
          insert.run(
            uuidv4(), row.platform, row.period_start, row.period_end,
            row.spend, row.impressions, row.clicks, row.conversions, row.ctr,
            doc.original_name, now, doc.id, result.provenance.parse_timestamp, result.provenance.parser_version, result.provenance.import_mode,
            row.cpc, row.cpa, row.cvr,
            row._raw ? JSON.stringify(row._raw) : null
          );
        }
        parse_status = result.status;
        rows_imported = result.rows_imported;
        rows_failed = result.rows_failed;
        if (result.errors.length > 0) {
          parse_error = `${result.rows_failed} row(s) failed, ${result.rows_skipped} skipped`;
        }
      } catch (parseErr) {
        parse_status = 'failed';
        parse_error = parseErr instanceof Error ? parseErr.message : String(parseErr);
        rows_failed = 1;
      }
    } else {
      return NextResponse.json({ error: 'Cannot re-parse this document type' }, { status: 400 });
    }

    // Update document parse status
    try {
      db.prepare('UPDATE documents SET parse_status = ?, parse_error = ? WHERE id = ?').run(parse_status, parse_error, doc.id);
    } catch (updateErr) {
      console.warn('[parse POST] Could not update parse_status:', updateErr);
    }

    return NextResponse.json({
      success: true,
      document_id: doc.id,
      parse_status,
      parse_error,
      rows_imported,
      rows_failed,
      import_mode,
    });
  } catch (error) {
    console.error('[parse POST]', error);
    return NextResponse.json({ error: 'Re-parse failed' }, { status: 500 });
  }
}