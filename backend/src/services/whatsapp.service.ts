// services/whatsapp.service.ts — WhatsApp "coexistence" message processing.
// Each employee keeps chatting from their own phone via the regular
// WhatsApp Business app; Meta mirrors every message (either direction) to
// our webhook. This turns that into per-employee Conversations/Messages,
// links them to Leads, and separately lets the CRM send replies out through
// Meta's API when an employee replies from inside the CRM instead of their
// phone.

import axios from 'axios';
import prisma from '../lib/prisma.js';
import logger from '../utils/logger.js';
import { decrypt } from '../utils/encryption.js';
import { createLead } from './lead.service.js';
import { createNotification } from './notification.service.js';
import { WebhookWhatsAppEntry } from '../types/index.js';

const META_VERSION = process.env.META_API_VERSION || 'v19.0';
const META_BASE = `https://graph.facebook.com/${META_VERSION}`;

type InboundMessage = NonNullable<WebhookWhatsAppEntry['changes'][number]['value']['messages']>[number];
type StatusUpdate = NonNullable<WebhookWhatsAppEntry['changes'][number]['value']['statuses']>[number];
type Contact = NonNullable<WebhookWhatsAppEntry['changes'][number]['value']['contacts']>[number];

function normalizePhone(raw: string): string {
  return raw.replace(/[^0-9]/g, '');
}

/**
 * Best-effort v1 heuristic for detecting a coexistence "echo" — a message the
 * employee sent from their own phone app, mirrored in rather than a real
 * inbound customer message. Meta's exact payload shape for this hasn't been
 * verified against a live connection yet (nothing is set up on Meta's side
 * as of writing this) — this treats a message whose `from` matches the
 * account's own registered number as an echo. Revisit once real webhook
 * payloads are captured in WebhookLog against a real pilot account; Meta may
 * instead use a dedicated field (e.g. a `from_me` flag or a separate `field`
 * value) rather than reusing `from`.
 */
function isEchoMessage(fromNumber: string, account: { displayPhoneNumber: string }): boolean {
  return normalizePhone(fromNumber) === normalizePhone(account.displayPhoneNumber);
}

export class WhatsAppApiError extends Error {
  statusCode: number;
  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
  }
}

export async function processInboundWhatsAppMessage(
  msg: InboundMessage,
  phoneNumberId: string,
  contacts: Contact[],
): Promise<void> {
  const account = await prisma.whatsAppAccount.findUnique({ where: { phoneNumberId } });

  if (!account || !account.isActive) {
    // No employee registered for this number yet (or deactivated) — fall
    // back to the original shared-number lead-capture behaviour so nothing
    // breaks while employees are being onboarded one at a time.
    if (msg.type !== 'text') return;
    const contact = contacts.find((c) => c.wa_id === msg.from);
    const name = contact?.profile?.name || `WhatsApp User ${msg.from}`;
    await createLead(
      { name, phone: msg.from, source: 'WHATSAPP', message: msg.text?.body || '', whatsappMsgId: msg.id, metaPageId: phoneNumberId },
      { whatsappNumber: `+${msg.from}` },
    );
    logger.info(`[whatsapp] no account for phoneNumberId=${phoneNumberId} — used legacy lead-capture path`);
    return;
  }

  // Dedup — Meta retries webhook delivery on any non-2xx/timeout response.
  if (msg.id) {
    const existing = await prisma.whatsAppMessage.findUnique({ where: { metaMessageId: msg.id } });
    if (existing) return;
  }

  const echo = isEchoMessage(msg.from, account);
  // For a real inbound message, `contacts[0].wa_id` is the same customer
  // identified by `msg.from`. For an echo (a message the employee sent from
  // their own phone app), `msg.from` is the *employee's own* number — Meta's
  // payload for `messages` has no separate `to` field, so `contacts[0].wa_id`
  // (still the other party in the conversation) is the only way to recover
  // the customer's number and link back to the right conversation instead of
  // creating a bogus one keyed on the employee's own number.
  const customerPhone = normalizePhone(contacts[0]?.wa_id || msg.from);
  const body = msg.text?.body ?? (msg.type !== 'text' ? `[${msg.type}]` : null);
  const timestamp = msg.timestamp ? new Date(Number(msg.timestamp) * 1000) : new Date();

  const conversation = await prisma.whatsAppConversation.upsert({
    where: { accountId_customerPhone: { accountId: account.id, customerPhone } },
    create: { accountId: account.id, customerPhone, organizationId: account.organizationId },
    update: {},
  });

  await prisma.whatsAppMessage.create({
    data: {
      conversationId: conversation.id,
      direction: echo ? 'OUTBOUND' : 'INBOUND',
      metaMessageId: msg.id,
      fromNumber: msg.from,
      toNumber: echo ? customerPhone : account.phoneNumberId,
      type: msg.type,
      body,
      status: echo ? 'SENT' : 'RECEIVED',
      isEcho: echo,
      timestamp,
    },
  });

  if (echo) {
    // The employee's own phone-app message, just mirrored in — no new-message
    // notification, no Lead churn, only bump the "last activity" markers.
    await prisma.whatsAppConversation.update({
      where: { id: conversation.id },
      data: { lastOutboundAt: timestamp, lastMessagePreview: body ?? undefined },
    });
    return;
  }

  // Real inbound customer message — link/create a Lead and notify the employee.
  let leadId = conversation.leadId;
  if (!leadId) {
    const existingLead = await prisma.lead.findFirst({
      where: { phone: customerPhone, assignedToId: account.userId, deletedAt: null },
    });
    if (existingLead) {
      leadId = existingLead.id;
    } else {
      const contact = contacts.find((c) => c.wa_id === msg.from);
      const name = contact?.profile?.name || `WhatsApp User ${msg.from}`;
      const lead = await createLead(
        {
          name,
          phone: customerPhone,
          source: 'WHATSAPP',
          message: body || '',
          whatsappMsgId: msg.id,
          metaPageId: phoneNumberId,
          organizationId: account.organizationId,
        },
        { whatsappNumber: `+${customerPhone}` },
      );
      // createLead() auto-assigns via campaign round-robin — this
      // conversation is already tied to one specific employee's own
      // number, which should win over any generic campaign assignment.
      if (lead.assignedToId !== account.userId) {
        await prisma.lead.update({ where: { id: lead.id }, data: { assignedToId: account.userId } });
      }
      leadId = lead.id;
    }
  }

  await prisma.whatsAppConversation.update({
    where: { id: conversation.id },
    data: {
      leadId,
      lastInboundAt: timestamp,
      lastMessagePreview: body ?? undefined,
      unreadCount: { increment: 1 },
    },
  });

  await createNotification(
    account.userId,
    'WHATSAPP_MESSAGE_RECEIVED',
    'New WhatsApp message',
    body ? body.slice(0, 100) : `New ${msg.type} message`,
    leadId,
  );
}

