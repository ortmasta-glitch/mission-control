import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface MonthlyEntry {
  month: string;
  clinic: string | null;
  revenue: number;
  costs: number;
}

interface MonthlySummary {
  month: string;
  revenue: number;
  costs: number;
  net: number;
  margin_pct: number;
  delta_absolute: number;
  delta_pct: number;
}

interface ParseResultSummary {
  rows_imported: number;
  rows_skipped: number;
  rows_failed: number;
  parse_status: string;
  parse_timestamp: string;
  parser_version: string;
  import_mode: string;
}

interface SourceFileDetail {
  source_file: string;
  source_document_id: string | null;
  imported_at: string;
  parse_timestamp: string | null;
  parser_version: string | null;
  import_mode: string | null;
  rows_count: number;
}

// GET /api/financial?clinic=Olsztyn
export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const clinicFilter = request.nextUrl.searchParams.get('clinic');

    let entries: MonthlyEntry[];
    if (clinicFilter && clinicFilter !== 'all') {
      entries = db.prepare(`
        SELECT month, clinic, SUM(revenue) as revenue, SUM(costs) as costs
        FROM financial_entries
        WHERE clinic = ? OR clinic IS NULL
        GROUP BY month, clinic
        ORDER BY month ASC
      `).all(clinicFilter) as MonthlyEntry[];
    } else {
      entries = db.prepare(`
        SELECT month, clinic, SUM(revenue) as revenue, SUM(costs) as costs
        FROM financial_entries
        GROUP BY month, clinic
        ORDER BY month ASC
      `).all() as MonthlyEntry[];
    }

    const byMonth: Record<string, MonthlySummary> = {};
    for (const e of entries) {
      if (!byMonth[e.month]) {
        byMonth[e.month] = { month: e.month, revenue: 0, costs: 0, net: 0, margin_pct: 0, delta_absolute: 0, delta_pct: 0 };
      }
      byMonth[e.month].revenue += e.revenue;
      byMonth[e.month].costs += e.costs;
    }
    
    const monthly = Object.values(byMonth)
      .sort((a, b) => a.month.localeCompare(b.month))
      .map((m, idx, arr) => {
        const net = m.revenue - m.costs;
        const margin_pct = m.revenue > 0 ? (net / m.revenue * 100) : 0;
        const prev = arr[idx - 1];
        const delta_absolute = prev ? net - prev.net : 0;
        const delta_pct = prev && prev.net !== 0 ? ((net - prev.net) / Math.abs(prev.net)) * 100 : 0;
        return { ...m, net, margin_pct, delta_absolute, delta_pct };
      });

    const last12 = monthly.slice(-12);

    const latestMonth = monthly[monthly.length - 1] ?? null;
    const prevMonth = monthly[monthly.length - 2] ?? null;

    // Projection with sparse data suppression
    const trailing = monthly.slice(-3);
    const avgRevenue = trailing.length ? trailing.reduce((s, m) => s + m.revenue, 0) / trailing.length : 0;
    const avgCosts = trailing.length ? trailing.reduce((s, m) => s + m.costs, 0) / trailing.length : 0;
    const projectionConfidence = monthly.length >= 3 ? 'normal' : monthly.length >= 1 ? 'low' : 'none';

    const projections: MonthlySummary[] = [];
    if (latestMonth && projectionConfidence !== 'none') {
      for (let i = 1; i <= 3; i++) {
        const [year, month] = latestMonth.month.split('-').map(Number);
        const d = new Date(year, month - 1 + i, 1);
        const projMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const net = avgRevenue - avgCosts;
        const margin_pct = avgRevenue > 0 ? (net / avgRevenue * 100) : 0;
        projections.push({ month: projMonth, revenue: avgRevenue, costs: avgCosts, net, margin_pct, delta_absolute: 0, delta_pct: 0 });
      }
    }

    const clinics = db.prepare(`
      SELECT clinic, SUM(revenue) as revenue, SUM(costs) as costs
      FROM financial_entries
      WHERE clinic IS NOT NULL
      GROUP BY clinic
      ORDER BY revenue DESC
    `).all() as { clinic: string; revenue: number; costs: number }[];

    const clinicsWithMargin = clinics.map(c => ({
      ...c,
      margin_pct: c.revenue > 0 ? ((c.revenue - c.costs) / c.revenue * 100) : 0,
    }));

    // Data freshness with full provenance
    const freshness = db.prepare(
      `SELECT MAX(imported_at) as last_import, MAX(parse_timestamp) as last_parse_timestamp, MAX(parser_version) as last_parser_version, MAX(import_mode) as last_import_mode FROM financial_entries`
    ).get() as { last_import: string | null; last_parse_timestamp: string | null; last_parser_version: string | null; last_import_mode: string | null };

    // Source file details with row counts
    const sourceFiles = db.prepare(`
      SELECT 
        source_file, 
        source_document_id, 
        imported_at, 
        parse_timestamp, 
        parser_version, 
        import_mode,
        COUNT(*) as rows_count
      FROM financial_entries 
      WHERE source_file IS NOT NULL
      GROUP BY source_file, source_document_id, imported_at, parse_timestamp, parser_version, import_mode
      ORDER BY imported_at DESC
    `).all() as SourceFileDetail[];

    // Per-source parse result summaries
    const parseResults = db.prepare(`
      SELECT 
        source_document_id,
        parse_timestamp,
        parser_version,
        import_mode,
        COUNT(*) as rows_imported
      FROM financial_entries
      WHERE source_document_id IS NOT NULL
      GROUP BY source_document_id, parse_timestamp, parser_version, import_mode
    `).all() as ParseResultSummary[];

    // MTD timezone handling: use the stored timestamp directly (ISO 8601)
    const mtdTimestamp = latestMonth ? `${latestMonth.month}-01T00:00:00.000Z` : null;
    const priorMonthTimestamp = prevMonth ? `${prevMonth.month}-01T00:00:00.000Z` : null;

    return NextResponse.json({
      monthly: last12,
      projections,
      projectionConfidence,
      mtd: latestMonth,
      prevMonth,
      clinics: clinicsWithMargin,
      lastImport: freshness.last_import,
      lastParseTimestamp: freshness.last_parse_timestamp,
      lastParserVersion: freshness.last_parser_version,
      lastImportMode: freshness.last_import_mode,
      sourceFiles,
      parseResults,
      totalEntries: entries.length,
      mtdTimestamp,
      priorMonthTimestamp,
    });
  } catch (error) {
    console.error('[financial GET]', error);
    return NextResponse.json({ error: 'Failed to fetch financial data' }, { status: 500 });
  }
}
