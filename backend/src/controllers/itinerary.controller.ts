import { Response } from 'express';
import prisma from '../lib/prisma.js';
import { AuthenticatedRequest } from '../types/index.js';

const orgId = (req: AuthenticatedRequest) => req.user?.organizationId ?? null;

// ─── Get itinerary for a package ─────────────────────────────────────────────

export const getItinerary = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { packageId } = req.params;
    // Verify package belongs to org
    const pkg = await (prisma as any).package.findFirst({ where: { id: packageId, organizationId: orgId(req) } });
    if (!pkg) { res.status(404).json({ success: false, error: 'Package not found' }); return; }

    const items = await (prisma as any).packageItinerary.findMany({
      where: { packageId },
      orderBy: [{ dayOffset: 'asc' }, { sortOrder: 'asc' }],
    });

    res.json({ success: true, data: items });
  } catch (e) {
    console.error('[itinerary] getItinerary error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// ─── Create itinerary item ────────────────────────────────────────────────────

export const createItineraryItem = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { packageId } = req.params;
    const pkg = await (prisma as any).package.findFirst({ where: { id: packageId, organizationId: orgId(req) } });
    if (!pkg) { res.status(404).json({ success: false, error: 'Package not found' }); return; }

    const { dayOffset, title, description, notes, taskType, department, sortOrder, location } = req.body;

    if (!title?.trim()) { res.status(400).json({ success: false, error: 'Title is required' }); return; }
    if (dayOffset === undefined || dayOffset === null || isNaN(Number(dayOffset))) {
      res.status(400).json({ success: false, error: 'Day offset is required' }); return;
    }

    const item = await (prisma as any).packageItinerary.create({
      data: {
        packageId,
        dayOffset: Number(dayOffset),
        title: title.trim(),
        description: description?.trim() || null,
        notes: notes?.trim() || null,
        taskType: taskType || 'GENERAL',
        department: department || 'SALES',
        sortOrder: sortOrder !== undefined ? Number(sortOrder) : 0,
        location: location?.trim() || null,
      },
    });

    res.status(201).json({ success: true, data: item });
  } catch (e) {
    console.error('[itinerary] createItineraryItem error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// ─── Update itinerary item ────────────────────────────────────────────────────

export const updateItineraryItem = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { packageId, id } = req.params;
    const existing = await (prisma as any).packageItinerary.findFirst({
      where: { id, packageId },
      include: { package: { select: { organizationId: true } } },
    });
    if (!existing || existing.package.organizationId !== orgId(req)) {
      res.status(404).json({ success: false, error: 'Item not found' }); return;
    }

    const { dayOffset, title, description, notes, taskType, department, sortOrder, location } = req.body;

    const item = await (prisma as any).packageItinerary.update({
      where: { id },
      data: {
        dayOffset: dayOffset !== undefined ? Number(dayOffset) : existing.dayOffset,
        title: title?.trim() ?? existing.title,
        description: description !== undefined ? description?.trim() || null : existing.description,
        notes: notes !== undefined ? notes?.trim() || null : existing.notes,
        taskType: taskType ?? existing.taskType,
        department: department ?? existing.department,
        sortOrder: sortOrder !== undefined ? Number(sortOrder) : existing.sortOrder,
        location: location !== undefined ? location?.trim() || null : existing.location,
      },
    });

    res.json({ success: true, data: item });
  } catch (e) {
    console.error('[itinerary] updateItineraryItem error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// ─── Delete itinerary item ────────────────────────────────────────────────────

export const deleteItineraryItem = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { packageId, id } = req.params;
    const existing = await (prisma as any).packageItinerary.findFirst({
      where: { id, packageId },
      include: { package: { select: { organizationId: true } } },
    });
    if (!existing || existing.package.organizationId !== orgId(req)) {
      res.status(404).json({ success: false, error: 'Item not found' }); return;
    }

    await (prisma as any).packageItinerary.delete({ where: { id } });
    res.json({ success: true, message: 'Deleted' });
  } catch (e) {
    console.error('[itinerary] deleteItineraryItem error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// ─── Bulk reorder itinerary ───────────────────────────────────────────────────

export const reorderItinerary = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { packageId } = req.params;
    const { items } = req.body; // [{ id, dayOffset, sortOrder }]

    if (!Array.isArray(items)) { res.status(400).json({ success: false, error: 'Items array required' }); return; }

    await Promise.all(
      items.map((item: { id: string; dayOffset: number; sortOrder: number }) =>
        (prisma as any).packageItinerary.update({
          where: { id: item.id },
          data: { dayOffset: item.dayOffset, sortOrder: item.sortOrder },
        })
      )
    );

    const updated = await (prisma as any).packageItinerary.findMany({
      where: { packageId },
      orderBy: [{ dayOffset: 'asc' }, { sortOrder: 'asc' }],
    });

    res.json({ success: true, data: updated });
  } catch (e) {
    console.error('[itinerary] reorderItinerary error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};
