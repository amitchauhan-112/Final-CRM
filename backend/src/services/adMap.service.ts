/**
 * Maps Meta adId → CRM campaign data, backed by the MetaAdMap table.
 * Refreshed on each Meta sync run. Previously an in-memory Map, which doesn't
 * survive serverless cold starts (each invocation is a fresh, isolated
 * process) — this persists the mapping in Postgres instead.
 */

import prisma from '../lib/prisma.js';

export interface AdEntry {
  campaignId: string;       // CRM campaign UUID
  adsetId: string;          // Meta adset ID
  metaCampaignId: string;   // Meta campaign ID
  orgId: string;            // CRM organization ID
}

export async function setAdEntry(adId: string, entry: AdEntry): Promise<void> {
  await prisma.metaAdMap.upsert({
    where: { adId },
    create: {
      adId,
      campaignId: entry.campaignId,
      adsetId: entry.adsetId,
      metaCampaignId: entry.metaCampaignId,
      organizationId: entry.orgId,
    },
    update: {
      campaignId: entry.campaignId,
      adsetId: entry.adsetId,
      metaCampaignId: entry.metaCampaignId,
      organizationId: entry.orgId,
    },
  });
}

export async function getAdEntry(adId: string): Promise<AdEntry | undefined> {
  const row = await prisma.metaAdMap.findUnique({ where: { adId } });
  if (!row) return undefined;
  return {
    campaignId: row.campaignId,
    adsetId: row.adsetId,
    metaCampaignId: row.metaCampaignId,
    orgId: row.organizationId,
  };
}

/** Remove all entries for a given org before re-populating on sync */
export async function clearOrgEntries(orgId: string): Promise<void> {
  await prisma.metaAdMap.deleteMany({ where: { organizationId: orgId } });
}

export async function getMapSize(): Promise<number> {
  return prisma.metaAdMap.count();
}
