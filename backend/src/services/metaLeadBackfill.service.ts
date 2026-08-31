// services/metaLeadBackfill.service.ts - one-off, admin-triggered pull of
// EXISTING Meta Lead Ad form submissions (via the Leads Retrieval API),
// separate from metaSync.service.ts which only syncs campaign structure on
// a per-minute cron. Requires the connection's Page to be assigned to the System
// User with the leads_retrieval permission - without that, Meta returns a
// permission error per form, which is surfaced per-form rather than aborting
// the whole run.

import axios from 'axios';
import prisma from '../lib/prisma.js';
import logger from '../utils/logger.js';
import { decrypt } from '../utils/encryption.js';
import { createLead } from './lead.service.js';

const META_VERSION = process.env.META_API_VERSION || 'v19.0';
const META_BASE = `https://graph.facebook.com/${META_VERSION}`;

interface FieldDatum { name: string; values: string[]; }

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
    if (page > 100) {
      logger.warn(`[metaLeadBackfill] fetchAllPages: exceeded 100 pages for ${url} — stopping`);
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

function extractField(fieldData: FieldDatum[], patterns: string[]): string | undefined {
  for (const p of patterns) {
    const match = fieldData.find((f) => f.name?.toLowerCase().includes(p));
    if (match?.values?.length) return match.values[0];
  }
  return undefined;
}

export interface BackfillResult {
  formsScanned: number;
  leadsFound: number;
  leadsCreated: number;
  duplicatesSkipped: number;
  errors: string[];
}

export async function backfillLeadsForOrg(orgId: string, since?: Date): Promise<BackfillResult> {
  const conn = await (prisma as any).metaConnection.findUnique({ where: { organizationId: orgId } });
  if (!conn) throw new Error('No Meta connection configured for this organization');
  if (!conn.pageId) {
    throw new Error('No Facebook Page ID on this connection — required to list Lead Ad forms. Add a Page ID and save the connection again.');
  }

  const systemUserToken = decrypt(conn.systemUserToken);

  // Lead Ad form endpoints require a Page Access Token specifically - the
  // System User token itself (even with the right permissions) gets rejected
  // with "(#190) This method must be called with a Page Access Token". Since
  // the Page was assigned as an asset to the System User, we can exchange for
  // the Page's own token via this call.
  const pageTokenRes = await axios.get(`${META_BASE}/${conn.pageId}`, {
    params: { fields: 'access_token', access_token: systemUserToken },
    timeout: 15000,
  });
  const token = pageTokenRes.data?.access_token;
  if (!token) {
    throw new Error('Could not obtain a Page Access Token - make sure the Page is assigned to the System User with at least "Manage campaigns" access.');
  }

  const result: BackfillResult = { formsScanned: 0, leadsFound: 0, leadsCreated: 0, duplicatesSkipped: 0, errors: [] };

  const forms = await fetchAllPages<any>(
    `${META_BASE}/${conn.pageId}/leadgen_forms`,
    token,
    { fields: 'id,name,status' },
  );
  result.formsScanned = forms.length;

  // On scheduled runs, only ask Meta for leads created since the last run
  // instead of re-scanning full form history every time - re-fetching
  // everything on every run got slower as lead volume grew until it blew
  // past Vercel's function time limit (the scheduled runs were timing out
  // mid-execution, stuck showing "RUNNING" forever). The one-off "Import
  // Historical Leads" button still omits `since` for a full scan.
  const sinceFilter: Record<string, string> = since
    ? { filtering: JSON.stringify([{ field: 'time_created', operator: 'GREATER_THAN', value: Math.floor(since.getTime() / 1000) }]) }
    : {};

  for (const form of forms) {
    try {
      const metaLeads = await fetchAllPages<any>(
        `${META_BASE}/${form.id}/leads`,
        token,
        { fields: 'id,created_time,ad_id,ad_name,campaign_id,campaign_name,adset_id,adset_name,field_data', ...sinceFilter },
      );
      result.leadsFound += metaLeads.length;

      for (const ml of metaLeads) {
        const existing = await prisma.lead.findFirst({ where: { instagramLeadId: ml.id } });
        if (existing) { result.duplicatesSkipped++; continue; }

        const fieldData: FieldDatum[] = ml.field_data || [];
        const name = extractField(fieldData, ['full_name', 'name']) || `Meta Lead ${ml.id}`;
        const phone = extractField(fieldData, ['phone', 'whatsapp', 'mobile', 'contact_number']);
        const email = extractField(fieldData, ['email']);

        if (!phone) {
          result.errors.push(`Form "${form.name}" lead ${ml.id}: no phone field in submission — skipped`);
          continue;
        }

        let campaignId: string | undefined;
        if (ml.campaign_id) {
          const crmCampaign = await prisma.campaign.findFirst({
            where: { organizationId: orgId, metaCampaignId: ml.campaign_id },
          });
          campaignId = crmCampaign?.id;
        }

        await createLead({
          name,
          phone,
          email,
          source: 'META_ADS',
          message: `Historical Meta Lead Ad submission — form "${form.name}"`,
          instagramLeadId: ml.id,
          adId: ml.ad_id,
          adName: ml.ad_name,
          adsetId: ml.adset_id,
          metaCampaignId: ml.campaign_id,
          organizationId: orgId,
          campaignId,
          createdAt: ml.created_time ? new Date(ml.created_time) : undefined,
        });
        result.leadsCreated++;
      }
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message || err.message || 'Unknown error';
      result.errors.push(`Form "${form.name}" (${form.id}): ${msg}`);
      logger.error(`[metaLeadBackfill] form ${form.id} failed: ${msg}`);
    }
  }

  await (prisma as any).metaConnection.update({
    where: { id: conn.id },
    data: { lastLeadBackfillAt: new Date(), lastLeadBackfillResult: JSON.stringify(result) },
  }).catch(() => {});

  await prisma.webhookLog.create({
    data: {
      source: 'META_LEAD_BACKFILL',
      payload: JSON.stringify({ orgId, ...result, timestamp: new Date().toISOString() }),
      processed: true,
    },
  }).catch(() => {});

  logger.info(`[metaLeadBackfill] org=${orgId} done: ${JSON.stringify(result)}`);
  return result;
}

// ── Scheduled run — permanent fix for the sync gap ──────────────────────────
// A real-time Meta leadgen webhook would need the backend on HTTPS, which
// it isn't yet. Until then, this closes the gap by pulling any lead
// submitted since the last run on a fixed schedule (see index.ts), instead
// of relying on someone remembering to trigger the one-off backfill above.
// Once HTTPS is in place, this can be replaced by (or kept alongside, as a
// safety net for) a real webhook subscription.
export async function runScheduledLeadBackfill(): Promise<void> {
  const connections = await (prisma as any).metaConnection.findMany({ where: { isActive: true } });
  if (connections.length === 0) return;

  // 1-hour overlap buffer on top of the last run so a lead landing right at
  // the boundary of two runs can never be missed - createLead's
  // instagramLeadId duplicate check makes re-fetching that overlap harmless.
  const OVERLAP_MS = 60 * 60 * 1000;

  for (const conn of connections) {
    try {
      const since = conn.lastLeadBackfillAt ? new Date(conn.lastLeadBackfillAt.getTime() - OVERLAP_MS) : undefined;
      await backfillLeadsForOrg(conn.organizationId, since);
    } catch (err: any) {
      const msg = (err?.response?.data?.error?.message || err?.message || 'Unknown error').slice(0, 500);
      logger.error(`[metaLeadBackfill] scheduled run failed for org ${conn.organizationId}: ${msg}`);
    }
  }
}