export async function processWhatsAppStatusUpdate(status: StatusUpdate): Promise<void> {
  const message = await prisma.whatsAppMessage.findUnique({ where: { metaMessageId: status.id } });
  if (!message) return; // status for a message we don't have on record — nothing to update

  await prisma.whatsAppMessage.update({
    where: { id: message.id },
    data: {
      status: status.status.toUpperCase(),
      statusUpdatedAt: status.timestamp ? new Date(Number(status.timestamp) * 1000) : new Date(),
      errorMessage: status.status === 'failed' ? (status.errors?.[0]?.title ?? null) : null,
    },
  });
}

export async function sendWhatsAppMessage(
  conversationId: string,
  requestingUser: { id: string; role: string },
  body: string,
) {
  const conversation = await prisma.whatsAppConversation.findUnique({
    where: { id: conversationId },
    include: { account: true },
  });
  if (!conversation) throw new WhatsAppApiError('Conversation not found', 404);

  if (requestingUser.role !== 'ADMIN' && conversation.account.userId !== requestingUser.id) {
    throw new WhatsAppApiError('You can only reply on your own conversations', 403);
  }

  if (!conversation.lastInboundAt || Date.now() - conversation.lastInboundAt.getTime() > 24 * 60 * 60 * 1000) {
    throw new WhatsAppApiError(
      "Customer's WhatsApp service window has closed (last message over 24 hours ago). Free-form replies aren't allowed outside this window — a pre-approved message template would be required, which isn't supported yet.",
      400,
    );
  }

  const mockSend = process.env.WHATSAPP_MOCK_SEND === 'true';
  let metaMessageId: string;
  let status = 'SENT';
  let errorMessage: string | null = null;

  if (mockSend) {
    metaMessageId = `wamid.MOCK${Date.now()}`;
  } else {
    try {
      const token = decrypt(conversation.account.accessToken);
      const { data } = await axios.post(
        `${META_BASE}/${conversation.account.phoneNumberId}/messages`,
        { messaging_product: 'whatsapp', to: conversation.customerPhone, type: 'text', text: { body } },
        { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 },
      );
      metaMessageId = data?.messages?.[0]?.id ?? `local.${Date.now()}`;
    } catch (err: any) {
      status = 'FAILED';
      errorMessage = err?.response?.data?.error?.message || err.message || 'Unknown error';
      metaMessageId = `local.${Date.now()}`;
    }
  }

  const message = await prisma.whatsAppMessage.create({
    data: {
      conversationId,
      direction: 'OUTBOUND',
      metaMessageId,
      fromNumber: conversation.account.phoneNumberId,
      toNumber: conversation.customerPhone,
      type: 'text',
      body,
      status,
      errorMessage,
      sentById: requestingUser.id,
      timestamp: new Date(),
    },
  });

  await prisma.whatsAppConversation.update({
    where: { id: conversationId },
    data: { lastOutboundAt: new Date(), lastMessagePreview: body },
  });

  if (status === 'FAILED') {
    throw new WhatsAppApiError(errorMessage || 'Failed to send message', 502);
  }

  return message;
}
