import { Response } from 'express';
import prisma from '../lib/prisma.js';
import { AuthenticatedRequest } from '../types/index.js';
import { emitFinanceUpdated, emitOperationsUpdated, notifyOperationsTeam } from '../services/notification.service.js';
import { buildUploadUrl } from '../middleware/upload.js';
import { isWholeAmount, WHOLE_AMOUNT_ERROR } from '../utils/amountValidation.js';
import { roomsRequiredForDeparture } from '../services/roomRequirement.service.js';

const orgId = (req: AuthenticatedRequest) => req.user?.organizationId ?? null;
const orgFilter = (req: AuthenticatedRequest) => (orgId(req) ? { organizationId: orgId(req) } : {});

// Entry methods that count as real money moving toward the bill (paid by us,
// or by the customer directly on our behalf). CREDIT is an acknowledgment
// only — logged for the history but doesn't reduce what's owed. VENDOR_REFUND
// is money coming back FROM the vendor (they'd been overpaid), so it
// subtracts instead of adding.
export const ENTRY_METHODS = ['CASH', 'UPI', 'BANK_TRANSFER', 'CHEQUE', 'CUSTOMER_DIRECT', 'CREDIT', 'VENDOR_REFUND'];

export function computeStatus(totalAmount: number, advancePaid: number, dueDate: Date | null): string {
  const balance = totalAmount - advancePaid;
  if (balance < 0) return 'RECEIVABLE'; // vendor has been paid more than they were owed — they owe us
  if (balance === 0) return 'PAID';
  if (dueDate && dueDate < new Date()) return 'OVERDUE';
  if (advancePaid > 0) return 'PARTIAL';
  return 'PENDING';
}

