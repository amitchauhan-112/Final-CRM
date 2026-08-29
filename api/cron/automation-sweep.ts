import { isAuthorizedCronRequest } from './_shared.js';
import { runTrackedJob } from '../../backend/src/services/jobTracker.service.js';
import { processDueAutomationExecutions } from '../../backend/src/services/automationEngine.service.js';

export default async function handler(req: any, res: any) {
  if (!isAuthorizedCronRequest(req)) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }
  await runTrackedJob('automation-execution-sweep', processDueAutomationExecutions);
  res.status(200).json({ success: true });
}
