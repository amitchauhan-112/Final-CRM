import PDFDocument from 'pdfkit';
import { uploadGeneratedFile } from '../middleware/upload.js';

const FINANCE_DOCS_CATEGORY = 'finance-generated-documents';

// Same static letterhead already used by the browser-print convention
// (frontend/src/components/finance/ReceiptView.tsx) — no company-profile/
// settings model exists in this codebase, so this mirrors that exact text
// rather than inventing new config.
const COMPANY_NAME = 'Travel CRM';
const COMPANY_TAGLINE = 'Trek & Pilgrimage';

const DOCUMENT_TITLES: Record<string, string> = {
  TAX_INVOICE: 'Tax Invoice',
  RECEIPT: 'Receipt',
  CREDIT_NOTE: 'Credit Note',
  DEBIT_NOTE: 'Debit Note',
  REFUND_VOUCHER: 'Refund Voucher',
};

export interface FinanceDocumentSnapshot {
  customerName: string;
  customerPhone?: string;
  bookingNumber?: string;
  packageName?: string;
  destination?: string;
  departureDate?: string;
  amount: number;
  taxAmount?: number;
  method?: string;
  reference?: string;
  reason?: string;
  lineItems?: { label: string; value: number }[];
}

const formatINR = (n: number) => `Rs. ${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export async function renderFinanceDocumentPdf(
  type: string,
  documentNumber: string,
  generatedAt: Date,
  snapshot: FinanceDocumentSnapshot
): Promise<string> {
  const filename = `${documentNumber.replace(/\//g, '-')}.pdf`;

  const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Letterhead
    doc.fontSize(18).font('Helvetica-Bold').text(COMPANY_NAME);
    doc.fontSize(10).font('Helvetica').fillColor('#666').text(COMPANY_TAGLINE);
    doc.moveDown(1.5);

    doc.fillColor('#000').fontSize(14).font('Helvetica-Bold').text(DOCUMENT_TITLES[type] ?? type, { align: 'right' });
    doc.fontSize(9).font('Helvetica').fillColor('#666')
      .text(documentNumber, { align: 'right' })
      .text(generatedAt.toDateString(), { align: 'right' });
    doc.fillColor('#000');
    doc.moveDown(1);

    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#ddd').stroke();
    doc.moveDown(1);

    // Customer / booking block
    doc.fontSize(9).fillColor('#888').text('CUSTOMER');
    doc.fontSize(11).fillColor('#000').font('Helvetica-Bold').text(snapshot.customerName);
    doc.font('Helvetica').fontSize(10).fillColor('#333');
    if (snapshot.customerPhone) doc.text(snapshot.customerPhone);
    doc.moveDown(0.5);
    if (snapshot.bookingNumber) doc.text(`Booking: ${snapshot.bookingNumber}`);
    if (snapshot.packageName) doc.text(`Package: ${snapshot.packageName}`);
    if (snapshot.destination) doc.text(`Destination: ${snapshot.destination}${snapshot.departureDate ? ` — ${new Date(snapshot.departureDate).toDateString()}` : ''}`);
    doc.moveDown(1.5);

    // Line items
    const items = snapshot.lineItems && snapshot.lineItems.length > 0
      ? snapshot.lineItems
      : [{ label: DOCUMENT_TITLES[type] ?? type, value: snapshot.amount }];

    doc.fontSize(9).fillColor('#888');
    const tableTop = doc.y;
    doc.text('DESCRIPTION', 50, tableTop);
    doc.text('AMOUNT', 450, tableTop, { width: 95, align: 'right' });
    doc.moveTo(50, doc.y + 14).lineTo(545, doc.y + 14).strokeColor('#ddd').stroke();
    doc.moveDown(1.2);

    doc.fillColor('#000').fontSize(10).font('Helvetica');
    for (const item of items) {
      const y = doc.y;
      doc.text(item.label, 50, y, { width: 380 });
      doc.text(formatINR(item.value), 450, y, { width: 95, align: 'right' });
      doc.moveDown(0.7);
    }

    if (snapshot.taxAmount && snapshot.taxAmount > 0) {
      const y = doc.y;
      doc.text('Tax', 50, y, { width: 380 });
      doc.text(formatINR(snapshot.taxAmount), 450, y, { width: 95, align: 'right' });
      doc.moveDown(0.7);
    }

    doc.moveTo(50, doc.y + 4).lineTo(545, doc.y + 4).strokeColor('#ddd').stroke();
    doc.moveDown(0.8);

    const total = snapshot.amount + (snapshot.taxAmount ?? 0);
    doc.font('Helvetica-Bold').fontSize(12);
    doc.text('Total', 50, doc.y, { width: 380 });
    doc.text(formatINR(total), 450, doc.y - 14, { width: 95, align: 'right' });
    doc.moveDown(1.5);

    if (snapshot.method || snapshot.reference) {
      doc.font('Helvetica').fontSize(9).fillColor('#888').text('PAYMENT DETAILS');
      doc.fillColor('#333').fontSize(10);
      if (snapshot.method) doc.text(`Method: ${snapshot.method}`);
      if (snapshot.reference) doc.text(`Reference: ${snapshot.reference}`);
      doc.moveDown(1);
    }
    if (snapshot.reason) {
      doc.font('Helvetica').fontSize(9).fillColor('#888').text('REASON');
      doc.fillColor('#333').fontSize(10).text(snapshot.reason);
      doc.moveDown(1);
    }

    doc.fontSize(8).fillColor('#999').text('Thank you for traveling with us.', 50, 760, { align: 'center', width: 495 });

    doc.end();
  });

  return uploadGeneratedFile(FINANCE_DOCS_CATEGORY, filename, pdfBuffer, 'application/pdf');
}
