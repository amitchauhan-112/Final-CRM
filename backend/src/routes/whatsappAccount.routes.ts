import { Router } from 'express';
import {
  listWhatsAppAccounts,
  saveWhatsAppAccount,
  deactivateWhatsAppAccount,
  completeEmbeddedSignup,
} from '../controllers/whatsappAccount.controller.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);
router.use(requireAdmin);

router.get('/', listWhatsAppAccounts);
router.post('/', saveWhatsAppAccount);
router.post('/embedded-signup', completeEmbeddedSignup);
router.delete('/:userId', deactivateWhatsAppAccount);

export default router;
