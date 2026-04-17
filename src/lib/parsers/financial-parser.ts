/**
 * Financial CSV/XLSX parser with enhanced validation.
 * Expected columns (case-insensitive, whitespace-trimmed): month | date, clinic, revenue, costs | cost
 * Month format: YYYY-MM or YYYY-MM-DD (date portion extracted)
 * Supports both decimal comma (European) and decimal dot (US) formats.
 */
import * as XLSX from 'xlsx';

export const FINANCIAL_PARSER_VERSION = '2.1.0';

export type ParseStatus = 'pending' | 'success' | 'failed' | 'stale' | 'partial';

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
  validation_summary: ValidationSummary;
}

export interface ValidationSummary {
  required_columns_found: string[];
  required_columns_missing: string[];
  header_normalization_applied: boolean;
  total_rows: number;
  empty_rows_skipped: number;
}

export interface ParseError {
  row_index: number;
  raw_values: Record<string, unknown>;
  reason: string;
  severity: 'error' | 'warning';
}

export interface FinancialRow {
  clinic: string | null;
  month: string; // YYYY-MM
  revenue: number;
  costs: number;
  _provenance?: Provenance;
  _parse_status?: ParseStatus;
}

// Required columns with aliases (any alias satisfies the requirement)
const REQUIRED_COLUMN_ALIASES: Record<string, string[]> = {
  month: ['month', 'date', 'okres', 'miesiąc', 'miesiac'],
  clinic: ['clinic', 'klinika', 'oddział', 'oddzial', 'location'],
  revenue: ['revenue', 'przychód', 'przychody', 'income', 'sales', 'turnover'],
  costs: ['costs', 'cost', 'koszty', 'wydatki', 'expenses'],
};

function normalizeKey(k: string): string {
  return k.toLowerCase().trim().replace(/[\s_-]+/g, '_').replace(/ó/g, 'o').replace(/ł/g, 'l');
}

function findMatchingColumn(normalizedHeaders: string[], aliases: string[]): string | null {
  for (const alias of aliases) {
    if (normalizedHeaders.includes(alias)) return alias;
  }
  return null;
}

function validateRequiredColumns(headers: string[]): { found: string[]; missing: string[]; normalized: Record<string, string> } {
  const normalizedHeaders = headers.map(normalizeKey);
  const found: string[] = [];
  const missing: string[] = [];
  const headerMap: Record<string, string> = {};

  for (const [field, aliases] of Object.entries(REQUIRED_COLUMN_ALIASES)) {
    const match = findMatchingColumn(normalizedHeaders, aliases);
    if (match) {
      found.push(field);
      // Map the canonical field name to the actual header found
      const originalIndex = normalizedHeaders.indexOf(match);
      headerMap[field] = headers[originalIndex];
    } else {
      missing.push(field);
    }
  }

  return { found, missing, normalized: headerMap };
}

function toMonth(val: string | number | undefined): string | null {
  if (!val) return null;
  const s = String(val).trim();
  
  // YYYY-MM format
  if (/^\d{4}-\d{2}$/.test(s)) return s;
  
  // YYYY-MM-DD format (extract YYYY-MM)
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 7);
  
  // DD/MM/YYYY or MM/DD/YYYY format
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    const parts = s.split('/');
    // Assume DD/MM/YYYY for European format
    return `${parts[2]}-${parts[1]}`;
  }
  
  // MM/YYYY format
  if (/^\d{2}\/\d{4}$/.test(s)) return `${s.slice(3)}-${s.slice(0, 2)}`;
  
  // Excel serial date number
  const n = Number(s);
  if (!isNaN(n) && n > 40000) {
    const d = XLSX.SSF.parse_date_code(n);
    if (d) return `${d.y}-${String(d.m).padStart(2, '0')}`;
  }
  
  return null;
}

