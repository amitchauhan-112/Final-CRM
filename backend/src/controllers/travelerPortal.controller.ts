import { Request, Response } from 'express';
import { createHash } from 'node:crypto';
import prisma from '../lib/prisma.js';
import { notifyOperationsTeam } from '../services/notification.service.js';
import { validateTravelerInput } from '../utils/travelerValidation.js';
import { buildUploadUrl } from '../middleware/upload.js';

// ─── Traveler Portal (public, token-gated — no authenticate middleware) ─────
// The only surface in the app a customer can reach without logging in. Every
// handler resolves the booking strictly through the hashed token; nothing here
// trusts a bookingId/travelerId from the URL alone.

function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

async function resolveBookingByToken(rawToken: string) {
  const tokenHash = hashToken(rawToken);
  const booking = await prisma.booking.findUnique({
    where: { travelerPortalTokenHash: tokenHash },
    include: {
      package: { select: { name: true, code: true, nights: true, days: true } },
      lead: { select: { name: true, destination: true } },
      travelers: { orderBy: { createdAt: 'asc' } },
    },
  });
  if (!booking) return null;
  if (booking.travelerPortalTokenExpiresAt && booking.travelerPortalTokenExpiresAt < new Date()) return null;
  return booking;
}

// ─── GET /portal/:token ───────────────────────────────────────────────────────

