import axios from 'axios';
import prisma from '../lib/prisma.js';
import logger from '../utils/logger.js';
import { decrypt } from '../utils/encryption.js';
import { setAdEntry, clearOrgEntries } from './adMap.service.js';
import { archiveCampaign } from './campaignArchive.service.js';

const META_VERSION = process.env.META_API_VERSION || 'v19.0';
const META_BASE = `https://graph.facebook.com/${META_VERSION}`;

// ── Helpers ──────────────────────────────────────────────────────────────────

function toCrmStatus(effectiveStatus: string): string {
  switch (effectiveStatus?.toUpperCase()) {
    case 'ACTIVE':   return 'ACTIVE';
    case 'PAUSED':   return 'PAUSED';
    case 'ARCHIVED': return 'ENDED';
    case 'DELETED':  return 'ENDED';
    default:         return 'PAUSED';
  }
}

/** Fetch all cursor-paginated results from a Meta Graph API endpoint */
async function fetchAllPages<T>(
  url: string,
  token: string,
  extraParams: Record<string, string> = {},
): Promise<T[]> {
  const results: T[] = [];
  let after: string | null = null;
  let page = 0;

  do {
    page++;
    if (page > 50) {
      logger.warn(`[metaSync] fetchAllPages: exceeded 50 pages for ${url} — stopping`);
      break;
    }
    const params: Record<string, string> = { access_token: token, limit: '100', ...extraParams };
    if (after) params.after = after;

    const { data } = await axios.get(url, { params, timeout: 20000 });

    if (Array.isArray(data.data)) results.push(...data.data);

    after = data.paging?.cursors?.after ?? null;
    if (!data.paging?.next) after = null;
  } while (after);

  return results;
}

/**
 * Double-verify that a campaign is truly deleted in Meta before archiving.
 * Returns true ONLY when we have positive confirmation of deletion.
 * Any ambiguous response (network error, rate limit, etc.) returns false.
 */
async function verifyMetaDeletion(metaCampaignId: string, token: string): Promise<boolean> {
  try {
    const { data } = await axios.get(`${META_BASE}/${metaCampaignId}`, {
      params: { fields: 'id,status,effective_status', access_token: token },
      timeout: 10000,
    });
    const s = (data.effective_status || data.status || '').toUpperCase();
    return s === 'DELETED';
  } catch (err: any) {
    const code: number = err?.response?.data?.error?.code;
    // 100 = "Invalid parameter" / object not found; 803 = "Some of the aliases you requested do not exist"
    if (code === 100 || code === 803) return true;
    // Anything else is ambiguous — do NOT archive
    logger.warn(
      `[metaSync] verifyMetaDeletion uncertain for ${metaCampaignId}: ` +
      `HTTP ${err?.response?.status}, code ${code}`,
    );
    return false;
  }
}

// ── Main sync ─────────────────────────────────────────────────────────────────

