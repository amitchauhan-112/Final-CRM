import { Router } from 'express';
import { getLeads, getLeadById, createLeadManual, updateLead, transferLead, deleteLead, getStats, getOverdueFollowUps, getRecentActivity, getDashboardStats, exportLeads, checkDuplicate, getPreferredDateSummary } from '../controllers/lead.controller.js';
import { getLeadJourney } from '../controllers/journey.controller.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);
router.get('/', getLeads);
router.get('/stats', getStats);
router.get('/check-duplicate', checkDuplicate);
router.get('/dashboard-stats', requireAdmin, getDashboardStats);
router.get('/export', requireAdmin, exportLeads);
router.get('/overdue', getOverdueFollowUps);
router.get('/activity', getRecentActivity);
router.get('/preferred-dates', getPreferredDateSummary);
router.get('/:id', getLeadById);
router.get('/:id/journey', getLeadJourney);
router.post('/', createLeadManual);
router.put('/:id', updateLead);
router.post('/:id/transfer', transferLead);
router.delete('/:id', requireAdmin, deleteLead);

export default router;