export const getPortalBooking = async (req: Request, res: Response): Promise<void> => {
  try {
    const booking = await resolveBookingByToken(req.params.token);
    if (!booking) { res.status(404).json({ success: false, error: 'This link is invalid or has expired. Please contact your travel agent for a new one.' }); return; }

    const paymentSchedule = await prisma.paymentScheduleItem.findMany({
      where: { bookingId: booking.id },
      orderBy: { sequence: 'asc' },
    });

    res.json({
      success: true,
      data: {
        bookingNumber: booking.bookingNumber,
        customerName: booking.lead.name,
        destination: booking.lead.destination,
        package: booking.package,
        departureDate: booking.departureDate,
        returnDate: booking.returnDate,
        numberOfTravelers: booking.numberOfTravelers,
        finalPrice: booking.finalPrice,
        amountPaid: booking.amountPaid,
        balanceAmount: booking.balanceAmount,
        travelers: booking.travelers,
        paymentSchedule,
      },
    });
  } catch (e) {
    console.error('[travelerPortal] getPortalBooking error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// ─── PUT /portal/:token/travelers/:travelerId ────────────────────────────────
// The customer submits their own details — this is the one place in the whole
// app where a traveler record is edited by anyone other than Operations.

export const submitTravelerDetails = async (req: Request, res: Response): Promise<void> => {
  try {
    const booking = await resolveBookingByToken(req.params.token);
    if (!booking) { res.status(404).json({ success: false, error: 'This link is invalid or has expired.' }); return; }

    const traveler = booking.travelers.find((t) => t.id === req.params.travelerId);
    if (!traveler) { res.status(404).json({ success: false, error: 'Traveler not found on this booking.' }); return; }
    if (traveler.verificationStatus === 'VERIFIED') {
      res.status(400).json({ success: false, error: 'These details are already verified. Contact your travel agent if something needs to change.' });
      return;
    }

    const b = req.body;
    const validationError = validateTravelerInput(b);
    if (validationError) { res.status(400).json({ success: false, error: validationError }); return; }

    const dobDate = b.dob !== undefined ? (b.dob ? new Date(b.dob) : null) : traveler.dob;
    const resolvedAge = b.age !== undefined
      ? (b.age === null || b.age === '' ? null : Number(b.age))
      : dobDate
        ? (() => {
            const today = new Date();
            let age = today.getFullYear() - dobDate.getFullYear();
            const monthDiff = today.getMonth() - dobDate.getMonth();
            if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dobDate.getDate())) age--;
            return age;
          })()
        : traveler.age;

    const updated = await prisma.traveler.update({
      where: { id: traveler.id },
      data: {
        name: b.name !== undefined ? String(b.name).trim() || traveler.name : traveler.name,
        mobile: b.mobile !== undefined ? b.mobile?.trim() || null : traveler.mobile,
        email: b.email !== undefined ? b.email?.trim() || null : traveler.email,
        gender: b.gender !== undefined ? b.gender || null : traveler.gender,
        dob: dobDate,
        age: resolvedAge,
        bloodGroup: b.bloodGroup !== undefined ? b.bloodGroup?.trim() || null : traveler.bloodGroup,
        nationality: b.nationality !== undefined ? b.nationality?.trim() || null : traveler.nationality,
        pickupPoint: b.pickupPoint !== undefined ? b.pickupPoint?.trim() || null : traveler.pickupPoint,
        emergencyContactName: b.emergencyContactName !== undefined ? b.emergencyContactName?.trim() || null : traveler.emergencyContactName,
        emergencyContactPhone: b.emergencyContactPhone !== undefined ? b.emergencyContactPhone?.trim() || null : traveler.emergencyContactPhone,
        roomSharing: b.roomSharing !== undefined ? b.roomSharing || null : traveler.roomSharing,
        foodPreference: b.foodPreference !== undefined ? b.foodPreference || null : traveler.foodPreference,
        isChild: b.isChild !== undefined ? !!b.isChild : traveler.isChild,
        isSeniorCitizen: b.isSeniorCitizen !== undefined ? !!b.isSeniorCitizen : traveler.isSeniorCitizen,
        needsExtraMattress: b.needsExtraMattress !== undefined ? !!b.needsExtraMattress : traveler.needsExtraMattress,
        specialNotes: b.specialNotes !== undefined ? b.specialNotes?.trim() || null : traveler.specialNotes,
        govIdType: b.govIdType !== undefined ? b.govIdType || null : traveler.govIdType,
        govIdNumber: b.govIdNumber !== undefined ? b.govIdNumber?.trim() || null : traveler.govIdNumber,
        medicalConditions: b.medicalConditions !== undefined ? b.medicalConditions?.trim() || null : traveler.medicalConditions,
        arrivalDetails: b.arrivalDetails !== undefined ? b.arrivalDetails?.trim() || null : traveler.arrivalDetails,
        departureDetails: b.departureDetails !== undefined ? b.departureDetails?.trim() || null : traveler.departureDetails,
        flightBookedByUs: b.flightBookedByUs !== undefined ? (b.flightBookedByUs === null ? null : !!b.flightBookedByUs) : traveler.flightBookedByUs,
        pickupDropBookedByUs: b.pickupDropBookedByUs !== undefined ? (b.pickupDropBookedByUs === null ? null : !!b.pickupDropBookedByUs) : traveler.pickupDropBookedByUs,
        verificationStatus: 'SUBMITTED',
        verificationNote: null,
        submittedAt: new Date(),
      },
    });

    // No ActivityLog entry here — ActivityLog.userId is a required FK to a real
    // User and there is no authenticated actor for a portal submission; the
    // audit trail lives in Traveler.submittedAt/verificationStatus instead.
    await notifyOperationsTeam(
      booking.organizationId,
      'TRAVELER_SUBMITTED',
      'Traveler Details Submitted',
      `${updated.name} submitted their details for ${booking.lead.name}'s booking — pending verification.`,
      booking.departureId ?? undefined
    );

    res.json({ success: true, data: updated });
  } catch (e) {
    console.error('[travelerPortal] submitTravelerDetails error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// ─── POST /portal/:token/travelers/:travelerId/document ─────────────────────

export const uploadTravelerDocument = async (req: Request, res: Response): Promise<void> => {
  try {
    const booking = await resolveBookingByToken(req.params.token);
    if (!booking) { res.status(404).json({ success: false, error: 'This link is invalid or has expired.' }); return; }

    const traveler = booking.travelers.find((t) => t.id === req.params.travelerId);
    if (!traveler) { res.status(404).json({ success: false, error: 'Traveler not found on this booking.' }); return; }
    if (traveler.verificationStatus === 'VERIFIED') {
      res.status(400).json({ success: false, error: 'These details are already verified. Contact your travel agent if something needs to change.' });
      return;
    }
    if (!req.file) { res.status(400).json({ success: false, error: 'A document file is required.' }); return; }

    const govIdDocumentUrl = buildUploadUrl(req.file);
    const updated = await prisma.traveler.update({ where: { id: traveler.id }, data: { govIdDocumentUrl } });

    res.json({ success: true, data: updated });
  } catch (e) {
    console.error('[travelerPortal] uploadTravelerDocument error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};
