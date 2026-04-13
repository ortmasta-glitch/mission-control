/**
 * Financial CSV/XLSX parser.
 * Expected columns (case-insensitive): month | date, clinic, revenue, costs | cost
 * Month format: YYYY-MM or YYYY-MM-DD (date portion extracted)
 */
import * as XLSX from 'xlsx';

export const FINANCIAL_PARSER_VERSION = '2.0.0';

export type ParseStatus = 'pending' | 'success' | 'failed' | 'stale';

export interface Provenance {
  source_document_id: string;
  parse_timestamp: string; // ISO 8601
  parser_version: string;
  import_mode: 'manual' | 'scheduled' | 'retry';
}

export interface ParseResult<T> {
  data: T[];
  provenance: Provenance;
  status: ParseStatus;
  rows_imported: number;
  rows_skipped: number;
  rows_failed: number;
  errors: ParseError[];
}

export interface ParseError {
  row_index: number;
  raw_values: Record<string, unknown>;
  reason: string;
}

export interface FinancialRow {
  clinic: string | null;
  month: string; // YYYY-MM
  revenue: number;
  costs: number;
  _provenance?: Provenance;
  _parse_status?: ParseStatus;
}

function normalizeKey(k: string): string {
  return k.toLowerCase().trim().replace(/[\s_-]+/g, '_');
}

function toMonth(val: string | number | undefined): string | null {
  if (!val) return null;
  const s = String(val).trim();
  if (/^\d{4}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 7);
  if (/^\d{2}\/\d{4}$/.test(s)) return `${s.slice(3)}-${s.slice(0, 2)}`;
  const n = Number(s);
  if (!isNaN(n) && n > 40000) {
    const d = XLSX.SSF.parse_date_code(n);
    if (d) return `${d.y}-${String(d.m).padStart(2, '0')}`;
  }
  return null;
}

function toNumber(val: unknown): number {
  if (val == null) return 0;
  const n = typeof val === 'number' ? val : parseFloat(String(val).replace(/[, ]/g, ''));
  return isNaN(n) ? 0 : n;
}

export function parseFinancialBuffer(
  buffer: Buffer,
  filename: string,
  options?: { source_document_id?: string; import_mode?: 'manual' | 'scheduled' | 'retry' }
): ParseResult<FinancialRow> {
  const source_document_id = options?.source_document_id || filename;
  const import_mode = options?.import_mode || 'manual';

  const provenance: Provenance = {
    source_document_id,
    parse_timestamp: new Date().toISOString(),
    parser_version: FINANCIAL_PARSER_VERSION,
    import_mode,
  };

  const errors: ParseError[] = [];
  const results: FinancialRow[] = [];
  let rows_skipped = 0;

  let rows: Record<string, unknown>[];
  try {
    const wb = XLSX.read(buffer, { type: 'buffer', cellDates: false });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });
  } catch (err) {
    return {
      data: [],
      provenance,
      status: 'failed',
      rows_imported: 0,
      rows_skipped: 0,
      rows_failed: 1,
      errors: [{ row_index: 0, raw_values: {}, reason: `File parse error: ${err instanceof Error ? err.message : String(err)}` }],
    };
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const normalized: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      normalized[normalizeKey(k)] = v;
    }

    const rawMonth = normalized['month'] ?? normalized['date'] ?? normalized['okres'] ?? normalized['miesiąc'];
    const month = toMonth(rawMonth as string | number | undefined);
    if (!month) {
      rows_skipped++;
      errors.push({ row_index: i, raw_values: normalized, reason: 'Could not parse month/date value' });
      continue;
    }

    const clinic = (normalized['clinic'] ?? normalized['klinika'] ?? normalized['oddział'] ?? null) as string | null;
    const revenue = toNumber(normalized['revenue'] ?? normalized['przychód'] ?? normalized['przychody'] ?? normalized['income'] ?? 0);
    const costs = toNumber(normalized['costs'] ?? normalized['cost'] ?? normalized['koszty'] ?? normalized['wydatki'] ?? normalized['expenses'] ?? 0);

    results.push({
      clinic: clinic ? String(clinic) : null,
      month,
      revenue,
      costs,
      _provenance: provenance,
      _parse_status: 'success',
    });
  }

  return {
    data: results,
    provenance,
    status: results.length > 0 ? 'success' : 'failed',
    rows_imported: results.length,
    rows_skipped,
    rows_failed: errors.length,
    errors,
  };
}