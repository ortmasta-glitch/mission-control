/**
 * Financial CSV/XLSX parser.
 * Expected columns (case-insensitive): month | date, clinic, revenue, costs | cost
 * Month format: YYYY-MM or YYYY-MM-DD (date portion extracted)
 */
import * as XLSX from 'xlsx';

export interface FinancialRow {
  clinic: string | null;
  month: string; // YYYY-MM
  revenue: number;
  costs: number;
}

function normalizeKey(k: string): string {
  return k.toLowerCase().trim().replace(/[\s_-]+/g, '_');
}

function toMonth(val: string | number | undefined): string | null {
  if (!val) return null;
  const s = String(val).trim();
  // YYYY-MM
  if (/^\d{4}-\d{2}$/.test(s)) return s;
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 7);
  // MM/YYYY or YYYY/MM
  if (/^\d{2}\/\d{4}$/.test(s)) return `${s.slice(3)}-${s.slice(0, 2)}`;
  // Excel serial date
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

export function parseFinancialBuffer(buffer: Buffer, filename: string): FinancialRow[] {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });

  const results: FinancialRow[] = [];
  for (const row of rows) {
    const normalized: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      normalized[normalizeKey(k)] = v;
    }

    const rawMonth = normalized['month'] ?? normalized['date'] ?? normalized['okres'] ?? normalized['miesiąc'];
    const month = toMonth(rawMonth as string | number | undefined);
    if (!month) continue;

    const clinic = (normalized['clinic'] ?? normalized['klinika'] ?? normalized['oddział'] ?? null) as string | null;
    const revenue = toNumber(normalized['revenue'] ?? normalized['przychód'] ?? normalized['przychody'] ?? normalized['income'] ?? 0);
    const costs = toNumber(normalized['costs'] ?? normalized['cost'] ?? normalized['koszty'] ?? normalized['wydatki'] ?? normalized['expenses'] ?? 0);

    results.push({ clinic: clinic ? String(clinic) : null, month, revenue, costs });
  }
  return results;
}
