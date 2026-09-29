import { Response } from 'express';
import prisma from '../lib/prisma.js';
import { AuthenticatedRequest } from '../types/index.js';
import { emitFinanceUpdated, emitOperationsUpdated, notifyOperationsTeam } from '../services/notification.service.js';
import { buildUploadUrl } from '../middleware/upload.js';
import { isWholeAmount, WHOLE_AMOUNT_ERROR } from '../utils/amountValidation.js';

const orgId = (req: AuthenticatedRequest) => req.user?.organizationId ?? null;
const orgFilter = (req: AuthenticatedRequest) => (orgId(req) ? { organizationId: orgId(req) } : {});

// Entry methods that count as real money moving toward the bill (paid by us,
// or by the customer directly on our behalf). CREDIT is an acknowledgment
// only — logged for the history but doesn't reduce what's owed. VENDOR_REFUND
// is money coming back FROM the vendor (they'd been overpaid), so it
// subtracts instead of adding.
const ENTRY_METHODS = ['CASH', 'UPI', 'BANK_TRANSFER', 'CHEQUE', 'CUSTOMER_DIRECT', 'CREDIT', 'VENDOR_REFUND'];
const PAYING_METHODS = ['CASH', 'UPI', 'BANK_TRANSFER', 'CHEQUE', 'CUSTOMER_DIRECT'];

function computeStatus(totalAmount: number, advancePaid: number, dueDate: Date | null): string {
  const balance = totalAmount - advancePaid;
  if (balance < 0) return 'RECEIVABLE'; // vendor has been paid more than they were owed — they owe us
  if (balance === 0) return 'PAID';
  if (dueDate && dueDate < new Date()) return 'OVERDUE';
  if (advancePaid > 0) return 'PARTIAL';
  return 'PENDING';
}

// Re-derives advancePaid/balanceAmount/status from the entry log, then runs
// the same advance-required auto-confirm check updateVendorPayment always
// has — shared so both the direct-edit path and the new entry-based path
// keep that behavior identical.
async function recalcVendorPayment(vendorPaymentId: string) {
  const existing = await prisma.vendorPayment.findUnique({
    where: { id: vendorPaymentId },
    include: { entries: true, hotel: true, vehicle: true },
  });
  if (!existing) return null;

  const advancePaid = existing.entries.reduce((sum, e) => {
    if (e.method === 'VENDOR_REFUND') return sum - e.amount;
    if (PAYING_METHODS.includes(e.method)) return sum + e.amount;
    return sum; // CREDIT — acknowledgment only, no balance effect
  }, 0);
  const balanceAmount = existing.totalAmount - advancePaid;
  const status = computeStatus(existing.totalAmount, advancePaid, existing.dueDate);

  const updated = await prisma.vendorPayment.update({
    where: { id: vendorPaymentId },
    data: { advancePaid, balanceAmount, status },
    include: {
      entries: { orderBy: { createdAt: 'desc' }, include: { createdBy: { select: { id: true, name: true } } } },
      vendor: { select: { id: true, name: true, type: true } },
      departure: { select: { id: true, destination: true, departureDate: true } },
    },
  });

  // Advance-required auto-confirm: this bill was auto-synced from a
  // Hotel/Vehicle that set advanceRequired — once the recorded advancePaid
  // reaches it, that Hotel/Vehicle flips to CONFIRMED without Ops having to
  // come back and do it by hand. Only ever moves PENDING -> CONFIRMED.
  if (existing.advanceRequired != null && advancePaid >= existing.advanceRequired) {
    if (existing.hotel && existing.hotel.status === 'PENDING') {
      await prisma.hotel.update({ where: { id: existing.hotel.id }, data: { status: 'CONFIRMED' } });
      await notifyOperationsTeam(existing.organizationId, 'HOTEL_CONFIRMED', 'Hotel Confirmed', `Hotel "${existing.hotel.name}" auto-confirmed — advance paid`, existing.hotel.departureId);
      emitOperationsUpdated(existing.hotel.departureId);
    }
    if (existing.vehicle && existing.vehicle.status === 'PENDING') {
      await prisma.vehicle.update({ where: { id: existing.vehicle.id }, data: { status: 'CONFIRMED' } });
      emitOperationsUpdated(existing.vehicle.departureId);
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
    if (!totalAmount || isNaN(Number(totalAmount))) { res.status(400).json({ success: false, error: 'Valid total amount is required' }); return; }
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
        payments: {
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
          where: { balanceAmount: { not: 0 } },
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
