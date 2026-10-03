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

async function fetchDailySpend(metaCampaignId: string, token: string, since: string, until: string): Promise<DailyInsightRow[]> {
  const { data } = await axios.get(`${META_BASE}/${metaCampaignId}/insights`, {
    params: {
      access_token: token,
      time_range: JSON.stringify({ since, until }),
      time_increment: 1,
      fields: 'spend,impressions,clicks',
    },
    timeout: 20000,
  });
  return Array.isArray(data.data) ? data.data : [];
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
        for (const row of rows) {
          const day = dateOnly(new Date(row.date_start));
          await prisma.campaignInsight.upsert({
            where: { campaignId_date: { campaignId: c.id, date: day } },
            create: {
              campaignId: c.id,
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
        }
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
