import { Response } from 'express';
import prisma from '../lib/prisma.js';
import { AuthenticatedRequest } from '../types/index.js';
import { isWholeAmount, WHOLE_AMOUNT_ERROR } from '../utils/amountValidation.js';

// Discount and per-booking extra expense. Only Finance, Operations and Admin
// can record these — Sales can see them but not change them — and only while
// the booking is live and its trip has not been Completed yet.

const EDIT_ROLES = ['ADMIN', 'OPERATIONS', 'FINANCE'];

const orgId = (req: AuthenticatedRequest) => req.user?.organizationId ?? null;

function toMoney(value: unknown, fallback: number): number | null {
  if (value === undefined) return fallback;
  if (value === null || value === '') return 0;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || !isWholeAmount(n)) return null;
  return n;
}

export const updateBookingAdjustments = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!EDIT_ROLES.includes(req.user?.role ?? '')) {
      res.status(403).json({ success: false, error: 'Only Finance, Operations or Admin can change discount or extra expense' });
      return;
    }

    const { id } = req.params;
    const existing = await prisma.booking.findFirst({
      where: { id, organizationId: orgId(req) },
      include: { departure: { select: { status: true } } },
    });
    if (!existing) { res.status(404).json({ success: false, error: 'Booking not found' }); return; }
    if (existing.status === 'CANCELLED') {
      res.status(400).json({ success: false, error: 'Cancelled bookings cannot be adjusted' }); return;
    }
    if (existing.departure?.status === 'COMPLETED') {
      res.status(400).json({ success: false, error: 'This trip is completed — discount and extra expense are locked' }); return;
    }

    const { discountAmount, discountNote, extraExpenseAmount, extraExpenseNote } = req.body as Record<string, unknown>;
    const discount = toMoney(discountAmount, existing.discountAmount);
    const extra = toMoney(extraExpenseAmount, existing.extraExpenseAmount);
    if (discount === null || extra === null) {
      res.status(400).json({ success: false, error: `Amounts must be zero or positive whole rupees. ${WHOLE_AMOUNT_ERROR}` }); return;
    }
    if (discount > existing.finalPrice) {
      res.status(400).json({ success: false, error: 'Discount cannot be more than the booking price' }); return;
    }

    const note = (v: unknown, fallback: string | null) =>
      v === undefined ? fallback : (typeof v === 'string' && v.trim() ? v.trim() : null);

    const updated = await prisma.booking.update({
      where: { id },
      data: {
        discountAmount: discount,
        discountNote: note(discountNote, existing.discountNote),
        extraExpenseAmount: extra,
        extraExpenseNote: note(extraExpenseNote, existing.extraExpenseNote),
      },
    });

    await prisma.activityLog.create({
      data: {
        action: 'Booking Adjusted',
        details: `Discount ₹${discount}, extra expense ₹${extra} (by ${req.user?.name})`,
        entityType: 'BOOKING',
        entityId: id,
        userId: req.user!.id,
        leadId: existing.leadId,
      },
    });

    res.json({ success: true, data: updated });
  } catch (e) {
    console.error('[bookings] updateBookingAdjustments error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};
