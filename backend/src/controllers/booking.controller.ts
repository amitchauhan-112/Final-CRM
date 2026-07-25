import { Response } from 'express';
import prisma from '../lib/prisma.js';
import { AuthenticatedRequest } from '../types/index.js';
import { generateTasksFromItinerary } from './bookingTask.controller.js';
import { linkBookingToDeparture, createPlaceholderTravelers, issueTravelerPortalToken } from './departure.controller.js';
import { generatePaymentSchedule } from './paymentSchedule.controller.js';
import { notifyFinanceTeam } from '../services/notification.service.js';
import { fireEvent } from '../services/automationEngine.service.js';

const orgId = (req: AuthenticatedRequest) => req.user?.organizationId ?? null;

// ─── Get booking by lead ──────────────────────────────────────────────────────

export const getBookingByLead = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { leadId } = req.params;
    const booking = await prisma.booking.findFirst({
      where: { leadId, ...(orgId(req) ? { organizationId: orgId(req) } : {}) },
      include: {
        package: { select: { id: true, name: true, code: true, nights: true, days: true } },
        payments: {
          include: { recordedBy: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'desc' },
        },
        tasks: {
          include: { assignee: { select: { id: true, name: true } } },
          orderBy: [{ dueDate: 'asc' }],
        },
      },
    });
    if (!booking) { res.status(404).json({ success: false, error: 'Booking not found' }); return; }
    res.json({ success: true, data: booking });
  } catch {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// ─── Create booking ───────────────────────────────────────────────────────────

export const createBooking = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const {
      leadId, travelerName, numberOfTravelers, aadharNumber,
      foodPreference, roomSharing, departureLocation, departurePackage,
      tourType, specialRequest, finalPrice, amountPaid, balanceDueDate,
      packageId, departureDate, returnDate, bookingNotes,
      paymentMode, paymentMethod, paymentReference, handedOverTo,
    } = req.body;

    if (!leadId) { res.status(400).json({ success: false, error: 'leadId is required' }); return; }
    if (!travelerName?.trim()) { res.status(400).json({ success: false, error: 'Traveler name is required' }); return; }
    if (!numberOfTravelers || isNaN(Number(numberOfTravelers))) { res.status(400).json({ success: false, error: 'Number of travelers is required' }); return; }
    if (finalPrice === undefined || isNaN(Number(finalPrice))) { res.status(400).json({ success: false, error: 'Final price is required' }); return; }
    if (aadharNumber && !/^\d{12}$/.test(String(aadharNumber).replace(/\s/g, ''))) {
      res.status(400).json({ success: false, error: 'Aadhar number must be 12 digits' }); return;
    }
    if (amountPaid !== undefined && Number(amountPaid) > Number(finalPrice)) {
      res.status(400).json({ success: false, error: 'Amount paid cannot exceed the final price' }); return;
    }
    if (departureDate && returnDate && new Date(returnDate) < new Date(departureDate)) {
      res.status(400).json({ success: false, error: 'Return date cannot be before departure date' }); return;
    }

    // amountPaid is never credited directly — it only increases once Finance
    // verifies a payment (see payment.controller.ts). The advance entered here
    // becomes a PENDING Payment below, and the booking starts fully outstanding.
    const paid = Number(amountPaid ?? 0);
    const price = Number(finalPrice);
    const balance = price;
    const depDate = departureDate ? new Date(departureDate) : null;

    // Auto-generate booking number: BKG-YYYYMMDD-XXXX
    const today = new Date();
    const datePart = today.toISOString().slice(0, 10).replace(/-/g, '');
    const rand = Math.floor(1000 + Math.random() * 9000);
    const bookingNumber = `BKG-${datePart}-${rand}`;

    const [booking] = await prisma.$transaction([
      prisma.booking.upsert({
        where: { leadId },
        create: {
          leadId,
          organizationId: orgId(req),
          bookingNumber,
          packageId: packageId || null,
          travelerName: travelerName.trim(),
          numberOfTravelers: Number(numberOfTravelers),
          aadharNumber: aadharNumber?.trim() || null,
          foodPreference: foodPreference || 'NO_PREFERENCE',
          roomSharing: roomSharing || 'DOUBLE',
          departureLocation: departureLocation?.trim() || null,
          departurePackage: departurePackage?.trim() || null,
          tourType: tourType || 'GIT',
          specialRequest: specialRequest?.trim() || null,
          bookingNotes: bookingNotes?.trim() || null,
          finalPrice: price,
          amountPaid: 0,
          balanceAmount: balance,
          balanceDueDate: balanceDueDate ? new Date(balanceDueDate) : null,
          departureDate: depDate,
          returnDate: returnDate ? new Date(returnDate) : null,
        },
        update: {
          packageId: packageId !== undefined ? packageId || null : undefined,
          travelerName: travelerName.trim(),
          numberOfTravelers: Number(numberOfTravelers),
          aadharNumber: aadharNumber?.trim() || null,
          foodPreference: foodPreference || 'NO_PREFERENCE',
          roomSharing: roomSharing || 'DOUBLE',
          departureLocation: departureLocation?.trim() || null,
          departurePackage: departurePackage?.trim() || null,
          tourType: tourType || 'GIT',
          specialRequest: specialRequest?.trim() || null,
          bookingNotes: bookingNotes?.trim() || null,
          finalPrice: price,
          // amountPaid/balanceAmount intentionally omitted here — re-submitting
          // this form for an already-confirmed lead must not reset already
          // Finance-verified collections back to 0.
          balanceDueDate: balanceDueDate ? new Date(balanceDueDate) : null,
          departureDate: depDate,
          returnDate: returnDate ? new Date(returnDate) : null,
        },
      }),
      prisma.lead.update({
        where: { id: leadId },
        data: { status: 'CONFIRMED' },
      }),
    ]);

    // Record advance payment as PENDING — it only credits amountPaid once
    // Finance verifies it (see payment.controller.ts approvePayment).
    if (paid > 0) {
      const resolvedMethod = paymentMode === 'CASH' ? 'CASH' : (paymentMethod === 'BANK_TRANSFER' ? 'BANK_TRANSFER' : 'UPI');
      const resolvedNotes = paymentMode === 'CASH' && handedOverTo
        ? `Cash received — handed to: ${handedOverTo}`
        : 'Initial payment at booking';
      await prisma.payment.create({
        data: {
          bookingId: booking.id,
          amount: paid,
          type: 'ADVANCE',
          method: resolvedMethod,
          notes: resolvedNotes,
          reference: paymentReference || null,
          status: 'PENDING',
          recordedById: req.user!.id,
        },
      });
      await notifyFinanceTeam(
        orgId(req),
        'NEW_PAYMENT_SUBMITTED',
        'New Payment Awaiting Verification',
        `${travelerName.trim()} — ₹${paid.toLocaleString()} advance payment needs verification (Booking ${bookingNumber}).`
      );
    }

    // Auto-generate tasks from package itinerary if package + departure date provided
    if (packageId && depDate) {
      const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { assignedToId: true } });
      await generateTasksFromItinerary(booking.id, packageId, depDate, lead?.assignedToId ?? undefined).catch(console.error);
    }

    // Create notification for lead assignee
    const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { assignedToId: true, destination: true, phone: true, email: true } });
    if (lead?.assignedToId) {
      await prisma.notification.create({
        data: {
          type: 'LEAD_STATUS_CHANGED',
          title: 'Booking Confirmed',
          message: `Booking ${bookingNumber} created — ${numberOfTravelers} traveler(s), ₹${price.toLocaleString()}`,
          userId: lead.assignedToId,
          leadId,
        },
      });
    }

    await prisma.activityLog.create({
      data: {
        action: 'Lead Confirmed',
        details: `Booking ${bookingNumber} created — ${numberOfTravelers} traveler(s), ₹${price.toLocaleString()} finalised`,
        userId: req.user!.id,
        leadId,
      },
    });

    // Auto-link to (or create) a Departure so this booking appears in the
    // Operations Panel without any manual action there.
    if (depDate) {
      let destination = departureLocation?.trim() || lead?.destination || 'Unspecified';
      let tripDays = 1;
      if (packageId) {
        const pkg = await prisma.package.findUnique({ where: { id: packageId }, include: { destination: true } });
        if (pkg?.destination?.name) destination = pkg.destination.name;
        if (pkg?.days) tripDays = pkg.days;
      }
      await linkBookingToDeparture(booking.id, orgId(req), packageId || null, depDate, destination, tripDays).catch(console.error);
    }

    // Materialize the headcount into real per-traveler placeholder records —
    // Traveler 1 is seeded with the booking contact's name/phone/email, since
    // that's who almost always ends up being the first traveler — and issue a
    // Traveler Portal link (only if this booking doesn't already have one) so
    // the customer can submit the rest of their own details.
    await createPlaceholderTravelers(booking.id, Number(numberOfTravelers), {
      name: travelerName, mobile: lead?.phone, email: lead?.email,
    }).catch(console.error);
    await generatePaymentSchedule(booking.id, price, depDate).catch(console.error);
    let travelerPortalToken: string | null = null;
    if (!booking.travelerPortalTokenHash) {
      travelerPortalToken = await issueTravelerPortalToken(booking.id, depDate).catch(() => null);
    }

    // Additive — any admin-defined BOOKING_CONFIRMED automation rules fire
    // here, alongside (not instead of) the cascade above.
    await fireEvent('BOOKING_CONFIRMED', {
      leadId, bookingId: booking.id, assignedToId: lead?.assignedToId ?? undefined,
      organizationId: orgId(req), finalPrice: price, packageId: packageId || undefined,
      destination: lead?.destination ?? undefined,
    }).catch((err) => console.error('[automation] BOOKING_CONFIRMED fireEvent error:', err));

    // Return the full booking with relations
    const fullBooking = await prisma.booking.findUnique({
      where: { id: booking.id },
      include: {
        package: { select: { id: true, name: true, code: true } },
        payments: { include: { recordedBy: { select: { id: true, name: true } } } },
        tasks: { orderBy: [{ dueDate: 'asc' }] },
      },
    });

    // travelerPortalToken is only ever present in this one response — only its
    // hash is persisted, so this is Operations' one chance to copy the link.
    res.status(201).json({ success: true, data: { ...fullBooking, travelerPortalToken } });
  } catch (e) {
    console.error('[bookings] createBooking error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// ─── Update booking ───────────────────────────────────────────────────────────

export const updateBooking = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const existing = await prisma.booking.findFirst({
      where: { id, ...(orgId(req) ? { organizationId: orgId(req) } : {}) },
    });
    if (!existing) { res.status(404).json({ success: false, error: 'Booking not found' }); return; }

    const {
      travelerName, numberOfTravelers, aadharNumber,
      foodPreference, roomSharing, departureLocation, departurePackage,
      tourType, specialRequest, bookingNotes, finalPrice,
      balanceDueDate, status, packageId, departureDate, returnDate,
    } = req.body;

    if (aadharNumber && !/^\d{12}$/.test(String(aadharNumber).replace(/\s/g, ''))) {
      res.status(400).json({ success: false, error: 'Aadhar number must be 12 digits' }); return;
    }
    const effectiveDepartureDate = departureDate !== undefined ? departureDate : existing.departureDate;
    const effectiveReturnDate = returnDate !== undefined ? returnDate : existing.returnDate;
    if (effectiveDepartureDate && effectiveReturnDate && new Date(effectiveReturnDate) < new Date(effectiveDepartureDate)) {
      res.status(400).json({ success: false, error: 'Return date cannot be before departure date' }); return;
    }

    // amountPaid is intentionally not accepted here — it only changes via
    // Finance payment verification (payment.controller.ts) or a paid Refund.
    // finalPrice can still change, so balance is recomputed against the
    // existing (verified) amountPaid, not a client-supplied one.
    const price = finalPrice !== undefined ? Number(finalPrice) : existing.finalPrice;
    const paid = existing.amountPaid;
    const balance = Math.max(0, price - paid);

    const booking = await prisma.booking.update({
      where: { id },
      data: {
        travelerName: travelerName?.trim() ?? existing.travelerName,
        numberOfTravelers: numberOfTravelers !== undefined ? Number(numberOfTravelers) : existing.numberOfTravelers,
        aadharNumber: aadharNumber !== undefined ? aadharNumber?.trim() || null : existing.aadharNumber,
        foodPreference: foodPreference ?? existing.foodPreference,
        roomSharing: roomSharing ?? existing.roomSharing,
        departureLocation: departureLocation !== undefined ? departureLocation?.trim() || null : existing.departureLocation,
        departurePackage: departurePackage !== undefined ? departurePackage?.trim() || null : existing.departurePackage,
        tourType: tourType ?? existing.tourType,
        specialRequest: specialRequest !== undefined ? specialRequest?.trim() || null : existing.specialRequest,
        bookingNotes: bookingNotes !== undefined ? bookingNotes?.trim() || null : existing.bookingNotes,
        finalPrice: price,
        amountPaid: paid,
        balanceAmount: balance,
        balanceDueDate: balanceDueDate !== undefined ? (balanceDueDate ? new Date(balanceDueDate) : null) : existing.balanceDueDate,
        status: status ?? existing.status,
        packageId: packageId !== undefined ? packageId || null : existing.packageId,
        departureDate: departureDate !== undefined ? (departureDate ? new Date(departureDate) : null) : existing.departureDate,
        returnDate: returnDate !== undefined ? (returnDate ? new Date(returnDate) : null) : existing.returnDate,
      },
      include: {
        package: { select: { id: true, name: true, code: true } },
        payments: { include: { recordedBy: { select: { id: true, name: true } } }, orderBy: { createdAt: 'desc' } },
        tasks: { include: { assignee: { select: { id: true, name: true } } }, orderBy: [{ dueDate: 'asc' }] },
      },
    });

    // Diff the fields an Admin/audit trail would actually care about — not
    // every column, just the ones that carry meaning when they change.
    const diffFields = ['travelerName', 'numberOfTravelers', 'finalPrice', 'status', 'packageId', 'departureDate', 'returnDate', 'balanceDueDate'] as const;
    const oldValue: Record<string, unknown> = {};
    const newValue: Record<string, unknown> = {};
    for (const field of diffFields) {
      const before = existing[field];
      const after = booking[field];
      const beforeStr = before instanceof Date ? before.toISOString() : before;
      const afterStr = after instanceof Date ? after.toISOString() : after;
      if (beforeStr !== afterStr) { oldValue[field] = before; newValue[field] = after; }
    }

    await prisma.activityLog.create({
      data: {
        action: 'Booking Updated',
        details: `Booking details updated by ${req.user?.name}`,
        userId: req.user!.id,
        leadId: existing.leadId,
        oldValue: Object.keys(oldValue).length ? oldValue : undefined,
        newValue: Object.keys(newValue).length ? newValue : undefined,
      },
    });

    // Re-link to a Departure if the departure date or package changed.
    const leadForDest = await prisma.lead.findUnique({ where: { id: existing.leadId }, select: { destination: true, phone: true, email: true } });
    if (booking.departureDate) {
      let destination = booking.departureLocation?.trim() || leadForDest?.destination || 'Unspecified';
      let tripDays = 1;
      if (booking.packageId) {
        const pkg = await prisma.package.findUnique({ where: { id: booking.packageId }, include: { destination: true } });
        if (pkg?.destination?.name) destination = pkg.destination.name;
        if (pkg?.days) tripDays = pkg.days;
      }
      await linkBookingToDeparture(booking.id, orgId(req), booking.packageId || null, booking.departureDate, destination, tripDays).catch(console.error);
    }

    // Top up traveler placeholders if the headcount grew, and back-fill a
    // Traveler Portal link for any booking confirmed before this feature shipped.
    await createPlaceholderTravelers(booking.id, booking.numberOfTravelers, {
      name: booking.travelerName, mobile: leadForDest?.phone, email: leadForDest?.email,
    }).catch(console.error);
    await generatePaymentSchedule(booking.id, booking.finalPrice, booking.departureDate).catch(console.error);
    let travelerPortalToken: string | null = null;
    if (!booking.travelerPortalTokenHash) {
      travelerPortalToken = await issueTravelerPortalToken(booking.id, booking.departureDate).catch(() => null);
    }

    res.json({ success: true, data: { ...booking, travelerPortalToken } });
  } catch {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// ─── Journey Tracker terminal stages ─────────────────────────────────────────
// Review/referral collection has no dedicated workflow in this app yet — these
// are simple one-click "mark as done" actions so the journey tracker can
// actually reach its last two stages.
export const markReviewCollected = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const existing = await prisma.booking.findFirst({ where: { id, ...(orgId(req) ? { organizationId: orgId(req) } : {}) } });
    if (!existing) { res.status(404).json({ success: false, error: 'Booking not found' }); return; }

    const booking = await prisma.booking.update({
      where: { id },
      data: { reviewSubmittedAt: existing.reviewSubmittedAt ?? new Date() },
    });
    res.json({ success: true, data: booking });
  } catch {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

export const markReferralReceived = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const existing = await prisma.booking.findFirst({ where: { id, ...(orgId(req) ? { organizationId: orgId(req) } : {}) } });
    if (!existing) { res.status(404).json({ success: false, error: 'Booking not found' }); return; }

    const booking = await prisma.booking.update({
      where: { id },
      data: { referralReceivedAt: existing.referralReceivedAt ?? new Date() },
    });
    res.json({ success: true, data: booking });
  } catch {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};
