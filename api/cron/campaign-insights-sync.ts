import { isAuthorizedCronRequest } from './_shared.js';
import { runTrackedJob } from '../../backend/src/services/jobTracker.service.js';
import { runCampaignInsightsSync } from '../../backend/src/services/metaInsights.service.js';

export default async function handler(req: any, res: any) {
  if (!isAuthorizedCronRequest(req)) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }
  await runTrackedJob('campaign-insights-sync', runCampaignInsightsSync);
  res.status(200).json({ success: true });
}
