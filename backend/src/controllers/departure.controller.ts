import { Response } from 'express';
import { randomBytes, createHash } from 'node:crypto';
import prisma from '../lib/prisma.js';
import { AuthenticatedRequest } from '../types/index.js';
import { emitOperationsUpdated, notifyOperationsTeam, createNotification } from '../services/notification.service.js';
import { generateOpsTasksFromItinerary, generateStandardOpsTasks } from './departureTask.controller.js';
import { computeJourney } from './journey.controller.js';
import { validateTravelerInput } from '../utils/travelerValidation.js';

const orgId = (req: AuthenticatedRequest) => req.user?.organizationId ?? null;
const orgFilter = (req: AuthenticatedRequest) => (orgId(req) ? { organizationId: orgId(req) } : {});

function ageFromDob(dob: Date): number {
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) age--;
  return age;
}

// ─── Traveler placeholder records ────────────────────────────────────────────
// A confirmed booking only stores a headcount — this materializes it into real
// per-traveler rows ("Traveler 1"..."Traveler N") for the customer to fill in
// via the Traveler Portal, or Operations to edit directly. Idempotent: only
// tops up the count, never duplicates travelers that already exist (so it's
// safe to call again from updateBooking if numberOfTravelers changes).
//
// The person who made the booking is, in practice, almost always Traveler 1 —
// so that first placeholder is seeded with the booking's contact name/phone/
// email instead of being left blank like the rest. It's still just a
// starting point: the customer (or Ops) can edit it via the normal flows,
// and it doesn't affect verificationStatus, which still starts PENDING.
export async function createPlaceholderTravelers(
  bookingId: string,
  numberOfTravelers: number,
  primaryContact?: { name?: string | null; mobile?: string | null; email?: string | null }
): Promise<void> {
  const existingCount = await prisma.traveler.count({ where: { bookingId } });
  if (existingCount >= numberOfTravelers) return;

  const toCreate = numberOfTravelers - existingCount;
  await prisma.traveler.createMany({
    data: Array.from({ length: toCreate }, (_, i) => {
      const index = existingCount + i;
      const isPrimary = index === 0 && !!primaryContact;
      return {
        bookingId,
        name: isPrimary && primaryContact?.name?.trim() ? primaryContact.name.trim() : `Traveler ${index + 1}`,
        mobile: isPrimary ? primaryContact?.mobile?.trim() || null : null,
        email: isPrimary ? primaryContact?.email?.trim() || null : null,
        verificationStatus: 'PENDING',
      };
    }),
  });
}

// ─── Traveler Portal token ────────────────────────────────────────────────────
// Generates a random link token, stores only its SHA-256 hash (never the raw
// value — same idiom as RefreshToken), and returns the raw token once so the
// caller can hand it to Operations to copy/share. Idempotent per-call: always
// issues a fresh token (invalidating any previous one), since re-confirming a
// booking is a reasonable moment to also refresh an expired link.
export async function issueTravelerPortalToken(bookingId: string, departureDate: Date | null): Promise<string> {
  const rawToken = randomBytes(24).toString('base64url');
  const tokenHash = createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = departureDate
    ? new Date(departureDate.getTime() + 7 * 86400000)
    : new Date(Date.now() + 180 * 86400000);

  await prisma.booking.update({
    where: { id: bookingId },
    data: { travelerPortalTokenHash: tokenHash, travelerPortalTokenExpiresAt: expiresAt },
  });

  return rawToken;
}

// ─── Auto-link a confirmed booking to its Departure ──────────────────────────
// Called from booking.controller.ts whenever Sales confirms a booking. Finds an
// existing Departure sharing the same trip (packageId+date, or destination+date
// for package-less bookings) or creates one — Operations never creates these
// manually. This is the sole mechanism that makes confirmed bookings "appear"
// in the Operations Panel automatically.
export async function linkBookingToDeparture(
  bookingId: string,
  organizationId: string | null,
  packageId: string | null,
  departureDate: Date,
  destination: string,
  tripDays: number = 1
): Promise<string> {
  const where = packageId
    ? { organizationId, packageId, departureDate }
    : { organizationId, packageId: null, departureDate, destination };

  let departure = await prisma.departure.findFirst({ where });
  let isNew = false;
  if (!departure) {
    departure = await prisma.departure.create({
      data: { organizationId, packageId: packageId || null, destination, departureDate, status: 'UPCOMING' },
    });
    isNew = true;
  }

  await prisma.booking.update({ where: { id: bookingId }, data: { departureId: departure.id } });

  if (isNew) {
    await generateStandardOpsTasks(departure.id, tripDays).catch(console.error);
    if (packageId) {
      await generateOpsTasksFromItinerary(departure.id, packageId, departureDate).catch(console.error);
    }
  }

  await notifyOperationsTeam(
    organizationId,
    'NEW_CONFIRMED_BOOKING',
    'New Confirmed Booking',
    `${destination} — departure on ${departureDate.toDateString()} has a new confirmed booking.`,
    departure.id
  );
  emitOperationsUpdated(departure.id);

  return departure.id;
}

// ─── Checklist Engine ─────────────────────────────────────────────────────────
// Most items are computed live from existing fields — never stored — so they
// can never drift out of sync. Only the handful with no natural backing field
// (physical prep, not data the app already tracks) are persisted, in
// Departure.manualChecklist.
const MANUAL_CHECKLIST_ITEMS = [
  { key: 'welcomeKitReady', label: 'Welcome Kit Ready' },
  { key: 'passengerListPrinted', label: 'Passenger List Printed' },
  { key: 'emergencyContactsReady', label: 'Emergency Contacts Ready' },
  { key: 'medicalKitReady', label: 'Medical Kit Ready' },
] as const;
const MANUAL_CHECKLIST_KEYS = new Set(MANUAL_CHECKLIST_ITEMS.map((i) => i.key));

export function computeChecklist(departure: {
  hotels: { status: string; roomAllocation: string | null }[];
  vehicles: { status: string; driverName: string | null }[];
  tripCaptainStatus: string;
  manualChecklist: unknown;
  bookings: { travelers: { verificationStatus: string }[] }[];
}) {
  const travelers = departure.bookings.flatMap((b) => b.travelers);
  const manual = (departure.manualChecklist ?? {}) as Record<string, boolean>;
  const hasHotels = departure.hotels.length > 0;
  const hasVehicles = departure.vehicles.length > 0;

  // "applicable: false" items are excluded from both the display and the
  // progress total — a trip with no vehicle component should be able to
  // reach 100%, not get stuck forever on a "Vehicle Confirmed" item that can
  // never be satisfied. Same "don't show what doesn't apply" rule as tiles
  // that would otherwise display a permanent zero.
  const allItems = [
    { key: 'hotelConfirmed', label: 'Hotel Confirmed', applicable: hasHotels, done: hasHotels && departure.hotels.every((h) => h.status === 'CONFIRMED') },
    { key: 'vehicleConfirmed', label: 'Vehicle Confirmed', applicable: hasVehicles, done: hasVehicles && departure.vehicles.every((v) => v.status === 'CONFIRMED') },
    { key: 'driverAssigned', label: 'Driver Assigned', applicable: hasVehicles, done: hasVehicles && departure.vehicles.every((v) => !!v.driverName?.trim()) },
    { key: 'roomAllocationDone', label: 'Room Allocation Done', applicable: hasHotels, done: hasHotels && departure.hotels.every((h) => !!h.roomAllocation?.trim()) },
    { key: 'tripCaptainConfirmed', label: 'Trip Captain Confirmed', applicable: true, done: departure.tripCaptainStatus === 'CONFIRMED' },
    { key: 'travelerVerificationDone', label: 'Traveler Verification Done', applicable: travelers.length > 0, done: travelers.length > 0 && travelers.every((t) => t.verificationStatus === 'VERIFIED') },
    ...MANUAL_CHECKLIST_ITEMS.map((item) => ({ key: item.key as string, label: item.label, applicable: true, done: !!manual[item.key] })),
  ];

  const items = allItems.filter((i) => i.applicable).map(({ key, label, done }) => ({ key, label, done }));
  const completedCount = items.filter((i) => i.done).length;
  return { items, completedCount, totalCount: items.length, progress: items.length ? Math.round((completedCount / items.length) * 100) : 0 };
}

