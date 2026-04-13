/**
 * Advertising CSV/XLSX parser.
 * Expected columns (case-insensitive): platform, period_start, period_end,
 * spend, impressions, clicks, conversions, ctr
 * Platform is auto-detected from filename if column not present.
 */
import * as XLSX from 'xlsx';

export const AD_PARSER_VERSION = '2.0.0';

export type ParseStatus = 'pending' | 'success' | 'failed' | 'stale';

export interface Provenance {
  source_document_id: string;
  parse_timestamp: string;
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

/** Canonical normalized advertising record */
export interface CanonicalAdRow {
  platform: string;
  period_start: string | null;
  period_end: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  ctr: number;
  /** Cost Per Click - calculated if not provided */
  cpc: number | null;
  /** Cost Per Acquisition (conversion) - calculated */
  cpa: number | null;
  /** Conversion Rate - calculated */
  cvr: number | null;
  _provenance?: Provenance;
  _parse_status?: ParseStatus;
  _raw?: Record<string, unknown>;
}

/** Legacy alias for backward compat */
export type AdRow = CanonicalAdRow;

const PLATFORM_PATTERNS: [RegExp, string][] = [
  [/google/i, 'Google Ads'],
  [/instagram/i, 'Instagram'],
  [/facebook|fb/i, 'Facebook'],
  [/tiktok/i, 'TikTok'],
];

function detectPlatformFromFilename(filename: string): string | null {
  for (const [pattern, name] of PLATFORM_PATTERNS) {
    if (pattern.test(filename)) return name;
  }
  return null;
}

function normalizeKey(k: string): string {
  return k.toLowerCase().trim().replace(/[\s_-]+/g, '_');
}

function toNumber(val: unknown): number {
  if (val == null) return 0;
  const n = typeof val === 'number' ? val : parseFloat(String(val).replace(/[%, ]/g, ''));
  return isNaN(n) ? 0 : n;
}

function toDateString(val: unknown): string | null {
  if (!val) return null;
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const num = Number(s);
  if (!isNaN(num) && num > 40000) {
    try {
      const d = XLSX.SSF.parse_date_code(num);
      if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
    } catch { return null; }
  }
  return null;
}

export function parseAdvertisingBuffer(
  buffer: Buffer,
  filename: string,
  options?: { source_document_id?: string; import_mode?: 'manual' | 'scheduled' | 'retry' }
): ParseResult<CanonicalAdRow> {
  const source_document_id = options?.source_document_id || filename;
  const import_mode = options?.import_mode || 'manual';

  const provenance: Provenance = {
    source_document_id,
    parse_timestamp: new Date().toISOString(),
    parser_version: AD_PARSER_VERSION,
    import_mode,
  };

  const errors: ParseError[] = [];
  const results: CanonicalAdRow[] = [];
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

  const filenamePlatform = detectPlatformFromFilename(filename);

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const n: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      n[normalizeKey(k)] = v;
    }

    const platform = (n['platform'] ?? n['platforma'] ?? filenamePlatform ?? 'Unknown') as string;
    const period_start = toDateString(n['period_start'] ?? n['date_start'] ?? n['start'] ?? n['od']);
    const period_end = toDateString(n['period_end'] ?? n['date_stop'] ?? n['end'] ?? n['do']);
    const spend = toNumber(n['spend'] ?? n['cost'] ?? n['amount_spent'] ?? n['wydatki'] ?? 0);
    const impressions = Math.round(toNumber(n['impressions'] ?? n['wyswietlenia'] ?? 0));
    const clicks = Math.round(toNumber(n['clicks'] ?? n['klikniecia'] ?? 0));
    const conversions = toNumber(n['conversions'] ?? n['konwersje'] ?? 0);
    const ctr = toNumber(n['ctr'] ?? 0);

    if (spend === 0 && impressions === 0 && clicks === 0) {
      rows_skipped++;
      errors.push({ row_index: i, raw_values: n, reason: 'All key metrics are zero' });
      continue;
    }

    // Calculate CPC/CPA/CVR
    const cpc = clicks > 0 ? spend / clicks : null;
    const cpa = conversions > 0 ? spend / conversions : null;
    const cvr = clicks > 0 ? (conversions / clicks) * 100 : null;

    results.push({
      platform: String(platform),
      period_start,
      period_end,
      spend,
      impressions,
      clicks,
      conversions,
      ctr,
      cpc,
      cpa,
      cvr,
      _provenance: provenance,
      _parse_status: 'success',
      _raw: n,
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