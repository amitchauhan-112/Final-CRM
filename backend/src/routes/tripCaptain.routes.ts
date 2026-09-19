import { Router } from 'express';
import { authenticate, requireTripCaptain } from '../middleware/auth.js';
import {
  listMyDepartures, getMyDepartureDetail, checkInHotel, checkOutHotel, postMealUpdate,
} from '../controllers/tripCaptain.controller.js';

const router = Router();
router.use(authenticate, requireTripCaptain);

router.get('/departures', listMyDepartures);
router.get('/departures/:id', getMyDepartureDetail);
router.post('/departures/:id/meals', postMealUpdate);
router.put('/hotels/:id/checkin', checkInHotel);
router.put('/hotels/:id/checkout', checkOutHotel);

export default router;
