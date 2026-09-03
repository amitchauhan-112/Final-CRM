import { Response } from 'express';
import prisma from '../lib/prisma.js';
import { AuthenticatedRequest } from '../types/index.js';
import { emitFinanceUpdated } from '../services/notification.service.js';
import { getRuleNumber } from '../services/businessRule.service.js';
import { isWholeAmount, WHOLE_AMOUNT_ERROR } from '../utils/amountValidation.js';

const orgId = (req: AuthenticatedRequest) => req.user?.organizationId ?? null;

const MS_PER_DAY = 86400000;

// ─── Auto-generate a default installment split at booking confirmation ──────
// Advance now → (0-2 installments spaced between today and the departure) →
// Balance due N days before departure. Purely additive on top of
// Booking.balanceAmount/balanceDueDate — this is an informational/reminder-
// scheduling layer, generated once (idempotent) and editable afterward via
// updateScheduleItem. Both thresholds are BusinessRule-configurable
// (PAYMENT_ADVANCE_PCT, PAYMENT_BALANCE_DAYS_BEFORE_DEPARTURE), falling back
// to 20% / 7 days if no rule has been set.
export async function generatePaymentSchedule(bookingId: string, finalPrice: number, departureDate: Date | null): Promise<void> {
  const existing = await prisma.paymentScheduleItem.count({ where: { bookingId } });
  if (existing > 0) return;
  if (finalPrice <= 0) return;

  const [advancePct, balanceDaysBeforeDeparture] = await Promise.all([
    getRuleNumber('PAYMENT_ADVANCE_PCT', 0.2),
    getRuleNumber('PAYMENT_BALANCE_DAYS_BEFORE_DEPARTURE', 7),
  ]);

  const now = new Date();
  const items: { label: string; sequence: number; amount: number; dueDate: Date }[] = [];

  const advance = Math.round(finalPrice * advancePct);
  items.push({ label: 'Advance', sequence: 0, amount: advance, dueDate: now });

  const remaining = finalPrice - advance;
  if (remaining <= 0) {
    await prisma.paymentScheduleItem.createMany({ data: items.map((i) => ({ bookingId, ...i })) });
    return;
  }

  const balanceDue = departureDate
    ? new Date(departureDate.getTime() - balanceDaysBeforeDeparture * MS_PER_DAY)
    : new Date(now.getTime() + 30 * MS_PER_DAY);
  const effectiveBalanceDue = balanceDue > now ? balanceDue : now;
  const daysUntilBalance = Math.round((effectiveBalanceDue.getTime() - now.getTime()) / MS_PER_DAY);

  if (!departureDate || daysUntilBalance <= 14) {
    // Not enough runway for an installment in between — Advance + Balance only.
    items.push({ label: 'Balance Payment', sequence: 1, amount: remaining, dueDate: effectiveBalanceDue });
  } else if (daysUntilBalance <= 45) {
    // One installment at the midpoint.
    const midDate = new Date(now.getTime() + (effectiveBalanceDue.getTime() - now.getTime()) / 2);
    const installment = Math.round(remaining / 2);
    items.push({ label: 'Installment 1', sequence: 1, amount: installment, dueDate: midDate });
    items.push({ label: 'Balance Payment', sequence: 2, amount: remaining - installment, dueDate: effectiveBalanceDue });
  } else {
    // Two installments, evenly spaced.
    const third = (effectiveBalanceDue.getTime() - now.getTime()) / 3;
    const each = Math.round(remaining / 3);
    items.push({ label: 'Installment 1', sequence: 1, amount: each, dueDate: new Date(now.getTime() + third) });
    items.push({ label: 'Installment 2', sequence: 2, amount: each, dueDate: new Date(now.getTime() + third * 2) });
    items.push({ label: 'Balance Payment', sequence: 3, amount: remaining - each * 2, dueDate: effectiveBalanceDue });
  }

  await prisma.paymentScheduleItem.createMany({ data: items.map((i) => ({ bookingId, ...i })) });
}

// ─── Allocate a verified payment against the schedule ────────────────────────
// Applies in sequence order starting from the tagged item (if any), so a
// lump-sum payment can still settle more than one installment. Called from
// payment.controller.ts:approvePayment — never for REFUND-type payments.
export async function allocatePaymentToSchedule(bookingId: string, amount: number, scheduleItemId?: string | null): Promise<void> {
  const items = await prisma.paymentScheduleItem.findMany({
    where: { bookingId, status: { not: 'PAID' } },
    orderBy: { sequence: 'asc' },
  });
  if (items.length === 0) return;

  let ordered = items;
  if (scheduleItemId) {
    const idx = items.findIndex((i) => i.id === scheduleItemId);
    if (idx > 0) ordered = [...items.slice(idx), ...items.slice(0, idx)];
  }

  let remaining = amount;
  for (const item of ordered) {
    if (remaining <= 0) break;
    const due = item.amount - item.paidAmount;
    if (due <= 0) continue;
    const applied = Math.min(remaining, due);
    const newPaid = item.paidAmount + applied;
    await prisma.paymentScheduleItem.update({
      where: { id: item.id },
      data: { paidAmount: newPaid, status: newPaid >= item.amount ? 'PAID' : 'PARTIAL' },
    });
    remaining -= applied;
  }
}

// ─── GET /finance/bookings/:bookingId/schedule ───────────────────────────────

export const getPaymentSchedule = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { bookingId } = req.params;
    const booking = await prisma.booking.findFirst({ where: { id: bookingId, ...(orgId(req) ? { organizationId: orgId(req) } : {}) } });
    if (!booking) { res.status(404).json({ success: false, error: 'Booking not found' }); return; }

    const items = await prisma.paymentScheduleItem.findMany({ where: { bookingId }, orderBy: { sequence: 'asc' } });
    res.json({ success: true, data: items });
  } catch (e) {
    console.error('[finance] getPaymentSchedule error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// ─── PUT /finance/schedule/:itemId ────────────────────────────────────────────

export const updateScheduleItem = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { itemId } = req.params;
    const existing = await prisma.paymentScheduleItem.findUnique({ where: { id: itemId }, include: { booking: true } });
    if (!existing) { res.status(404).json({ success: false, error: 'Schedule item not found' }); return; }
    if (orgId(req) && existing.booking.organizationId !== orgId(req)) { res.status(404).json({ success: false, error: 'Schedule item not found' }); return; }
    if (existing.status === 'PAID') { res.status(400).json({ success: false, error: 'Cannot edit an already-paid installment' }); return; }

    const { amount, dueDate, label } = req.body;
    if (!isWholeAmount(amount)) { res.status(400).json({ success: false, error: WHOLE_AMOUNT_ERROR }); return; }
    const updated = await prisma.paymentScheduleItem.update({
      where: { id: itemId },
      data: {
        amount: amount !== undefined ? Number(amount) : existing.amount,
        dueDate: dueDate !== undefined ? new Date(dueDate) : existing.dueDate,
        label: label !== undefined ? String(label).trim() || existing.label : existing.label,
        status: existing.paidAmount > 0 ? 'PARTIAL' : 'PENDING',
      },
    });

    emitFinanceUpdated();
    res.json({ success: true, data: updated });
  } catch (e) {
    console.error('[finance] updateScheduleItem error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};
