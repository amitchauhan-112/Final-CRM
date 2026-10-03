import { Response } from 'express';
import prisma from '../lib/prisma.js';
import { AuthenticatedRequest } from '../types/index.js';
import { applyBookingChanges, validateBookingChangePayload } from './booking.controller.js';
import { createNotification, emitFinanceUpdated } from '../services/notification.service.js';

const orgId = (req: AuthenticatedRequest) => req.user?.organizationId ?? null;

// Anyone who can act on a given request: the specifically-named approver, an
// Admin (always allowed to override), or — for role-targeted requests — any
// user holding that role. Never the person who submitted it, even if they
// also happen to hold the approving role/id (e.g. a Finance user correcting
// a payment they themselves recorded) — that would defeat the whole point of
// routing it to a second person.
const canResolve = (req: AuthenticatedRequest, request: { type: string; requestedById: string; approverRole: string | null; approverId: string | null }) => {
  if (request.requestedById === req.user?.id) return req.user?.role === 'ADMIN';
  // A payment correction belongs to the person who recorded that payment —
  // Admin can see it as oversight but doesn't act on it.
  if (request.type === 'PAYMENT_CORRECTION' && request.approverId) return request.approverId === req.user?.id;
  if (req.user?.role === 'ADMIN') return true;
  if (request.approverId) return request.approverId === req.user?.id;
  if (request.approverRole) return request.approverRole === req.user?.role;
  return false;
};

// ─── List pending requests (Admin's oversight queue, or "assigned to me") ────

