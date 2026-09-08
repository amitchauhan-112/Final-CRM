import { Request, Response } from 'express';

import { createLead } from '../services/lead.service.js';
import { WebhookWhatsAppEntry, WebhookInstagramEntry, AuthenticatedRequest } from '../types/index.js';
import logger from '../utils/logger.js';
import { getAdEntry } from '../services/adMap.service.js';
import { processInboundWhatsAppMessage, processWhatsAppStatusUpdate } from '../services/whatsapp.service.js';

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

    // Logged unconditionally, before any processing — the audit trail this
    // relies on to capture real coexistence payload shapes once a pilot
    // employee is connected (see whatsapp.service.ts's echo-detection note).
    await prisma.webhookLog.create({
      data: { source: 'WHATSAPP', payload: JSON.stringify(body), processed: false },
    });

    for (const entry of (body.entry || []) as WebhookWhatsAppEntry[]) {
      for (const change of entry.changes || []) {
        const value = change.value;
        const phoneNumberId = value.metadata?.phone_number_id;

        if (change.field === 'messages') {
          const contacts = value.contacts || [];
          for (const msg of value.messages || []) {
            try {
              await processInboundWhatsAppMessage(msg, phoneNumberId, contacts);
            } catch (err) {
              logger.error(`[whatsapp] failed to process message ${msg.id}`, err);
            }
          }
        } else if (change.field === 'statuses') {
          for (const status of value.statuses || []) {
            try {
              await processWhatsAppStatusUpdate(status);
            } catch (err) {
              logger.error(`[whatsapp] failed to process status update ${status.id}`, err);
            }
          }
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

// One-time (safe to re-run) backfill for leads captured before CTWA
// referral attribution was added — every inbound WhatsApp webhook payload
// is logged raw regardless of how it was processed at the time, so a
// message's `referral` data (which ad it came from) is still recoverable
// even for old leads. Matches back to a Lead via the WhatsApp message ID,
// only touches leads that don't already have an adId (never overwrites
// anything, so re-running this is harmless).
export const backfillCtwaAttribution = async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const logs = await prisma.webhookLog.findMany({ where: { source: 'WHATSAPP' } });

    let scanned = 0;
    let updated = 0;
    let noMatch = 0;

    for (const log of logs) {
      let body: any;
      try { body = JSON.parse(log.payload); } catch { continue; }
      if (body?.object !== 'whatsapp_business_account') continue;

      for (const entry of (body.entry || []) as WebhookWhatsAppEntry[]) {
        for (const change of entry.changes || []) {
          if (change.field !== 'messages') continue;
          for (const msg of change.value.messages || []) {
            if (!msg.referral?.source_id) continue;
            scanned++;

            const lead = await prisma.lead.findFirst({ where: { whatsappMsgId: msg.id } });
            if (!lead || lead.adId) { noMatch++; continue; } // no matching lead, or already attributed

            const adEntry = await getAdEntry(msg.referral.source_id);
            await prisma.lead.update({
              where: { id: lead.id },
              data: {
                adId: msg.referral.source_id,
                adName: msg.referral.headline || msg.referral.body || undefined,
                campaignId: lead.campaignId ?? adEntry?.campaignId ?? undefined,
              },
            });
            updated++;
          }
        }
      }
    }

    res.json({
      success: true,
      message: `Scanned ${scanned} CTWA message(s) across ${logs.length} logged webhook payload(s) — updated ${updated} lead(s), ${noMatch} already attributed or had no matching lead`,
      data: { scanned, updated, noMatch, logsScanned: logs.length },
    });
  } catch (e) {
    logger.error('[admin] backfillCtwaAttribution error', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};
