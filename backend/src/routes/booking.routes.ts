import { Router } from 'express';
import { getBookingByLead, getBookingDocuments, createBooking, updateBooking, deleteBooking, markReviewCollected, markReferralReceived, getPendingBookingChange } from '../controllers/booking.controller.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import { updateBookingAdjustments } from '../controllers/bookingAdjustments.controller.js';

const router = Router();
router.use(authenticate);

router.get('/lead/:leadId', getBookingByLead);
router.get('/:id/documents', getBookingDocuments);
router.get('/:id/pending-change', getPendingBookingChange);
router.post('/', createBooking);
router.put('/:id', updateBooking);
router.put('/:id/adjustments', updateBookingAdjustments);
router.delete('/:id', requireAdmin, deleteBooking);
router.put('/:id/mark-review-collected', markReviewCollected);
router.put('/:id/mark-referral-received', markReferralReceived);

export default router;