export async function runMetaSync(): Promise<void> {
  const connections = await (prisma as any).metaConnection.findMany({
    where: { isActive: true },
  });

  if (connections.length === 0) {
    logger.info('[metaSync] No active Meta connections — skipping sync');
    return;
  }

  logger.info(`[metaSync] Starting sync for ${connections.length} connection(s)`);

  let orgsProcessed = 0;
  let campaignsUpserted = 0;
  let errorsCount = 0;

  for (const conn of connections) {
    const orgId: string = conn.organizationId;

    try {
      // 1. Decrypt token
      let token: string;
      try {
        token = decrypt(conn.systemUserToken);
      } catch {
        throw new Error('Failed to decrypt system user token — check TOKEN_ENCRYPTION_KEY');
      }

      const acct = `act_${conn.adAccountId}`;

      // 2. Fetch campaigns, adsets, ads in parallel
      const [metaCampaigns, metaAdsets, metaAds] = await Promise.all([
        fetchAllPages<any>(
          `${META_BASE}/${acct}/campaigns`,
          token,
          { fields: 'id,name,objective,status,effective_status,daily_budget,lifetime_budget,start_time,stop_time' },
        ),
        fetchAllPages<any>(
          `${META_BASE}/${acct}/adsets`,
          token,
          { fields: 'id,name,campaign_id' },
        ),
        fetchAllPages<any>(
          `${META_BASE}/${acct}/ads`,
          token,
          { fields: 'id,name,adset_id,campaign_id' },
        ),
      ]);

      logger.info(
        `[metaSync] org=${orgId}: ` +
        `${metaCampaigns.length} campaigns, ${metaAdsets.length} adsets, ${metaAds.length} ads`,
      );

      // 3. Load existing Meta-sourced campaigns from DB
      const existingCrmCampaigns = await prisma.campaign.findMany({
        where: { organizationId: orgId, isFromMeta: true },
        select: { id: true, metaCampaignId: true, name: true, archivedAt: true, status: true },
      });

      // metaCampaignId → CRM id
      const crmById = new Map<string, string>();
      for (const c of existingCrmCampaigns) {
        if (c.metaCampaignId) crmById.set(c.metaCampaignId, c.id);
      }

      // 4. Upsert campaigns
      const seenMetaIds = new Set<string>();

      for (const mc of metaCampaigns) {
        seenMetaIds.add(mc.id);

        const effective = mc.effective_status || mc.status || '';
        const crmStatus = toCrmStatus(effective);

        // Budget: Meta stores in cents (smallest currency unit)
        const budget = mc.daily_budget
          ? Number(mc.daily_budget) / 100
          : mc.lifetime_budget
            ? Number(mc.lifetime_budget) / 100
            : undefined;

        const existing = crmById.get(mc.id)
          ? existingCrmCampaigns.find((c) => c.metaCampaignId === mc.id)
          : null;

        if (!existing) {
          // New campaign — create in CRM
          const created = await prisma.campaign.create({
            data: {
              organizationId: orgId,
              name: mc.name,
              destination: '',          // admin fills in after sync
              metaCampaignId: mc.id,
              metaAdAccountId: conn.adAccountId,
              metaObjective: mc.objective ?? null,
              metaStatus: effective,
              isFromMeta: true,
              status: crmStatus,
              budget,
              startDate: mc.start_time ? new Date(mc.start_time) : undefined,
              endDate: mc.stop_time ? new Date(mc.stop_time) : undefined,
              lastSyncedAt: new Date(),
              keywords: '[]',
            } as any,
          });
          crmById.set(mc.id, created.id);
          campaignsUpserted++;
          logger.info(`[metaSync] Created campaign "${mc.name}" (${mc.id})`);
        } else if (!(existing as any).archivedAt) {
          // Update existing (skip archived)
          await prisma.campaign.update({
            where: { id: existing.id },
            data: {
              name: mc.name,
              metaStatus: effective,
              status: crmStatus,
              budget,
              startDate: mc.start_time ? new Date(mc.start_time) : undefined,
              endDate: mc.stop_time ? new Date(mc.stop_time) : undefined,
              lastSyncedAt: new Date(),
            } as any,
          });
          campaignsUpserted++;
        }
      }

      // 5. Detect deletions — in DB but absent from Meta response
      const candidatesForDeletion = existingCrmCampaigns.filter(
        (c) => c.metaCampaignId && !seenMetaIds.has(c.metaCampaignId) && !(c as any).archivedAt,
      );

      for (const candidate of candidatesForDeletion) {
        if (!candidate.metaCampaignId) continue;
        logger.warn(
          `[metaSync] Campaign ${candidate.metaCampaignId} ("${candidate.name}") ` +
          `missing from Meta — verifying before archival`,
        );

        const confirmed = await verifyMetaDeletion(candidate.metaCampaignId, token);
        if (confirmed) {
          logger.info(`[metaSync] Confirmed deletion — archiving campaign ${candidate.id}`);
          // Get org slug for S3 key
          const org = await prisma.organization.findUnique({
            where: { id: orgId },
            select: { slug: true },
          });
          await archiveCampaign(candidate.id, orgId, org?.slug ?? 'unknown');
        } else {
          logger.warn(`[metaSync] Could not confirm deletion of ${candidate.metaCampaignId} — will retry next cycle`);
        }
      }

      // 6. Build/refresh ad→campaign map after all upserts
      await clearOrgEntries(orgId);

      for (const ad of metaAds) {
        const crmCampaignId = crmById.get(ad.campaign_id);
        if (crmCampaignId) {
          await setAdEntry(ad.id, {
            campaignId: crmCampaignId,
            adsetId: ad.adset_id ?? '',
            metaCampaignId: ad.campaign_id,
            orgId,
          });
        }
      }

      // 7. Update last sync timestamp + clear error
      await (prisma as any).metaConnection.update({
        where: { id: conn.id },
        data: { lastSyncAt: new Date(), lastSyncError: null },
      });

      orgsProcessed++;
    } catch (err: any) {
      errorsCount++;
      const msg = (err?.message || 'Unknown error').slice(0, 500);
      logger.error(`[metaSync] Sync failed for org ${orgId}: ${msg}`);
      await (prisma as any).metaConnection.update({
        where: { id: conn.id },
        data: { lastSyncError: msg },
      }).catch(() => {});
    }
  }

  // Log every sync run to WebhookLog for debuggability
  await prisma.webhookLog.create({
    data: {
      source: 'META_SYNC',
      payload: JSON.stringify({
        timestamp: new Date().toISOString(),
        orgsProcessed,
        campaignsUpserted,
        errorsCount,
      }),
      processed: true,
    },
  }).catch(() => {});

  logger.info(
    `[metaSync] Done — orgs: ${orgsProcessed}, upserted: ${campaignsUpserted}, errors: ${errorsCount}`,
  );
}
