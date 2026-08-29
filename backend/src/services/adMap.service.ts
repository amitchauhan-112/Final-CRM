/**
 * In-memory singleton mapping Meta adId → CRM campaign data.
 * Populated on each Meta sync run (every minute + on-demand).
 * Empty after process restart until first sync — webhook falls back gracefully.
 */

export interface AdEntry {
  campaignId: string;       // CRM campaign UUID
  adsetId: string;          // Meta adset ID
  metaCampaignId: string;   // Meta campaign ID
  orgId: string;            // CRM organization ID
}

const adMap = new Map<string, AdEntry>();

export function setAdEntry(adId: string, entry: AdEntry): void {
  adMap.set(adId, entry);
}

export function getAdEntry(adId: string): AdEntry | undefined {
  return adMap.get(adId);
}

/** Remove all entries for a given org before re-populating on sync */
export function clearOrgEntries(orgId: string): void {
  for (const [key, val] of adMap.entries()) {
    if (val.orgId === orgId) adMap.delete(key);
  }
}

export function getMapSize(): number {
  return adMap.size;
}
