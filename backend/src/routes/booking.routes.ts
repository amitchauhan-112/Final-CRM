import { Router } from 'express';
import { getBookingByLead, getBookingDocuments, createBooking, updateBooking, deleteBooking, markReviewCollected, markReferralReceived } from '../controllers/booking.controller.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

router.get('/lead/:leadId', getBookingByLead);
router.get('/:id/documents', getBookingDocuments);
router.post('/', createBooking);
router.put('/:id', updateBooking);
router.delete('/:id', requireAdmin, deleteBooking);
router.put('/:id/mark-review-collected', markReviewCollected);
router.put('/:id/mark-referral-received', markReferralReceived);

export default router;
