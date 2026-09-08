import { Router } from 'express';
import { verifyWhatsAppWebhook, handleWhatsAppWebhook, verifyInstagramWebhook, handleInstagramWebhook, simulateLead, backfillCtwaAttribution } from '../controllers/webhook.controller.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

const router = Router();

router.get('/whatsapp', verifyWhatsAppWebhook);
router.post('/whatsapp', handleWhatsAppWebhook);
router.get('/instagram', verifyInstagramWebhook);
router.post('/instagram', handleInstagramWebhook);
router.post('/simulate', simulateLead);
// Admin-only, unlike everything else in this router (which Meta calls
// directly with no auth) — a one-time/re-runnable backfill, not a webhook.
router.post('/backfill-ctwa', authenticate, requireAdmin, backfillCtwaAttribution);

export default router;
