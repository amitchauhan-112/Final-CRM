import { Response } from 'express';
import prisma from '../lib/prisma.js';
import { AuthenticatedRequest } from '../types/index.js';
import { notifyFinanceTeam, emitFinanceUpdated, createNotification } from '../services/notification.service.js';
import { generateFinanceDocument } from './financeDocument.controller.js';
import { isWholeAmount, WHOLE_AMOUNT_ERROR } from '../utils/amountValidation.js';

const orgId = (req: AuthenticatedRequest) => req.user?.organizationId ?? null;
const orgFilter = (req: AuthenticatedRequest) => (orgId(req) ? { organizationId: orgId(req) } : {});

export const listRefunds = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { status } = req.query;
    const where: Record<string, unknown> = { ...orgFilter(req) };
    if (status) where.status = status;

    const refunds = await prisma.refund.findMany({
      where,
      include: {
        booking: { include: { lead: { select: { id: true, name: true, phone: true } } } },
        requestedBy: { select: { id: true, name: true } },
        approvedBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: refunds });
  } catch (e) {
    console.error('[finance] listRefunds error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

export const createRefund = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { bookingId, amount, reason, remarks } = req.body;
    const booking = await prisma.booking.findFirst({ where: { id: bookingId, ...orgFilter(req) }, include: { lead: true } });
    if (!booking) { res.status(404).json({ success: false, error: 'Booking not found' }); return; }
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) { res.status(400).json({ success: false, error: 'Valid refund amount is required' }); return; }
    if (!isWholeAmount(amount)) { res.status(400).json({ success: false, error: WHOLE_AMOUNT_ERROR }); return; }
    if (!reason?.trim()) { res.status(400).json({ success: false, error: 'Refund reason is required' }); return; }

    const refund = await prisma.refund.create({
      data: {
        organizationId: orgId(req),
        bookingId,
        amount: Number(amount),
        reason: reason.trim(),
        remarks: remarks?.trim() || null,
        status: 'REQUESTED',
        requestedById: req.user!.id,
      },
    });

    await prisma.activityLog.create({
      data: { action: 'Refund Requested', details: `₹${refund.amount.toLocaleString()} refund requested for ${booking.lead.name}`, entityType: 'REFUND', entityId: refund.id, userId: req.user!.id, leadId: booking.leadId },
    });
    await notifyFinanceTeam(orgId(req), 'REFUND_REQUESTED', 'Refund Requested', `₹${refund.amount.toLocaleString()} refund requested for ${booking.lead.name}: ${reason.trim()}`);
    emitFinanceUpdated();

    res.status(201).json({ success: true, data: refund });
  } catch (e) {
    console.error('[finance] createRefund error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

export const approveRefund = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const refund = await prisma.refund.findFirst({ where: { id, ...orgFilter(req) } });
    if (!refund) { res.status(404).json({ success: false, error: 'Refund not found' }); return; }
    if (refund.status !== 'REQUESTED') { res.status(400).json({ success: false, error: 'Only requested refunds can be approved' }); return; }

    const updated = await prisma.refund.update({
      where: { id },
      data: { status: 'APPROVED', approvedById: req.user!.id },
    });
    await prisma.activityLog.create({
      data: {
        action: 'Refund Approved', details: `₹${refund.amount.toLocaleString()} refund approved by ${req.user?.name}`,
        entityType: 'REFUND', entityId: id, userId: req.user!.id,
        oldValue: { status: refund.status }, newValue: { status: 'APPROVED' },
      },
    });
    emitFinanceUpdated();
    res.json({ success: true, data: updated });
  } catch (e) {
    console.error('[finance] approveRefund error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

export const markRefundPaid = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { transactionId } = req.body;
    const refund = await prisma.refund.findFirst({ where: { id, ...orgFilter(req) }, include: { booking: { include: { lead: true } } } });
    if (!refund) { res.status(404).json({ success: false, error: 'Refund not found' }); return; }
    if (refund.status !== 'APPROVED') { res.status(400).json({ success: false, error: 'Only approved refunds can be marked paid' }); return; }

    const newAmountPaid = Math.max(0, refund.booking.amountPaid - refund.amount);
    const newBalance = Math.max(0, refund.booking.finalPrice - newAmountPaid);

    const [updated] = await prisma.$transaction([
      prisma.refund.update({
        where: { id },
        data: { status: 'PAID', transactionId: transactionId?.trim() || null, refundDate: new Date() },
      }),
      prisma.booking.update({ where: { id: refund.bookingId }, data: { amountPaid: newAmountPaid, balanceAmount: newBalance } }),
    ]);

    await prisma.activityLog.create({
      data: {
        action: 'Refund Paid', details: `₹${refund.amount.toLocaleString()} refund paid to ${refund.booking.lead.name}`,
        entityType: 'REFUND', entityId: id, userId: req.user!.id, leadId: refund.booking.leadId,
        oldValue: { status: refund.status, bookingAmountPaid: refund.booking.amountPaid },
        newValue: { status: 'PAID', transactionId: transactionId?.trim() || null, bookingAmountPaid: newAmountPaid },
      },
    });

    // Every paid refund automatically gets a numbered refund voucher.
    await generateFinanceDocument({
      type: 'REFUND_VOUCHER', bookingId: refund.bookingId, refundId: id, reason: refund.reason, generatedById: req.user!.id,
    }).catch((err) => console.error('[refund] voucher generation error:', err));

    emitFinanceUpdated();
    res.json({ success: true, data: updated });
  } catch (e) {
    console.error('[finance] markRefundPaid error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

export const rejectRefund = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { remarks } = req.body;
    const refund = await prisma.refund.findFirst({ where: { id, ...orgFilter(req) } });
    if (!refund) { res.status(404).json({ success: false, error: 'Refund not found' }); return; }
    if (refund.status === 'PAID') { res.status(400).json({ success: false, error: 'Cannot reject a paid refund' }); return; }

    const updated = await prisma.refund.update({
      where: { id },
      data: { status: 'REJECTED', remarks: remarks?.trim() || refund.remarks, approvedById: req.user!.id },
    });
    await prisma.activityLog.create({
      data: {
        action: 'Refund Rejected', details: `Refund rejected by ${req.user?.name}`,
        entityType: 'REFUND', entityId: id, userId: req.user!.id,
        oldValue: { status: refund.status }, newValue: { status: 'REJECTED', remarks: remarks?.trim() || refund.remarks },
      },
    });
    emitFinanceUpdated();
    res.json({ success: true, data: updated });
  } catch (e) {
    console.error('[finance] rejectRefund error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};
