import { Response } from 'express';
import prisma from '../lib/prisma.js';
import { AuthenticatedRequest } from '../types/index.js';
import { notifyFinanceTeam, emitFinanceUpdated, createNotification } from '../services/notification.service.js';
import { allocatePaymentToSchedule } from './paymentSchedule.controller.js';
import { generateFinanceDocument } from './financeDocument.controller.js';
import { buildUploadUrl } from '../middleware/upload.js';
import { isWholeAmount, WHOLE_AMOUNT_ERROR } from '../utils/amountValidation.js';

const orgId = (req: AuthenticatedRequest) => req.user?.organizationId ?? null;

const PAYMENT_METHODS = ['CASH', 'UPI', 'BANK_TRANSFER', 'CHEQUE', 'ONLINE'];

// A pending PAYMENT_CORRECTION approval "owns" this payment's status until
// it's resolved — every other action that would also touch status/financeNote
// (verify, reject, resubmit, or a plain request-correction note) must wait,
// otherwise the correction could be silently applied on top of (or under)
// whatever that other action just did, double-crediting or losing the fix.
const hasPendingCorrection = (paymentId: string) =>
  prisma.approvalRequest.findFirst({
    where: { entityType: 'PAYMENT', entityId: paymentId, type: 'PAYMENT_CORRECTION', status: 'PENDING' },
  });

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
        handoverTo: { select: { id: true, name: true } },
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

    const { amount, type, method, reference, notes, receiptNo, scheduleItemId, handoverToId } = req.body;

    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      res.status(400).json({ success: false, error: 'Valid amount is required' }); return;
    }
    if (!isWholeAmount(amount)) { res.status(400).json({ success: false, error: WHOLE_AMOUNT_ERROR }); return; }
    // Write-offs close out a balance the company has decided not to pursue —
    // restricted to Admin since, unlike every other payment type, it isn't
    // backed by real money changing hands and shouldn't be something any
    // Sales/Finance user can apply unilaterally.
    if (type === 'WRITE_OFF' && req.user?.role !== 'ADMIN') {
      res.status(403).json({ success: false, error: 'Only an Admin can record a write-off' }); return;
    }

    const paymentMethod = method || 'CASH';
    // Cash needs a named, real employee to hold it — no free text, no
    // anonymous cash. Every other method skips this entirely.
    if (paymentMethod === 'CASH') {
      if (!handoverToId) {
        res.status(400).json({ success: false, error: 'Handover To is required for cash payments' }); return;
      }
      const handoverTarget = await prisma.user.findUnique({ where: { id: handoverToId } });
      if (!handoverTarget || handoverTarget.organizationId !== orgId(req) || !handoverTarget.isActive) {
        res.status(400).json({ success: false, error: 'Handover To must be an active employee' }); return;
      }
    }

    const paymentAmount = Number(amount);
    const proofUrl = req.file ? buildUploadUrl(req.file) : null;

    const payment = await prisma.payment.create({
      data: {
        bookingId,
        amount: paymentAmount,
        type: type || 'ADVANCE',
        method: paymentMethod,
        reference: reference?.trim() || null,
        notes: notes?.trim() || null,
        receiptNo: receiptNo?.trim() || null,
        proofUrl,
        status: 'PENDING',
        recordedById: req.user!.id,
        scheduleItemId: scheduleItemId || null,
        handoverToId: paymentMethod === 'CASH' ? handoverToId : null,
      },
      include: { recordedBy: { select: { id: true, name: true } }, handoverTo: { select: { id: true, name: true } } },
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
      where: { id, bookingId, ...(orgId(req) ? { booking: { organizationId: orgId(req) } } : {}) },
      include: { booking: true },
    });
    if (!payment) { res.status(404).json({ success: false, error: 'Payment not found' }); return; }

    if (payment.status === 'VERIFIED') {
      res.status(400).json({ success: false, error: 'Verified payments cannot be deleted — use the Refund workflow instead' });
      return;
    }
    if (await hasPendingCorrection(id)) {
      res.status(409).json({ success: false, error: 'A correction is pending approval on this payment — resolve that first' });
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
    if (await hasPendingCorrection(id)) {
      res.status(409).json({ success: false, error: 'A correction is pending approval on this payment — resolve that first' });
      return;
    }

    const isRefund = payment.type === 'REFUND';
    const newAmountPaid = isRefund
      ? Math.max(0, payment.booking.amountPaid - payment.amount)
      : payment.booking.amountPaid + payment.amount;
    const newBalance = Math.max(0, payment.booking.finalPrice - newAmountPaid);

    // Cash that's just been verified becomes the handover employee's
    // holding as of now — credited here, not at recording time, since a
    // PENDING payment isn't confirmed real money yet.
    const creditsCashHolding = !isRefund && payment.method === 'CASH' && payment.handoverToId;

    const [updatedPayment] = await prisma.$transaction([
      prisma.payment.update({
        where: { id },
        data: { status: 'VERIFIED', verifiedById: req.user!.id, verifiedAt: new Date(), financeNote: null },
      }),
      prisma.booking.update({
        where: { id: payment.bookingId },
        data: { amountPaid: newAmountPaid, balanceAmount: newBalance },
      }),
      ...(creditsCashHolding ? [
        prisma.employeeCashLedger.create({
          data: {
            organizationId: payment.booking.organizationId,
            employeeId: payment.handoverToId!,
            type: 'HANDOVER',
            amount: payment.amount,
            paymentId: payment.id,
          },
        }),
      ] : []),
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
    if (await hasPendingCorrection(id)) {
      res.status(409).json({ success: false, error: 'A correction is pending approval on this payment — resolve that first' });
      return;
    }

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
    if (await hasPendingCorrection(id)) {
      res.status(409).json({ success: false, error: 'A correction is already pending approval on this payment' });
      return;
    }

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

// Finance types the exact corrected amount/method/reference/notes instead of
// just leaving a note — routes to the recording Sales person (or Admin) as a
// one-click Approve, so nobody has to blindly re-enter the whole payment via
// requestCorrection + resubmitPayment above.
export const proposeCorrection = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { amount, method, reference, notes, note, handoverToId } = req.body;

    const payment = await prisma.payment.findUnique({ where: { id }, include: { booking: { include: { lead: true } } } });
    if (!payment) { res.status(404).json({ success: false, error: 'Payment not found' }); return; }
    if (orgId(req) && payment.booking.organizationId !== orgId(req)) { res.status(404).json({ success: false, error: 'Payment not found' }); return; }
    if (payment.status === 'VERIFIED') { res.status(400).json({ success: false, error: 'Cannot propose a correction on an already-verified payment' }); return; }

    if (amount !== undefined) {
      if (isNaN(Number(amount)) || Number(amount) <= 0) { res.status(400).json({ success: false, error: 'Valid amount is required' }); return; }
      if (!isWholeAmount(amount)) { res.status(400).json({ success: false, error: WHOLE_AMOUNT_ERROR }); return; }
    }
    if (method !== undefined && !PAYMENT_METHODS.includes(method)) {
      res.status(400).json({ success: false, error: 'A valid payment mode is required' }); return;
    }
    const resolvedMethod = method ?? payment.method;
    const resolvedHandoverToId = handoverToId !== undefined ? handoverToId : payment.handoverToId;
    if (resolvedMethod === 'CASH') {
      if (!resolvedHandoverToId) { res.status(400).json({ success: false, error: 'Handover To is required for cash payments' }); return; }
      const handoverTarget = await prisma.user.findUnique({ where: { id: resolvedHandoverToId } });
      if (!handoverTarget || handoverTarget.organizationId !== orgId(req) || !handoverTarget.isActive) {
        res.status(400).json({ success: false, error: 'Handover To must be an active employee' }); return;
      }
    }

    const existingPending = await hasPendingCorrection(id);
    if (existingPending) { res.status(409).json({ success: false, error: 'A correction on this payment is already pending approval' }); return; }

    // Only include fields that actually differ, so the recipient sees a clean
    // old→new diff instead of every field re-stated. `previous` also captures
    // status/financeNote (even though they're not user-editable) so a reject
    // or cancel can restore exactly what was there before, instead of
    // guessing it was always PENDING.
    const changes: Record<string, unknown> = {};
    const previous: Record<string, unknown> = { status: payment.status, financeNote: payment.financeNote };
    if (amount !== undefined && Number(amount) !== payment.amount) { changes.amount = Number(amount); previous.amount = payment.amount; }
    if (method !== undefined && method !== payment.method) { changes.method = method; previous.method = payment.method; }
    if (reference !== undefined && (reference?.trim() || null) !== payment.reference) { changes.reference = reference?.trim() || null; previous.reference = payment.reference; }
    if (notes !== undefined && (notes?.trim() || null) !== payment.notes) { changes.notes = notes?.trim() || null; previous.notes = payment.notes; }
    if (handoverToId !== undefined && handoverToId !== payment.handoverToId) { changes.handoverToId = handoverToId || null; previous.handoverToId = payment.handoverToId; }
    // If the mode is changing to/from CASH, the handover target must move
    // with it even if the caller didn't explicitly touch handoverToId.
    if (changes.method !== undefined && !('handoverToId' in changes)) {
      if (changes.method === 'CASH' && resolvedHandoverToId !== payment.handoverToId) { changes.handoverToId = resolvedHandoverToId; previous.handoverToId = payment.handoverToId; }
      else if (payment.method === 'CASH' && changes.method !== 'CASH') { changes.handoverToId = null; previous.handoverToId = payment.handoverToId; }
    }

    if (Object.keys(changes).length === 0) {
      res.status(400).json({ success: false, error: 'Nothing to correct — the proposed values match the current payment' });
      return;
    }

    const approval = await prisma.approvalRequest.create({
      data: {
        organizationId: orgId(req),
        type: 'PAYMENT_CORRECTION',
        entityType: 'PAYMENT',
        entityId: id,
        payload: JSON.stringify({ changes, previous }),
        note: note?.trim() || null,
        requestedById: req.user!.id,
        approverId: payment.recordedById,
      },
    });

    await prisma.payment.update({
      where: { id },
      data: { status: 'CORRECTION_REQUESTED', financeNote: note?.trim() || 'Finance proposed a correction — awaiting your confirmation.' },
    });

    await createNotification(payment.recordedById, 'PAYMENT_CORRECTION_PENDING', 'Payment Correction Needs Your Confirmation',
      `Finance proposed a correction on the ₹${payment.amount.toLocaleString()} payment for ${payment.booking.lead.name} — review and confirm.`,
      payment.booking.leadId);
    emitFinanceUpdated();

    res.status(202).json({ success: true, data: { pending: true, approvalRequestId: approval.id } });
  } catch (e) {
    console.error('[payment] proposeCorrection error:', e);
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
    if (await hasPendingCorrection(id)) {
      res.status(409).json({ success: false, error: 'Finance has proposed a correction on this payment — confirm or reject that instead of resubmitting' });
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

// ─── Edit a still-pending payment ────────────────────────────────────────────
// Separate from resubmitPayment above (that's specifically for a
// REJECTED/CORRECTION_REQUESTED payment being fixed and re-sent). This is
// for correcting a plain mistake — wrong amount, wrong mode, wrong person
// entered — before Finance has even looked at it. Once VERIFIED (or
// REJECTED/CORRECTION_REQUESTED, which has its own flow), this refuses:
// changing the numbers after money has actually been confirmed/counted
// would silently disagree with whatever Finance already approved.
export const updatePendingPayment = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const payment = await prisma.payment.findUnique({ where: { id }, include: { booking: true } });
    if (!payment) { res.status(404).json({ success: false, error: 'Payment not found' }); return; }
    if (orgId(req) && payment.booking.organizationId !== orgId(req)) { res.status(404).json({ success: false, error: 'Payment not found' }); return; }
    if (payment.status !== 'PENDING') {
      res.status(400).json({ success: false, error: 'Only a payment still awaiting Finance verification can be edited' });
      return;
    }
    if (payment.recordedById !== req.user?.id && req.user?.role !== 'ADMIN') {
      res.status(403).json({ success: false, error: 'Only the original recorder or an admin can edit this payment' });
      return;
    }

    const { amount, method, reference, notes, handoverToId } = req.body;

    if (amount !== undefined) {
      if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
        res.status(400).json({ success: false, error: 'Valid amount is required' }); return;
      }
      if (!isWholeAmount(amount)) { res.status(400).json({ success: false, error: WHOLE_AMOUNT_ERROR }); return; }
    }

    const resolvedMethod = method ?? payment.method;
    if (resolvedMethod === 'CASH') {
      if (!handoverToId) {
        res.status(400).json({ success: false, error: 'Handover To is required for cash payments' }); return;
      }
      const handoverTarget = await prisma.user.findUnique({ where: { id: handoverToId } });
      if (!handoverTarget || handoverTarget.organizationId !== orgId(req) || !handoverTarget.isActive) {
        res.status(400).json({ success: false, error: 'Handover To must be an active employee' }); return;
      }
    }

    const updated = await prisma.payment.update({
      where: { id },
      data: {
        amount: amount !== undefined ? Number(amount) : payment.amount,
        method: resolvedMethod,
        reference: reference !== undefined ? reference?.trim() || null : payment.reference,
        notes: notes !== undefined ? notes?.trim() || null : payment.notes,
        handoverToId: resolvedMethod === 'CASH' ? handoverToId : null,
      },
      include: { handoverTo: { select: { id: true, name: true } } },
    });

    res.json({ success: true, data: updated });
  } catch (e) {
    console.error('[payment] updatePendingPayment error:', e);
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
              package: { select: { name: true } },
            },
          },
          recordedBy: { select: { id: true, name: true } },
          verifiedBy: { select: { id: true, name: true } },
          handoverTo: { select: { id: true, name: true } },
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
