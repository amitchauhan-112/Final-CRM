import { Response } from 'express';
import prisma from '../lib/prisma.js';
import { AuthenticatedRequest } from '../types/index.js';
import { sendWhatsAppMessage, WhatsAppApiError } from '../services/whatsapp.service.js';

function orgFilter(req: AuthenticatedRequest): Record<string, unknown> {
  return req.user?.organizationId ? { organizationId: req.user.organizationId } : {};
}

// ── List conversations — employees see only their own, admins see everyone's ─

export const listConversations = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const where: Record<string, unknown> = { ...orgFilter(req) };
    if (req.user?.role === 'EMPLOYEE') where.account = { userId: req.user.id };

    const conversations = await prisma.whatsAppConversation.findMany({
      where,
      include: {
        lead: { select: { id: true, name: true } },
        account: { select: { displayPhoneNumber: true, user: { select: { id: true, name: true } } } },
      },
      orderBy: [{ lastInboundAt: 'desc' }, { lastOutboundAt: 'desc' }],
    });

    res.json({ success: true, data: conversations });
  } catch {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// ── Message thread for one conversation ───────────────────────────────────────

export const getConversationMessages = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const conversation = await prisma.whatsAppConversation.findFirst({
      where: { id, ...orgFilter(req) },
      include: { account: true },
    });
    if (!conversation) { res.status(404).json({ success: false, error: 'Conversation not found' }); return; }
    if (req.user?.role === 'EMPLOYEE' && conversation.account.userId !== req.user.id) {
      res.status(403).json({ success: false, error: 'Access denied' }); return;
    }

    const messages = await prisma.whatsAppMessage.findMany({
      where: { conversationId: id },
      orderBy: { timestamp: 'asc' },
    });

    if (conversation.unreadCount > 0) {
      await prisma.whatsAppConversation.update({ where: { id }, data: { unreadCount: 0 } });
    }

    res.json({ success: true, data: messages });
  } catch {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// ── Send a reply through the CRM ──────────────────────────────────────────────

export const sendMessage = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { body } = req.body;

    if (!body?.trim()) {
      res.status(400).json({ success: false, error: 'Message body is required' });
      return;
    }

    const message = await sendWhatsAppMessage(id, { id: req.user!.id, role: req.user!.role }, body.trim());
    res.status(201).json({ success: true, data: message });
  } catch (e) {
    if (e instanceof WhatsAppApiError) {
      res.status(e.statusCode).json({ success: false, error: e.message });
      return;
    }
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};
