// ─── Operations → Finance auto-sync ───────────────────────────────────────
// Whenever Operations records a hotel/vehicle with both a vendor and a rate,
// this keeps a matching VendorPayment row in sync automatically — Finance
// never has to re-key the same vendor/rate info Operations already entered.
// Shared by hotel.controller.ts and vehicle.controller.ts.

import prisma from '../lib/prisma.js';

export type SyncVendorPaymentInput = {
  organizationId: string | null;
  vendorId: string | null | undefined;
  departureId: string;
  serviceType: 'HOTEL' | 'VEHICLE';
  totalAmount: number | null | undefined; // null/0/undefined means "not enough info to sync yet"
  existingVendorPaymentId: string | null | undefined;
  createdById: string;
  label: string; // hotel/vehicle name, used in the auto-generated note
};

// Returns the VendorPayment id that should be stored back on the
// Hotel/Vehicle row (null if nothing should be synced yet — e.g. no vendor
// chosen or no rate entered).
export async function syncVendorPayment(input: SyncVendorPaymentInput): Promise<string | null> {
  const { organizationId, vendorId, departureId, serviceType, totalAmount, existingVendorPaymentId, createdById, label } = input;

  if (!vendorId || !totalAmount || totalAmount <= 0) {
    // Not enough info to sync (no vendor yet, or rate/rooms not entered).
    // If a payment was already synced earlier and the vendor/rate has since
    // been cleared, leave that payment alone rather than deleting a record
    // Finance may already be tracking/paying against — just stop updating it.
    return existingVendorPaymentId ?? null;
  }

  if (existingVendorPaymentId) {
    const existing = await prisma.vendorPayment.findUnique({ where: { id: existingVendorPaymentId } });
    if (existing) {
      const balanceAmount = Math.max(0, totalAmount - existing.advancePaid);
      const status = balanceAmount <= 0 ? 'PAID' : existing.advancePaid > 0 ? 'PARTIAL' : (existing.status === 'OVERDUE' ? 'OVERDUE' : 'PENDING');
      await prisma.vendorPayment.update({
        where: { id: existingVendorPaymentId },
        data: { vendorId, totalAmount, balanceAmount, status },
      });
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
      status: 'PENDING',
      notes: `Auto-synced from Operations — ${label}`,
      createdById,
    },
  });
  return created.id;
}
