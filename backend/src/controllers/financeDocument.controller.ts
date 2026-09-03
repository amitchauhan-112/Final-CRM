import { Response } from 'express';
import prisma from '../lib/prisma.js';
import { AuthenticatedRequest } from '../types/index.js';
import { renderFinanceDocumentPdf, FinanceDocumentSnapshot } from '../services/pdf.service.js';
import { isWholeAmount, WHOLE_AMOUNT_ERROR } from '../utils/amountValidation.js';

const orgId = (req: AuthenticatedRequest) => req.user?.organizationId ?? null;

const TYPE_PREFIX: Record<string, string> = {
  TAX_INVOICE: 'INV',
  RECEIPT: 'RCPT',
  CREDIT_NOTE: 'CN',
  DEBIT_NOTE: 'DN',
  REFUND_VOUCHER: 'RV',
};
const VALID_TYPES = Object.keys(TYPE_PREFIX);

async function nextDocumentNumber(type: string): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = TYPE_PREFIX[type];
  const count = await prisma.financeDocument.count({
    where: { type, documentNumber: { startsWith: `${prefix}-${year}-` } },
  });
  return `${prefix}-${year}-${String(count + 1).padStart(6, '0')}`;
}

// ─── Core generator — used both by the HTTP endpoint (on-demand documents)
// and by the auto-triggers in payment.controller.ts / refund.controller.ts.
export async function generateFinanceDocument(params: {
  type: string;
  bookingId: string;
  paymentId?: string;
  refundId?: string;
  amount?: number;
  taxAmount?: number;
  reason?: string;
  generatedById: string;
}) {
  const { type, bookingId, paymentId, refundId, reason, generatedById } = params;
  if (!VALID_TYPES.includes(type)) throw new Error(`Invalid document type: ${type}`);

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      lead: { select: { name: true, phone: true } },
      package: { select: { name: true } },
      departure: { select: { destination: true, departureDate: true } },
    },
  });
  if (!booking) throw new Error('Booking not found');

  let amount = params.amount ?? booking.finalPrice;
  let method: string | undefined;
  let reference: string | undefined;

  if (paymentId) {
    const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
    if (payment) { amount = payment.amount; method = payment.method; reference = payment.reference ?? undefined; }
  }
  if (refundId) {
    const refund = await prisma.refund.findUnique({ where: { id: refundId } });
    if (refund) { amount = refund.amount; reference = refund.transactionId ?? undefined; }
  }

  const documentNumber = await nextDocumentNumber(type);

  const snapshot: FinanceDocumentSnapshot = {
    customerName: booking.lead.name,
    customerPhone: booking.lead.phone,
    bookingNumber: booking.bookingNumber ?? undefined,
    packageName: booking.package?.name,
    destination: booking.departure?.destination,
    departureDate: booking.departure?.departureDate?.toISOString(),
    amount,
    taxAmount: params.taxAmount ?? 0,
    method,
    reference,
    reason,
  };

  const generatedAt = new Date();
  const pdfUrl = await renderFinanceDocumentPdf(type, documentNumber, generatedAt, snapshot);

  return prisma.financeDocument.create({
    data: {
      organizationId: booking.organizationId,
      type,
      documentNumber,
      bookingId,
      paymentId: paymentId || null,
      refundId: refundId || null,
      amount,
      taxAmount: params.taxAmount ?? 0,
      pdfUrl,
      snapshotJson: snapshot as any,
      generatedById,
      generatedAt,
    },
  });
}

// ─── POST /finance/documents ──────────────────────────────────────────────────

export const createFinanceDocument = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { type, bookingId, amount, taxAmount, reason } = req.body;
    if (!VALID_TYPES.includes(type)) { res.status(400).json({ success: false, error: 'Invalid document type' }); return; }
    if (!isWholeAmount(amount) || !isWholeAmount(taxAmount)) { res.status(400).json({ success: false, error: WHOLE_AMOUNT_ERROR }); return; }

    const booking = await prisma.booking.findFirst({ where: { id: bookingId, ...(orgId(req) ? { organizationId: orgId(req) } : {}) } });
    if (!booking) { res.status(404).json({ success: false, error: 'Booking not found' }); return; }

    const document = await generateFinanceDocument({
      type, bookingId,
      amount: amount !== undefined ? Number(amount) : undefined,
      taxAmount: taxAmount !== undefined ? Number(taxAmount) : undefined,
      reason: reason?.trim() || undefined,
      generatedById: req.user!.id,
    });

    res.status(201).json({ success: true, data: document });
  } catch (e) {
    console.error('[finance] createFinanceDocument error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// ─── GET /finance/documents?bookingId= ───────────────────────────────────────

export const listFinanceDocuments = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { bookingId } = req.query;
    const where: Record<string, unknown> = { ...(orgId(req) ? { organizationId: orgId(req) } : {}) };
    if (bookingId) where.bookingId = bookingId;

    const documents = await prisma.financeDocument.findMany({
      where,
      include: { generatedBy: { select: { id: true, name: true } } },
      orderBy: { generatedAt: 'desc' },
    });
    res.json({ success: true, data: documents });
  } catch (e) {
    console.error('[finance] listFinanceDocuments error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};
