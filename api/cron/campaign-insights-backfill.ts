import { isAuthorizedCronRequest } from './_shared.js';
import { backfillCampaignInsights } from '../../backend/src/services/metaInsights.service.js';

// Secret-protected but NOT scheduled (not in cron.yml / cron-job.org) — a
// one-off, manually-triggered full-history backfill, same shape as the
// regular cron routes so it reuses the existing secret instead of needing a
// separate admin login to invoke once.
export default async function handler(req: any, res: any) {
  if (!isAuthorizedCronRequest(req)) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }
  const result = await backfillCampaignInsights();
  res.status(200).json({ success: true, ...result });
}
