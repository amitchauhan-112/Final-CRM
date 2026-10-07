import { Response } from 'express';
import prisma from '../lib/prisma.js';
import { AuthenticatedRequest } from '../types/index.js';
import { emitFinanceUpdated, createNotification, notifyFinanceTeam } from '../services/notification.service.js';
import { buildUploadUrl } from '../middleware/upload.js';
import { isWholeAmount, WHOLE_AMOUNT_ERROR } from '../utils/amountValidation.js';

const orgId = (req: AuthenticatedRequest) => req.user?.organizationId ?? null;
const orgFilter = (req: AuthenticatedRequest) => (orgId(req) ? { organizationId: orgId(req) } : {});

export const listExpenses = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { status, category, departureId, packageId } = req.query;
    const where: Record<string, unknown> = { ...orgFilter(req) };
    if (status) where.status = status;
    if (category) where.category = category;
    if (departureId) where.departureId = departureId;
    if (packageId) where.packageId = packageId;

    const expenses = await prisma.expense.findMany({
      where,
      include: {
        departure: { select: { id: true, destination: true, departureDate: true } },
        package: { select: { id: true, name: true, code: true } },
        vendor: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        approvedBy: { select: { id: true, name: true } },
        paidByPartner: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: expenses });
  } catch (e) {
    console.error('[finance] listExpenses error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// ─── My claims — any authenticated user, their own self-logged expenses ─────

export const listMyExpenseClaims = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const expenses = await prisma.expense.findMany({
      where: { createdById: req.user!.id, isClaim: true, ...orgFilter(req) },
      include: {
        paidByPartner: { select: { id: true, name: true } },
        approvedBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: expenses });
  } catch (e) {
    console.error('[finance] listMyExpenseClaims error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// ─── Log an expense — always PENDING until Finance/Admin approves it, mirroring
// the Payment verification workflow so nothing hits trip/package cost unverified.

export const createExpense = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { category, amount, description, departureId, packageId, vendorId, paidByPartnerId } = req.body;
    if (!category?.trim()) { res.status(400).json({ success: false, error: 'Category is required' }); return; }
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      res.status(400).json({ success: false, error: 'Valid amount is required' }); return;
    }
    if (!isWholeAmount(amount)) { res.status(400).json({ success: false, error: WHOLE_AMOUNT_ERROR }); return; }

    const billUrl = req.file ? buildUploadUrl(req.file) : null;
    // Self-logged by anyone outside Finance/Admin — e.g. an employee's own
    // small reimbursement claim, or a partner logging their own spend — only
    // an Admin may approve/reject it (see approveExpense/rejectExpense).
    // Finance keeps approving everything else, same as before.
    const isClaim = req.user!.role !== 'ADMIN' && req.user!.role !== 'FINANCE';
    // A self-claimant can only attribute the spend to themselves, never to
    // another partner — otherwise anyone could pin their own expense on
    // someone else's name.
    if (isClaim && paidByPartnerId) {
      const own = await prisma.partner.findFirst({ where: { userId: req.user!.id, ...(orgId(req) ? { organizationId: orgId(req) } : {}) } });
      if (!own || own.id !== paidByPartnerId) {
        res.status(403).json({ success: false, error: 'You can only log this as paid by your own linked partner profile' }); return;
      }
    }

    const expense = await prisma.expense.create({
      data: {
        organizationId: orgId(req),
        category: category.trim(),
        amount: Number(amount),
        description: description?.trim() || null,
        departureId: departureId || null,
        packageId: packageId || null,
        vendorId: vendorId || null,
        paidByPartnerId: paidByPartnerId || null,
        isClaim,
        billUrl,
        status: 'PENDING',
        createdById: req.user!.id,
      },
      include: { createdBy: { select: { id: true, name: true } }, paidByPartner: { select: { id: true, name: true } } },
    });

    await prisma.activityLog.create({
      data: {
        action: 'Expense Logged',
        details: `₹${expense.amount.toLocaleString()} ${expense.category} expense logged by ${req.user?.name}`,
        entityType: 'EXPENSE',
        entityId: expense.id,
        userId: req.user!.id,
      },
    });

    await notifyFinanceTeam(orgId(req), 'NEW_EXPENSE_SUBMITTED', 'New Expense Awaiting Approval',
      `₹${expense.amount.toLocaleString()} ${expense.category} expense needs approval.`, departureId || undefined);
    emitFinanceUpdated();

    res.status(201).json({ success: true, data: expense });
  } catch (e) {
    console.error('[finance] createExpense error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

export const approveExpense = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const expense = await prisma.expense.findFirst({ where: { id, ...orgFilter(req) } });
    if (!expense) { res.status(404).json({ success: false, error: 'Expense not found' }); return; }
    if (expense.status === 'APPROVED') { res.status(400).json({ success: false, error: 'Expense already approved' }); return; }
    if (expense.isClaim && req.user?.role !== 'ADMIN') {
      res.status(403).json({ success: false, error: 'Only an Admin can approve a self-logged claim' }); return;
    }

    const updated = await prisma.expense.update({
      where: { id },
      data: { status: 'APPROVED', approvedById: req.user!.id, approvedAt: new Date(), rejectionReason: null },
    });

    await prisma.activityLog.create({
      data: {
        action: 'Expense Approved',
        details: `₹${expense.amount.toLocaleString()} ${expense.category} expense approved by ${req.user?.name}`,
        entityType: 'EXPENSE', entityId: id, userId: req.user!.id,
        oldValue: { status: expense.status }, newValue: { status: 'APPROVED' },
      },
    });

    if (expense.createdById !== req.user!.id) {
      await createNotification(expense.createdById, 'EXPENSE_APPROVED', 'Expense Approved',
        `Your ₹${expense.amount.toLocaleString()} ${expense.category} expense was approved.`);
    }
    emitFinanceUpdated();

    res.json({ success: true, data: updated });
  } catch (e) {
    console.error('[finance] approveExpense error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

export const rejectExpense = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    if (!reason?.trim()) { res.status(400).json({ success: false, error: 'Rejection reason is required' }); return; }

    const expense = await prisma.expense.findFirst({ where: { id, ...orgFilter(req) } });
    if (!expense) { res.status(404).json({ success: false, error: 'Expense not found' }); return; }
    if (expense.status === 'APPROVED') { res.status(400).json({ success: false, error: 'Cannot reject an already-approved expense' }); return; }
    if (expense.isClaim && req.user?.role !== 'ADMIN') {
      res.status(403).json({ success: false, error: 'Only an Admin can reject a self-logged claim' }); return;
    }

    const updated = await prisma.expense.update({
      where: { id },
      data: { status: 'REJECTED', rejectionReason: reason.trim(), approvedById: req.user!.id, approvedAt: new Date() },
    });

    await prisma.activityLog.create({
      data: {
        action: 'Expense Rejected',
        details: `₹${expense.amount.toLocaleString()} ${expense.category} expense rejected by ${req.user?.name}: ${reason.trim()}`,
        entityType: 'EXPENSE', entityId: id, userId: req.user!.id,
        oldValue: { status: expense.status }, newValue: { status: 'REJECTED', rejectionReason: reason.trim() },
      },
    });

    if (expense.createdById !== req.user!.id) {
      await createNotification(expense.createdById, 'EXPENSE_REJECTED', 'Expense Rejected',
        `Your ₹${expense.amount.toLocaleString()} ${expense.category} expense was rejected: ${reason.trim()}`);
    }
    emitFinanceUpdated();

    res.json({ success: true, data: updated });
  } catch (e) {
    console.error('[finance] rejectExpense error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

export const deleteExpense = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const existing = await prisma.expense.findFirst({ where: { id, ...orgFilter(req) } });
    if (!existing) { res.status(404).json({ success: false, error: 'Expense not found' }); return; }
    if (existing.status === 'APPROVED') {
      res.status(400).json({ success: false, error: 'Approved expenses cannot be deleted — they are part of finalized cost records' });
      return;
    }

    await prisma.expense.delete({ where: { id } });
    emitFinanceUpdated();
    res.json({ success: true, data: { id } });
  } catch (e) {
    console.error('[finance] deleteExpense error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};
