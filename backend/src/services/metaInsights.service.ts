import axios from 'axios';
import prisma from '../lib/prisma.js';
import logger from '../utils/logger.js';
import { decrypt } from '../utils/encryption.js';

const META_VERSION = process.env.META_API_VERSION || 'v19.0';
const META_BASE = `https://graph.facebook.com/${META_VERSION}`;

// Meta attributes some spend/conversions to a campaign with a short delay —
// re-pulling the last few days (not just "today") on every run keeps
// already-stored buckets accurate instead of freezing them the moment the
// day rolls over.
const BACKFILL_DAYS = 3;

function dateOnly(d: Date): Date {
  return new Date(d.toISOString().slice(0, 10) + 'T00:00:00.000Z');
}

interface DailyInsightRow {
  date_start: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
}

// A long since/until range (full-history backfill) can span more rows than
// Meta returns in one page — cursor-paginate same as metaSync.service.ts's
// fetchAllPages, since the 3-day regular-sync window never needs more than
// one page but a multi-year backfill can.
async function fetchDailySpend(metaCampaignId: string, token: string, since: string, until: string): Promise<DailyInsightRow[]> {
  const results: DailyInsightRow[] = [];
  let after: string | null = null;
  let page = 0;

  do {
    page++;
    if (page > 100) {
      logger.warn(`[metaInsights] fetchDailySpend: exceeded 100 pages for campaign ${metaCampaignId} — stopping`);
      break;
    }
    const params: Record<string, string> = {
      access_token: token,
      time_range: JSON.stringify({ since, until }),
      time_increment: '1',
      fields: 'spend,impressions,clicks',
      limit: '100',
    };
    if (after) params.after = after;

    const { data } = await axios.get(`${META_BASE}/${metaCampaignId}/insights`, { params, timeout: 20000 });
    if (Array.isArray(data.data)) results.push(...data.data);

    after = data.paging?.cursors?.after ?? null;
    if (!data.paging?.next) after = null;
  } while (after);

  return results;
}

async function upsertDailyRows(campaignId: string, rows: DailyInsightRow[]): Promise<number> {
  let count = 0;
  for (const row of rows) {
    const day = dateOnly(new Date(row.date_start));
    await prisma.campaignInsight.upsert({
      where: { campaignId_date: { campaignId, date: day } },
      create: {
        campaignId,
        date: day,
        spend: Number(row.spend ?? 0),
        impressions: row.impressions !== undefined ? Number(row.impressions) : null,
        clicks: row.clicks !== undefined ? Number(row.clicks) : null,
      },
      update: {
        spend: Number(row.spend ?? 0),
        impressions: row.impressions !== undefined ? Number(row.impressions) : null,
        clicks: row.clicks !== undefined ? Number(row.clicks) : null,
        fetchedAt: new Date(),
      },
    });
    count++;
  }
  return count;
}

export async function runCampaignInsightsSync(): Promise<void> {
  const connections = await (prisma as any).metaConnection.findMany({ where: { isActive: true } });
  if (connections.length === 0) {
    logger.info('[metaInsights] No active Meta connections — skipping');
    return;
  }

  const until = dateOnly(new Date());
  const since = new Date(until);
  since.setUTCDate(since.getUTCDate() - BACKFILL_DAYS);
  const sinceStr = since.toISOString().slice(0, 10);
  const untilStr = until.toISOString().slice(0, 10);

  let campaignsUpdated = 0;
  let errorsCount = 0;

  for (const conn of connections) {
    const campaigns = await prisma.campaign.findMany({
      where: { organizationId: conn.organizationId, isFromMeta: true, metaCampaignId: { not: null }, archivedAt: null },
      select: { id: true, metaCampaignId: true, name: true },
    });
    if (campaigns.length === 0) continue;

    let token: string;
    try {
      token = decrypt(conn.systemUserToken);
    } catch {
      logger.error(`[metaInsights] Failed to decrypt token for org ${conn.organizationId}`);
      continue;
    }

    for (const c of campaigns) {
      if (!c.metaCampaignId) continue;
      try {
        const rows = await fetchDailySpend(c.metaCampaignId, token, sinceStr, untilStr);
        await upsertDailyRows(c.id, rows);
        campaignsUpdated++;
      } catch (err: any) {
        errorsCount++;
        const msg = err?.response?.data?.error?.message || err?.message || 'Unknown error';
        logger.warn(`[metaInsights] Failed to fetch insights for campaign "${c.name}" (${c.metaCampaignId}): ${msg}`);
      }
    }
  }

  logger.info(`[metaInsights] Done — campaigns updated: ${campaignsUpdated}, errors: ${errorsCount}`);
}

// ── One-off: full-history spend backfill ─────────────────────────────────────
// Separate from the twice-daily sync above (which only re-pulls the last
// BACKFILL_DAYS), this pulls each Meta-synced campaign's entire spend
// history from its start date to today, so a campaign that's been running
// for months shows real CPL for any date range, not just the last few days.
export interface InsightsBackfillResult {
  campaignsScanned: number;
  daysUpserted: number;
  errors: string[];
}

export async function backfillCampaignInsights(): Promise<InsightsBackfillResult> {
  const result: InsightsBackfillResult = { campaignsScanned: 0, daysUpserted: 0, errors: [] };

  const connections = await (prisma as any).metaConnection.findMany({ where: { isActive: true } });
  if (connections.length === 0) return result;

  const todayStr = dateOnly(new Date()).toISOString().slice(0, 10);

  for (const conn of connections) {
    const campaigns = await prisma.campaign.findMany({
      where: { organizationId: conn.organizationId, isFromMeta: true, metaCampaignId: { not: null }, archivedAt: null },
      select: { id: true, metaCampaignId: true, name: true, startDate: true, createdAt: true },
    });
    if (campaigns.length === 0) continue;

    let token: string;
    try {
      token = decrypt(conn.systemUserToken);
    } catch {
      result.errors.push(`org ${conn.organizationId}: failed to decrypt Meta token`);
      continue;
    }

    for (const c of campaigns) {
      if (!c.metaCampaignId) continue;
      result.campaignsScanned++;
      const since = dateOnly(c.startDate ?? c.createdAt).toISOString().slice(0, 10);
      try {
        const rows = await fetchDailySpend(c.metaCampaignId, token, since, todayStr);
        result.daysUpserted += await upsertDailyRows(c.id, rows);
      } catch (err: any) {
        const msg = err?.response?.data?.error?.message || err?.message || 'Unknown error';
        result.errors.push(`"${c.name}" (${c.metaCampaignId}): ${msg}`);
        logger.warn(`[metaInsights] Backfill failed for campaign "${c.name}" (${c.metaCampaignId}): ${msg}`);
      }
    }
  }

  logger.info(`[metaInsights] Backfill done — campaigns: ${result.campaignsScanned}, days upserted: ${result.daysUpserted}, errors: ${result.errors.length}`);
  return result;
}
