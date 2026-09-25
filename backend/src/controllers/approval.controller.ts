import { Response } from 'express';
import prisma from '../lib/prisma.js';
import { AuthenticatedRequest } from '../types/index.js';
import { applyBookingChanges } from './booking.controller.js';
import { createNotification, emitFinanceUpdated } from '../services/notification.service.js';

const orgId = (req: AuthenticatedRequest) => req.user?.organizationId ?? null;

// Anyone who can act on a given request: the specifically-named approver, an
// Admin (always allowed to override), or — for role-targeted requests — any
// user holding that role.
const canResolve = (req: AuthenticatedRequest, request: { approverRole: string | null; approverId: string | null }) => {
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
      : { status: 'PENDING', approverId: req.user!.id };

    const requests = await prisma.approvalRequest.findMany({
      where,
      include: {
        requestedBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: requests.map((r) => ({ ...r, payload: JSON.parse(r.payload) })) });
  } catch {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// ─── Requests I submitted (any status) ───────────────────────────────────────

export const listMyApprovalRequests = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const requests = await prisma.approvalRequest.findMany({
      where: { requestedById: req.user!.id },
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

    const { changes } = JSON.parse(request.payload) as { changes: Record<string, unknown> };

    if (request.type === 'BOOKING_CHANGE') {
      await applyBookingChanges(
        request.entityId, changes, { id: req.user!.id, name: req.user!.name },
        orgId(req),
        `Booking change (proposed by ${(await prisma.user.findUnique({ where: { id: request.requestedById }, select: { name: true } }))?.name ?? 'a user'}) approved by ${req.user!.name}`
      );
    } else if (request.type === 'PAYMENT_CORRECTION') {
      await prisma.payment.update({
        where: { id: request.entityId },
        data: { ...changes, status: 'PENDING', financeNote: null },
      });
      emitFinanceUpdated();
    }

    const resolved = await prisma.approvalRequest.update({
      where: { id },
      data: { status: 'APPROVED', resolvedById: req.user!.id, resolvedAt: new Date() },
    });

    await createNotification(request.requestedById, 'APPROVAL_APPROVED', 'Your Change Was Approved',
      request.type === 'BOOKING_CHANGE' ? 'Your proposed booking change has been approved and applied.' : 'Your proposed payment correction has been approved and applied.');

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

    if (request.type === 'PAYMENT_CORRECTION') {
      await prisma.payment.update({ where: { id: request.entityId }, data: { status: 'PENDING', financeNote: null } });
      emitFinanceUpdated();
    }

    const resolved = await prisma.approvalRequest.update({
      where: { id },
      data: { status: 'REJECTED', reviewNote: reviewNote?.trim() || null, resolvedById: req.user!.id, resolvedAt: new Date() },
    });

    await createNotification(request.requestedById, 'APPROVAL_REJECTED', 'Your Change Was Rejected',
      reviewNote?.trim() ? `Rejected: ${reviewNote.trim()}` : (request.type === 'BOOKING_CHANGE' ? 'Your proposed booking change was rejected.' : 'Your proposed payment correction was rejected.'));

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
    if (request.requestedById !== req.user?.id && req.user?.role !== 'ADMIN') {
      res.status(403).json({ success: false, error: 'Only the original requester or an admin can cancel this' });
      return;
    }

    if (request.type === 'PAYMENT_CORRECTION') {
      await prisma.payment.update({ where: { id: request.entityId }, data: { status: 'PENDING', financeNote: null } });
      emitFinanceUpdated();
    }

    await prisma.approvalRequest.update({
      where: { id },
      data: { status: 'REJECTED', reviewNote: 'Cancelled by requester', resolvedById: req.user!.id, resolvedAt: new Date() },
    });

    res.json({ success: true, data: { cancelled: true } });
  } catch {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};
