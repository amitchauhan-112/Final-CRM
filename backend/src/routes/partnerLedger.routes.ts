import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  getPartnerLedger, getMyPartner, listHandoverOptions, listPartnerCollections, createPartnerCollection,
  approvePartnerCollection, rejectPartnerCollection,
} from '../controllers/partnerLedger.controller.js';

// Any authenticated user — permission is enforced inside each controller
// function (Admin/Finance always; a partner only for their own entries),
// same pattern as the Approvals engine.
const router = Router();
router.use(authenticate);

router.get('/', getPartnerLedger);
router.get('/mine', getMyPartner);
router.get('/handover-options', listHandoverOptions);
router.get('/collections', listPartnerCollections);
router.post('/collections', createPartnerCollection);
router.put('/collections/:id/approve', approvePartnerCollection);
router.put('/collections/:id/reject', rejectPartnerCollection);

export default router;
