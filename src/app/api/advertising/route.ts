import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

const PLATFORMS = ['Google Ads', 'Instagram', 'Facebook', 'TikTok'];
const STALE_THRESHOLD_DAYS = 14;

// GET /api/advertising
export async function GET(request: NextRequest) {
  try {
    const db = getDb();

    // Aggregate per platform — include provenance and calculated metrics
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
        MAX(source_file) as source_file,
        MAX(source_document_id) as source_document_id,
        MAX(parse_timestamp) as last_parse_timestamp,
        MAX(parser_version) as last_parser_version,
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
      source_file: string | null;
      source_document_id: string | null;
      last_parse_timestamp: string | null;
      last_parser_version: string | null;
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
      if (!s) return {
        platform: name, spend: 0, impressions: 0, clicks: 0, conversions: 0, ctr: 0,
        last_import: null, last_period_end: null, source_file: null, source_document_id: null,
        last_parse_timestamp: null, last_parser_version: null, row_count: 0, hasData: false,
        cpc: null, cpa: null, cvr: null, is_stale: false,
      };
      // Calculate CPC / CPA / CVR
      const cpc = s.clicks > 0 ? s.spend / s.clicks : null;
      const cpa = s.conversions > 0 ? s.spend / s.conversions : null;
      const cvr = s.clicks > 0 ? (s.conversions / s.clicks) * 100 : null;

      // Stale detection
      let is_stale = false;
      if (s.last_import) {
        const ageDays = (Date.now() - new Date(s.last_import).getTime()) / 86_400_000;
        is_stale = ageDays > STALE_THRESHOLD_DAYS;
      }

      return { ...s, cpc, cpa, cvr, hasData: true, is_stale };
    });

    // Recent entries for each platform (last 6 periods) — include provenance
    const recentByPlatform: Record<string, unknown[]> = {};
    for (const platform of PLATFORMS) {
      const rows = db.prepare(`
        SELECT *, cpc as calculated_cpc, cpa as calculated_cpa, cvr as calculated_cvr FROM ad_metrics WHERE platform = ? ORDER BY period_end DESC, imported_at DESC LIMIT 6
      `).all(platform);
      if (rows.length) recentByPlatform[platform] = rows;
    }

    return NextResponse.json({ channels, recentByPlatform });
  } catch (error) {
    console.error('[advertising GET]', error);
    return NextResponse.json({ error: 'Failed to fetch advertising data' }, { status: 500 });
  }
}