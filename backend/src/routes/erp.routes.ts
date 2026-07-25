import { Router } from 'express';
import { getFinanceSummary, getAllBookings, getUpcomingTrips, getCustomers } from '../controllers/finance.controller.js';
import { bookingLookup } from '../controllers/search.controller.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

router.get('/finance/summary', getFinanceSummary);
router.get('/bookings-list', getAllBookings);
router.get('/operations/trips', getUpcomingTrips);
router.get('/customers', getCustomers);
router.get('/booking-lookup', bookingLookup);

export default router;
