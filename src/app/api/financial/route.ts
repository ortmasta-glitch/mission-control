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
}

// GET /api/financial?clinic=Olsztyn
export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const clinicFilter = request.nextUrl.searchParams.get('clinic');

    // Build query with optional clinic filter
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

    // Aggregate by month (across all clinics in filter)
    const byMonth: Record<string, MonthlySummary> = {};
    for (const e of entries) {
      if (!byMonth[e.month]) {
        byMonth[e.month] = { month: e.month, revenue: 0, costs: 0, net: 0, margin_pct: 0 };
      }
      byMonth[e.month].revenue += e.revenue;
      byMonth[e.month].costs += e.costs;
    }
    const monthly = Object.values(byMonth)
      .sort((a, b) => a.month.localeCompare(b.month))
      .map(m => ({ ...m, net: m.revenue - m.costs, margin_pct: m.revenue > 0 ? ((m.revenue - m.costs) / m.revenue * 100) : 0 }));

    // Last 12 months
    const last12 = monthly.slice(-12);

    // MTD (most recent month)
    const latestMonth = monthly[monthly.length - 1] ?? null;
    const prevMonth = monthly[monthly.length - 2] ?? null;

    // Projection: simple 3-month trailing average
    const trailing = monthly.slice(-3);
    const avgRevenue = trailing.length ? trailing.reduce((s, m) => s + m.revenue, 0) / trailing.length : 0;
    const avgCosts = trailing.length ? trailing.reduce((s, m) => s + m.costs, 0) / trailing.length : 0;

    const projections: MonthlySummary[] = [];
    if (latestMonth) {
      for (let i = 1; i <= 3; i++) {
        const [year, month] = latestMonth.month.split('-').map(Number);
        const d = new Date(year, month - 1 + i, 1);
        const projMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const net = avgRevenue - avgCosts;
        projections.push({ month: projMonth, revenue: avgRevenue, costs: avgCosts, net, margin_pct: avgRevenue > 0 ? (net / avgRevenue * 100) : 0 });
      }
    }

    // Per-clinic breakdown (all-time totals)
    const clinics = db.prepare(`
      SELECT clinic, SUM(revenue) as revenue, SUM(costs) as costs
      FROM financial_entries
      WHERE clinic IS NOT NULL
      GROUP BY clinic
      ORDER BY revenue DESC
    `).all() as { clinic: string; revenue: number; costs: number }[];

    // Add margin % to clinics
    const clinicsWithMargin = clinics.map(c => ({
      ...c,
      margin_pct: c.revenue > 0 ? ((c.revenue - c.costs) / c.revenue * 100) : 0,
    }));

    // Data freshness with provenance
    const freshness = db.prepare(
      `SELECT MAX(imported_at) as last_import, MAX(parse_timestamp) as last_parse_timestamp, MAX(parser_version) as last_parser_version FROM financial_entries`
    ).get() as { last_import: string | null; last_parse_timestamp: string | null; last_parser_version: string | null };

    // Source file visibility
    const sourceFiles = db.prepare(
      `SELECT source_file, source_document_id, imported_at, parse_timestamp, parser_version FROM financial_entries GROUP BY source_file ORDER BY imported_at DESC`
    ).all() as { source_file: string; source_document_id: string | null; imported_at: string; parse_timestamp: string | null; parser_version: string | null }[];

    return NextResponse.json({
      monthly: last12,
      projections,
      mtd: latestMonth,
      prevMonth,
      clinics: clinicsWithMargin,
      lastImport: freshness.last_import,
      lastParseTimestamp: freshness.last_parse_timestamp,
      lastParserVersion: freshness.last_parser_version,
      sourceFiles,
      totalEntries: entries.length,
    });
  } catch (error) {
    console.error('[financial GET]', error);
    return NextResponse.json({ error: 'Failed to fetch financial data' }, { status: 500 });
  }
}