// Re-derives advancePaid/balanceAmount/status from the entry log, then runs
// the advance-required auto-confirm (and auto-revert) check — shared by the
// entry-based path, the direct-edit path, and Operations' Hotel/Vehicle/B2B
// auto-sync, so all three keep this behavior identical instead of each
// reimplementing (and subtly disagreeing on) the math.
//
// The sum itself runs as a single atomic UPDATE...FROM, not a JS read-sum-
// write — two concurrent entries (or an entry racing a sync call) would
// otherwise let the second write silently clobber the first's effect, since
// both would start from the same pre-change snapshot.
export async function recalcVendorPayment(vendorPaymentId: string) {
  const exists = await prisma.vendorPayment.findUnique({ where: { id: vendorPaymentId }, select: { id: true } });
  if (!exists) return null;

  await prisma.$executeRaw`
    UPDATE vendor_payments vp
    SET "advancePaid" = sub.total,
        "balanceAmount" = vp."totalAmount" - sub.total,
        status = CASE
          WHEN vp."totalAmount" - sub.total < 0 THEN 'RECEIVABLE'
          WHEN vp."totalAmount" - sub.total = 0 THEN 'PAID'
          WHEN vp."dueDate" IS NOT NULL AND vp."dueDate" < NOW() THEN 'OVERDUE'
          WHEN sub.total > 0 THEN 'PARTIAL'
          ELSE 'PENDING'
        END
    FROM (
      SELECT COALESCE(SUM(
        CASE
          WHEN method = 'VENDOR_REFUND' THEN -amount
          WHEN method IN ('CASH', 'UPI', 'BANK_TRANSFER', 'CHEQUE', 'CUSTOMER_DIRECT') THEN amount
          ELSE 0
        END
      ), 0) AS total
      FROM vendor_payment_entries
      WHERE "vendorPaymentId" = ${vendorPaymentId}
    ) sub
    WHERE vp.id = ${vendorPaymentId}
  `;

  const updated = await prisma.vendorPayment.findUnique({
    where: { id: vendorPaymentId },
    include: {
      entries: { orderBy: { createdAt: 'desc' }, include: { createdBy: { select: { id: true, name: true } } } },
      vendor: { select: { id: true, name: true, type: true } },
      departure: { select: { id: true, destination: true, departureDate: true } },
      hotel: true,
      vehicle: true,
    },
  });
  if (!updated) return null;

  // Advance-required auto-confirm/auto-revert: this bill was auto-synced
  // from a Hotel/Vehicle that set advanceRequired. `updateMany` with a
  // status filter makes the flip itself atomic too — if two recalcs race,
  // only the one that actually finds PENDING (or CONFIRMED, for a revert)
  // applies it and sends the notification, not both.
  const meetsThreshold = updated.advanceRequired != null && updated.advancePaid >= updated.advanceRequired;
  const belowThreshold = updated.advanceRequired != null && updated.advancePaid < updated.advanceRequired;

  if (updated.hotel) {
    if (meetsThreshold && updated.hotel.status === 'PENDING') {
      // Never auto-confirm past the same confirmed-room cap updateHotel
      // enforces by hand — a paid advance doesn't excuse overbooking rooms.
      let roomCapOk = true;
      if (updated.hotel.numberOfRooms) {
        const [required, confirmedElsewhere] = await Promise.all([
          roomsRequiredForDeparture(updated.hotel.departureId),
          prisma.hotel.aggregate({
            where: { departureId: updated.hotel.departureId, status: 'CONFIRMED', id: { not: updated.hotel.id } },
            _sum: { numberOfRooms: true },
          }),
        ]);
        roomCapOk = (confirmedElsewhere._sum.numberOfRooms ?? 0) + updated.hotel.numberOfRooms <= required;
      }
      if (roomCapOk) {
        const claimed = await prisma.hotel.updateMany({ where: { id: updated.hotel.id, status: 'PENDING' }, data: { status: 'CONFIRMED' } });
        if (claimed.count > 0) {
          await notifyOperationsTeam(updated.organizationId, 'HOTEL_CONFIRMED', 'Hotel Confirmed', `Hotel "${updated.hotel.name}" auto-confirmed — advance paid`, updated.hotel.departureId);
          emitOperationsUpdated(updated.hotel.departureId);
        }
      }
    } else if (belowThreshold && updated.hotel.status === 'CONFIRMED') {
      // A refund or a removed entry can drop the advance back under the
      // threshold — follow it back to PENDING rather than leaving a hotel
      // marked CONFIRMED on an advance that's no longer actually there.
      const reverted = await prisma.hotel.updateMany({ where: { id: updated.hotel.id, status: 'CONFIRMED' }, data: { status: 'PENDING' } });
      if (reverted.count > 0) emitOperationsUpdated(updated.hotel.departureId);
    }
  }

  if (updated.vehicle) {
    if (meetsThreshold && updated.vehicle.status === 'PENDING') {
      const claimed = await prisma.vehicle.updateMany({ where: { id: updated.vehicle.id, status: 'PENDING' }, data: { status: 'CONFIRMED' } });
      if (claimed.count > 0) emitOperationsUpdated(updated.vehicle.departureId);
    } else if (belowThreshold && updated.vehicle.status === 'CONFIRMED') {
      const reverted = await prisma.vehicle.updateMany({ where: { id: updated.vehicle.id, status: 'CONFIRMED' }, data: { status: 'PENDING' } });
      if (reverted.count > 0) emitOperationsUpdated(updated.vehicle.departureId);
    }
  }

  return updated;
}

