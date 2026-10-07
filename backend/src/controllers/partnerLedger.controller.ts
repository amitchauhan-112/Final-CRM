import { Response } from 'express';
import prisma from '../lib/prisma.js';
import { AuthenticatedRequest } from '../types/index.js';
import { createNotification } from '../services/notification.service.js';
import { isWholeAmount, WHOLE_AMOUNT_ERROR } from '../utils/amountValidation.js';

// Partner ledger: for each partner, "paid" comes from approved Expense rows
// (paidByPartnerId — already existed), "collected" is the new PartnerCollection
// model below. Only partners linked to a real login (userId set) take part in
// the 3-way equalization — a name-only bucket like "Company Account" is shown
// for visibility but its money already sits with the company, so it's excluded
// from who-owes-whom.

const orgId = (req: AuthenticatedRequest) => req.user?.organizationId ?? null;
const orgFilter = (req: AuthenticatedRequest) => (orgId(req) ? { organizationId: orgId(req) } : {});

// Admin/Finance can act for any partner; a partner linked to the caller's own
// login can act only for themselves.
async function canActForPartner(req: AuthenticatedRequest, partnerId: string): Promise<boolean> {
  if (req.user?.role === 'ADMIN' || req.user?.role === 'FINANCE') return true;
  const partner = await prisma.partner.findFirst({ where: { id: partnerId, ...orgFilter(req) } });
  return !!partner && partner.userId === req.user?.id;
}

async function canViewLedger(req: AuthenticatedRequest): Promise<boolean> {
  if (req.user?.role === 'ADMIN' || req.user?.role === 'FINANCE') return true;
  const linked = await prisma.partner.findFirst({ where: { userId: req.user?.id, ...orgFilter(req) } });
  return !!linked;
}

// ─── GET /partner-ledger/handover-options — who "Handover To" can pick ──────
// Any authenticated user — cash handover now only ever goes to one of the
// partners (Amit, Nitin, Saurabh, …), not any employee, so Sales picks from
// this short list instead of the full employee directory.