export const listPendingApprovals = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const where = req.user?.role === 'ADMIN'
      ? { status: 'PENDING', ...(orgId(req) ? { organizationId: orgId(req) } : {}) }
      : {
          status: 'PENDING',
          ...(orgId(req) ? { organizationId: orgId(req) } : {}),
          OR: [{ approverId: req.user!.id }, { approverRole: req.user?.role }],
        };

    const requests = await prisma.approvalRequest.findMany({
      where,
      include: {
        requestedBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Resolve which lead each request belongs to, so the UI (dashboard cards,
    // notifications) can deep-link straight to it instead of just a count.
    const withLeadId = await Promise.all(requests.map(async (r) => {
      let leadId: string | undefined;
      if (r.type === 'BOOKING_CHANGE') {
        leadId = (await prisma.booking.findUnique({ where: { id: r.entityId }, select: { leadId: true } }))?.leadId;
      } else if (r.type === 'PAYMENT_CORRECTION') {
        leadId = (await prisma.payment.findUnique({ where: { id: r.entityId }, select: { booking: { select: { leadId: true } } } }))?.booking.leadId;
      }
      return { ...r, leadId, payload: JSON.parse(r.payload), canResolve: canResolve(req, r) };
    }));

    res.json({ success: true, data: withLeadId });
  } catch {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// ─── Requests I submitted (any status) ───────────────────────────────────────

export const listMyApprovalRequests = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const requests = await prisma.approvalRequest.findMany({
      where: { requestedById: req.user!.id, ...(orgId(req) ? { organizationId: orgId(req) } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json({ success: true, data: requests.map((r) => ({ ...r, payload: JSON.parse(r.payload) })) });
  } catch {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// ─── Approve ──────────────────────────────────────────────────────────────────

export const approveRequest = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const request = await prisma.approvalRequest.findFirst({
      where: { id, ...(orgId(req) ? { organizationId: orgId(req) } : {}) },
    });
    if (!request) { res.status(404).json({ success: false, error: 'Approval request not found' }); return; }
    if (request.status !== 'PENDING') { res.status(400).json({ success: false, error: 'This request has already been resolved' }); return; }
    if (!canResolve(req, request)) { res.status(403).json({ success: false, error: 'You are not authorized to resolve this request' }); return; }

    // Atomically claim this request before touching anything else — if two
    // people (or one impatient double-click) hit Approve/Reject on the same
    // request at once, only the first actually gets to apply the change; the
    // rest see a clean "already resolved" response instead of it applying twice.
    const claim = await prisma.approvalRequest.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: 'APPROVED', resolvedById: req.user!.id, resolvedAt: new Date() },
    });
    if (claim.count === 0) { res.status(409).json({ success: false, error: 'This request was just resolved by someone else' }); return; }

    const { changes } = JSON.parse(request.payload) as { changes: Record<string, unknown> };
    let leadId: string | undefined;

    try {
      if (request.type === 'BOOKING_CHANGE') {
        // Re-check the booking's live state before applying a payload that
        // may have been sitting here for a while — if it's gone, or no
        // longer ACTIVE, or would now fail the same validation updateBooking
        // itself enforces, refuse rather than blindly overwriting whatever
        // has happened to it since this was proposed.
        const booking = await prisma.booking.findFirst({ where: { id: request.entityId, ...(orgId(req) ? { organizationId: orgId(req) } : {}) } });
        if (!booking) throw new Error('The booking this change was proposed for no longer exists');
        if (booking.status !== 'ACTIVE') throw new Error(`The booking is now ${booking.status} — this change can no longer be applied as proposed`);
        const validationError = validateBookingChangePayload(booking, changes);
        if (validationError) throw new Error(validationError);

        leadId = booking.leadId;
        const requester = await prisma.user.findUnique({ where: { id: request.requestedById }, select: { name: true } });
        await applyBookingChanges(
          request.entityId, changes, { id: req.user!.id, name: req.user!.name },
          orgId(req),
          `Booking change (proposed by ${requester?.name ?? 'a user'}) approved by ${req.user!.name}`
        );
      } else if (request.type === 'PAYMENT_CORRECTION') {
        const payment = await prisma.payment.findFirst({
          where: { id: request.entityId, ...(orgId(req) ? { booking: { organizationId: orgId(req) } } : {}) },
          include: { booking: { select: { leadId: true } } },
        });
        if (!payment) throw new Error('The payment this correction was proposed for no longer exists');
        // Only apply if the payment is still exactly where proposeCorrection
        // left it — if Finance/Sales already verified, rejected, or
        // resubmitted it through another route in the meantime, applying a
        // stale correction on top would double-credit or silently overwrite
        // that other action.
        if (payment.status !== 'CORRECTION_REQUESTED') {
          throw new Error(`This payment is no longer awaiting correction (now ${payment.status}) — it was likely already handled another way`);
        }

        leadId = payment.booking.leadId;
        await prisma.payment.update({
          where: { id: request.entityId },
          data: { ...changes, status: 'PENDING', financeNote: null },
        });
        await prisma.activityLog.create({
          data: {
            action: 'Payment Correction Approved',
            details: `Payment correction approved by ${req.user!.name}`,
            entityType: 'PAYMENT',
            entityId: request.entityId,
            userId: req.user!.id,
            leadId: payment.booking.leadId,
            oldValue: JSON.parse(request.payload).previous,
            newValue: changes as any,
          },
        }).catch(() => {});
        emitFinanceUpdated();
      }
    } catch (applyError: any) {
      // The claim above already flipped this to APPROVED — since applying it
      // failed, correct the record to REJECTED with why, rather than leaving
      // a misleading "APPROVED" request that was never actually applied and
      // would otherwise sit unresolved (and unresolvable) forever.
      await prisma.approvalRequest.update({
        where: { id },
        data: { status: 'REJECTED', reviewNote: applyError?.message || 'Failed to apply this change' },
      });
      res.status(409).json({ success: false, error: applyError?.message || 'Failed to apply this change' });
      return;
    }

    const resolved = await prisma.approvalRequest.findUnique({ where: { id } });

    await createNotification(request.requestedById, 'APPROVAL_APPROVED', 'Your Change Was Approved',
      request.type === 'BOOKING_CHANGE' ? 'Your proposed booking change has been approved and applied.' : 'Your proposed payment correction has been approved and applied.',
      leadId);

    res.json({ success: true, data: resolved });
  } catch (e) {
    console.error('[approval] approveRequest error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// ─── Reject ───────────────────────────────────────────────────────────────────

export const rejectRequest = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { reviewNote } = req.body;
    const request = await prisma.approvalRequest.findFirst({
      where: { id, ...(orgId(req) ? { organizationId: orgId(req) } : {}) },
    });
    if (!request) { res.status(404).json({ success: false, error: 'Approval request not found' }); return; }
    if (request.status !== 'PENDING') { res.status(400).json({ success: false, error: 'This request has already been resolved' }); return; }
    if (!canResolve(req, request)) { res.status(403).json({ success: false, error: 'You are not authorized to resolve this request' }); return; }

    const claim = await prisma.approvalRequest.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: 'REJECTED', reviewNote: reviewNote?.trim() || null, resolvedById: req.user!.id, resolvedAt: new Date() },
    });
    if (claim.count === 0) { res.status(409).json({ success: false, error: 'This request was just resolved by someone else' }); return; }

    let leadId: string | undefined;

    if (request.type === 'PAYMENT_CORRECTION') {
      const { previous } = JSON.parse(request.payload) as { previous: Record<string, unknown> };
      // Only restore if the payment is still sitting in the state this
      // correction put it in — if it's already been moved on through another
      // route (verified, rejected again, resubmitted, or deleted), leave it
      // alone rather than clobbering whatever it is now.
      const payment = await prisma.payment.findUnique({ where: { id: request.entityId }, include: { booking: { select: { leadId: true } } } });
      if (payment) {
        leadId = payment.booking.leadId;
        if (payment.status === 'CORRECTION_REQUESTED') {
          await prisma.payment.update({
            where: { id: request.entityId },
            data: { status: (previous.status as string) ?? 'PENDING', financeNote: (previous.financeNote as string | null) ?? null },
          });
          await prisma.activityLog.create({
            data: {
              action: 'Payment Correction Rejected',
              details: `Payment correction rejected by ${req.user!.name}${reviewNote?.trim() ? `: ${reviewNote.trim()}` : ''}`,
              entityType: 'PAYMENT',
              entityId: request.entityId,
              userId: req.user!.id,
              leadId: payment.booking.leadId,
            },
          }).catch(() => {});
          emitFinanceUpdated();
        }
      }
    } else if (request.type === 'BOOKING_CHANGE') {
      const booking = await prisma.booking.findUnique({ where: { id: request.entityId }, select: { leadId: true } });
      leadId = booking?.leadId;
    }

    const resolved = await prisma.approvalRequest.findUnique({ where: { id } });

    await createNotification(request.requestedById, 'APPROVAL_REJECTED', 'Your Change Was Rejected',
      reviewNote?.trim() ? `Rejected: ${reviewNote.trim()}` : (request.type === 'BOOKING_CHANGE' ? 'Your proposed booking change was rejected.' : 'Your proposed payment correction was rejected.'),
      leadId);

    res.json({ success: true, data: resolved });
  } catch (e) {
    console.error('[approval] rejectRequest error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// ─── Cancel my own still-pending request ─────────────────────────────────────

export const cancelRequest = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const request = await prisma.approvalRequest.findFirst({
      where: { id, ...(orgId(req) ? { organizationId: orgId(req) } : {}) },
    });
    if (!request) { res.status(404).json({ success: false, error: 'Approval request not found' }); return; }
    if (request.status !== 'PENDING') { res.status(400).json({ success: false, error: 'This request has already been resolved' }); return; }
    const isOwnRequest = request.requestedById === req.user?.id;
    if (!isOwnRequest && req.user?.role !== 'ADMIN') {
      res.status(403).json({ success: false, error: 'Only the original requester or an admin can cancel this' });
      return;
    }

    const claim = await prisma.approvalRequest.updateMany({
      where: { id, status: 'PENDING' },
      data: {
        status: 'REJECTED',
        reviewNote: isOwnRequest ? 'Cancelled by requester' : `Cancelled by ${req.user!.name} (Admin)`,
        resolvedById: req.user!.id,
        resolvedAt: new Date(),
      },
    });
    if (claim.count === 0) { res.status(409).json({ success: false, error: 'This request was just resolved by someone else' }); return; }

    if (request.type === 'PAYMENT_CORRECTION') {
      const { previous } = JSON.parse(request.payload) as { previous: Record<string, unknown> };
      const payment = await prisma.payment.findUnique({ where: { id: request.entityId } });
      if (payment && payment.status === 'CORRECTION_REQUESTED') {
        await prisma.payment.update({
          where: { id: request.entityId },
          data: { status: (previous.status as string) ?? 'PENDING', financeNote: (previous.financeNote as string | null) ?? null },
        });
        emitFinanceUpdated();
      }
    }

    // An Admin cancelling someone else's request removes it from that
    // person's view without them ever hearing why — let them know.
    if (!isOwnRequest) {
      await createNotification(request.requestedById, 'APPROVAL_REJECTED', 'Your Request Was Cancelled',
        `${req.user!.name} (Admin) cancelled your pending ${request.type === 'BOOKING_CHANGE' ? 'booking change' : 'payment correction'} request.`);
    }

    res.json({ success: true, data: { cancelled: true } });
  } catch {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};
