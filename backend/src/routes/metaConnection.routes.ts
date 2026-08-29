import { Router } from 'express';
import {
  getMetaConnection,
  saveMetaConnection,
  deleteMetaConnection,
  triggerSync,
  backfillLeads,
  getArchiveDownload,
} from '../controllers/metaConnection.controller.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);
router.use(requireAdmin);

router.get('/',       getMetaConnection);
router.post('/',      saveMetaConnection);
router.delete('/',    deleteMetaConnection);
router.post('/sync',  triggerSync);
router.post('/backfill-leads', backfillLeads);

// Archive download is on campaigns router but wired here via controller
// Campaign route: GET /api/campaigns/:id/archive-download → imported directly

export { getArchiveDownload };
export default router;
