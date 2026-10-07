import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { listPendingApprovals, listMyApprovalRequests, approveRequest, rejectRequest, cancelRequest, createPaymentRequest } from '../controllers/approval.controller.js';

const router = Router();
router.use(authenticate);

router.get('/', listPendingApprovals);
router.get('/mine', listMyApprovalRequests);
router.post('/payment-requests', createPaymentRequest);
router.put('/:id/approve', approveRequest);
router.put('/:id/reject', rejectRequest);
router.delete('/:id', cancelRequest);

export default router;
