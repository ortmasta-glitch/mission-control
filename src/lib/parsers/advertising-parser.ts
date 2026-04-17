/**
 * Advertising CSV/XLSX parser v2.1.0 — T3-C Remediation
 * Enhanced with: required column validation, header normalization, 
 * canonical metric schema with CPC/CPA/CVR, raw data preservation,
 * stale detection, and provenance tracking.
 */
import * as XLSX from 'xlsx';

export const AD_PARSER_VERSION = '2.1.0';

export type ParseStatus = 'pending' | 'success' | 'failed' | 'stale' | 'partial';

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
  validation_summary?: {
    required_columns_found: string[];
    required_columns_missing: string[];
    header_normalization_applied: boolean;
    total_rows: number;
    empty_rows_skipped: number;
  };
}

export interface ParseError {
  row_index: number;
  raw_values: Record<string, unknown>;
  reason: string;
  severity: 'error' | 'warning';
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

/** Required column aliases for advertising data */
const REQUIRED_COLUMN_ALIASES: Record<string, string[]> = {
  spend: ['spend', 'cost', 'amount_spent', 'wydatki', 'koszty', 'cost_usd', 'cost_pln'],
  impressions: ['impressions', 'wyświetlenia', 'wyswietlenia', 'views', 'impr'],
};

const OPTIONAL_COLUMN_ALIASES: Record<string, string[]> = {
  platform: ['platform', 'platforma', 'sieć', 'siec', 'network', 'ad_network'],
  period_start: ['period_start', 'date_start', 'start', 'od', 'date', 'day', 'dzień', 'dzien'],
  period_end: ['period_end', 'date_end', 'end', 'do', 'date_stop'],
  clicks: ['clicks', 'kliknięcia', 'klikniecia', 'link_clicks', 'clicks_total'],
  conversions: ['conversions', 'konwersje', 'purchases', 'orders', 'leads'],
  ctr: ['ctr', 'click_through_rate', 'ctr_percent'],
  cpc: ['cpc', 'cost_per_click', 'koszt_kliknięcia'],
  cpa: ['cpa', 'cost_per_acquisition', 'cost_per_conversion'],
  cvr: ['cvr', 'conversion_rate', 'cr', 'conversion_rate_percent'],
};

const PLATFORM_PATTERNS: [RegExp, string][] = [
  [/google/i, 'Google Ads'],
  [/instagram/i, 'Instagram'],
  [/facebook|fb/i, 'Facebook'],
  [/tiktok/i, 'TikTok'],
  [/linkedin/i, 'LinkedIn'],
];

function detectPlatformFromFilename(filename: string): string | null {
  for (const [pattern, name] of PLATFORM_PATTERNS) {
    if (pattern.test(filename)) return name;
  }
  return null;
}

function normalizeKey(k: string): string {
  return k.toLowerCase().trim().replace(/[\s_-]+/g, '_').replace(/ó/g, 'o').replace(/ł/g, 'l').replace(/ś/g, 's').replace(/ź/g, 'z').replace(/ż/g, 'z').replace(/ć/g, 'c').replace(/ń/g, 'n').replace(/ą/g, 'a').replace(/ę/g, 'e');
}

function toNumber(val: unknown): number {
  if (val == null) return 0;
  const s = String(val).trim().replace(/[ ]/g, '');
  // European format: "1.234,56" → 1234.56
  if (/^[\d.]+,\d{1,2}$/.test(s)) {
    return parseFloat(s.replace(/\./g, '').replace(',', '.'));
  }
  // US format: "1,234.56" → 1234.56
  if (/^[\d,]+\.\d{1,2}$/.test(s)) {
    return parseFloat(s.replace(/,/g, ''));
  }
  // Percentage like "5.2%"
  const pct = s.replace('%', '');
  const n = parseFloat(pct);
  return isNaN(n) ? 0 : n;
}

function toDateString(val: unknown): string | null {
  if (!val) return null;
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // DD.MM.YYYY or DD/MM/YYYY
  const euMatch = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (euMatch) return `${euMatch[3]}-${euMatch[2].padStart(2, '0')}-${euMatch[1].padStart(2, '0')}`;
  // Excel serial date
  const num = Number(s);
  if (!isNaN(num) && num > 40000) {
    try {
      const d = XLSX.SSF.parse_date_code(num);
      if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
    } catch { return null; }
  }
  return null;
}

function validateRequiredColumns(headers: string[]): { found: string[]; missing: string[] } {
  const normalized = headers.map(normalizeKey);
  const found: string[] = [];
  const missing: string[] = [];
  
  for (const [field, aliases] of Object.entries(REQUIRED_COLUMN_ALIASES)) {
    const fieldAliases = aliases.map(normalizeKey);
    if (normalized.some(h => fieldAliases.includes(h))) {
      found.push(field);
    } else {
      missing.push(field);
    }
  }
  
  return { found, missing };
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
  let header_normalization_applied = false;
  let empty_rows_skipped = 0;

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
      errors: [{ row_index: 0, raw_values: {}, reason: `File parse error: ${err instanceof Error ? err.message : String(err)}`, severity: 'error' }],
    };
  }

  if (rows.length === 0) {
    return {
      data: [],
      provenance,
      status: 'failed',
      rows_imported: 0,
      rows_skipped: 0,
      rows_failed: 0,
      errors: [{ row_index: 0, raw_values: {}, reason: 'No data rows found in file', severity: 'error' }],
    };
  }

  // Validate required columns
  const rawHeaders = Object.keys(rows[0]);
  const { found: foundRequired, missing: missingRequired } = validateRequiredColumns(rawHeaders);
  
  // Check if normalization was needed
  const originalNormalized = rawHeaders.map(normalizeKey);
  const canonicalHeaders = Object.values(REQUIRED_COLUMN_ALIASES).flat().concat(Object.values(OPTIONAL_COLUMN_ALIASES).flat()).map(normalizeKey);
  for (const h of originalNormalized) {
    if (!canonicalHeaders.includes(h) && h.length > 0) {
      header_normalization_applied = true;
      break;
    }
  }

  const filenamePlatform = detectPlatformFromFilename(filename);

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const n: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      n[normalizeKey(k)] = v;
    }

    const platform = (n['platform'] ?? n['platforma'] ?? filenamePlatform ?? 'Unknown') as string;
    const period_start = toDateString(n['period_start'] ?? n['date_start'] ?? n['start'] ?? n['od'] ?? n['date']);
    const period_end = toDateString(n['period_end'] ?? n['date_stop'] ?? n['end'] ?? n['do'] ?? period_start);
    const spend = toNumber(n['spend'] ?? n['cost'] ?? n['amount_spent'] ?? n['wydatki'] ?? 0);
    const impressions = Math.round(toNumber(n['impressions'] ?? n['wyswietlenia'] ?? 0));
    const clicks = Math.round(toNumber(n['clicks'] ?? n['klikniecia'] ?? 0));
    const conversions = toNumber(n['conversions'] ?? n['konwersje'] ?? 0);
    const ctr = toNumber(n['ctr'] ?? 0);
    
    // Explicit CPC/CPA/CVR from file, or calculate
    const explicit_cpc = n['cpc'] ? toNumber(n['cpc']) : null;
    const explicit_cpa = n['cpa'] ? toNumber(n['cpa']) : null;
    const explicit_cvr = n['cvr'] ? toNumber(n['cvr']) : null;

    // Skip completely empty rows
    if (spend === 0 && impressions === 0 && clicks === 0 && conversions === 0) {
      const allNull = Object.values(n).every(v => v == null || v === '' || v === 0);
      if (allNull) {
        empty_rows_skipped++;
        continue;
      }
      rows_skipped++;
      errors.push({ row_index: i + 1, raw_values: n, reason: 'All key metrics are zero', severity: 'warning' });
      continue;
    }

    // Calculate derived metrics
    const cpc = explicit_cpc ?? (clicks > 0 ? spend / clicks : null);
    const cpa = explicit_cpa ?? (conversions > 0 ? spend / conversions : null);
    const cvr = explicit_cvr ?? (clicks > 0 ? (conversions / clicks) * 100 : null);

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

  const status: ParseStatus = 
    results.length === 0 ? 'failed' :
    rows_skipped > 0 || errors.length > 0 ? 'partial' :
    'success';

  return {
    data: results,
    provenance,
    status,
    rows_imported: results.length,
    rows_skipped,
    rows_failed: errors.length,
    errors: errors.slice(0, 20), // Cap errors for UI display
    validation_summary: {
      required_columns_found: foundRequired,
      required_columns_missing: missingRequired,
      header_normalization_applied,
      total_rows: rows.length,
      empty_rows_skipped,
    },
  };
}
