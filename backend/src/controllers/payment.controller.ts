import { Response } from 'express';
import prisma from '../lib/prisma.js';
import { AuthenticatedRequest } from '../types/index.js';
import { notifyFinanceTeam, emitFinanceUpdated, createNotification } from '../services/notification.service.js';
import { allocatePaymentToSchedule } from './paymentSchedule.controller.js';
import { generateFinanceDocument } from './financeDocument.controller.js';
import { buildUploadUrl } from '../middleware/upload.js';

const orgId = (req: AuthenticatedRequest) => req.user?.organizationId ?? null;

// Whoever submitted the payment proof isn't always the lead's actual Sales
// owner — Ops/Finance sometimes enter a payment on the customer's behalf.
// Notify both: the submitter (so they know what happened to what they
// entered) and the lead's assigned Sales rep (so the person actually
// responsible for the customer relationship always hears about it too),
// without sending a duplicate when they're the same person.
const notifyPaymentParties = async (
  recordedById: string | null,
  assignedToId: string | null | undefined,
  type: string, title: string, message: string, leadId: string
) => {
  const recipients = new Set<string>();
  if (recordedById) recipients.add(recordedById);
  if (assignedToId) recipients.add(assignedToId);
  await Promise.all(
    [...recipients].map((userId) => createNotification(userId, type, title, message, leadId))
  );
};

// ─── List payments for a booking ─────────────────────────────────────────────

