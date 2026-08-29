import { isAuthorizedCronRequest } from './_shared.js';
import { runTrackedJob } from '../../backend/src/services/jobTracker.service.js';
import { runScheduledLeadBackfill } from '../../backend/src/services/metaLeadBackfill.service.js';

export default async function handler(req: any, res: any) {
  if (!isAuthorizedCronRequest(req)) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }
  await runTrackedJob('meta-lead-backfill', runScheduledLeadBackfill);
  res.status(200).json({ success: true });
}
