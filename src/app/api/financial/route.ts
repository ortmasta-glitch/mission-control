import { NextResponse } from 'next/server';
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
}

// GET /api/financial
export async function GET() {
  try {
    const db = getDb();

    // All entries, ordered by month
    const entries = db.prepare(`
      SELECT month, clinic, SUM(revenue) as revenue, SUM(costs) as costs
      FROM financial_entries
      GROUP BY month, clinic
      ORDER BY month ASC
    `).all() as MonthlyEntry[];

    // Aggregate by month (across all clinics)
    const byMonth: Record<string, MonthlySummary> = {};
    for (const e of entries) {
      if (!byMonth[e.month]) {
        byMonth[e.month] = { month: e.month, revenue: 0, costs: 0, net: 0 };
      }
      byMonth[e.month].revenue += e.revenue;
      byMonth[e.month].costs += e.costs;
    }
    const monthly = Object.values(byMonth)
      .sort((a, b) => a.month.localeCompare(b.month))
      .map(m => ({ ...m, net: m.revenue - m.costs }));

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
        projections.push({ month: projMonth, revenue: avgRevenue, costs: avgCosts, net: avgRevenue - avgCosts });
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

    // Data freshness
    const freshness = db.prepare(
      `SELECT MAX(imported_at) as last_import FROM financial_entries`
    ).get() as { last_import: string | null };

    return NextResponse.json({
      monthly: last12,
      projections,
      mtd: latestMonth,
      prevMonth,
      clinics,
      lastImport: freshness.last_import,
      totalEntries: entries.length,
    });
  } catch (error) {
    console.error('[financial GET]', error);
    return NextResponse.json({ error: 'Failed to fetch financial data' }, { status: 500 });
  }
}