export const updateChecklist = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const departure = await prisma.departure.findFirst({ where: { id, ...orgFilter(req) } });
    if (!departure) { res.status(404).json({ success: false, error: 'Departure not found' }); return; }

    const current = (departure.manualChecklist ?? {}) as Record<string, boolean>;
    const next = { ...current };
    for (const [key, value] of Object.entries(req.body as Record<string, unknown>)) {
      if (MANUAL_CHECKLIST_KEYS.has(key as any)) next[key] = !!value;
    }

    const updated = await prisma.departure.update({ where: { id }, data: { manualChecklist: next } });
    emitOperationsUpdated(id);
    res.json({ success: true, data: updated.manualChecklist });
  } catch (e) {
    console.error('[operations] updateChecklist error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function endOfDay(d: Date) { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }

// ─── Travel Calendar + Countdown widgets ─────────────────────────────────────
// Pure read over existing Departure rows, bucketed by date — no new schema.
// Each entry doubles as countdown-widget data (daysUntil) and calendar-widget
// data (bucket), so the frontend can drive both from one call.
export const getTravelCalendar = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const today = startOfDay(new Date());
    const tomorrow = addDays(today, 1);
    const in7 = addDays(today, 7);
    const in30 = addDays(today, 30);
    const monthStart = today;
    const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);

    const departures = await prisma.departure.findMany({
      where: {
        ...orgFilter(req),
        status: { in: ['UPCOMING', 'ACTIVE'] },
        OR: [{ departureDate: { gte: today, lte: in30 } }, { returnDate: { gte: today, lte: in30 } }],
      },
      select: {
        id: true, destination: true, departureDate: true, returnDate: true, status: true,
        package: { select: { name: true } },
        bookings: { select: { numberOfTravelers: true } },
      },
      orderBy: { departureDate: 'asc' },
    });

    const dayMs = 86400000;
    const items = departures.map((d) => {
      const daysUntilDeparture = Math.round((startOfDay(d.departureDate).getTime() - today.getTime()) / dayMs);
      const daysUntilReturn = d.returnDate ? Math.round((startOfDay(d.returnDate).getTime() - today.getTime()) / dayMs) : null;
      let bucket: string;
      if (d.status === 'ACTIVE') bucket = 'IN_PROGRESS';
      else if (d.departureDate >= today && d.departureDate < tomorrow) bucket = 'TODAY';
      else if (d.departureDate >= tomorrow && d.departureDate < addDays(tomorrow, 1)) bucket = 'TOMORROW';
      else if (d.departureDate >= today && d.departureDate <= in7) bucket = 'THIS_WEEK';
      else if (d.departureDate >= today && d.departureDate <= monthEnd) bucket = 'THIS_MONTH';
      else bucket = 'LATER';

      return {
        id: d.id,
        destination: d.destination,
        packageName: d.package?.name ?? null,
        departureDate: d.departureDate,
        returnDate: d.returnDate,
        status: d.status,
        totalTravelers: d.bookings.reduce((s, b) => s + b.numberOfTravelers, 0),
        daysUntilDeparture,
        daysUntilReturn,
        bucket,
      };
    });

    res.json({ success: true, data: { items, range: { from: monthStart, to: monthEnd } } });
  } catch (e) {
    console.error('[operations] getTravelCalendar error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// ─── Dashboard ─────────────────────────────────────────────────────────────────

export const getDashboardStats = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const today = startOfDay(new Date());
    const todayEnd = endOfDay(new Date());
    const in7 = addDays(today, 7);
    const in30 = addDays(today, 30);

    const activeUpcomingFilter = { ...orgFilter(req), status: { in: ['UPCOMING', 'ACTIVE'] } } as const;

    const [
      todaysDepartures,
      upcomingDepartures,
      activeTrips,
      completedTrips,
      todaysBookings,
      pendingHotels,
      bookedHotels,
      pendingVehicles,
      bookedVehicles,
      unassignedCaptains,
      assignedCaptains,
      todaysCheckins,
      todaysCheckouts,
      todaysVehicles,
      activeTripBookings,
      pendingRoomAllocation,
      candidateTasks,
      pendingTravelerVerification,
      checklistDepartures,
      activeUpcomingBookings,
      bookedRoomsAgg,
    ] = await Promise.all([
      prisma.departure.count({ where: { ...orgFilter(req), departureDate: { gte: today, lte: todayEnd } } }),
      prisma.departure.count({ where: { ...orgFilter(req), departureDate: { gt: todayEnd, lte: in30 }, status: 'UPCOMING' } }),
      prisma.departure.count({ where: { ...orgFilter(req), status: 'ACTIVE' } }),
      prisma.departure.count({ where: { ...orgFilter(req), status: 'COMPLETED' } }),
      prisma.booking.findMany({ where: { departure: { ...orgFilter(req), departureDate: { gte: today, lte: todayEnd } } }, select: { numberOfTravelers: true } }),
      prisma.hotel.count({ where: { status: 'PENDING', departure: activeUpcomingFilter } }),
      prisma.hotel.count({ where: { status: 'CONFIRMED', departure: activeUpcomingFilter } }),
      prisma.vehicle.count({ where: { status: 'PENDING', departure: activeUpcomingFilter } }),
      prisma.vehicle.count({ where: { status: 'CONFIRMED', departure: activeUpcomingFilter } }),
      prisma.departure.count({ where: { ...orgFilter(req), status: { in: ['UPCOMING', 'ACTIVE'] }, tripCaptainStatus: 'UNASSIGNED' } }),
      prisma.departure.count({ where: { ...orgFilter(req), status: { in: ['UPCOMING', 'ACTIVE'] }, tripCaptainStatus: { in: ['ASSIGNED', 'CONFIRMED'] } } }),
      prisma.hotel.count({ where: { checkInDate: { gte: today, lte: todayEnd }, departure: { ...orgFilter(req) } } }),
      prisma.hotel.count({ where: { checkOutDate: { gte: today, lte: todayEnd }, departure: { ...orgFilter(req) } } }),
      prisma.vehicle.count({ where: { pickupTime: { gte: today, lte: todayEnd }, departure: { ...orgFilter(req) } } }),
      prisma.booking.findMany({ where: { departure: { ...orgFilter(req), status: 'ACTIVE' } }, select: { numberOfTravelers: true } }),
      prisma.hotel.count({ where: { OR: [{ roomAllocation: null }, { roomAllocation: '' }], departure: activeUpcomingFilter } }),
      prisma.departureTask.findMany({
        where: { status: { not: 'COMPLETED' }, departure: { ...orgFilter(req), departureDate: { gte: addDays(today, -30), lte: in30 } } },
        select: { dayOffset: true, departure: { select: { departureDate: true } } },
      }),
      prisma.traveler.count({
        where: { verificationStatus: { in: ['SUBMITTED', 'CORRECTION_REQUESTED'] }, booking: { departure: activeUpcomingFilter } },
      }),
      prisma.departure.findMany({
        where: { ...orgFilter(req), status: { in: ['UPCOMING', 'ACTIVE'] } },
        select: {
          hotels: { select: { status: true, roomAllocation: true } },
          vehicles: { select: { status: true } },
          tripCaptainStatus: true,
          manualChecklist: true,
          bookings: { select: { travelers: { select: { verificationStatus: true } } } },
        },
      }),
      prisma.booking.findMany({ where: { departure: activeUpcomingFilter, status: { not: 'CANCELLED' } }, select: { numberOfTravelers: true, roomSharing: true } }),
      prisma.hotel.aggregate({ _sum: { numberOfRooms: true }, where: { status: 'CONFIRMED', departure: activeUpcomingFilter } }),
    ]);

    const upcomingActivities = candidateTasks.filter((t) => {
      const activityDate = addDays(startOfDay(t.departure.departureDate), t.dayOffset);
      return activityDate >= today && activityDate <= in7;
    }).length;

    const totalTravelersToday = todaysBookings.reduce((s, b) => s + b.numberOfTravelers, 0);
    const totalTravelersOnTour = activeTripBookings.reduce((s, b) => s + b.numberOfTravelers, 0);
    const checklistProgressAvg = checklistDepartures.length
      ? Math.round(checklistDepartures.reduce((s, d) => s + computeChecklist(d as any).progress, 0) / checklistDepartures.length)
      : 0;

    const CAP: Record<string, number> = { SINGLE: 1, DOUBLE: 2, TRIPLE: 3, QUAD: 4 };
    const roomsRequired = activeUpcomingBookings.reduce((sum, b) => {
      const cap = CAP[b.roomSharing] ?? 2;
      return sum + Math.ceil(b.numberOfTravelers / cap);
    }, 0);
    const roomsBooked = bookedRoomsAgg._sum.numberOfRooms ?? 0;
    const roomsPending = Math.max(0, roomsRequired - roomsBooked);

    res.json({
      success: true,
      data: {
        todaysDepartures, upcomingDepartures, activeTrips, completedTrips,
        totalTravelersToday,
        pendingHotelBookings: pendingHotels,
        bookedHotelBookings: bookedHotels,
        pendingVehicleBookings: pendingVehicles,
        bookedVehicleBookings: bookedVehicles,
        pendingRoomAllocation,
        pendingTripCaptainAssignment: unassignedCaptains,
        assignedTripCaptains: assignedCaptains,
        roomsRequired, roomsBooked, roomsPending,
        todaysCheckins, todaysCheckouts, todaysTransfers: todaysVehicles,
        upcomingActivities, totalTravelersOnTour,
        pendingTravelerVerification, checklistProgressAvg,
      },
    });
  } catch (e) {
    console.error('[operations] getDashboardStats error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// ─── List departures (date-wise) ─────────────────────────────────────────────

export const listDepartures = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { search, status, from, to, page = '1', limit = '20' } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const where: Record<string, unknown> = { ...orgFilter(req) };
    if (status) where.status = status;
    if (search) where.destination = { contains: String(search), mode: 'insensitive' };
    if (from || to) {
      const range: Record<string, Date> = {};
      if (from) range.gte = new Date(String(from));
      if (to) range.lte = new Date(String(to));
      where.departureDate = range;
    }

    const [departures, total] = await Promise.all([
      prisma.departure.findMany({
        where,
        include: {
          package: { select: { id: true, name: true, code: true } },
          bookings: { select: { id: true, numberOfTravelers: true, finalPrice: true, amountPaid: true, balanceAmount: true } },
          hotels: { select: { id: true, status: true } },
          vehicles: { select: { id: true, status: true } },
        },
        orderBy: { departureDate: 'asc' },
        skip,
        take: Number(limit),
      }),
      prisma.departure.count({ where }),
    ]);

    const data = departures.map((d) => ({
      ...d,
      totalTravelers: d.bookings.reduce((s, b) => s + b.numberOfTravelers, 0),
      totalRevenue: d.bookings.reduce((s, b) => s + b.finalPrice, 0),
      totalPending: d.bookings.reduce((s, b) => s + b.balanceAmount, 0),
      bookingCount: d.bookings.length,
      hotelsPending: d.hotels.filter((h) => h.status === 'PENDING').length,
      vehiclesPending: d.vehicles.filter((v) => v.status === 'PENDING').length,
    }));

    res.json({ success: true, data, meta: { total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / Number(limit)) } });
  } catch (e) {
    console.error('[operations] listDepartures error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// ─── Departure detail (passenger list + computed group summary) ─────────────

export const getDepartureDetail = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const departure = await prisma.departure.findFirst({
      where: { id, ...orgFilter(req) },
      include: {
        package: { select: { id: true, name: true, code: true, nights: true, days: true } },
        bookings: {
          include: {
            lead: {
              select: {
                id: true, name: true, phone: true, email: true, status: true, createdAt: true, updatedAt: true,
                activityLogs: { select: { action: true, createdAt: true } },
              },
            },
            travelers: true,
            payments: { select: { status: true, verifiedAt: true } },
            refunds: { where: { status: 'PAID' }, select: { amount: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
        hotels: { orderBy: { createdAt: 'asc' } },
        vehicles: { orderBy: { createdAt: 'asc' } },
        documents: { include: { uploadedBy: { select: { id: true, name: true } } }, orderBy: { createdAt: 'desc' } },
        notes: { include: { author: { select: { id: true, name: true } } }, orderBy: { createdAt: 'desc' } },
        timeline: { orderBy: [{ dayOffset: 'asc' }, { sortOrder: 'asc' }] },
        vendorPayments: { select: { totalAmount: true } },
        expenses: { where: { status: 'APPROVED' }, select: { amount: true } },
      },
    });
    if (!departure) { res.status(404).json({ success: false, error: 'Departure not found' }); return; }

    // Group summary is always computed live — never stored — so it reflects the
    // current bookings/travelers automatically, with no separate sync step needed.
    let totalTravelers = 0, male = 0, female = 0, children = 0, seniors = 0, extraMattress = 0;
    let veg = 0, nonVeg = 0, jain = 0;
    const roomCounts: Record<string, number> = { SINGLE: 0, DOUBLE: 0, TRIPLE: 0, QUAD: 0 };
    let pendingPayments = 0, totalPendingAmount = 0;

    for (const booking of departure.bookings) {
      totalTravelers += booking.numberOfTravelers;
      if (booking.balanceAmount > 0) { pendingPayments += 1; totalPendingAmount += booking.balanceAmount; }

      if (booking.travelers.length > 0) {
        for (const t of booking.travelers) {
          if (t.gender === 'MALE') male += 1;
          else if (t.gender === 'FEMALE') female += 1;
          if (t.isChild) children += 1;
          if (t.isSeniorCitizen) seniors += 1;
          if (t.needsExtraMattress) extraMattress += 1;
          const food = t.foodPreference ?? booking.foodPreference;
          if (food === 'VEG') veg += 1; else if (food === 'NON_VEG') nonVeg += 1; else if (food === 'JAIN') jain += 1;
          const room = t.roomSharing ?? booking.roomSharing;
          if (room in roomCounts) roomCounts[room] += 1;
        }
      } else {
        // no individual traveler records entered yet — fall back to the booking-level aggregate
        if (booking.foodPreference === 'VEG') veg += booking.numberOfTravelers;
        else if (booking.foodPreference === 'NON_VEG') nonVeg += booking.numberOfTravelers;
        else if (booking.foodPreference === 'JAIN') jain += booking.numberOfTravelers;
        if (booking.roomSharing in roomCounts) roomCounts[booking.roomSharing] += booking.numberOfTravelers;
      }
    }

    const roomCapacity: Record<string, number> = { SINGLE: 1, DOUBLE: 2, TRIPLE: 3, QUAD: 4 };
    const groupSummary = {
      totalTravelers, maleCount: male, femaleCount: female,
      doubleSharingRoomsRequired: Math.ceil(roomCounts.DOUBLE / roomCapacity.DOUBLE),
      tripleSharingRoomsRequired: Math.ceil(roomCounts.TRIPLE / roomCapacity.TRIPLE),
      quadSharingRoomsRequired: Math.ceil(roomCounts.QUAD / roomCapacity.QUAD),
      extraMattressRequired: extraMattress,
      vegMeals: veg, nonVegMeals: nonVeg, jainMeals: jain,
      childrenCount: children, seniorCitizenCount: seniors,
      pendingPayments, totalPendingAmount,
    };

    const checklist = computeChecklist(departure);

    // Trip profitability — same cash-basis formula as the org-wide Profit & Loss
    // report, just scoped to this departure's bookings/vendor bills/expenses.
    // Computed live, never persisted, same idiom as groupSummary above.
    const tripRevenue = departure.bookings.reduce((s, b) => s + b.finalPrice, 0);
    const tripCollected = departure.bookings.reduce((s, b) => s + b.amountPaid, 0);
    const tripVendorCost = departure.vendorPayments.reduce((s, v) => s + v.totalAmount, 0);
    const tripExpenseCost = departure.expenses.reduce((s, e) => s + e.amount, 0);
    const tripRefunds = departure.bookings.reduce((s, b) => s + b.refunds.reduce((rs, r) => rs + r.amount, 0), 0);
    const tripNetProfit = tripCollected - tripVendorCost - tripExpenseCost - tripRefunds;
    const tripProfitability = {
      revenue: tripRevenue, collected: tripCollected,
      vendorCost: tripVendorCost, expenseCost: tripExpenseCost, refunds: tripRefunds,
      netProfit: tripNetProfit,
      marginPct: tripRevenue > 0 ? Math.round((tripNetProfit / tripRevenue) * 1000) / 10 : 0,
    };

    // Compact per-booking journey progress for the Trip Workspace overview —
    // reuses the same 15-stage computation as the full Lead Journey Tracker,
    // just without the stage-by-stage detail (that lives on the Lead page).
    const journeySummaries = departure.bookings.map((b) => {
      const { stages, ...summary } = computeJourney({
        status: b.lead.status,
        createdAt: b.lead.createdAt,
        updatedAt: b.lead.updatedAt,
        activityLogs: b.lead.activityLogs,
        booking: {
          createdAt: b.createdAt,
          reviewSubmittedAt: b.reviewSubmittedAt,
          referralReceivedAt: b.referralReceivedAt,
          payments: b.payments,
          travelers: b.travelers,
          departure: { status: departure.status, tripCaptainStatus: departure.tripCaptainStatus, updatedAt: departure.updatedAt, hotels: departure.hotels, vehicles: departure.vehicles },
        },
      });
      return { bookingId: b.id, leadId: b.lead.id, leadName: b.lead.name, ...summary };
    });

    res.json({ success: true, data: { ...departure, groupSummary, checklist, tripProfitability, journeySummaries } });
  } catch (e) {
    console.error('[operations] getDepartureDetail error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// ─── Recent Activity feed for the Trip Workspace ─────────────────────────────
// Aggregates ActivityLog entries across everything that belongs to this
// departure (the departure itself, its hotels/vehicles, and its bookings'
// travelers/leads) — no new logging plumbing, just a broader read.
export const getDepartureActivity = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const departure = await prisma.departure.findFirst({
      where: { id, ...orgFilter(req) },
      select: {
        id: true,
        hotels: { select: { id: true } },
        vehicles: { select: { id: true } },
        bookings: { select: { leadId: true, travelers: { select: { id: true } } } },
      },
    });
    if (!departure) { res.status(404).json({ success: false, error: 'Departure not found' }); return; }

    const hotelIds = departure.hotels.map((h) => h.id);
    const vehicleIds = departure.vehicles.map((v) => v.id);
    const leadIds = departure.bookings.map((b) => b.leadId);
    const travelerIds = departure.bookings.flatMap((b) => b.travelers.map((t) => t.id));

    const logs = await prisma.activityLog.findMany({
      where: {
        OR: [
          { entityType: 'DEPARTURE', entityId: id },
          { entityType: 'HOTEL', entityId: { in: hotelIds } },
          { entityType: 'VEHICLE', entityId: { in: vehicleIds } },
          { entityType: 'TRAVELER', entityId: { in: travelerIds } },
          { entityType: 'TRAVELER_PORTAL', leadId: { in: leadIds } },
        ],
      },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });

    res.json({ success: true, data: logs });
  } catch (e) {
    console.error('[operations] getDepartureActivity error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// ─── Room Allocation Engine ───────────────────────────────────────────────────
// Pure suggestion, never persisted here — Ops reviews and applies it (or an
// edited version of it) via the existing Hotel.roomAllocation field on
// whichever hotel they choose. Grouped per-booking first (a booking is
// assumed to be one travelling party), then bucketed by room-sharing
// preference and gender within that booking — children stay bucketed with
// the rest of their booking's party rather than split out by gender.
const ROOM_CAPACITY: Record<string, number> = { SINGLE: 1, DOUBLE: 2, TRIPLE: 3, QUAD: 4 };

export const suggestRoomAllocation = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const departure = await prisma.departure.findFirst({
      where: { id, ...orgFilter(req) },
      include: { bookings: { include: { travelers: true } } },
    });
    if (!departure) { res.status(404).json({ success: false, error: 'Departure not found' }); return; }

    const rooms: {
      roomNumber: number; roomType: string; bookingId: string;
      travelerIds: string[]; travelerNames: string[]; note: string | null;
    }[] = [];
    let roomNumber = 1;

    for (const booking of departure.bookings) {
      if (booking.travelers.length === 0) continue;

      const buckets = new Map<string, typeof booking.travelers>();
      for (const t of booking.travelers) {
        const roomType = t.roomSharing || booking.roomSharing;
        const genderKey = t.isChild ? 'FAMILY' : (t.gender || 'UNSPECIFIED');
        const key = `${roomType}:${genderKey}`;
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key)!.push(t);
      }

      for (const [key, group] of buckets) {
        const roomType = key.split(':')[0];
        const capacity = ROOM_CAPACITY[roomType] ?? 2;
        for (let i = 0; i < group.length; i += capacity) {
          const chunk = group.slice(i, i + capacity);
          const notes: string[] = [];
          if (chunk.some((t) => t.isSeniorCitizen)) notes.push('senior citizen — consider ground floor');
          if (chunk.some((t) => t.needsExtraMattress)) notes.push('extra mattress needed');
          rooms.push({
            roomNumber: roomNumber++,
            roomType,
            bookingId: booking.id,
            travelerIds: chunk.map((t) => t.id),
            travelerNames: chunk.map((t) => t.name),
            note: notes.length ? notes.join(', ') : null,
          });
        }
      }
    }

    const summaryText = rooms.map((r) => `Room ${r.roomNumber} (${r.roomType}): ${r.travelerNames.join(', ')}`).join('\n');

    res.json({ success: true, data: { rooms, summaryText } });
  } catch (e) {
    console.error('[operations] suggestRoomAllocation error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// ─── Update departure (status / trip captain) ────────────────────────────────

export const updateDeparture = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const existing = await prisma.departure.findFirst({ where: { id, ...orgFilter(req) } });
    if (!existing) { res.status(404).json({ success: false, error: 'Departure not found' }); return; }

    const { status, tripCaptainName, tripCaptainPhone, tripCaptainStatus, returnDate } = req.body;

    // A trip can't start until every applicable checklist item is done —
    // otherwise "Trip Started" becomes meaningless as a signal to the rest of
    // the app (Journey Tracker, dashboards) that the group is actually ready.
    if (status === 'ACTIVE' && existing.status !== 'ACTIVE') {
      const full = await prisma.departure.findFirst({
        where: { id },
        include: {
          hotels: { select: { status: true, roomAllocation: true } },
          vehicles: { select: { status: true, driverName: true } },
          bookings: { select: { travelers: { select: { verificationStatus: true } } } },
        },
      });
      if (full) {
        const checklist = computeChecklist(full);
        if (checklist.progress < 100) {
          const pending = checklist.items.filter((i) => !i.done).map((i) => i.label);
          res.status(400).json({
            success: false,
            error: `Cannot start this trip — checklist isn't complete: ${pending.join(', ')}.`,
          });
          return;
        }
      }
    }

    const departure = await prisma.departure.update({
      where: { id },
      data: {
        status: status ?? existing.status,
        tripCaptainName: tripCaptainName !== undefined ? tripCaptainName?.trim() || null : existing.tripCaptainName,
        tripCaptainPhone: tripCaptainPhone !== undefined ? tripCaptainPhone?.trim() || null : existing.tripCaptainPhone,
        tripCaptainStatus: tripCaptainStatus ?? existing.tripCaptainStatus,
        returnDate: returnDate !== undefined ? (returnDate ? new Date(returnDate) : null) : existing.returnDate,
      },
    });

    await prisma.activityLog.create({
      data: {
        action: 'Departure Updated',
        details: `Departure for ${existing.destination} on ${existing.departureDate.toDateString()} updated by ${req.user?.name}`,
        entityType: 'DEPARTURE',
        entityId: id,
        userId: req.user!.id,
      },
    });
    emitOperationsUpdated(id);

    res.json({ success: true, data: departure });
  } catch (e) {
    console.error('[operations] updateDeparture error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// ─── Traveler CRUD (Operations enriches an already-confirmed booking) ───────

export const createTraveler = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { bookingId } = req.params;
    const booking = await prisma.booking.findFirst({ where: { id: bookingId, ...orgFilter(req) } });
    if (!booking) { res.status(404).json({ success: false, error: 'Booking not found' }); return; }

    const {
      name, mobile, email, gender, dob, age, bloodGroup, nationality, seatNumber, pickupPoint,
      emergencyContactName, emergencyContactPhone, roomSharing, foodPreference,
      isChild, isSeniorCitizen, needsExtraMattress, specialNotes,
      govIdType, govIdNumber, govIdDocumentUrl, medicalConditions, arrivalDetails, departureDetails,
      flightBookedByUs, pickupDropBookedByUs,
    } = req.body;
    if (!name?.trim()) { res.status(400).json({ success: false, error: 'Traveler name is required' }); return; }
    const validationError = validateTravelerInput(req.body);
    if (validationError) { res.status(400).json({ success: false, error: validationError }); return; }

    const dobDate = dob ? new Date(dob) : null;
    const resolvedAge = age !== undefined && age !== null && age !== '' ? Number(age) : (dobDate ? ageFromDob(dobDate) : null);

    const traveler = await prisma.traveler.create({
      data: {
        bookingId,
        name: name.trim(),
        mobile: mobile?.trim() || null,
        email: email?.trim() || null,
        gender: gender || null,
        dob: dobDate,
        age: resolvedAge,
        bloodGroup: bloodGroup?.trim() || null,
        nationality: nationality?.trim() || null,
        seatNumber: seatNumber?.trim() || null,
        pickupPoint: pickupPoint?.trim() || null,
        emergencyContactName: emergencyContactName?.trim() || null,
        emergencyContactPhone: emergencyContactPhone?.trim() || null,
        roomSharing: roomSharing || null,
        foodPreference: foodPreference || null,
        isChild: !!isChild,
        isSeniorCitizen: !!isSeniorCitizen,
        needsExtraMattress: !!needsExtraMattress,
        specialNotes: specialNotes?.trim() || null,
        govIdType: govIdType || null,
        govIdNumber: govIdNumber?.trim() || null,
        govIdDocumentUrl: govIdDocumentUrl?.trim() || null,
        medicalConditions: medicalConditions?.trim() || null,
        arrivalDetails: arrivalDetails?.trim() || null,
        departureDetails: departureDetails?.trim() || null,
        flightBookedByUs: flightBookedByUs === undefined ? null : (flightBookedByUs === null ? null : !!flightBookedByUs),
        pickupDropBookedByUs: pickupDropBookedByUs === undefined ? null : (pickupDropBookedByUs === null ? null : !!pickupDropBookedByUs),
      },
    });

    await prisma.activityLog.create({
      data: {
        action: 'Traveler Added',
        details: `Traveler ${traveler.name} added to booking ${booking.bookingNumber ?? booking.id}`,
        entityType: 'TRAVELER',
        entityId: traveler.id,
        userId: req.user!.id,
      },
    });
    if (booking.departureId) emitOperationsUpdated(booking.departureId);

    res.status(201).json({ success: true, data: traveler });
  } catch (e) {
    console.error('[operations] createTraveler error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

export const updateTraveler = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const existing = await prisma.traveler.findUnique({ where: { id }, include: { booking: true } });
    if (!existing) { res.status(404).json({ success: false, error: 'Traveler not found' }); return; }
    if (orgId(req) && existing.booking.organizationId !== orgId(req)) { res.status(404).json({ success: false, error: 'Traveler not found' }); return; }

    const b = req.body;
    const validationError = validateTravelerInput(b);
    if (validationError) { res.status(400).json({ success: false, error: validationError }); return; }

    const dobDate = b.dob !== undefined ? (b.dob ? new Date(b.dob) : null) : existing.dob;
    const resolvedAge = b.age !== undefined
      ? (b.age === null || b.age === '' ? null : Number(b.age))
      : (b.dob !== undefined && dobDate ? ageFromDob(dobDate) : existing.age);

    const traveler = await prisma.traveler.update({
      where: { id },
      data: {
        name: b.name !== undefined ? String(b.name).trim() : existing.name,
        mobile: b.mobile !== undefined ? b.mobile?.trim() || null : existing.mobile,
        email: b.email !== undefined ? b.email?.trim() || null : existing.email,
        gender: b.gender !== undefined ? b.gender || null : existing.gender,
        dob: dobDate,
        age: resolvedAge,
        bloodGroup: b.bloodGroup !== undefined ? b.bloodGroup?.trim() || null : existing.bloodGroup,
        nationality: b.nationality !== undefined ? b.nationality?.trim() || null : existing.nationality,
        seatNumber: b.seatNumber !== undefined ? b.seatNumber?.trim() || null : existing.seatNumber,
        pickupPoint: b.pickupPoint !== undefined ? b.pickupPoint?.trim() || null : existing.pickupPoint,
        emergencyContactName: b.emergencyContactName !== undefined ? b.emergencyContactName?.trim() || null : existing.emergencyContactName,
        emergencyContactPhone: b.emergencyContactPhone !== undefined ? b.emergencyContactPhone?.trim() || null : existing.emergencyContactPhone,
        roomSharing: b.roomSharing !== undefined ? b.roomSharing || null : existing.roomSharing,
        foodPreference: b.foodPreference !== undefined ? b.foodPreference || null : existing.foodPreference,
        isChild: b.isChild !== undefined ? !!b.isChild : existing.isChild,
        isSeniorCitizen: b.isSeniorCitizen !== undefined ? !!b.isSeniorCitizen : existing.isSeniorCitizen,
        needsExtraMattress: b.needsExtraMattress !== undefined ? !!b.needsExtraMattress : existing.needsExtraMattress,
        specialNotes: b.specialNotes !== undefined ? b.specialNotes?.trim() || null : existing.specialNotes,
        govIdType: b.govIdType !== undefined ? b.govIdType || null : existing.govIdType,
        govIdNumber: b.govIdNumber !== undefined ? b.govIdNumber?.trim() || null : existing.govIdNumber,
        govIdDocumentUrl: b.govIdDocumentUrl !== undefined ? b.govIdDocumentUrl?.trim() || null : existing.govIdDocumentUrl,
        medicalConditions: b.medicalConditions !== undefined ? b.medicalConditions?.trim() || null : existing.medicalConditions,
        arrivalDetails: b.arrivalDetails !== undefined ? b.arrivalDetails?.trim() || null : existing.arrivalDetails,
        departureDetails: b.departureDetails !== undefined ? b.departureDetails?.trim() || null : existing.departureDetails,
        flightBookedByUs: b.flightBookedByUs !== undefined ? (b.flightBookedByUs === null ? null : !!b.flightBookedByUs) : existing.flightBookedByUs,
        pickupDropBookedByUs: b.pickupDropBookedByUs !== undefined ? (b.pickupDropBookedByUs === null ? null : !!b.pickupDropBookedByUs) : existing.pickupDropBookedByUs,
      },
    });

    if (existing.booking.departureId) emitOperationsUpdated(existing.booking.departureId);
    res.json({ success: true, data: traveler });
  } catch (e) {
    console.error('[operations] updateTraveler error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

export const deleteTraveler = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const existing = await prisma.traveler.findUnique({ where: { id }, include: { booking: true } });
    if (!existing) { res.status(404).json({ success: false, error: 'Traveler not found' }); return; }
    if (orgId(req) && existing.booking.organizationId !== orgId(req)) { res.status(404).json({ success: false, error: 'Traveler not found' }); return; }

    await prisma.traveler.delete({ where: { id } });
    if (existing.booking.departureId) emitOperationsUpdated(existing.booking.departureId);
    res.json({ success: true, data: { id } });
  } catch (e) {
    console.error('[operations] deleteTraveler error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// ─── Traveler Portal review actions ──────────────────────────────────────────
// Mirrors payment.controller.ts's approve/reject/requestCorrection shape exactly.
// Operations only ever reviews what the customer submitted via the portal —
// Sales never manually enters traveler details after booking confirmation.

async function findTravelerOrFail(req: AuthenticatedRequest, res: Response, id: string) {
  const traveler = await prisma.traveler.findUnique({ where: { id }, include: { booking: { include: { lead: true } } } });
  if (!traveler) { res.status(404).json({ success: false, error: 'Traveler not found' }); return null; }
  if (orgId(req) && traveler.booking.organizationId !== orgId(req)) { res.status(404).json({ success: false, error: 'Traveler not found' }); return null; }
  return traveler;
}

export const approveTraveler = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const traveler = await findTravelerOrFail(req, res, id);
    if (!traveler) return;
    if (traveler.verificationStatus === 'VERIFIED') { res.status(400).json({ success: false, error: 'Traveler already verified' }); return; }

    const hasRealName = !!traveler.name?.trim() && !/^Traveler \d+$/.test(traveler.name.trim());
    if (!hasRealName || !traveler.gender) {
      res.status(400).json({ success: false, error: 'Cannot verify — Name and Gender must be filled in before approval.' });
      return;
    }

    const updated = await prisma.traveler.update({
      where: { id },
      data: { verificationStatus: 'VERIFIED', verifiedById: req.user!.id, verifiedAt: new Date(), verificationNote: null },
    });

    await prisma.activityLog.create({
      data: {
        action: 'Traveler Verified',
        details: `${traveler.name} verified by ${req.user?.name}`,
        entityType: 'TRAVELER', entityId: id, userId: req.user!.id, leadId: traveler.booking.leadId,
      },
    });
    if (traveler.booking.departureId) emitOperationsUpdated(traveler.booking.departureId);

    res.json({ success: true, data: updated });
  } catch (e) {
    console.error('[operations] approveTraveler error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

export const rejectTraveler = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    if (!reason?.trim()) { res.status(400).json({ success: false, error: 'Rejection reason is required' }); return; }

    const traveler = await findTravelerOrFail(req, res, id);
    if (!traveler) return;
    if (traveler.verificationStatus === 'VERIFIED') { res.status(400).json({ success: false, error: 'Cannot reject an already-verified traveler' }); return; }

    const updated = await prisma.traveler.update({
      where: { id },
      data: { verificationStatus: 'REJECTED', verificationNote: reason.trim() },
    });

    await prisma.activityLog.create({
      data: {
        action: 'Traveler Rejected',
        details: `${traveler.name} rejected by ${req.user?.name}: ${reason.trim()}`,
        entityType: 'TRAVELER', entityId: id, userId: req.user!.id, leadId: traveler.booking.leadId,
      },
    });
    if (traveler.booking.lead.assignedToId) {
      await createNotification(traveler.booking.lead.assignedToId, 'TRAVELER_REJECTED', 'Traveler Details Rejected',
        `${traveler.name}'s submitted details for ${traveler.booking.lead.name} were rejected: ${reason.trim()}`, traveler.booking.leadId);
    }
    if (traveler.booking.departureId) emitOperationsUpdated(traveler.booking.departureId);

    res.json({ success: true, data: updated });
  } catch (e) {
    console.error('[operations] rejectTraveler error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

export const requestTravelerCorrection = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { note } = req.body;
    if (!note?.trim()) { res.status(400).json({ success: false, error: 'A note explaining the correction needed is required' }); return; }

    const traveler = await findTravelerOrFail(req, res, id);
    if (!traveler) return;
    if (traveler.verificationStatus === 'VERIFIED') { res.status(400).json({ success: false, error: 'Cannot request correction on an already-verified traveler' }); return; }

    const updated = await prisma.traveler.update({
      where: { id },
      data: { verificationStatus: 'CORRECTION_REQUESTED', verificationNote: note.trim() },
    });

    await prisma.activityLog.create({
      data: {
        action: 'Traveler Correction Requested',
        details: `Correction requested for ${traveler.name} by ${req.user?.name}: ${note.trim()}`,
        entityType: 'TRAVELER', entityId: id, userId: req.user!.id, leadId: traveler.booking.leadId,
      },
    });
    if (traveler.booking.lead.assignedToId) {
      await createNotification(traveler.booking.lead.assignedToId, 'TRAVELER_CORRECTION_REQUESTED', 'Traveler Correction Requested',
        `Operations requested a correction on ${traveler.name}'s details for ${traveler.booking.lead.name}: ${note.trim()}`, traveler.booking.leadId);
    }
    if (traveler.booking.departureId) emitOperationsUpdated(traveler.booking.departureId);

    res.json({ success: true, data: updated });
  } catch (e) {
    console.error('[operations] requestTravelerCorrection error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// Ops needs a way to re-view/resend the link if it wasn't copied the first
// time, or to invalidate a compromised one — always issues a fresh token.
export const regenerateTravelerPortalLink = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { bookingId } = req.params;
    const booking = await prisma.booking.findFirst({ where: { id: bookingId, ...orgFilter(req) } });
    if (!booking) { res.status(404).json({ success: false, error: 'Booking not found' }); return; }

    const travelerPortalToken = await issueTravelerPortalToken(booking.id, booking.departureDate);

    await prisma.activityLog.create({
      data: {
        action: 'Traveler Portal Link Regenerated',
        details: `Portal link regenerated by ${req.user?.name}`,
        entityType: 'TRAVELER_PORTAL', entityId: booking.id, userId: req.user!.id, leadId: booking.leadId,
      },
    });

    res.json({ success: true, data: { travelerPortalToken } });
  } catch (e) {
    console.error('[operations] regenerateTravelerPortalLink error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// ─── Stay Planning ────────────────────────────────────────────────────────────
// Computes date-wise and package-wise stay requirements from all confirmed
// bookings. Each STAY night in the package itinerary is mapped to its actual
// calendar date using: departureDate + Math.floor(dayOffset / 2).

const ROOM_CAP: Record<string, number> = { SINGLE: 1, DOUBLE: 2, TRIPLE: 3, QUAD: 4 };

function calcRoomsForBookings(bookings: { numberOfTravelers: number; roomSharing: string }[]) {
  const rooms = { SINGLE: 0, DOUBLE: 0, TRIPLE: 0, QUAD: 0 };
  for (const b of bookings) {
    const type = (b.roomSharing || 'DOUBLE') as keyof typeof rooms;
    const cap = ROOM_CAP[type] ?? 2;
    rooms[type] += Math.ceil(b.numberOfTravelers / cap);
  }
  return { ...rooms, total: rooms.SINGLE + rooms.DOUBLE + rooms.TRIPLE + rooms.QUAD };
}

function calcVehiclesForPax(pax: number) {
  const SIZES = [54, 40, 26, 20, 12];
  const LABELS: Record<number, string> = {
    54: '54-Seater Bus', 40: '40-Seater Bus', 26: '26-Seater Bus',
    20: '20-Seater Tempo Traveller', 12: '12-Seater Tempo Traveller',
  };
  const result: { type: string; count: number; seats: number }[] = [];
  let rem = pax;
  for (const sz of SIZES) {
    if (rem <= 0) break;
    const n = Math.floor(rem / sz);
    if (n > 0) { result.push({ type: LABELS[sz], count: n, seats: sz * n }); rem -= sz * n; }
  }
  if (rem > 0) result.push({ type: '12-Seater Tempo Traveller', count: 1, seats: 12 });
  return result;
}

// ─── Shared date+location aggregation engine ───────────────────────────────
// Used by both getStayPlan and getRoomsRequired so the two views can never
// disagree about what's actually required on a given date/location.

type BookingInfo = {
  bookingId: string;
  bookingNumber: string | null;
  travelerName: string;
  numberOfTravelers: number;
  roomSharing: string;
  specialRequest: string | null;
  salesExecutive: { id: string; name: string } | null;
};

type PkgBreakdown = {
  packageId: string;
  packageName: string;
  packageType: string | null; // GIT | FIT | null (no package)
  guestCount: number;
  rooms: { SINGLE: number; DOUBLE: number; TRIPLE: number; QUAD: number; total: number };
  departureIds: string[];
  checkOutDate: string;
  nights: number;
  bookings: BookingInfo[];
};

type DestEntry = {
  guestCount: number;
  rooms: { SINGLE: number; DOUBLE: number; TRIPLE: number; QUAD: number; total: number };
  vehicles: { type: string; count: number; seats: number }[];
  departureIds: string[];
  packageNames: string[];
  checkOutDate: string;
  nights: number;
  breakdown: Record<string, PkgBreakdown>;
};

function addDaysStr(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

async function buildStayDateMap(req: AuthenticatedRequest) {
  const activeUpcomingFilter = { ...orgFilter(req), status: { in: ['UPCOMING', 'ACTIVE'] } } as const;
  const departures = await prisma.departure.findMany({
    where: activeUpcomingFilter,
    include: {
      bookings: {
        where: { status: { not: 'CANCELLED' } },
        select: {
          id: true, bookingNumber: true, travelerName: true, numberOfTravelers: true,
          roomSharing: true, specialRequest: true, salesExecutiveId: true,
        },
      },
      package: {
        select: {
          id: true, name: true, code: true, nights: true, packageType: true,
          itineraryItems: {
            where: { taskType: 'TRIP_DAY' },
            select: { dayOffset: true, title: true, notes: true, description: true },
            orderBy: { dayOffset: 'asc' },
          },
        },
      },
    },
    orderBy: { departureDate: 'asc' },
  });

  // salesExecutiveId has no Prisma relation defined on Booking (plain scalar,
  // matching the organizationId pattern elsewhere) — resolve names with one
  // batched lookup instead of a per-row query.
  const salesExecIds = Array.from(new Set(
    departures.flatMap((d) => d.bookings.map((b) => b.salesExecutiveId).filter((id): id is string => !!id))
  ));
  const salesExecs = salesExecIds.length
    ? await prisma.user.findMany({ where: { id: { in: salesExecIds } }, select: { id: true, name: true } })
    : [];
  const salesExecById = new Map(salesExecs.map((u) => [u.id, u]));

  const dateMap: Record<string, Record<string, DestEntry>> = {};

  for (const dep of departures) {
    const depDate = new Date(dep.departureDate);
    depDate.setHours(0, 0, 0, 0);
    const items = dep.package?.itineraryItems ?? [];
    const totalGuests = dep.bookings.reduce((s, b) => s + b.numberOfTravelers, 0);
    if (totalGuests === 0) continue;

    const rooms = calcRoomsForBookings(dep.bookings);

    // Turn each STAY night into its calendar date, then collapse consecutive
    // nights at the SAME location into one stay block (checkIn → checkOut).
    // This is what makes "Manali Night 1 + Night 2" show as one 2-night stay
    // instead of two identical, independently-counted entries — and it's why
    // vehicles/rooms below get computed once per block, not once per night.
    // A package that returns to the same city later (Night 1 Manali, Night 2
    // Kasol, Night 3 Manali) still gets two separate blocks, because the
    // nights aren't consecutive.
    const nights = items
      .filter((item) => item.notes === 'STAY')
      .map((item) => {
        const dayIndex = Math.floor(item.dayOffset / 2);
        const date = new Date(depDate);
        date.setDate(date.getDate() + dayIndex);
        return {
          dateStr: date.toISOString().split('T')[0],
          dest: (item.description || dep.destination || '').trim() || 'Unknown',
        };
      });

    type StayBlock = { dest: string; checkIn: string; checkOut: string; nights: number };
    const blocks: StayBlock[] = [];
    for (const n of nights) {
      const last = blocks[blocks.length - 1];
      if (last && last.dest === n.dest && last.checkOut === n.dateStr) {
        last.checkOut = addDaysStr(n.dateStr, 1);
        last.nights += 1;
      } else {
        blocks.push({ dest: n.dest, checkIn: n.dateStr, checkOut: addDaysStr(n.dateStr, 1), nights: 1 });
      }
    }

    for (const block of blocks) {
      const dateStr = block.checkIn;
      const dest = block.dest;

      if (!dateMap[dateStr]) dateMap[dateStr] = {};
      if (!dateMap[dateStr][dest]) {
        dateMap[dateStr][dest] = {
          guestCount: 0,
          rooms: { SINGLE: 0, DOUBLE: 0, TRIPLE: 0, QUAD: 0, total: 0 },
          vehicles: [],
          departureIds: [],
          packageNames: [],
          checkOutDate: block.checkOut,
          nights: block.nights,
          breakdown: {},
        };
      }
      const entry = dateMap[dateStr][dest];
      entry.guestCount += totalGuests;
      entry.rooms.SINGLE += rooms.SINGLE;
      entry.rooms.DOUBLE += rooms.DOUBLE;
      entry.rooms.TRIPLE += rooms.TRIPLE;
      entry.rooms.QUAD += rooms.QUAD;
      entry.rooms.total += rooms.total;
      // The whole point of this entry is one date+location bucket — if two
      // departures share it but leave on different days, show the longer
      // stay so Ops books rooms for the full window either group needs.
      if (block.checkOut > entry.checkOutDate) { entry.checkOutDate = block.checkOut; entry.nights = block.nights; }
      if (!entry.departureIds.includes(dep.id)) {
        entry.departureIds.push(dep.id);
        entry.packageNames.push(dep.package?.name ?? dep.destination);
      }
      // Vehicles are computed once per stay block (not once per night it
      // spans) — a 2-night Manali stay needs one transfer in, not two.
      entry.vehicles = calcVehiclesForPax(entry.guestCount);

      // Per-package breakdown — same date+location, multiple packages
      // overlapping (e.g. 4 different Manali packages all with a Day-1
      // Manali night) each get their own row inside the same total.
      const pkgKey = dep.package?.id ?? `__no_package__${dep.destination}`;
      if (!entry.breakdown[pkgKey]) {
        entry.breakdown[pkgKey] = {
          packageId: dep.package?.id ?? '',
          packageName: dep.package?.name ?? dep.destination,
          packageType: dep.package?.packageType ?? null,
          guestCount: 0,
          rooms: { SINGLE: 0, DOUBLE: 0, TRIPLE: 0, QUAD: 0, total: 0 },
          departureIds: [],
          checkOutDate: block.checkOut,
          nights: block.nights,
          bookings: [],
        };
      }
      const pb = entry.breakdown[pkgKey];
      pb.guestCount += totalGuests;
      pb.rooms.SINGLE += rooms.SINGLE;
      pb.rooms.DOUBLE += rooms.DOUBLE;
      pb.rooms.TRIPLE += rooms.TRIPLE;
      pb.rooms.QUAD += rooms.QUAD;
      pb.rooms.total += rooms.total;
      if (block.checkOut > pb.checkOutDate) { pb.checkOutDate = block.checkOut; pb.nights = block.nights; }
      if (!pb.departureIds.includes(dep.id)) {
        pb.departureIds.push(dep.id);
        for (const b of dep.bookings) {
          pb.bookings.push({
            bookingId: b.id,
            bookingNumber: b.bookingNumber,
            travelerName: b.travelerName,
            numberOfTravelers: b.numberOfTravelers,
            roomSharing: b.roomSharing,
            specialRequest: b.specialRequest,
            salesExecutive: b.salesExecutiveId ? (salesExecById.get(b.salesExecutiveId) ?? null) : null,
          });
        }
      }
    }
  }

  return { dateMap, departures };
}

export const getStayPlan = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { dateMap, departures } = await buildStayDateMap(req);

    // packageId → dates
    type PkgDate = { date: string; destination: string; guestCount: number };
    const packageMap: Record<string, { packageId: string; packageName: string; dates: PkgDate[] }> = {};

    for (const dep of departures) {
      const depDate = new Date(dep.departureDate);
      depDate.setHours(0, 0, 0, 0);
      const items = dep.package?.itineraryItems ?? [];
      const totalGuests = dep.bookings.reduce((s, b) => s + b.numberOfTravelers, 0);
      if (totalGuests === 0 || !dep.package) continue;

      const pkgId = dep.package.id;
      if (!packageMap[pkgId]) {
        packageMap[pkgId] = { packageId: pkgId, packageName: dep.package.name, dates: [] };
      }
      for (const item of items) {
        if (item.notes !== 'STAY') continue;
        const dayIndex = Math.floor(item.dayOffset / 2);
        const date = new Date(depDate);
        date.setDate(date.getDate() + dayIndex);
        const dateStr = date.toISOString().split('T')[0];
        const dest = (item.description || dep.destination || '').trim() || 'Unknown';
        const existing = packageMap[pkgId].dates.find((d) => d.date === dateStr && d.destination === dest);
        if (existing) existing.guestCount += totalGuests;
        else packageMap[pkgId].dates.push({ date: dateStr, destination: dest, guestCount: totalGuests });
      }
    }

    const dateWise = Object.entries(dateMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, destMap]) => ({
        date,
        entries: Object.entries(destMap)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([destination, data]) => ({
            destination,
            ...data,
            breakdown: Object.values(data.breakdown).sort((a, b) => b.rooms.total - a.rooms.total),
          })),
      }));

    const packageWise = Object.values(packageMap)
      .sort((a, b) => a.packageName.localeCompare(b.packageName))
      .map((p) => ({ ...p, dates: p.dates.sort((a, b) => a.date.localeCompare(b.date)) }));

    res.json({ success: true, data: { dateWise, packageWise } });
  } catch (e: any) {
    console.error('[operations] getStayPlan error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// ─── Rooms Required — date → location → required/booked/pending/status ────
// Same aggregation engine as getStayPlan, plus a real "booked" count pulled
// from actual Hotel records so Operations can see at a glance what's still
// outstanding, without manually cross-checking departures one by one.

export const getRoomsRequired = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { dateMap, departures } = await buildStayDateMap(req);
    const allDepartureIds = departures.map((d) => d.id);

    const hotels = allDepartureIds.length
      ? await prisma.hotel.findMany({
          where: { departureId: { in: allDepartureIds }, status: 'CONFIRMED' },
          select: { departureId: true, location: true, checkInDate: true, numberOfRooms: true },
        })
      : [];

    // departureId → location (lowercased, trimmed) → checkInDate-keyed room counts,
    // plus a fallback bucket (no checkInDate recorded) for backward compatibility
    // with hotels booked before this date-aware attribution existed.
    type HotelBucket = { byDate: Record<string, number>; noDate: number };
    const hotelIndex: Record<string, Record<string, HotelBucket>> = {};
    for (const h of hotels) {
      if (!h.departureId || !h.location) continue;
      const loc = h.location.trim().toLowerCase();
      if (!loc) continue;
      if (!hotelIndex[h.departureId]) hotelIndex[h.departureId] = {};
      if (!hotelIndex[h.departureId][loc]) hotelIndex[h.departureId][loc] = { byDate: {}, noDate: 0 };
      const bucket = hotelIndex[h.departureId][loc];
      if (h.checkInDate) {
        const key = h.checkInDate.toISOString().split('T')[0];
        bucket.byDate[key] = (bucket.byDate[key] ?? 0) + (h.numberOfRooms ?? 0);
      } else {
        bucket.noDate += h.numberOfRooms ?? 0;
      }
    }

    // departureId → location → set of distinct dates that location appears
    // on for that departure. A package can revisit the same city on
    // non-adjacent nights (Manali Night 1 and Night 3) — when that happens,
    // an un-dated legacy hotel entry can't be safely attributed to either
    // night, so it's excluded rather than risking double-counting it into
    // both.
    const depLocationDates: Record<string, Record<string, Set<string>>> = {};
    for (const [date, destMap] of Object.entries(dateMap)) {
      for (const [destination, data] of Object.entries(destMap)) {
        const loc = destination.trim().toLowerCase();
        for (const depId of data.departureIds) {
          if (!depLocationDates[depId]) depLocationDates[depId] = {};
          if (!depLocationDates[depId][loc]) depLocationDates[depId][loc] = new Set();
          depLocationDates[depId][loc].add(date);
        }
      }
    }

    const dateWise = Object.entries(dateMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, destMap]) => ({
        date,
        entries: Object.entries(destMap)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([destination, data]) => {
            const loc = destination.trim().toLowerCase();
            let booked = 0;
            for (const depId of data.departureIds) {
              const bucket = hotelIndex[depId]?.[loc];
              if (!bucket) continue;
              // Prefer an exact date match; only fall back to the
              // undated bucket when this departure has just one
              // occurrence of this location (otherwise we can't tell
              // which night an undated hotel entry belongs to, and
              // guessing risks double-counting).
              booked += bucket.byDate[date] ?? 0;
              const occurrences = depLocationDates[depId]?.[loc]?.size ?? 1;
              if (!bucket.byDate[date] && occurrences <= 1) booked += bucket.noDate;
            }
            const required = data.rooms.total;
            const pending = Math.max(0, required - booked);
            const status = booked === 0 ? 'PENDING' : booked >= required ? (booked > required ? 'OVERBOOKED' : 'FULLY_BOOKED') : 'PARTIALLY_BOOKED';
            return {
              destination,
              ...data,
              breakdown: Object.values(data.breakdown).sort((a, b) => b.rooms.total - a.rooms.total),
              roomsBooked: booked,
              roomsPending: pending,
              status,
            };
          }),
      }));

    res.json({ success: true, data: { dateWise } });
  } catch (e: any) {
    console.error('[operations] getRoomsRequired error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};
