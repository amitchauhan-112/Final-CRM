import { Router } from 'express';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import {
  requireSalaryAccess, requireSalaryAccessOrSelf,
  listSalaryAccessGrants, grantSalaryAccess, revokeSalaryAccess,
  listSalesTargets, getSalesTargetHistory, setSalesTarget,
  listSalaryConfig, setSalaryConfig,
  listPayouts, releasePayout,
} from '../controllers/hr.controller.js';

const router = Router();
router.use(authenticate);

// Sales targets/achievement/incentive — Admin + authorized Finance see
// everyone; a Sales employee (role EMPLOYEE) is let through but the
// controller restricts them to their own data only. Operations and an
// un-granted Finance user get a 403 here.
router.get('/sales-targets', requireSalaryAccessOrSelf, listSalesTargets);
router.get('/sales-targets/:userId/history', requireSalaryAccessOrSelf, getSalesTargetHistory);
router.put('/sales-targets/:userId', requireAdmin, setSalesTarget);

// Everything salary/incentive-amount related is gated behind requireSalaryAccess
// (Admin always; Finance only with an active grant).
router.get('/salary-access', requireAdmin, listSalaryAccessGrants);
router.post('/salary-access/:userId/grant', requireAdmin, grantSalaryAccess);
router.post('/salary-access/:userId/revoke', requireAdmin, revokeSalaryAccess);

router.get('/salary-config', requireSalaryAccess, listSalaryConfig);
router.put('/salary-config/:userId', requireAdmin, setSalaryConfig);

router.get('/payouts', requireSalaryAccess, listPayouts);
router.post('/payouts/:userId/release', requireSalaryAccess, releasePayout);

export default router;