function toNumber(val: unknown): number {
  if (val == null || val === '') return 0;
  
  // Handle numeric values directly
  if (typeof val === 'number') return val;
  
  const s = String(val).trim();
  if (!s) return 0;
  
  // Detect European format (comma as decimal separator)
  // Pattern: digits, optional spaces/thousand separators, comma, digits
  // Examples: "1 234,56" or "1234,56" or "1.234,56"
  const europeanMatch = s.match(/^[\d\s.]+,\d{1,2}$/);
  if (europeanMatch) {
    // Remove thousand separators (spaces, dots), replace comma with dot
    const normalized = s.replace(/[\s.]/g, '').replace(',', '.');
    const n = parseFloat(normalized);
    return isNaN(n) ? 0 : n;
  }
  
  // US format (dot as decimal separator)
  // Pattern: digits, optional commas as thousand separators, dot, digits
  // Examples: "1,234.56" or "1234.56"
  const usMatch = s.match(/^[\d,]+\.\d{1,2}$/);
  if (usMatch) {
    const normalized = s.replace(/,/g, '');
    const n = parseFloat(normalized);
    return isNaN(n) ? 0 : n;
  }
  
  // Plain integer or already-clean number string
  const clean = s.replace(/[\s,]/g, '');
  const n = parseFloat(clean);
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
  let empty_rows_skipped = 0;

  let rows: Record<string, unknown>[];
  let rawHeaders: string[] = [];
  
  try {
    const wb = XLSX.read(buffer, { type: 'buffer', cellDates: false });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    
    // Get raw headers from first row
    const jsonFull = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
    if (jsonFull.length > 0) {
      const firstRow = jsonFull[0];
      rawHeaders = firstRow.map(h => String(h ?? ''));
    }
    
    // Parse data rows (skip header)
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
      validation_summary: {
        required_columns_found: [],
        required_columns_missing: ['month', 'clinic', 'revenue', 'costs'],
        header_normalization_applied: false,
        total_rows: 0,
        empty_rows_skipped: 0,
      },
    };
  }

  // Validate required columns
  const validation = validateRequiredColumns(rawHeaders);
  const headerNormalizationApplied = rawHeaders.some(h => normalizeKey(h) !== h);

  if (validation.missing.length > 0) {
    return {
      data: [],
      provenance,
      status: 'failed',
      rows_imported: 0,
      rows_skipped: 0,
      rows_failed: 1,
      errors: [{ 
        row_index: 0, 
        raw_values: { headers: rawHeaders }, 
        reason: `Missing required columns: ${validation.missing.join(', ')}. Found: ${validation.found.join(', ') || 'none'}.`,
        severity: 'error',
      }],
      validation_summary: {
        required_columns_found: validation.found,
        required_columns_missing: validation.missing,
        header_normalization_applied: headerNormalizationApplied,
        total_rows: rows.length,
        empty_rows_skipped: 0,
      },
    };
  }

  // Build header mapping for data extraction
  const headerMap: Record<string, string> = {};
  for (const [field, aliases] of Object.entries(REQUIRED_COLUMN_ALIASES)) {
    const normalizedHeaders = rawHeaders.map(normalizeKey);
    const match = findMatchingColumn(normalizedHeaders, aliases);
    if (match) {
      const originalIndex = normalizedHeaders.indexOf(match);
      headerMap[field] = rawHeaders[originalIndex];
    }
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    
    // Skip completely empty rows
    const hasAnyValue = Object.values(row).some(v => v !== null && v !== undefined && v !== '');
    if (!hasAnyValue) {
      empty_rows_skipped++;
      rows_skipped++;
      continue;
    }

    // Normalize row keys
    const normalized: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      normalized[normalizeKey(k)] = v;
    }

    // Extract values using header mapping
    const monthKey = headerMap['month'] ? normalizeKey(headerMap['month']) : 'month';
    const clinicKey = headerMap['clinic'] ? normalizeKey(headerMap['clinic']) : 'clinic';
    const revenueKey = headerMap['revenue'] ? normalizeKey(headerMap['revenue']) : 'revenue';
    const costsKey = headerMap['costs'] ? normalizeKey(headerMap['costs']) : 'costs';

    const rawMonth = normalized[monthKey] ?? normalized['date'] ?? normalized['okres'] ?? normalized['miesiąc'] ?? normalized['miesiac'];
    const month = toMonth(rawMonth as string | number | undefined);
    
    if (!month) {
      rows_skipped++;
      errors.push({ 
        row_index: i + 1, // 1-indexed for user-friendly reporting
        raw_values: { month: rawMonth }, 
        reason: `Could not parse month/date value: "${rawMonth}"`,
        severity: 'error',
      });
      continue;
    }

    const rawClinic = normalized[clinicKey] ?? normalized['klinika'] ?? normalized['oddział'] ?? normalized['oddzial'] ?? null;
    const clinic = rawClinic ? String(rawClinic).trim() : null;

    const rawRevenue = normalized[revenueKey] ?? normalized['przychód'] ?? normalized['przychody'] ?? normalized['income'] ?? 0;
    const revenue = toNumber(rawRevenue);

    const rawCosts = normalized[costsKey] ?? normalized['koszty'] ?? normalized['wydatki'] ?? normalized['expenses'] ?? 0;
    const costs = toNumber(rawCosts);

    results.push({
      clinic,
      month,
      revenue,
      costs,
      _provenance: provenance,
      _parse_status: 'success',
    });
  }

  // Determine final status
  let status: ParseStatus = 'success';
  if (results.length === 0 && errors.length > 0) {
    status = 'failed';
  } else if (results.length > 0 && errors.length > 0) {
    status = 'partial';
  }

  return {
    data: results,
    provenance,
    status,
    rows_imported: results.length,
    rows_skipped,
    rows_failed: errors.filter(e => e.severity === 'error').length,
    errors,
    validation_summary: {
      required_columns_found: validation.found,
      required_columns_missing: validation.missing,
      header_normalization_applied: headerNormalizationApplied,
      total_rows: rows.length,
      empty_rows_skipped,
    },
  };
}