export const listHandoverOptions = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const partners = await prisma.partner.findMany({
      where: { ...orgFilter(req), isActive: true, userId: { not: null } },
      select: { userId: true, name: true },
      orderBy: { name: 'asc' },
    });
    res.json({ success: true, data: partners.map((p) => ({ id: p.userId as string, name: p.name })) });
  } catch (e) {
    console.error('[partnerLedger] listHandoverOptions error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// ─── GET /partner-ledger/mine — am I linked to a partner profile? ───────────
// Any authenticated user — used by the expense-claim form to offer "mark as
// my own partner-paid expense" only to someone who actually has one.

export const getMyPartner = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const partner = await prisma.partner.findFirst({ where: { userId: req.user?.id, ...orgFilter(req) }, select: { id: true, name: true } });
    res.json({ success: true, data: partner });
  } catch (e) {
    console.error('[partnerLedger] getMyPartner error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// ─── GET /partner-ledger — every partner's paid/collected/net + equalization ─

export const getPartnerLedger = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!(await canViewLedger(req))) { res.status(403).json({ success: false, error: 'Access denied' }); return; }

    const partners = await prisma.partner.findMany({ where: { ...orgFilter(req), isActive: true }, orderBy: { name: 'asc' } });
    const linkedUserIds = partners.map((p) => p.userId).filter((id): id is string => !!id);

    const [paidRows, collectedRows, cashRows] = await Promise.all([
      prisma.expense.groupBy({
        by: ['paidByPartnerId'],
        where: { ...orgFilter(req), status: 'APPROVED', paidByPartnerId: { not: null } },
        _sum: { amount: true },
      }),
      prisma.partnerCollection.groupBy({
        by: ['partnerId'],
        where: { ...orgFilter(req), status: 'APPROVED' },
        _sum: { amount: true },
      }),
      // Cash a partner is currently holding after Finance verifies a CASH
      // payment handed over to them (see approvePayment) — same HANDOVER minus
      // COLLECTION formula employeeCash.controller.ts uses, counted here too
      // so a Sales handover automatically becomes that partner's "collected".
      linkedUserIds.length
        ? prisma.employeeCashLedger.groupBy({
            by: ['employeeId', 'type'],
            where: { ...orgFilter(req), employeeId: { in: linkedUserIds } },
            _sum: { amount: true },
          })
        : Promise.resolve([] as { employeeId: string; type: string; _sum: { amount: number | null } }[]),
    ]);
    const paidMap = new Map(paidRows.map((r) => [r.paidByPartnerId as string, r._sum.amount ?? 0]));
    const collectedMap = new Map(collectedRows.map((r) => [r.partnerId, r._sum.amount ?? 0]));
    const cashByUser = new Map<string, number>();
    for (const r of cashRows) {
      const sign = r.type === 'HANDOVER' ? 1 : -1;
      cashByUser.set(r.employeeId, (cashByUser.get(r.employeeId) ?? 0) + sign * (r._sum.amount ?? 0));
    }

    const rows = partners.map((p) => {
      const paid = paidMap.get(p.id) ?? 0;
      const cashHeld = p.userId ? (cashByUser.get(p.userId) ?? 0) : 0;
      const collected = (collectedMap.get(p.id) ?? 0) + cashHeld;
      return { id: p.id, name: p.name, isLinkedToLogin: !!p.userId, paid, collected, net: collected - paid };
    });

    // Equalize only across partners with their own login — a name-only
    // bucket (e.g. Company Account) is money that already belongs to the
    // company, not to any one person, so it never owes or is owed.
    const equalizable = rows.filter((r) => r.isLinkedToLogin);
    const totalNet = equalizable.reduce((s, r) => s + r.net, 0);
    const fairShare = equalizable.length ? totalNet / equalizable.length : 0;
    const balances = equalizable
      .map((r) => ({ id: r.id, name: r.name, balance: Math.round((r.net - fairShare) * 100) / 100 }))
      .sort((a, b) => b.balance - a.balance);

    // Greedy settle-up: whoever is holding more than their fair share pays
    // whoever is holding less, until everyone lands on the same amount.
    const settlements: { fromId: string; fromName: string; toId: string; toName: string; amount: number }[] = [];
    const creditors = balances.filter((b) => b.balance > 0.5).map((b) => ({ ...b }));
    const debtors = balances.filter((b) => b.balance < -0.5).map((b) => ({ ...b, balance: -b.balance }));
    let ci = 0, di = 0;
    while (ci < creditors.length && di < debtors.length) {
      const amount = Math.round(Math.min(creditors[ci].balance, debtors[di].balance) * 100) / 100;
      if (amount > 0.5) {
        settlements.push({ fromId: debtors[di].id, fromName: debtors[di].name, toId: creditors[ci].id, toName: creditors[ci].name, amount });
      }
      creditors[ci].balance -= amount;
      debtors[di].balance -= amount;
      if (creditors[ci].balance <= 0.5) ci++;
      if (debtors[di].balance <= 0.5) di++;
    }

    res.json({ success: true, data: { partners: rows, fairShare: Math.round(fairShare * 100) / 100, settlements } });
  } catch (e) {
    console.error('[partnerLedger] getPartnerLedger error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// ─── Collections ──────────────────────────────────────────────────────────────

export const listPartnerCollections = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { partnerId } = req.query;
    const where: Record<string, unknown> = { ...orgFilter(req) };
    if (partnerId) where.partnerId = partnerId;
    else if (!(req.user?.role === 'ADMIN' || req.user?.role === 'FINANCE')) {
      // No partner specified and caller isn't Finance/Admin — scope to their own.
      const mine = await prisma.partner.findFirst({ where: { userId: req.user?.id, ...orgFilter(req) } });
      if (!mine) { res.json({ success: true, data: [] }); return; }
      where.partnerId = mine.id;
    }

    const rows = await prisma.partnerCollection.findMany({
      where,
      include: { partner: { select: { id: true, name: true } }, createdBy: { select: { id: true, name: true } }, approvedBy: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: rows });
  } catch (e) {
    console.error('[partnerLedger] listPartnerCollections error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

export const createPartnerCollection = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { partnerId, amount, description, collectedAt } = req.body;
    if (!partnerId) { res.status(400).json({ success: false, error: 'Partner is required' }); return; }
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) { res.status(400).json({ success: false, error: 'Valid amount is required' }); return; }
    if (!isWholeAmount(amount)) { res.status(400).json({ success: false, error: WHOLE_AMOUNT_ERROR }); return; }

    const partner = await prisma.partner.findFirst({ where: { id: partnerId, ...orgFilter(req) } });
    if (!partner) { res.status(404).json({ success: false, error: 'Partner not found' }); return; }
    if (!(await canActForPartner(req, partnerId))) {
      res.status(403).json({ success: false, error: 'You can only log a collection for yourself, unless you are Admin or Finance' }); return;
    }

    const row = await prisma.partnerCollection.create({
      data: {
        organizationId: orgId(req),
        partnerId,
        amount: Number(amount),
        description: description?.trim() || null,
        collectedAt: collectedAt ? new Date(collectedAt) : new Date(),
        status: 'PENDING',
        createdById: req.user!.id,
      },
      include: { partner: { select: { id: true, name: true } } },
    });

    await prisma.activityLog.create({
      data: {
        action: 'Partner Collection Logged',
        details: `₹${row.amount.toLocaleString()} logged as collected by ${partner.name}, by ${req.user?.name}`,
        entityType: 'PARTNER_COLLECTION', entityId: row.id, userId: req.user!.id,
      },
    });

    res.status(201).json({ success: true, data: row });
  } catch (e) {
    console.error('[partnerLedger] createPartnerCollection error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

export const approvePartnerCollection = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (req.user?.role !== 'ADMIN') { res.status(403).json({ success: false, error: 'Only an Admin can approve a collection' }); return; }
    const { id } = req.params;
    const row = await prisma.partnerCollection.findFirst({ where: { id, ...orgFilter(req) } });
    if (!row) { res.status(404).json({ success: false, error: 'Collection not found' }); return; }
    if (row.status !== 'PENDING') { res.status(400).json({ success: false, error: 'Already resolved' }); return; }

    const updated = await prisma.partnerCollection.update({
      where: { id },
      data: { status: 'APPROVED', approvedById: req.user!.id, approvedAt: new Date(), rejectionReason: null },
    });
    if (row.createdById !== req.user!.id) {
      await createNotification(row.createdById, 'EXPENSE_APPROVED', 'Collection Approved', `Your ₹${row.amount.toLocaleString()} collection entry was approved.`);
    }
    res.json({ success: true, data: updated });
  } catch (e) {
    console.error('[partnerLedger] approvePartnerCollection error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

export const rejectPartnerCollection = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (req.user?.role !== 'ADMIN') { res.status(403).json({ success: false, error: 'Only an Admin can reject a collection' }); return; }
    const { id } = req.params;
    const { reason } = req.body;
    if (!reason?.trim()) { res.status(400).json({ success: false, error: 'Rejection reason is required' }); return; }
    const row = await prisma.partnerCollection.findFirst({ where: { id, ...orgFilter(req) } });
    if (!row) { res.status(404).json({ success: false, error: 'Collection not found' }); return; }
    if (row.status !== 'PENDING') { res.status(400).json({ success: false, error: 'Already resolved' }); return; }

    const updated = await prisma.partnerCollection.update({
      where: { id },
      data: { status: 'REJECTED', rejectionReason: reason.trim(), approvedById: req.user!.id, approvedAt: new Date() },
    });
    if (row.createdById !== req.user!.id) {
      await createNotification(row.createdById, 'EXPENSE_REJECTED', 'Collection Rejected', `Your ₹${row.amount.toLocaleString()} collection entry was rejected: ${reason.trim()}`);
    }
    res.json({ success: true, data: updated });
  } catch (e) {
    console.error('[partnerLedger] rejectPartnerCollection error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};
