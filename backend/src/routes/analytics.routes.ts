import { Router } from 'express';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import {
  getPackageAnalytics, getDestinationAnalytics, getCampaignAnalytics, getCampaignMonitoring, getCustomerAnalytics, getEmployeeAnalytics,
} from '../controllers/analytics.controller.js';

const router = Router();
router.use(authenticate, requireAdmin);

router.get('/packages', getPackageAnalytics);
router.get('/destinations', getDestinationAnalytics);
router.get('/campaigns', getCampaignAnalytics);
router.get('/campaigns/monitoring', getCampaignMonitoring);
router.get('/customers', getCustomerAnalytics);
router.get('/employees', getEmployeeAnalytics);

export default router;
