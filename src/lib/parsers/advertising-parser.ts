/**
 * Advertising CSV/XLSX parser.
 * Expected columns (case-insensitive): platform, period_start, period_end,
 * spend, impressions, clicks, conversions, ctr
 * Platform is auto-detected from filename if column not present.
 */
import * as XLSX from 'xlsx';

export interface AdRow {
  platform: string;
  period_start: string | null;
  period_end: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  ctr: number;
}

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

export function parseAdvertisingBuffer(buffer: Buffer, filename: string): AdRow[] {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });

  const filenamePlatform = detectPlatformFromFilename(filename);
  const results: AdRow[] = [];

  for (const row of rows) {
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

    if (spend === 0 && impressions === 0 && clicks === 0) continue;
    results.push({ platform: String(platform), period_start, period_end, spend, impressions, clicks, conversions, ctr });
  }
  return results;
}
