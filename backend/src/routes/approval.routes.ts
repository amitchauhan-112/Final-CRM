import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { listPendingApprovals, listMyApprovalRequests, approveRequest, rejectRequest, cancelRequest } from '../controllers/approval.controller.js';

const router = Router();
router.use(authenticate);

router.get('/', listPendingApprovals);
router.get('/mine', listMyApprovalRequests);
router.put('/:id/approve', approveRequest);
router.put('/:id/reject', rejectRequest);
router.delete('/:id', cancelRequest);

export default router;
