import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

const PLATFORMS = ['Google Ads', 'Instagram', 'Facebook', 'TikTok'];

// GET /api/advertising
export async function GET() {
  try {
    const db = getDb();

    // Aggregate per platform
    const platformSummaries = db.prepare(`
      SELECT
        platform,
        SUM(spend) as spend,
        SUM(impressions) as impressions,
        SUM(clicks) as clicks,
        SUM(conversions) as conversions,
        AVG(ctr) as ctr,
        MAX(imported_at) as last_import,
        MAX(period_end) as last_period_end,
        COUNT(*) as row_count
      FROM ad_metrics
      GROUP BY platform
    `).all() as {
      platform: string;
      spend: number;
      impressions: number;
      clicks: number;
      conversions: number;
      ctr: number;
      last_import: string | null;
      last_period_end: string | null;
      row_count: number;
    }[];

    // Build a map
    const summaryMap: Record<string, typeof platformSummaries[0]> = {};
    for (const s of platformSummaries) {
      summaryMap[s.platform] = s;
    }

    // Ensure all 4 platforms appear (with zeros if no data)
    const channels = PLATFORMS.map(name => {
      const s = summaryMap[name];
      if (!s) return { platform: name, spend: 0, impressions: 0, clicks: 0, conversions: 0, ctr: 0, last_import: null, last_period_end: null, row_count: 0, hasData: false };
      return { ...s, hasData: true };
    });

    // Recent entries for each platform (last 6 periods)
    const recentByPlatform: Record<string, unknown[]> = {};
    for (const platform of PLATFORMS) {
      const rows = db.prepare(`
        SELECT * FROM ad_metrics WHERE platform = ? ORDER BY period_end DESC, imported_at DESC LIMIT 6
      `).all(platform);
      if (rows.length) recentByPlatform[platform] = rows;
    }

    return NextResponse.json({ channels, recentByPlatform });
  } catch (error) {
    console.error('[advertising GET]', error);
    return NextResponse.json({ error: 'Failed to fetch advertising data' }, { status: 500 });
  }
}
