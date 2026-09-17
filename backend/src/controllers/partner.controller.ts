import { Response } from 'express';
import prisma from '../lib/prisma.js';
import { AuthenticatedRequest } from '../types/index.js';

const orgId = (req: AuthenticatedRequest) => req.user?.organizationId ?? null;
const orgFilter = (req: AuthenticatedRequest) => (orgId(req) ? { organizationId: orgId(req) } : {});

// Business partners/co-owners — just a name list to attribute "who paid what"
// on an Expense. Not login accounts, no role/permission implications.

export const listPartners = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { includeInactive } = req.query;
    const partners = await prisma.partner.findMany({
      where: { ...orgFilter(req), ...(includeInactive === 'true' ? {} : { isActive: true }) },
      orderBy: { name: 'asc' },
    });
    res.json({ success: true, data: partners });
  } catch (e) {
    console.error('[finance] listPartners error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

export const createPartner = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { name } = req.body;
    if (!name?.trim()) { res.status(400).json({ success: false, error: 'Partner name is required' }); return; }

    const partner = await prisma.partner.create({
      data: { organizationId: orgId(req), name: name.trim() },
    });
    res.status(201).json({ success: true, data: partner });
  } catch (e) {
    console.error('[finance] createPartner error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

export const updatePartner = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const existing = await prisma.partner.findFirst({ where: { id, ...orgFilter(req) } });
    if (!existing) { res.status(404).json({ success: false, error: 'Partner not found' }); return; }

    const { name, isActive } = req.body;
    const partner = await prisma.partner.update({
      where: { id },
      data: {
        name: name !== undefined ? String(name).trim() : existing.name,
        isActive: isActive !== undefined ? Boolean(isActive) : existing.isActive,
      },
    });
    res.json({ success: true, data: partner });
  } catch (e) {
    console.error('[finance] updatePartner error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// ─── GET /finance/partners/summary — each partner's total paid, in-range ────
// Only counts APPROVED expenses — same rule the P&L report uses, so this
// stays consistent with it.

export const getPartnerPaymentsSummary = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { start, end } = req.query;
    const where: Record<string, unknown> = {
      ...orgFilter(req),
      status: 'APPROVED',
      paidByPartnerId: { not: null },
    };
    if (start || end) {
      where.approvedAt = {
        ...(start ? { gte: new Date(String(start)) } : {}),
        ...(end ? { lte: new Date(String(end)) } : {}),
      };
    }

    const expenses = await prisma.expense.findMany({
      where,
      select: { amount: true, paidByPartnerId: true, paidByPartner: { select: { id: true, name: true } } },
    });

    const byPartner = new Map<string, { id: string; name: string; totalPaid: number; count: number }>();
    for (const e of expenses) {
      if (!e.paidByPartnerId || !e.paidByPartner) continue;
      const row = byPartner.get(e.paidByPartnerId) ?? { id: e.paidByPartnerId, name: e.paidByPartner.name, totalPaid: 0, count: 0 };
      row.totalPaid += e.amount;
      row.count += 1;
      byPartner.set(e.paidByPartnerId, row);
    }

    res.json({ success: true, data: Array.from(byPartner.values()).sort((a, b) => b.totalPaid - a.totalPaid) });
  } catch (e) {
    console.error('[finance] getPartnerPaymentsSummary error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};
