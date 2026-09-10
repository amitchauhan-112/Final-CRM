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

// Meta field names come in like "who's_travelling_?" / "choose_your_preferred_dates"
// and values like "2–4_travellers" / "join_a_group_trip". Tidy both for display.
function tidy(s: string): string {
  return s.replace(/[_?]+/g, ' ').replace(/\s+/g, ' ').trim();
}

const NAME_PHONE_EMAIL = ['full_name', 'name', 'phone', 'whatsapp', 'mobile', 'contact_number', 'email'];

// Everything the customer answered on the Instant Form, minus name/phone/email,
// turned into a readable block the sales team sees as the lead's message.
function buildFormResponsesBlock(fieldData: FieldDatum[], formName: string): string {
  const lines = fieldData
    .filter((f) => f.name && !NAME_PHONE_EMAIL.some((k) => f.name!.toLowerCase().includes(k)))
    .map((f) => {
      const answer = (f.values || []).map(tidy).join(', ');
      return answer ? `• ${tidy(f.name!)}: ${answer}` : '';
    })
    .filter(Boolean);

  const headerLine = `Meta Lead Ad — form "${formName}"`;
  return lines.length ? `${headerLine}\n\n${lines.join('\n')}` : headerLine;
}

// "just_me" → 1; "5–8_travellers" → 8; "2-4 travellers" → 4. Best-effort
// planning number, undefined if nothing numeric.
function parseGroupSize(raw?: string): number | undefined {
  if (!raw) return undefined;
  const low = raw.toLowerCase();
  if (low.includes('just_me') || low.includes('only_me') || low.includes('solo')) return 1;
  const nums = (raw.match(/\d+/g) || []).map(Number).filter((n) => n > 0 && n < 1000);
  return nums.length ? Math.max(...nums) : undefined;
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

        // Pull the rest of the form answers into structured fields + a
        // readable block, so sales isn't stuck with just name/phone/email.
        const destination = extractField(fieldData, ['destination', 'where_do_you', 'which_place', 'location']);
        const preferredDate = extractField(fieldData, ['date', 'when_are_you', 'travel_month', 'preferred_dates']);
        const groupSize = parseGroupSize(extractField(fieldData, ['travel', 'traveller', 'traveler', 'how_many', 'group', 'people']));
        const formResponses = buildFormResponsesBlock(fieldData, form.name);

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
          destination: destination ? tidy(destination) : undefined,
          preferredDate: preferredDate ? tidy(preferredDate) : undefined,
          groupSize,
          source: 'META_ADS',
          message: formResponses,
          instagramLeadId: ml.id,
          adId: ml.ad_id,
          adName: ml.ad_name,
          adsetId: ml.adset_id,
          metaCampaignId: ml.campaign_id,
          organizationId: orgId,
          campaignId,
          createdAt: ml.created_time ? new Date(ml.created_time) : undefined,
          // Matches createdAt — without this a backfilled lead's "last
          // activity" would default to right now (when the sync ran),
          // burying genuinely fresh leads under months-old backfilled ones
          // at the top of every list sorted by updatedAt.
          updatedAt: ml.created_time ? new Date(ml.created_time) : undefined,
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
// ── One-time: enrich EXISTING Meta leads with their Instant Form answers ──────
// Older leads only kept name/phone/email — this re-fetches each one's
// field_data from Meta and fills in the "Customer Message" block plus
// Destination / Preferred Date / Group Size. Idempotent: skips leads whose
// message already has the new form-responses block, so it's safe to re-run.
export interface EnrichResult {
  scanned: number;
  enriched: number;
  skipped: number;
  errors: string[];
}

export async function enrichExistingMetaLeads(orgId: string): Promise<EnrichResult> {
  const result: EnrichResult = { scanned: 0, enriched: 0, skipped: 0, errors: [] };

  const conn = await (prisma as any).metaConnection.findUnique({ where: { organizationId: orgId } });
  if (!conn) throw new Error('No Meta connection configured for this organization');
  if (!conn.pageId) throw new Error('No Facebook Page ID on this connection');

  const systemUserToken = decrypt(conn.systemUserToken);
  const pageTokenRes = await axios.get(`${META_BASE}/${conn.pageId}`, {
    params: { fields: 'access_token', access_token: systemUserToken },
    timeout: 15000,
  });
  const token = pageTokenRes.data?.access_token;
  if (!token) throw new Error('Could not obtain a Page Access Token');

  const leads = await prisma.lead.findMany({
    where: { organizationId: orgId, source: 'META_ADS', instagramLeadId: { not: null }, deletedAt: null },
    select: { id: true, instagramLeadId: true, message: true, destination: true, preferredDate: true, groupSize: true },
  });

  for (const lead of leads) {
    result.scanned++;
    if (lead.message?.startsWith('Meta Lead Ad — form "')) { result.skipped++; continue; }

    try {
      const { data } = await axios.get(`${META_BASE}/${lead.instagramLeadId}`, {
        params: { fields: 'field_data,campaign_name', access_token: token },
        timeout: 15000,
      });
      const fieldData: FieldDatum[] = data?.field_data || [];
      if (!fieldData.length) { result.skipped++; continue; }

      const formName: string = data?.campaign_name || 'Meta Lead Ad';
      const destination = extractField(fieldData, ['destination', 'where_do_you', 'which_place', 'location']);
      const preferredDate = extractField(fieldData, ['date', 'when_are_you', 'travel_month', 'preferred_dates']);
      const groupSize = parseGroupSize(extractField(fieldData, ['travel', 'traveller', 'traveler', 'how_many', 'group', 'people']));

      await prisma.lead.update({
        where: { id: lead.id },
        data: {
          message: buildFormResponsesBlock(fieldData, formName),
          // Only fill blanks — never overwrite something sales already set.
          destination: lead.destination || (destination ? tidy(destination) : undefined),
          preferredDate: lead.preferredDate || (preferredDate ? tidy(preferredDate) : undefined),
          groupSize: lead.groupSize ?? groupSize,
        },
      });
      result.enriched++;
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message || err.message || 'Unknown error';
      result.errors.push(`Lead ${lead.id} (${lead.instagramLeadId}): ${msg}`);
    }
  }

  logger.info(`[metaLeadBackfill] enrich existing: scanned ${result.scanned}, enriched ${result.enriched}, skipped ${result.skipped}, errors ${result.errors.length}`);
  return result;
}

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
