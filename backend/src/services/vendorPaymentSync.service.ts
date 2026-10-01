// ─── Operations → Finance auto-sync ───────────────────────────────────────
// Whenever Operations records a hotel/vehicle with both a vendor and a rate,
// this keeps a matching VendorPayment row in sync automatically — Finance
// never has to re-key the same vendor/rate info Operations already entered.
// Shared by hotel.controller.ts and vehicle.controller.ts.

import prisma from '../lib/prisma.js';
import { recalcVendorPayment } from '../controllers/vendorPayment.controller.js';

export type SyncVendorPaymentInput = {
  organizationId: string | null;
  vendorId: string | null | undefined;
  departureId: string;
  serviceType: 'HOTEL' | 'VEHICLE' | 'B2B';
  totalAmount: number | null | undefined; // null/0/undefined means "not enough info to sync yet"
  advanceRequired: number | null | undefined; // threshold updateVendorPayment auto-confirms against
  existingVendorPaymentId: string | null | undefined;
  createdById: string;
  label: string; // hotel/vehicle name, used in the auto-generated note
};

// Returns the VendorPayment id that should be stored back on the
// Hotel/Vehicle row (null if nothing should be synced yet — e.g. no vendor
// chosen or no rate entered).
export async function syncVendorPayment(input: SyncVendorPaymentInput): Promise<string | null> {
  const { organizationId, vendorId, departureId, serviceType, totalAmount, advanceRequired, existingVendorPaymentId, createdById, label } = input;

  if (!vendorId || !totalAmount || totalAmount <= 0) {
    // Not enough info to sync (no vendor yet, or rate/rooms not entered).
    // If a payment was already synced earlier and the vendor/rate has since
    // been cleared, leave that payment alone rather than deleting a record
    // Finance may already be tracking/paying against — just stop updating it.
    return existingVendorPaymentId ?? null;
  }

  // Guard against linking a vendor from a different tenant — the picker UIs
  // only ever list same-org vendors, but a crafted vendorId here would mix
  // one org's bill/history onto another org's vendor record.
  const vendor = await prisma.vendor.findFirst({ where: { id: vendorId, ...(organizationId ? { organizationId } : {}) } });
  if (!vendor) return existingVendorPaymentId ?? null;

  if (existingVendorPaymentId) {
    const existing = await prisma.vendorPayment.findUnique({
      where: { id: existingVendorPaymentId },
      select: { id: true, entries: { select: { id: true }, take: 1 } },
    });
    if (existing) {
      // Once Finance has started recording payments against this bill,
      // treat the rate/vendor as settled from their side — a later,
      // unrelated Operations save (editing room plan, trip captain, etc.)
      // shouldn't silently overwrite a rate Finance has already paid
      // against, or move already-paid history onto a different vendor.
      const hasPayments = existing.entries.length > 0;
      await prisma.vendorPayment.update({
        where: { id: existingVendorPaymentId },
        data: {
          advanceRequired: advanceRequired ?? null,
          ...(hasPayments ? {} : { vendorId, totalAmount }),
        },
      });
      // Delegate status/balance to the same recalc every other path uses —
      // keeps RECEIVABLE, auto-confirm, and auto-revert all correct here too,
      // instead of this duplicating (and under-handling) that logic itself.
      await recalcVendorPayment(existingVendorPaymentId);
      return existingVendorPaymentId;
    }
  }

  const created = await prisma.vendorPayment.create({
    data: {
      organizationId: organizationId ?? undefined,
      vendorId,
      departureId,
      serviceType,
      totalAmount,
      advancePaid: 0,
      balanceAmount: totalAmount,
      advanceRequired: advanceRequired ?? null,
      status: 'PENDING',
      notes: `Auto-synced from Operations — ${label}`,
      createdById,
    },
  });
  return created.id;
}
