import { Response } from 'express';
import prisma from '../lib/prisma.js';
import { AuthenticatedRequest } from '../types/index.js';
import { emitOperationsUpdated } from '../services/notification.service.js';

const orgId = (req: AuthenticatedRequest) => req.user?.organizationId ?? null;

// Backs the Departure Detail page's "Others" tab — a manual checklist for
// requirements that don't fit Trip Captain / Hotel / Vehicle. Same
// visibility rule as OperationsNote: only ADMIN/OPERATIONS ever reach these
// routes (requireOperationsOrAdmin gates the whole router), no separate
// visibility field needed.

export const createRequirement = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { departureId } = req.params;
    const departure = await prisma.departure.findFirst({
      where: { id: departureId, ...(orgId(req) ? { organizationId: orgId(req) } : {}) },
    });
    if (!departure) { res.status(404).json({ success: false, error: 'Departure not found' }); return; }

    const { title, notes } = req.body;
    if (!title?.trim()) { res.status(400).json({ success: false, error: 'Title is required' }); return; }

    const requirement = await prisma.departureRequirement.create({
      data: { departureId, title: title.trim(), notes: notes?.trim() || null, createdById: req.user!.id },
      include: { createdBy: { select: { id: true, name: true } } },
    });

    emitOperationsUpdated(departureId);
    res.status(201).json({ success: true, data: requirement });
  } catch (e) {
    console.error('[operations] createRequirement error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

export const toggleRequirementStatus = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const existing = await prisma.departureRequirement.findUnique({ where: { id }, include: { departure: true } });
    if (!existing) { res.status(404).json({ success: false, error: 'Requirement not found' }); return; }
    if (orgId(req) && existing.departure.organizationId !== orgId(req)) { res.status(404).json({ success: false, error: 'Requirement not found' }); return; }

    const requirement = await prisma.departureRequirement.update({
      where: { id },
      data: { status: existing.status === 'DONE' ? 'PENDING' : 'DONE' },
      include: { createdBy: { select: { id: true, name: true } } },
    });

    emitOperationsUpdated(existing.departureId);
    res.json({ success: true, data: requirement });
  } catch (e) {
    console.error('[operations] toggleRequirementStatus error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

export const deleteRequirement = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const existing = await prisma.departureRequirement.findUnique({ where: { id }, include: { departure: true } });
    if (!existing) { res.status(404).json({ success: false, error: 'Requirement not found' }); return; }
    if (orgId(req) && existing.departure.organizationId !== orgId(req)) { res.status(404).json({ success: false, error: 'Requirement not found' }); return; }
    if (req.user?.role !== 'ADMIN' && existing.createdById !== req.user?.id) {
      res.status(403).json({ success: false, error: 'Only the creator or an admin can delete this' });
      return;
    }

    await prisma.departureRequirement.delete({ where: { id } });
    emitOperationsUpdated(existing.departureId);
    res.json({ success: true, data: { id } });
  } catch (e) {
    console.error('[operations] deleteRequirement error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};
