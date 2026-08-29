import { Router } from 'express';
import { createUpload } from '../middleware/upload.js';
const upload = createUpload('traveler-documents');
import { getPortalBooking, submitTravelerDetails, uploadTravelerDocument } from '../controllers/travelerPortal.controller.js';

// Deliberately NOT behind `authenticate` — this is the customer-facing,
// token-gated Traveler Portal. See webhook.routes.ts for the only other
// unauthenticated route in the app. Rate-limited in index.ts (same
// express-rate-limit pattern already used for the login endpoint).
const router = Router();

router.get('/:token', getPortalBooking);
router.put('/:token/travelers/:travelerId', submitTravelerDetails);
router.post('/:token/travelers/:travelerId/document', upload.single('document'), uploadTravelerDocument);

export default router;
