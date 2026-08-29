import { Request, Response } from 'express';

import { createLead } from '../services/lead.service.js';
import { WebhookWhatsAppEntry, WebhookInstagramEntry } from '../types/index.js';
import logger from '../utils/logger.js';
import { getAdEntry } from '../services/adMap.service.js';

import prisma from '../lib/prisma.js';

export const verifyWhatsAppWebhook = (req: Request, res: Response): void => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    logger.info('WhatsApp webhook verified');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
};

export const handleWhatsAppWebhook = async (req: Request, res: Response): Promise<void> => {
  try {
    res.sendStatus(200);

    const body = req.body;
    if (body.object !== 'whatsapp_business_account') return;

    for (const entry of (body.entry || []) as WebhookWhatsAppEntry[]) {
      for (const change of entry.changes || []) {
        if (change.field !== 'messages') continue;
        const value = change.value;
        const messages = value.messages || [];
        const contacts = value.contacts || [];
        const phoneNumberId = value.metadata?.phone_number_id;
        const displayPhone = value.metadata?.display_phone_number;

        await prisma.webhookLog.create({
          data: { source: 'WHATSAPP', payload: JSON.stringify(body), processed: false },
        });

        for (const msg of messages) {
          if (msg.type !== 'text') continue;
          const contact = contacts.find((c) => c.wa_id === msg.from);
          const name = contact?.profile?.name || `WhatsApp User ${msg.from}`;
          const messageText = msg.text?.body || '';

          await createLead(
            {
              name,
              phone: msg.from,
              source: 'WHATSAPP',
              message: messageText,
              whatsappMsgId: msg.id,
              metaPageId: phoneNumberId,
            },
            { whatsappNumber: `+${msg.from}` }
          );

          logger.info(`WhatsApp lead created: ${name} from ${msg.from}`);
        }
      }
    }
  } catch (err) {
    logger.error('WhatsApp webhook error', err);
  }
};

export const verifyInstagramWebhook = (req: Request, res: Response): void => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.INSTAGRAM_VERIFY_TOKEN) {
    logger.info('Instagram webhook verified');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
};

export const handleInstagramWebhook = async (req: Request, res: Response): Promise<void> => {
  try {
    res.sendStatus(200);

    const body = req.body;
    await prisma.webhookLog.create({
      data: { source: 'INSTAGRAM', payload: JSON.stringify(body), processed: false },
    });

    for (const entry of (body.entry || []) as WebhookInstagramEntry[]) {
      for (const msg of entry.messaging || []) {
        if (!msg.message?.text) continue;

        await createLead(
          {
            name: `Instagram User ${msg.sender.id}`,
            phone: msg.sender.id,
            source: 'INSTAGRAM',
            message: msg.message.text,
            instagramLeadId: msg.message.mid,
          },
          {}
        );
        logger.info(`Instagram lead created from ${msg.sender.id}`);
      }

      for (const leadgen of entry.leadgen || []) {
        // Resolve adId → campaign via the MetaAdMap table (populated by Meta sync)
        const adEntry = leadgen.ad_id ? await getAdEntry(leadgen.ad_id) : undefined;

        await createLead(
          {
            name: `Instagram Lead ${leadgen.leadgen_id}`,
            phone: leadgen.leadgen_id,
            source: 'INSTAGRAM',
            message: `Lead from ad: ${leadgen.ad_name}`,
            instagramLeadId: leadgen.leadgen_id,
            adId: leadgen.ad_id,
            adName: leadgen.ad_name,
            metaPageId: leadgen.page_id,
            // adMap-resolved fields — fall back to keyword matching if map is empty
            campaignId: adEntry?.campaignId,
            adsetId: adEntry?.adsetId,
            metaCampaignId: adEntry?.metaCampaignId,
          },
          { instagramAdId: adEntry ? undefined : leadgen.ad_id }, // skip keyword match if adMap resolved
        );
        logger.info(`Instagram leadgen created: ${leadgen.leadgen_id}${adEntry ? ` → campaign ${adEntry.campaignId}` : ''}`);
      }
    }
  } catch (err) {
    logger.error('Instagram webhook error', err);
  }
};

export const simulateLead = async (req: Request, res: Response): Promise<void> => {
  try {
    const { source, name, phone, message, whatsappNumber, instagramAdId } = req.body;

    const lead = await createLead(
      { name, phone, source, message },
      { whatsappNumber, instagramAdId }
    );

    res.status(201).json({ success: true, data: lead, message: 'Lead simulated successfully' });
  } catch {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};
