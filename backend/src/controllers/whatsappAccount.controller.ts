import { Response } from 'express';
import axios from 'axios';
import prisma from '../lib/prisma.js';
import { AuthenticatedRequest } from '../types/index.js';
import { encrypt, decrypt } from '../utils/encryption.js';
import logger from '../utils/logger.js';

const META_VERSION = process.env.META_API_VERSION || 'v19.0';
const META_BASE = `https://graph.facebook.com/${META_VERSION}`;

function orgFilter(req: AuthenticatedRequest): Record<string, unknown> {
  return req.user?.organizationId ? { organizationId: req.user.organizationId } : {};
}

// ── List all employees' connection status (admin) ────────────────────────────

export const listWhatsAppAccounts = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const accounts = await prisma.whatsAppAccount.findMany({
      where: orgFilter(req),
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    });

    const data = accounts.map((a) => {
      let tokenLastFour = '????';
      try {
        tokenLastFour = decrypt(a.accessToken).slice(-4);
      } catch {
        // decryption failed (e.g. key rotation) — still return status
      }
      const { accessToken: _accessToken, ...rest } = a;
      return { ...rest, tokenLastFour };
    });

    res.json({ success: true, data });
  } catch {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// ── Connect an employee's WhatsApp number ─────────────────────────────────────

export const saveWhatsAppAccount = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { userId, phoneNumberId, wabaId, displayPhoneNumber, accessToken } = req.body;

    if (!userId || !phoneNumberId?.trim() || !wabaId?.trim() || !displayPhoneNumber?.trim() || !accessToken?.trim()) {
      res.status(400).json({ success: false, error: 'userId, phoneNumberId, wabaId, displayPhoneNumber and accessToken are all required' });
      return;
    }

    const employee = await prisma.user.findFirst({ where: { id: userId, ...orgFilter(req) } });
    if (!employee) { res.status(404).json({ success: false, error: 'Employee not found' }); return; }

    let encryptedToken: string;
    try {
      encryptedToken = encrypt(accessToken.trim());
    } catch (e: any) {
      res.status(500).json({ success: false, error: `Encryption error: ${e.message}` });
      return;
    }

    const existing = await prisma.whatsAppAccount.findUnique({ where: { userId } });

    if (existing) {
      await prisma.whatsAppAccount.update({
        where: { userId },
        data: {
          phoneNumberId: phoneNumberId.trim(),
          wabaId: wabaId.trim(),
          displayPhoneNumber: displayPhoneNumber.trim(),
          accessToken: encryptedToken,
          isActive: true,
          lastError: null,
        },
      });
    } else {
      await prisma.whatsAppAccount.create({
        data: {
          userId,
          organizationId: req.user?.organizationId ?? null,
          phoneNumberId: phoneNumberId.trim(),
          wabaId: wabaId.trim(),
          displayPhoneNumber: displayPhoneNumber.trim(),
          accessToken: encryptedToken,
        },
      });
    }

    res.json({ success: true, message: 'WhatsApp account connected successfully' });
  } catch (e: any) {
    if (e?.code === 'P2002') {
      res.status(409).json({ success: false, error: 'That phone number is already connected to another employee' });
      return;
    }
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// ── Connect via Meta's Embedded Signup (Coexistence) ──────────────────────────
//
// The manual form above (saveWhatsAppAccount) registers a number as a plain
// Cloud API number — fine for a brand-new WhatsApp line, but for an employee
// who wants to KEEP using the WhatsApp Business app on their phone, Meta only
// turns on mirroring ("Coexistence") through this specific flow: the frontend
// launches FB.login() with a Coexistence-configured config_id, which returns
// a short-lived `code` plus (via a postMessage the popup sends) the
// phoneNumberId/wabaId the employee picked. This endpoint takes that code,
// exchanges it for a real token, and finishes wiring things up on Meta's side
// (the pure browser click-through we tried earlier has no button for this —
// it only exists inside the Embedded Signup popup itself).
export const completeEmbeddedSignup = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { userId, code, wabaId } = req.body;
    let { phoneNumberId } = req.body as { phoneNumberId?: string };

    if (!userId || !code?.trim() || !wabaId?.trim()) {
      res.status(400).json({ success: false, error: 'userId, code and wabaId are all required' });
      return;
    }

    const employee = await prisma.user.findFirst({ where: { id: userId, ...orgFilter(req) } });
    if (!employee) { res.status(404).json({ success: false, error: 'Employee not found' }); return; }

    const appId = process.env.META_APP_ID;
    const appSecret = process.env.META_APP_SECRET;
    if (!appId || !appSecret) {
      res.status(500).json({ success: false, error: 'META_APP_ID / META_APP_SECRET not configured on the server' });
      return;
    }

    // 1. Exchange the Embedded Signup `code` for a short-lived user token.
    //    (No redirect_uri — the JS SDK popup flow doesn't use one.)
    let shortLivedToken: string;
    try {
      const { data } = await axios.get(`${META_BASE}/oauth/access_token`, {
        params: { client_id: appId, client_secret: appSecret, code: code.trim() },
        timeout: 15000,
      });
      shortLivedToken = data.access_token;
      if (!shortLivedToken) throw new Error('No access_token in response');
    } catch (err: any) {
      logger.error('[whatsappAccount] embedded signup code exchange failed', err?.response?.data || err.message);
      res.status(502).json({ success: false, error: err?.response?.data?.error?.message || 'Failed to exchange signup code with Meta' });
      return;
    }

    // 2. Exchange for a long-lived token (~60 days) so the connection doesn't
    //    silently die a few hours after setup.
    let longLivedToken = shortLivedToken;
    try {
      const { data } = await axios.get(`${META_BASE}/oauth/access_token`, {
        params: {
          grant_type: 'fb_exchange_token',
          client_id: appId,
          client_secret: appSecret,
          fb_exchange_token: shortLivedToken,
        },
        timeout: 15000,
      });
      if (data.access_token) longLivedToken = data.access_token;
    } catch (err: any) {
      // Non-fatal — fall back to the short-lived token rather than failing
      // the whole connect; the employee can just reconnect sooner.
      logger.warn('[whatsappAccount] long-lived token exchange failed, using short-lived token', err?.response?.data || err.message);
    }

    // 3. Subscribe our app to this WABA's webhooks — without this, Meta never
    //    sends us events for it even though the token/number are valid.
    try {
      await axios.post(`${META_BASE}/${wabaId.trim()}/subscribed_apps`, null, {
        params: { access_token: longLivedToken },
        timeout: 15000,
      });
    } catch (err: any) {
      logger.error('[whatsappAccount] subscribed_apps failed', err?.response?.data || err.message);
      res.status(502).json({ success: false, error: err?.response?.data?.error?.message || 'Connected, but failed to subscribe for webhooks — try disconnecting and reconnecting' });
      return;
    }

    // 4. Coexistence's completion event routinely doesn't hand back a
    //    phoneNumberId at all — resolve it from the WABA's own phone number
    //    list instead of trusting (or requiring) anything from the client.
    let resolvedPhoneNumberId = phoneNumberId?.trim();
    let displayPhoneNumber = resolvedPhoneNumberId ?? '';
    try {
      const { data } = await axios.get(`${META_BASE}/${wabaId.trim()}/phone_numbers`, {
        params: { fields: 'id,display_phone_number', access_token: longLivedToken },
        timeout: 15000,
      });
      const numbers: Array<{ id: string; display_phone_number?: string }> = data?.data ?? [];
      const match = resolvedPhoneNumberId
        ? numbers.find((n) => n.id === resolvedPhoneNumberId)
        : numbers[0]; // Coexistence WABAs have exactly one number
      if (match) {
        resolvedPhoneNumberId = match.id;
        if (match.display_phone_number) displayPhoneNumber = match.display_phone_number;
      }
    } catch (err: any) {
      logger.warn('[whatsappAccount] could not list phone_numbers for WABA', err?.response?.data || err.message);
    }

    if (!resolvedPhoneNumberId) {
      res.status(502).json({ success: false, error: 'Connected, but could not find a phone number on this WhatsApp Business Account' });
      return;
    }
    phoneNumberId = resolvedPhoneNumberId;

    const encryptedToken = encrypt(longLivedToken);

    const existing = await prisma.whatsAppAccount.findUnique({ where: { userId } });
    if (existing) {
      await prisma.whatsAppAccount.update({
        where: { userId },
        data: {
          phoneNumberId: phoneNumberId.trim(),
          wabaId: wabaId.trim(),
          displayPhoneNumber,
          accessToken: encryptedToken,
          isActive: true,
          lastError: null,
        },
      });
    } else {
      await prisma.whatsAppAccount.create({
        data: {
          userId,
          organizationId: req.user?.organizationId ?? null,
          phoneNumberId: phoneNumberId.trim(),
          wabaId: wabaId.trim(),
          displayPhoneNumber,
          accessToken: encryptedToken,
        },
      });
    }

    res.json({ success: true, message: 'WhatsApp connected via Meta — Coexistence enabled' });
  } catch (e: any) {
    if (e?.code === 'P2002') {
      res.status(409).json({ success: false, error: 'That phone number is already connected to another employee' });
      return;
    }
    logger.error('[whatsappAccount] completeEmbeddedSignup unexpected error', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// ── Disconnect (soft — preserves conversation history) ────────────────────────

export const deactivateWhatsAppAccount = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const account = await prisma.whatsAppAccount.findFirst({ where: { userId, ...orgFilter(req) } });
    if (!account) { res.status(404).json({ success: false, error: 'Account not found' }); return; }

    await prisma.whatsAppAccount.update({ where: { userId }, data: { isActive: false } });
    res.json({ success: true, message: 'WhatsApp account disconnected' });
  } catch {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};
