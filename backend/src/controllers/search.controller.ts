import { Response } from 'express';
import prisma from '../lib/prisma.js';
import { AuthenticatedRequest } from '../types/index.js';

const orgId = (req: AuthenticatedRequest) => req.user?.organizationId ?? null;
const orgFilter = (req: AuthenticatedRequest) => (orgId(req) ? { organizationId: orgId(req) } : {});

const LIMIT = 5;

// ─── GET /erp/booking-lookup?q= ──────────────────────────────────────────────
// Search bookings by booking number OR registered mobile number.
// Accessible to all authenticated roles (Admin, Employee, Finance, Operations).
export const bookingLookup = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const q = String(req.query.q ?? '').trim();
    if (q.length < 3) { res.json({ success: true, data: [] }); return; }

    const oid = orgId(req);
    const contains = { contains: q, mode: 'insensitive' as const };

    const bookings = await prisma.booking.findMany({
      where: {
        ...(oid ? { organizationId: oid } : {}),
        OR: [
          { bookingNumber: contains },
          { lead: { phone: contains } },
          { travelerName: contains },
        ],
      },
      include: {
        lead: {
          select: {
            id: true, name: true, phone: true, email: true, destination: true,
            assignedTo: { select: { id: true, name: true } },
          },
        },
        package: { select: { id: true, name: true, code: true } },
        departure: { select: { id: true, departureDate: true, destination: true, status: true } },
        payments: {
          select: { id: true, amount: true, method: true, status: true, reference: true, receiptNo: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
        },
        travelers: {
          select: { id: true, name: true, age: true, gender: true, mobile: true },
          orderBy: { createdAt: 'asc' },
        },
        paymentSchedule: {
          select: { id: true, dueDate: true, amount: true, label: true, paidAmount: true, status: true },
          orderBy: { dueDate: 'asc' },
        },
      },
      take: 10,
      orderBy: { createdAt: 'desc' },
    });

    res.json({ success: true, data: bookings });
  } catch (e) {
    console.error('[search] bookingLookup error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// ─── GET /search?q= ───────────────────────────────────────────────────────────
// Cross-entity search, capped to LIMIT results per entity, grouped by type.
// Deliberately simple `contains` matching (no full-text index) — this
// codebase's scale doesn't need more, and every other search box in the app
// (leads, bookings, vendors) already uses the same idiom.
export const globalSearch = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const q = String(req.query.q ?? '').trim();
    if (q.length < 2) { res.json({ success: true, data: {} }); return; }

    const contains = { contains: q, mode: 'insensitive' as const };

    const [leads, bookings, payments, packages, hotels, vehicles, vendors, users, travelers] = await Promise.all([
      prisma.lead.findMany({
        where: { ...orgFilter(req), deletedAt: null, OR: [{ name: contains }, { phone: contains }, { email: contains }] },
        select: { id: true, name: true, phone: true, status: true },
        take: LIMIT,
      }),
      prisma.booking.findMany({
        where: { ...orgFilter(req), OR: [{ bookingNumber: contains }, { travelerName: contains }] },
        select: { id: true, bookingNumber: true, travelerName: true, leadId: true },
        take: LIMIT,
      }),
      prisma.payment.findMany({
        where: { booking: orgFilter(req), OR: [{ reference: contains }, { receiptNo: contains }] },
        select: { id: true, amount: true, reference: true, receiptNo: true, bookingId: true },
        take: LIMIT,
      }),
      prisma.package.findMany({
        where: { ...orgFilter(req), OR: [{ name: contains }, { code: contains }] },
        select: { id: true, name: true, code: true },
        take: LIMIT,
      }),
      prisma.hotel.findMany({
        where: { name: contains, departure: orgFilter(req) },
        select: { id: true, name: true, departureId: true },
        take: LIMIT,
      }),
      prisma.vehicle.findMany({
        where: { departure: orgFilter(req), OR: [{ vehicleNumber: contains }, { driverName: contains }] },
        select: { id: true, vehicleNumber: true, driverName: true, departureId: true },
        take: LIMIT,
      }),
      prisma.vendor.findMany({
        where: { ...orgFilter(req), name: contains },
        select: { id: true, name: true, type: true },
        take: LIMIT,
      }),
      prisma.user.findMany({
        where: { ...orgFilter(req), OR: [{ name: contains }, { email: contains }] },
        select: { id: true, name: true, email: true, role: true },
        take: LIMIT,
      }),
      prisma.traveler.findMany({
        where: { name: contains, booking: orgFilter(req) },
        select: { id: true, name: true, bookingId: true, booking: { select: { departureId: true } } },
        take: LIMIT,
      }),
    ]);

    res.json({
      success: true,
      data: {
        leads, bookings, payments, packages, hotels, vehicles, vendors, users,
        travelers: travelers.map((t) => ({ id: t.id, name: t.name, bookingId: t.bookingId, departureId: t.booking.departureId })),
      },
    });
  } catch (e) {
    console.error('[search] globalSearch error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};
