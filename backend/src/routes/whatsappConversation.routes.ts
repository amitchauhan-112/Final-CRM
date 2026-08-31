import { Router } from 'express';
import {
  listConversations,
  getConversationMessages,
  sendMessage,
} from '../controllers/whatsappConversation.controller.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

router.get('/conversations', listConversations);
router.get('/conversations/:id/messages', getConversationMessages);
router.post('/conversations/:id/messages', sendMessage);

export default router;