export const listVendorPayments = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { status, vendorId, serviceType } = req.query;
    const where: Record<string, unknown> = { ...orgFilter(req) };
    if (status) where.status = status;
    if (vendorId) where.vendorId = vendorId;
    if (serviceType) where.serviceType = serviceType;

    const payments = await prisma.vendorPayment.findMany({
      where,
      include: {
        vendor: { select: { id: true, name: true, type: true } },
        departure: { select: { id: true, destination: true, departureDate: true } },
        entries: { orderBy: { createdAt: 'desc' }, include: { createdBy: { select: { id: true, name: true } } } },
      },
      orderBy: { dueDate: 'asc' },
    });
    res.json({ success: true, data: payments });
  } catch (e) {
    console.error('[finance] listVendorPayments error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

export const createVendorPayment = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { vendorId, departureId, serviceType, totalAmount, advancePaid, advanceMethod, dueDate, notes, invoiceUrl, paymentProofUrl } = req.body;
    const vendor = await prisma.vendor.findFirst({ where: { id: vendorId, ...orgFilter(req) } });
    if (!vendor) { res.status(404).json({ success: false, error: 'Vendor not found' }); return; }
    if (departureId) {
      const departure = await prisma.departure.findFirst({ where: { id: departureId, ...orgFilter(req) } });
      if (!departure) { res.status(404).json({ success: false, error: 'Departure not found' }); return; }
    }
    if (!totalAmount || isNaN(Number(totalAmount)) || Number(totalAmount) <= 0) { res.status(400).json({ success: false, error: 'Valid total amount is required' }); return; }
    if (!isWholeAmount(totalAmount) || !isWholeAmount(advancePaid)) { res.status(400).json({ success: false, error: WHOLE_AMOUNT_ERROR }); return; }

    const total = Number(totalAmount);
    const initialAdvance = Number(advancePaid ?? 0);
    const due = dueDate ? new Date(dueDate) : null;

    const payment = await prisma.vendorPayment.create({
      data: {
        organizationId: orgId(req),
        vendorId, departureId: departureId || null,
        serviceType: serviceType || 'OTHER',
        totalAmount: total, advancePaid: 0, balanceAmount: total,
        dueDate: due, status: computeStatus(total, 0, due),
        invoiceUrl: invoiceUrl || null, paymentProofUrl: paymentProofUrl || null,
        notes: notes?.trim() || null,
        createdById: req.user!.id,
      },
    });

    // Any initial advance entered at creation time becomes the bill's first
    // itemized entry, same as every payment recorded afterward — so the
    // history is complete from the start, not "the first ₹X came from
    // nowhere."
    let final = payment;
    if (initialAdvance > 0) {
      await prisma.vendorPaymentEntry.create({
        data: { vendorPaymentId: payment.id, amount: initialAdvance, method: ENTRY_METHODS.includes(advanceMethod) ? advanceMethod : 'CASH', createdById: req.user!.id },
      });
      final = (await recalcVendorPayment(payment.id)) ?? payment;
    }

    await prisma.activityLog.create({
      data: { action: 'Vendor Payment Created', details: `₹${total.toLocaleString()} bill created for ${vendor.name}`, entityType: 'VENDOR_PAYMENT', entityId: payment.id, userId: req.user!.id },
    });
    emitFinanceUpdated();

    res.status(201).json({ success: true, data: final });
  } catch (e) {
    console.error('[finance] createVendorPayment error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// totalAmount/dueDate/notes/serviceType/files only — advancePaid is no
// longer directly editable here (see addVendorPaymentEntry below); a bill's
// paid amount only ever moves via an itemized entry now, so there's always a
// record of when and how.
export const updateVendorPayment = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const existing = await prisma.vendorPayment.findFirst({
      where: { id, ...orgFilter(req) },
      include: { vendor: true },
    });
    if (!existing) { res.status(404).json({ success: false, error: 'Vendor payment not found' }); return; }

    const b = req.body;
    if (!isWholeAmount(b.totalAmount)) { res.status(400).json({ success: false, error: WHOLE_AMOUNT_ERROR }); return; }
    if (b.totalAmount !== undefined && Number(b.totalAmount) <= 0) { res.status(400).json({ success: false, error: 'Valid total amount is required' }); return; }
    const total = b.totalAmount !== undefined ? Number(b.totalAmount) : existing.totalAmount;
    const due = b.dueDate !== undefined ? (b.dueDate ? new Date(b.dueDate) : null) : existing.dueDate;

    await prisma.vendorPayment.update({
      where: { id },
      data: {
        serviceType: b.serviceType ?? existing.serviceType,
        totalAmount: total,
        dueDate: due,
        invoiceUrl: b.invoiceUrl !== undefined ? b.invoiceUrl : existing.invoiceUrl,
        paymentProofUrl: b.paymentProofUrl !== undefined ? b.paymentProofUrl : existing.paymentProofUrl,
        notes: b.notes !== undefined ? b.notes?.trim() || null : existing.notes,
      },
    });

    // totalAmount/dueDate can change what's owed and whether it's overdue —
    // recompute off the existing entries rather than trusting a client-sent
    // status/balance.
    const updated = await recalcVendorPayment(id);

    await prisma.activityLog.create({
      data: { action: 'Vendor Payment Updated', details: `Bill for ${existing.vendor.name} updated by ${req.user?.name}`, entityType: 'VENDOR_PAYMENT', entityId: id, userId: req.user!.id },
    });
    emitFinanceUpdated();

    res.json({ success: true, data: updated });
  } catch (e) {
    console.error('[finance] updateVendorPayment error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// ─── Itemized payment entries ─────────────────────────────────────────────

export const addVendorPaymentEntry = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { amount, method, note } = req.body;
    const existing = await prisma.vendorPayment.findFirst({ where: { id, ...orgFilter(req) }, include: { vendor: true } });
    if (!existing) { res.status(404).json({ success: false, error: 'Vendor payment not found' }); return; }

    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) { res.status(400).json({ success: false, error: 'Valid amount is required' }); return; }
    if (!isWholeAmount(amount)) { res.status(400).json({ success: false, error: WHOLE_AMOUNT_ERROR }); return; }
    if (!ENTRY_METHODS.includes(method)) { res.status(400).json({ success: false, error: 'A valid method is required' }); return; }

    await prisma.vendorPaymentEntry.create({
      data: { vendorPaymentId: id, amount: Number(amount), method, note: note?.trim() || null, createdById: req.user!.id },
    });
    const updated = await recalcVendorPayment(id);

    await prisma.activityLog.create({
      data: { action: 'Vendor Payment Entry Added', details: `₹${Number(amount).toLocaleString()} (${method}) recorded against ${existing.vendor.name}'s bill by ${req.user?.name}`, entityType: 'VENDOR_PAYMENT', entityId: id, userId: req.user!.id },
    });
    emitFinanceUpdated();

    res.status(201).json({ success: true, data: updated });
  } catch (e) {
    console.error('[finance] addVendorPaymentEntry error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

export const deleteVendorPaymentEntry = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id, entryId } = req.params;
    const existing = await prisma.vendorPayment.findFirst({ where: { id, ...orgFilter(req) } });
    if (!existing) { res.status(404).json({ success: false, error: 'Vendor payment not found' }); return; }

    const entry = await prisma.vendorPaymentEntry.findFirst({ where: { id: entryId, vendorPaymentId: id } });
    if (!entry) { res.status(404).json({ success: false, error: 'Entry not found' }); return; }

    await prisma.vendorPaymentEntry.delete({ where: { id: entryId } });
    const updated = await recalcVendorPayment(id);

    await prisma.activityLog.create({
      data: {
        action: 'Vendor Payment Entry Removed',
        details: `₹${entry.amount.toLocaleString()} (${entry.method}) entry removed by ${req.user?.name}`,
        entityType: 'VENDOR_PAYMENT', entityId: id, userId: req.user!.id,
      },
    });
    emitFinanceUpdated();

    res.json({ success: true, data: updated });
  } catch (e) {
    console.error('[finance] deleteVendorPaymentEntry error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

export const deleteVendorPayment = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const existing = await prisma.vendorPayment.findFirst({ where: { id, ...orgFilter(req) } });
    if (!existing) { res.status(404).json({ success: false, error: 'Vendor payment not found' }); return; }

    await prisma.vendorPayment.delete({ where: { id } });
    emitFinanceUpdated();
    res.json({ success: true, data: { id } });
  } catch (e) {
    console.error('[finance] deleteVendorPayment error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// ─── Vendor Ledger — full financial picture for one vendor, across every bill
// they've ever had ─────────────────────────────────────────────────────────
// Mirrors getCustomerLedger's exact pattern (ledger.controller.ts): one
// deep-include query, then a JS reduce for running totals — computed live,
// never persisted. Exists as its own Finance-scoped endpoint because
// Operations already has a vendor detail view (VendorDetailPage.tsx) but
// it's guarded by requireOperationsOrAdmin and unreachable by the FINANCE
// role.
export const getVendorLedger = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const vendor = await prisma.vendor.findFirst({
      where: { id, ...orgFilter(req) },
      include: {
        // Defense in depth: a vendor's bills should already all share its
        // org (nothing should be able to create a cross-org one), but filter
        // explicitly rather than trust that invariant silently holds forever.
        payments: {
          where: orgFilter(req),
          include: {
            departure: { select: { id: true, destination: true, departureDate: true } },
            createdBy: { select: { id: true, name: true } },
            entries: { orderBy: { createdAt: 'desc' }, include: { createdBy: { select: { id: true, name: true } } } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!vendor) { res.status(404).json({ success: false, error: 'Vendor not found' }); return; }

    const totalBilled = vendor.payments.reduce((s, p) => s + p.totalAmount, 0);
    const totalPaid = vendor.payments.reduce((s, p) => s + p.advancePaid, 0);
    const totalOutstanding = vendor.payments.reduce((s, p) => s + p.balanceAmount, 0);
    const overdueCount = vendor.payments.filter((p) => p.status === 'OVERDUE').length;

    res.json({
      success: true,
      data: {
        ...vendor,
        ledger: { totalBilled, totalPaid, totalOutstanding, billCount: vendor.payments.length, overdueCount },
      },
    });
  } catch (e) {
    console.error('[finance] getVendorLedger error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// ─── Vendor Credits — cross-vendor net balances in one place ────────────────
// "Who do I owe, who owes me" without opening every vendor's ledger one by
// one. Net balance = sum of every VendorPayment.balanceAmount for that
// vendor: positive means we owe them, negative means they owe us (e.g. a
// B2B agent who was overpaid when a customer settled their pending balance
// directly with the agent instead of with us).
export const getVendorCredits = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const vendors = await prisma.vendor.findMany({
      where: orgFilter(req),
      include: {
        payments: {
          where: { balanceAmount: { not: 0 }, ...orgFilter(req) },
          select: { id: true, balanceAmount: true, totalAmount: true, serviceType: true, departure: { select: { id: true, destination: true, departureDate: true } } },
        },
      },
    });

    const credits = vendors
      .filter((v) => v.payments.length > 0)
      .map((v) => ({
        vendorId: v.id,
        vendorName: v.name,
        vendorType: v.type,
        netBalance: v.payments.reduce((s, p) => s + p.balanceAmount, 0),
        billCount: v.payments.length,
      }))
      .filter((c) => c.netBalance !== 0)
      .sort((a, b) => Math.abs(b.netBalance) - Math.abs(a.netBalance));

    const totalPayable = credits.filter((c) => c.netBalance > 0).reduce((s, c) => s + c.netBalance, 0);
    const totalReceivable = credits.filter((c) => c.netBalance < 0).reduce((s, c) => s + Math.abs(c.netBalance), 0);

    res.json({ success: true, data: { credits, totalPayable, totalReceivable } });
  } catch (e) {
    console.error('[finance] getVendorCredits error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

export const uploadVendorPaymentFile = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { fileType } = req.body; // 'invoice' | 'proof'
    const existing = await prisma.vendorPayment.findFirst({ where: { id, ...orgFilter(req) } });
    if (!existing) { res.status(404).json({ success: false, error: 'Vendor payment not found' }); return; }
    if (!req.file) { res.status(400).json({ success: false, error: 'File is required' }); return; }

    const fileUrl = buildUploadUrl(req.file);
    const updated = await prisma.vendorPayment.update({
      where: { id },
      data: fileType === 'proof' ? { paymentProofUrl: fileUrl } : { invoiceUrl: fileUrl },
    });
    emitFinanceUpdated();

    res.json({ success: true, data: updated });
  } catch (e) {
    console.error('[finance] uploadVendorPaymentFile error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};
