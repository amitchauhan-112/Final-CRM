import { Response } from 'express';
import prisma from '../lib/prisma.js';
import { AuthenticatedRequest } from '../types/index.js';
import { encrypt, decrypt } from '../utils/encryption.js';

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