export const getBookingPayments = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { bookingId } = req.params;
    const booking = await prisma.booking.findFirst({
      where: { id: bookingId, ...(orgId(req) ? { organizationId: orgId(req) } : {}) },
    });
    if (!booking) { res.status(404).json({ success: false, error: 'Booking not found' }); return; }

    const payments = await prisma.payment.findMany({
      where: { bookingId },
      include: {
        recordedBy: { select: { id: true, name: true } },
        verifiedBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ success: true, data: payments });
  } catch (e) {
    console.error('[payment] getBookingPayments error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// ─── Record a payment — always PENDING, never credits the booking directly ──
// Finance must approve it (see approvePayment below) before it counts toward
// booking.amountPaid. This is the mechanism that makes "whenever Sales records
// a payment, it appears in the Finance Panel for verification" true.

export const recordPayment = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { bookingId } = req.params;
    const booking = await prisma.booking.findFirst({
      where: { id: bookingId, ...(orgId(req) ? { organizationId: orgId(req) } : {}) },
      include: { lead: { select: { name: true, phone: true } } },
    });
    if (!booking) { res.status(404).json({ success: false, error: 'Booking not found' }); return; }

    const { amount, type, method, reference, notes, receiptNo, scheduleItemId } = req.body;

    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      res.status(400).json({ success: false, error: 'Valid amount is required' }); return;
    }
    // Write-offs close out a balance the company has decided not to pursue —
    // restricted to Admin since, unlike every other payment type, it isn't
    // backed by real money changing hands and shouldn't be something any
    // Sales/Finance user can apply unilaterally.
    if (type === 'WRITE_OFF' && req.user?.role !== 'ADMIN') {
      res.status(403).json({ success: false, error: 'Only an Admin can record a write-off' }); return;
    }

    const paymentAmount = Number(amount);
    const proofUrl = req.file ? buildUploadUrl(req.file) : null;

    const payment = await prisma.payment.create({
      data: {
        bookingId,
        amount: paymentAmount,
        type: type || 'ADVANCE',
        method: method || 'CASH',
        reference: reference?.trim() || null,
        notes: notes?.trim() || null,
        receiptNo: receiptNo?.trim() || null,
        proofUrl,
        status: 'PENDING',
        recordedById: req.user!.id,
        scheduleItemId: scheduleItemId || null,
      },
      include: { recordedBy: { select: { id: true, name: true } } },
    });

    await prisma.activityLog.create({
      data: {
        action: 'Payment Submitted',
        details: `${type || 'ADVANCE'} payment of ₹${paymentAmount.toLocaleString()} via ${method || 'CASH'}${reference ? ` (${reference})` : ''} submitted for verification`,
        entityType: 'PAYMENT',
        entityId: payment.id,
        userId: req.user!.id,
        leadId: booking.leadId,
      },
    });

    await notifyFinanceTeam(
      orgId(req),
      'NEW_PAYMENT_SUBMITTED',
      'New Payment Awaiting Verification',
      `${booking.lead?.name ?? booking.travelerName} — ₹${paymentAmount.toLocaleString()} ${type || 'ADVANCE'} payment needs verification.`
    );
    emitFinanceUpdated();

    res.status(201).json({ success: true, data: payment });
  } catch (e) {
    console.error('[payment] recordPayment error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// ─── Delete a payment — only if it never affected the booking's balance ─────

export const deletePayment = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { bookingId, id } = req.params;
    const payment = await prisma.payment.findFirst({
      where: { id, bookingId },
      include: { booking: true },
    });
    if (!payment) { res.status(404).json({ success: false, error: 'Payment not found' }); return; }

    if (payment.status === 'VERIFIED') {
      res.status(400).json({ success: false, error: 'Verified payments cannot be deleted — use the Refund workflow instead' });
      return;
    }

    await prisma.payment.delete({ where: { id } });
    emitFinanceUpdated();

    res.json({ success: true, message: 'Payment deleted' });
  } catch (e) {
    console.error('[payment] deletePayment error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// ─── Finance verification actions ────────────────────────────────────────────

export const approvePayment = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const payment = await prisma.payment.findUnique({ where: { id }, include: { booking: { include: { lead: true } } } });
    if (!payment) { res.status(404).json({ success: false, error: 'Payment not found' }); return; }
    if (orgId(req) && payment.booking.organizationId !== orgId(req)) { res.status(404).json({ success: false, error: 'Payment not found' }); return; }
    if (payment.status === 'VERIFIED') { res.status(400).json({ success: false, error: 'Payment already verified' }); return; }

    const isRefund = payment.type === 'REFUND';
    const newAmountPaid = isRefund
      ? Math.max(0, payment.booking.amountPaid - payment.amount)
      : payment.booking.amountPaid + payment.amount;
    const newBalance = Math.max(0, payment.booking.finalPrice - newAmountPaid);

    const [updatedPayment] = await prisma.$transaction([
      prisma.payment.update({
        where: { id },
        data: { status: 'VERIFIED', verifiedById: req.user!.id, verifiedAt: new Date(), financeNote: null },
      }),
      prisma.booking.update({
        where: { id: payment.bookingId },
        data: { amountPaid: newAmountPaid, balanceAmount: newBalance },
      }),
    ]);

    await prisma.activityLog.create({
      data: {
        action: 'Payment Approved',
        details: `₹${payment.amount.toLocaleString()} payment approved by ${req.user?.name}`,
        entityType: 'PAYMENT',
        entityId: id,
        userId: req.user!.id,
        leadId: payment.booking.leadId,
        oldValue: { status: payment.status },
        newValue: { status: 'VERIFIED', bookingAmountPaid: newAmountPaid, bookingBalanceAmount: newBalance },
      },
    });

    if (!isRefund) {
      await allocatePaymentToSchedule(payment.bookingId, payment.amount, payment.scheduleItemId).catch((err) =>
        console.error('[payment] schedule allocation error:', err)
      );
      // Every successful payment automatically gets a numbered receipt.
      await generateFinanceDocument({
        type: 'RECEIPT', bookingId: payment.bookingId, paymentId: payment.id, generatedById: req.user!.id,
      }).catch((err) => console.error('[payment] receipt generation error:', err));
    }

    await notifyPaymentParties(payment.recordedById, payment.booking.lead.assignedToId, 'PAYMENT_APPROVED', 'Payment Approved',
      `The ₹${payment.amount.toLocaleString()} payment for ${payment.booking.lead.name} has been verified.`, payment.booking.leadId);
    emitFinanceUpdated();

    res.json({ success: true, data: updatedPayment });
  } catch (e) {
    console.error('[payment] approvePayment error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

export const rejectPayment = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    if (!reason?.trim()) { res.status(400).json({ success: false, error: 'Rejection reason is required' }); return; }

    const payment = await prisma.payment.findUnique({ where: { id }, include: { booking: { include: { lead: true } } } });
    if (!payment) { res.status(404).json({ success: false, error: 'Payment not found' }); return; }
    if (orgId(req) && payment.booking.organizationId !== orgId(req)) { res.status(404).json({ success: false, error: 'Payment not found' }); return; }
    if (payment.status === 'VERIFIED') { res.status(400).json({ success: false, error: 'Cannot reject an already-verified payment' }); return; }

    const updated = await prisma.payment.update({
      where: { id },
      data: { status: 'REJECTED', financeNote: reason.trim(), verifiedById: req.user!.id, verifiedAt: new Date() },
    });

    await prisma.activityLog.create({
      data: {
        action: 'Payment Rejected',
        details: `₹${payment.amount.toLocaleString()} payment rejected by ${req.user?.name}: ${reason.trim()}`,
        entityType: 'PAYMENT',
        entityId: id,
        userId: req.user!.id,
        leadId: payment.booking.leadId,
        oldValue: { status: payment.status },
        newValue: { status: 'REJECTED', financeNote: reason.trim() },
      },
    });

    await notifyPaymentParties(payment.recordedById, payment.booking.lead.assignedToId, 'PAYMENT_REJECTED', 'Payment Rejected',
      `The ₹${payment.amount.toLocaleString()} payment for ${payment.booking.lead.name} was rejected: ${reason.trim()}`, payment.booking.leadId);
    emitFinanceUpdated();

    res.json({ success: true, data: updated });
  } catch (e) {
    console.error('[payment] rejectPayment error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

export const requestCorrection = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { note } = req.body;
    if (!note?.trim()) { res.status(400).json({ success: false, error: 'A note explaining the correction needed is required' }); return; }

    const payment = await prisma.payment.findUnique({ where: { id }, include: { booking: { include: { lead: true } } } });
    if (!payment) { res.status(404).json({ success: false, error: 'Payment not found' }); return; }
    if (orgId(req) && payment.booking.organizationId !== orgId(req)) { res.status(404).json({ success: false, error: 'Payment not found' }); return; }
    if (payment.status === 'VERIFIED') { res.status(400).json({ success: false, error: 'Cannot request correction on an already-verified payment' }); return; }

    const updated = await prisma.payment.update({
      where: { id },
      data: { status: 'CORRECTION_REQUESTED', financeNote: note.trim() },
    });

    await notifyPaymentParties(payment.recordedById, payment.booking.lead.assignedToId, 'PAYMENT_CORRECTION_REQUESTED', 'Payment Correction Requested',
      `Finance requested a correction on the ₹${payment.amount.toLocaleString()} payment for ${payment.booking.lead.name}: ${note.trim()}`, payment.booking.leadId);
    emitFinanceUpdated();

    res.json({ success: true, data: updated });
  } catch (e) {
    console.error('[payment] requestCorrection error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// Sales edits a REJECTED/CORRECTION_REQUESTED payment and resubmits it as PENDING.
export const resubmitPayment = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const payment = await prisma.payment.findUnique({ where: { id }, include: { booking: true } });
    if (!payment) { res.status(404).json({ success: false, error: 'Payment not found' }); return; }
    if (orgId(req) && payment.booking.organizationId !== orgId(req)) { res.status(404).json({ success: false, error: 'Payment not found' }); return; }
    if (payment.status !== 'REJECTED' && payment.status !== 'CORRECTION_REQUESTED') {
      res.status(400).json({ success: false, error: 'Only rejected or correction-requested payments can be resubmitted' });
      return;
    }
    if (payment.recordedById !== req.user?.id && req.user?.role !== 'ADMIN') {
      res.status(403).json({ success: false, error: 'Only the original recorder or an admin can resubmit this payment' });
      return;
    }

    const { amount, method, reference, notes, receiptNo } = req.body;
    const proofUrl = req.file ? buildUploadUrl(req.file) : payment.proofUrl;

    const updated = await prisma.payment.update({
      where: { id },
      data: {
        amount: amount !== undefined ? Number(amount) : payment.amount,
        method: method ?? payment.method,
        reference: reference !== undefined ? reference?.trim() || null : payment.reference,
        notes: notes !== undefined ? notes?.trim() || null : payment.notes,
        receiptNo: receiptNo !== undefined ? receiptNo?.trim() || null : payment.receiptNo,
        proofUrl,
        status: 'PENDING',
        financeNote: null,
      },
    });

    await notifyFinanceTeam(orgId(req), 'NEW_PAYMENT_SUBMITTED', 'Payment Resubmitted', `A corrected payment of ₹${updated.amount.toLocaleString()} was resubmitted for verification.`);
    emitFinanceUpdated();

    res.json({ success: true, data: updated });
  } catch (e) {
    console.error('[payment] resubmitPayment error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// ─── Payment verification queue (Finance Panel) ──────────────────────────────

export const listPaymentsForVerification = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { status, search, method, salesEmployeeId, page = '1', limit = '20' } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const bookingFilter: Record<string, unknown> = { ...(orgId(req) ? { organizationId: orgId(req) } : {}) };
    if (salesEmployeeId) bookingFilter.lead = { assignedToId: salesEmployeeId };
    if (search) {
      bookingFilter.OR = [
        { travelerName: { contains: String(search), mode: 'insensitive' } },
        { bookingNumber: { contains: String(search), mode: 'insensitive' } },
        { lead: { name: { contains: String(search), mode: 'insensitive' } } },
        { lead: { phone: { contains: String(search), mode: 'insensitive' } } },
      ];
    }

    const where: Record<string, unknown> = { status: status || 'PENDING', booking: bookingFilter };
    if (method) where.method = method;

    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        include: {
          booking: {
            include: {
              lead: { select: { id: true, name: true, phone: true, assignedTo: { select: { id: true, name: true } } } },
              departure: { select: { destination: true, departureDate: true } },
            },
          },
          recordedBy: { select: { id: true, name: true } },
          verifiedBy: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'asc' },
        skip,
        take: Number(limit),
      }),
      prisma.payment.count({ where }),
    ]);

    res.json({ success: true, data: payments, meta: { total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / Number(limit)) } });
  } catch (e) {
    console.error('[payment] listPaymentsForVerification error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// ─── Get all payments summary for dashboard ───────────────────────────────────

export const getPaymentsSummary = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const oid = orgId(req);

    const bookings = await prisma.booking.findMany({
      where: { organizationId: oid, status: 'ACTIVE' },
      select: {
        id: true, finalPrice: true, amountPaid: true, balanceAmount: true,
        balanceDueDate: true, travelerName: true, departureDate: true,
        lead: { select: { name: true, phone: true, destination: true } },
      },
      orderBy: { balanceDueDate: 'asc' },
    });

    const pendingPayments = bookings.filter((b) => b.balanceAmount > 0);
    const overduePayments = pendingPayments.filter(
      (b) => b.balanceDueDate && new Date(b.balanceDueDate) < new Date()
    );

    const summary = {
      totalRevenue: bookings.reduce((s, b) => s + b.finalPrice, 0),
      totalCollected: bookings.reduce((s, b) => s + b.amountPaid, 0),
      totalBalance: bookings.reduce((s, b) => s + b.balanceAmount, 0),
      pendingCount: pendingPayments.length,
      overdueCount: overduePayments.length,
      overdueAmount: overduePayments.reduce((s, b) => s + b.balanceAmount, 0),
    };

    res.json({ success: true, data: { summary, pendingPayments: pendingPayments.slice(0, 20), overduePayments: overduePayments.slice(0, 10) } });
  } catch (e) {
    console.error('[payment] getPaymentsSummary error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};
