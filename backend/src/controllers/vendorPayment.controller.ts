import { Response } from 'express';
import prisma from '../lib/prisma.js';
import { AuthenticatedRequest } from '../types/index.js';
import { emitFinanceUpdated } from '../services/notification.service.js';
import { buildUploadUrl } from '../middleware/upload.js';

const orgId = (req: AuthenticatedRequest) => req.user?.organizationId ?? null;
const orgFilter = (req: AuthenticatedRequest) => (orgId(req) ? { organizationId: orgId(req) } : {});

function computeStatus(totalAmount: number, advancePaid: number, dueDate: Date | null): string {
  const balance = totalAmount - advancePaid;
  if (balance <= 0) return 'PAID';
  if (dueDate && dueDate < new Date()) return 'OVERDUE';
  if (advancePaid > 0) return 'PARTIAL';
  return 'PENDING';
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
    const { vendorId, departureId, serviceType, totalAmount, advancePaid, dueDate, notes, invoiceUrl, paymentProofUrl } = req.body;
    const vendor = await prisma.vendor.findFirst({ where: { id: vendorId, ...orgFilter(req) } });
    if (!vendor) { res.status(404).json({ success: false, error: 'Vendor not found' }); return; }
    if (!totalAmount || isNaN(Number(totalAmount))) { res.status(400).json({ success: false, error: 'Valid total amount is required' }); return; }

    const total = Number(totalAmount);
    const advance = Number(advancePaid ?? 0);
    const balance = Math.max(0, total - advance);
    const due = dueDate ? new Date(dueDate) : null;

    const payment = await prisma.vendorPayment.create({
      data: {
        organizationId: orgId(req),
        vendorId, departureId: departureId || null,
        serviceType: serviceType || 'OTHER',
        totalAmount: total, advancePaid: advance, balanceAmount: balance,
        dueDate: due, status: computeStatus(total, advance, due),
        invoiceUrl: invoiceUrl || null, paymentProofUrl: paymentProofUrl || null,
        notes: notes?.trim() || null,
        createdById: req.user!.id,
      },
    });

    await prisma.activityLog.create({
      data: { action: 'Vendor Payment Created', details: `₹${total.toLocaleString()} bill created for ${vendor.name}`, entityType: 'VENDOR_PAYMENT', entityId: payment.id, userId: req.user!.id },
    });
    emitFinanceUpdated();

    res.status(201).json({ success: true, data: payment });
  } catch (e) {
    console.error('[finance] createVendorPayment error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

export const updateVendorPayment = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const existing = await prisma.vendorPayment.findFirst({ where: { id, ...orgFilter(req) }, include: { vendor: true } });
    if (!existing) { res.status(404).json({ success: false, error: 'Vendor payment not found' }); return; }

    const b = req.body;
    const total = b.totalAmount !== undefined ? Number(b.totalAmount) : existing.totalAmount;
    const advance = b.advancePaid !== undefined ? Number(b.advancePaid) : existing.advancePaid;
    const due = b.dueDate !== undefined ? (b.dueDate ? new Date(b.dueDate) : null) : existing.dueDate;
    const balance = Math.max(0, total - advance);

    const updated = await prisma.vendorPayment.update({
      where: { id },
      data: {
        serviceType: b.serviceType ?? existing.serviceType,
        totalAmount: total, advancePaid: advance, balanceAmount: balance,
        dueDate: due, status: b.status ?? computeStatus(total, advance, due),
        invoiceUrl: b.invoiceUrl !== undefined ? b.invoiceUrl : existing.invoiceUrl,
        paymentProofUrl: b.paymentProofUrl !== undefined ? b.paymentProofUrl : existing.paymentProofUrl,
        notes: b.notes !== undefined ? b.notes?.trim() || null : existing.notes,
      },
    });

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
          include: { departure: { select: { id: true, destination: true, departureDate: true } }, createdBy: { select: { id: true, name: true } } },
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
