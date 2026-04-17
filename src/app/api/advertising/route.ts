import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

const PLATFORMS = ['Google Ads', 'Instagram', 'Facebook', 'TikTok'];
const STALE_THRESHOLD_DAYS = 14;
const SUSPICIOUS_METRIC_THRESHOLD = 2.0; // 200% change flags as suspicious

interface ChannelSummary {
  platform: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  ctr: number;
  cpc: number | null;
  cpa: number | null;
  cvr: number | null;
  last_import: string | null;
  last_period_end: string | null;
  source_file: string | null;
  source_document_id: string | null;
  last_parse_timestamp: string | null;
  last_parser_version: string | null;
  row_count: number;
  hasData: boolean;
  is_stale: boolean;
  is_suspicious: boolean;
  import_mode: string | null;
  // Import summary for provenance
  import_summary?: {
    rows_imported: number;
    parse_timestamp: string | null;
    parser_version: string | null;
  };
}

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
        MAX(import_mode) as import_mode,
        COUNT(*) as row_count
      FROM ad_metrics
      GROUP BY platform
    `).all() as ChannelSummary[];

    // Build a map
    const summaryMap: Record<string, ChannelSummary> = {};
    for (const s of platformSummaries) {
      summaryMap[s.platform] = s;
    }

    // Ensure all 4 platforms appear (with zeros if no data)
    const channels: ChannelSummary[] = PLATFORMS.map(name => {
      const s = summaryMap[name];
      if (!s) return {
        platform: name, spend: 0, impressions: 0, clicks: 0, conversions: 0, ctr: 0,
        last_import: null, last_period_end: null, source_file: null, source_document_id: null,
        last_parse_timestamp: null, last_parser_version: null, row_count: 0, hasData: false,
        cpc: null, cpa: null, cvr: null, is_stale: false, is_suspicious: false, import_mode: null,
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

      // Suspicious metric detection: check for unusually high spend or ctr vs previous
      let is_suspicious = false;
      if (s.last_import) {
        try {
          const prevRows = db.prepare(`
            SELECT spend, ctr FROM ad_metrics 
            WHERE platform = ? AND imported_at < ? 
            ORDER BY imported_at DESC LIMIT 5
          `).all(s.platform, s.last_import) as { spend: number; ctr: number }[];
          
          if (prevRows.length >= 2) {
            const avgPrevSpend = prevRows.reduce((sum, r) => sum + r.spend, 0) / prevRows.length;
            const avgPrevCtr = prevRows.reduce((sum, r) => sum + r.ctr, 0) / prevRows.length;
            if (avgPrevSpend > 0 && (s.spend / prevRows.length) > avgPrevSpend * SUSPICIOUS_METRIC_THRESHOLD) {
              is_suspicious = true;
            }
            if (avgPrevCtr > 0 && s.ctr > avgPrevCtr * SUSPICIOUS_METRIC_THRESHOLD) {
              is_suspicious = true;
            }
          }
        } catch {
          // Suspicious detection is best-effort
        }
      }

      // Import summary for provenance visibility
      const import_summary = s.row_count > 0 ? {
        rows_imported: s.row_count,
        parse_timestamp: s.last_parse_timestamp,
        parser_version: s.last_parser_version,
      } : undefined;

      return { ...s, cpc, cpa, cvr, hasData: true, is_stale, is_suspicious, import_summary };
    });

    // Recent entries for each platform (last 12 periods) — include provenance and raw data
    const recentByPlatform: Record<string, unknown[]> = {};
    for (const platform of PLATFORMS) {
      const rows = db.prepare(`
        SELECT 
          id, platform, period_start, period_end,
          spend, impressions, clicks, conversions, ctr,
          cpc, cpa, cvr,
          source_file, source_document_id, imported_at,
          parse_timestamp, parser_version, import_mode,
          raw_data
        FROM ad_metrics WHERE platform = ? ORDER BY period_end DESC, imported_at DESC LIMIT 12
      `).all(platform);
      if (rows.length) recentByPlatform[platform] = rows;
    }

    // Provenance chain: source documents for advertising category
    let sourceDocuments: unknown[] = [];
    try {
      sourceDocuments = db.prepare(`
        SELECT id, original_name, uploaded_at, parse_status, parse_error
        FROM documents 
        WHERE category = 'advertising'
        ORDER BY uploaded_at DESC
      `).all();
    } catch {
      // parse_status may not exist yet
      sourceDocuments = db.prepare(`
        SELECT id, original_name, uploaded_at, 'unknown' as parse_status, NULL as parse_error
        FROM documents 
        WHERE category = 'advertising'
        ORDER BY uploaded_at DESC
      `).all();
    }

    return NextResponse.json({ channels, recentByPlatform, sourceDocuments });
  } catch (error) {
    console.error('[advertising GET]', error);
    return NextResponse.json({ error: 'Failed to fetch advertising data' }, { status: 500 });
  }
}
