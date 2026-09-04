import { Response } from 'express';
import prisma from '../lib/prisma.js';
import { AuthenticatedRequest } from '../types/index.js';
import { createLead, getLeadStats, assignEmployeeForCampaign } from '../services/lead.service.js';
import { createNotification, emitLeadUpdated } from '../services/notification.service.js';
import { fireEvent } from '../services/automationEngine.service.js';
import { isWholeAmount, WHOLE_AMOUNT_ERROR } from '../utils/amountValidation.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function orgFilter(req: AuthenticatedRequest): Record<string, unknown> {
  return req.user?.organizationId ? { organizationId: req.user.organizationId } : {};
}

// Mirrors the frontend's `statusOrder` in LeadDetail.tsx — the single source
// of truth for what "forward" means in the lead pipeline. LOST is handled as
// a separate always-allowed exit, not part of this ordering.
const LEAD_STATUS_ORDER: string[] = ['NEW', 'NOT_CONTACTED', 'CONTACTED', 'INTERESTED', 'FOLLOW_UP_SCHEDULED', 'CONFIRMED'];

// ─── Read ─────────────────────────────────────────────────────────────────────

export const getLeads = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const {
      status, source, campaignId, assignedToId, priority, tagId,
      search, page = 1, limit = 20,
      // Sorted by last activity by default, not just creation time — a lead
      // that was just confirmed, status-changed, or otherwise touched
      // should surface at the top everywhere (list, Kanban, status
      // filters), the same way the Bookings list already does, instead of
      // staying wherever its original createdAt placed it.
      sortBy = 'updatedAt', sortOrder = 'desc',
      dateFrom, dateTo, preferredDate,
    } = req.query;

    const skip = (Number(page) - 1) * Number(limit);

    const where: Record<string, unknown> = {
      ...orgFilter(req),
      deletedAt: null, // only active leads
    };

    if (req.user?.role === 'EMPLOYEE') where.assignedToId = req.user.id;
    if (status) where.status = status;
    if (source) where.source = source;
    if (campaignId) where.campaignId = campaignId;
    if (priority) where.priority = priority;
    if (tagId) where.tags = { some: { tagId } };
    if (assignedToId && req.user?.role === 'ADMIN') where.assignedToId = assignedToId;
    // Exact match — preferredDate is already stored as a plain YYYY-MM-DD
    // string (same shape the `<input type="date">` in LeadForm submits).
    if (preferredDate) where.preferredDate = preferredDate;
    if (dateFrom || dateTo) {
      const createdAt: Record<string, Date> = {};
      if (dateFrom) createdAt.gte = new Date(`${dateFrom}T00:00:00.000Z`);
      if (dateTo) createdAt.lte = new Date(`${dateTo}T23:59:59.999Z`);
      where.createdAt = createdAt;
    }

    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: 'insensitive' } },
        { phone: { contains: search as string } },
        { email: { contains: search as string, mode: 'insensitive' } },
        { destination: { contains: search as string, mode: 'insensitive' } },
        { message: { contains: search as string, mode: 'insensitive' } },
      ];
    }

    const [leads, total] = await Promise.all([
      prisma.lead.findMany({
        where,
        skip,
        take: Number(limit),
        include: {
          campaign: { select: { id: true, name: true, destination: true } },
          assignedTo: { select: { id: true, name: true, email: true } },
          tags: { include: { tag: true } },
        },
        // Tiebreakers make the order deterministic when the primary sort
        // field is identical across rows (e.g. two leads confirmed in the
        // same millisecond) — without this, tied rows can swap order
        // unpredictably between requests, which is especially bad with
        // pagination (a row could appear on neither or both pages).
        orderBy: [
          { [sortBy as string]: sortOrder },
          { createdAt: 'desc' },
          { id: 'desc' },
        ],
      }),
      prisma.lead.count({ where }),
    ]);

    res.json({
      success: true,
      data: leads,
      meta: { total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / Number(limit)) },
    });
  } catch (e) {
    console.error('[leads] getLeads error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// Groups active leads by their preferred/interested departure date, upcoming
// dates only — lets Sales/Admin spot a cluster (e.g. "15 people want Sept 3")
// and filter straight to it, instead of scrolling the whole list looking for
// matching dates. Same role/org scoping as getLeads.
export const getPreferredDateSummary = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const todayStr = new Date().toISOString().slice(0, 10);
    const where: Record<string, unknown> = {
      ...orgFilter(req),
      deletedAt: null,
      preferredDate: { not: null, gte: todayStr },
    };
    if (req.user?.role === 'EMPLOYEE') where.assignedToId = req.user.id;

    const grouped = await prisma.lead.groupBy({
      by: ['preferredDate'],
      where,
      _count: true,
      orderBy: { preferredDate: 'asc' },
    });

    res.json({
      success: true,
      data: grouped.map((g) => ({ preferredDate: g.preferredDate, count: g._count })),
    });
  } catch (e) {
    console.error('[leads] getPreferredDateSummary error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

export const getLeadById = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const lead = await prisma.lead.findFirst({
      where: { id, deletedAt: null, ...orgFilter(req) },
      include: {
        campaign: true,
        assignedTo: { select: { id: true, name: true, email: true, phone: true } },
        tags: { include: { tag: true } },
        activityLogs: {
          include: { user: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!lead) { res.status(404).json({ success: false, error: 'Lead not found' }); return; }
    if (req.user?.role === 'EMPLOYEE' && lead.assignedToId !== req.user.id) {
      res.status(403).json({ success: false, error: 'Access denied' }); return;
    }

    if (!lead.isRead) await prisma.lead.update({ where: { id }, data: { isRead: true } });

    res.json({ success: true, data: lead });
  } catch {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// ─── Duplicate check ──────────────────────────────────────────────────────────

export const checkDuplicate = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { phone, email } = req.query;
    const org = orgFilter(req);
    const conditions: any[] = [];

    if (phone) conditions.push({ phone: String(phone) });
    if (email) conditions.push({ email: String(email) });

    if (conditions.length === 0) { res.json({ success: true, data: [] }); return; }

    const duplicates = await prisma.lead.findMany({
      where: { ...org, deletedAt: null, OR: conditions },
      select: {
        id: true, name: true, phone: true, email: true, status: true, createdAt: true,
        assignedTo: { select: { id: true, name: true } },
        campaign: { select: { id: true, name: true } },
      },
      take: 5,
    });
    res.json({ success: true, data: duplicates });
  } catch {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// ─── Create ───────────────────────────────────────────────────────────────────

export const createLeadManual = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const {
      name, phone, email, source, message, destination, notes,
      followUpDate, followUpNotes, status, campaignId, assignedToId,
      groupSize, budget, preferredDate, priority, lostReason, lostReasonOther, tagIds,
    } = req.body;

    if (!name?.trim() || !phone?.trim()) {
      res.status(400).json({ success: false, error: 'Name and phone are required' });
      return;
    }
    if (followUpDate && new Date(followUpDate) <= new Date()) {
      res.status(400).json({ success: false, error: 'Follow-up date must be in the future' });
      return;
    }
    if (!isWholeAmount(budget)) { res.status(400).json({ success: false, error: WHOLE_AMOUNT_ERROR }); return; }

    // A lead placed under a campaign that has employees assigned belongs to
    // them (same round-robin rule webhook-created leads follow) — only when
    // the creator didn't already pick someone explicitly.
    const resolvedAssignedToId = assignedToId || (campaignId ? await assignEmployeeForCampaign(campaignId) : null);

    const lead = await prisma.lead.create({
      data: {
        name: name.trim(),
        phone: phone.trim(),
        email: email?.trim() || null,
        source: source || 'MANUAL',
        message: message || null,
        destination: destination?.trim() || null,
        notes: notes || null,
        status: status || 'NEW',
        priority: priority || 'MEDIUM',
        lostReason: status === 'LOST' ? (lostReason || null) : null,
        lostReasonOther: status === 'LOST' && lostReason === 'Other' ? (lostReasonOther || null) : null,
        campaignId: campaignId || null,
        assignedToId: resolvedAssignedToId || null,
        groupSize: groupSize && !isNaN(Number(groupSize)) ? Number(groupSize) : null,
        budget: budget && !isNaN(Number(budget)) ? Number(budget) : null,
        preferredDate: preferredDate || null,
        followUpDate: followUpDate ? new Date(followUpDate) : null,
        followUpNotes: followUpNotes || null,
        organizationId: req.user?.organizationId ?? null,
        tags: tagIds?.length ? { create: (tagIds as string[]).map((tagId) => ({ tagId })) } : undefined,
      },
      include: {
        campaign: { select: { id: true, name: true } },
        assignedTo: { select: { id: true, name: true } },
        tags: { include: { tag: true } },
      },
    });

    await prisma.activityLog.create({
      data: {
        action: 'Lead Created',
        details: `Created manually by ${req.user?.name}`,
        userId: req.user!.id,
        leadId: lead.id,
      },
    });

    if (lead.assignedToId) {
      await createNotification(
        lead.assignedToId, 'NEW_LEAD_ASSIGNED',
        'New Lead Assigned',
        `Lead "${lead.name}" has been assigned to you.`,
        lead.id,
      );
    }

    await fireEvent('LEAD_CREATED', {
      leadId: lead.id, name: lead.name, phone: lead.phone, source: lead.source,
      destination: lead.destination, assignedToId: lead.assignedToId, organizationId: lead.organizationId,
    }).catch((err) => console.error('[automation] LEAD_CREATED fireEvent error:', err));

    emitLeadUpdated(lead.id);
    res.status(201).json({ success: true, data: lead });
  } catch (e) {
    console.error('[leads] createLeadManual error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// ─── Update ───────────────────────────────────────────────────────────────────

export const updateLead = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const existing = await prisma.lead.findFirst({ where: { id, deletedAt: null, ...orgFilter(req) } });
    if (!existing) { res.status(404).json({ success: false, error: 'Lead not found' }); return; }
    if (req.user?.role === 'EMPLOYEE' && existing.assignedToId !== req.user.id) {
      res.status(403).json({ success: false, error: 'Access denied' }); return;
    }

    const { status, notes, followUpDate, followUpNotes, followUpDone, campaignId, assignedToId, priority, lostReason, lostReasonOther, tagIds, budget, ...rest } = req.body;
    if (!isWholeAmount(budget)) { res.status(400).json({ success: false, error: WHOLE_AMOUNT_ERROR }); return; }
    const updateData: Record<string, unknown> = { ...rest, ...(budget !== undefined ? { budget: budget === null || budget === '' ? null : Number(budget) } : {}) };

    if (status !== undefined) {
      // Once confirmed, a lead's status is permanently locked — not even the
      // usual LOST exit is allowed anymore. A confirmed lead has already
      // become a booking; any later outcome (cancellation, completion) is
      // tracked on the Booking record's own status, not by moving the lead
      // backward. Enforced for every role, including ADMIN.
      if (existing.status === 'CONFIRMED' && status !== 'CONFIRMED') {
        res.status(400).json({ success: false, error: 'A confirmed lead\'s status can never be changed again' });
        return;
      }
      // Forward-only pipeline, enforced for every role (including ADMIN) and
      // any direct API caller — LOST is always reachable as an exit, but no
      // status may ever move backward through the pipeline once advanced.
      // One further exception: completing a scheduled follow-up can lead to
      // "still interested, no concrete date yet" — allowed to fall back to
      // INTERESTED specifically from FOLLOW_UP_SCHEDULED, same as LOST.
      const isFollowUpToInterested = existing.status === 'FOLLOW_UP_SCHEDULED' && status === 'INTERESTED';
      const fromIdx = LEAD_STATUS_ORDER.indexOf(existing.status);
      const toIdx = LEAD_STATUS_ORDER.indexOf(status as string);
      if (status !== existing.status && status !== 'LOST' && !isFollowUpToInterested && fromIdx !== -1 && toIdx !== -1 && toIdx < fromIdx) {
        res.status(400).json({ success: false, error: `A lead cannot move backward from ${existing.status} to ${status}` });
        return;
      }
      updateData.status = status;
      if (status === 'LOST') {
        updateData.lostReason = lostReason || existing.lostReason || null;
        updateData.lostReasonOther = lostReason === 'Other' ? (lostReasonOther || null) : null;
      }
    }
    if (priority !== undefined) updateData.priority = priority;
    if (notes !== undefined) updateData.notes = notes;
    if (followUpNotes !== undefined) updateData.followUpNotes = followUpNotes;
    if (followUpDone !== undefined) updateData.followUpDone = followUpDone;

    // Handle tag updates
    if (Array.isArray(tagIds)) {
      await prisma.leadTag.deleteMany({ where: { leadId: id } });
      if (tagIds.length > 0) {
        await prisma.leadTag.createMany({
          data: tagIds.map((tagId: string) => ({ leadId: id, tagId })),
          skipDuplicates: true,
        });
      }
    }

    if (followUpDate !== undefined) {
      const parsed = followUpDate ? new Date(followUpDate) : null;
      if (parsed && parsed < existing.createdAt) {
        res.status(400).json({ success: false, error: 'Follow-up date cannot be before the lead creation date' });
        return;
      }
      // Only enforced when the date is actually changing — re-saving a lead
      // whose follow-up has since lapsed (without touching the date itself)
      // must not be blocked by it.
      if (parsed && parsed <= new Date() && parsed.getTime() !== existing.followUpDate?.getTime()) {
        res.status(400).json({ success: false, error: 'Follow-up date must be in the future' });
        return;
      }
      updateData.followUpDate = parsed;
    }

    if (req.user?.role === 'ADMIN') {
      if (campaignId !== undefined) updateData.campaignId = campaignId || null;
      if (assignedToId !== undefined) {
        updateData.assignedToId = assignedToId || null;
      } else if (campaignId !== undefined && campaignId && campaignId !== existing.campaignId) {
        // Moving a lead onto a campaign that has employees assigned hands it
        // to them (same round-robin rule as everywhere else), unless the
        // admin also picked an assignee explicitly in this same request.
        const autoAssignedToId = await assignEmployeeForCampaign(campaignId);
        if (autoAssignedToId) updateData.assignedToId = autoAssignedToId;
      }
    }

    const lead = await prisma.lead.update({
      where: { id },
      data: updateData,
      include: {
        campaign: { select: { id: true, name: true } },
        assignedTo: { select: { id: true, name: true } },
        tags: { include: { tag: true } },
      },
    });

    const changes: string[] = [];
    if (status && status !== existing.status) {
      changes.push(`Status: ${existing.status} → ${status}`);
      // Auto-posted into the same merged Notes/Comments feed everyone already
      // reads — so a status change made today is visible with its own date,
      // right alongside any manual notes, without anyone needing to type the
      // date themselves or go dig through the separate Activity tab.
      await prisma.leadComment.create({
        data: {
          leadId: id,
          authorId: req.user!.id,
          content: `🔄 Status changed: ${existing.status.replace(/_/g, ' ')} → ${status.replace(/_/g, ' ')}`,
        },
      });
    }
    if (priority && priority !== existing.priority) changes.push(`Priority: ${existing.priority} → ${priority}`);
    // Compares against the lead's actual final assignedToId (not just the
    // request body's) so this also fires for the campaign-driven
    // auto-assignment above, not only an explicit assignedToId in the body.
    if (lead.assignedToId && lead.assignedToId !== existing.assignedToId) {
      changes.push('Reassigned');
      await createNotification(
        lead.assignedToId, 'NEW_LEAD_ASSIGNED',
        'Lead Assigned to You',
        `Lead "${lead.name}" has been assigned to you.`,
        id,
      );
    }

    if (changes.length > 0) {
      await prisma.activityLog.create({
        data: { action: 'Lead Updated', details: changes.join(', '), userId: req.user!.id, leadId: id },
      });
    }

    emitLeadUpdated(id);
    res.json({ success: true, data: lead });
  } catch (e) {
    console.error('[leads] updateLead error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// ─── Transfer ─────────────────────────────────────────────────────────────────

export const transferLead = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { assignedToId, reason } = req.body;

    if (!assignedToId) {
      res.status(400).json({ success: false, error: 'assignedToId is required' });
      return;
    }

    const existing = await prisma.lead.findFirst({
      where: { id, deletedAt: null, ...orgFilter(req) },
      include: { assignedTo: { select: { name: true } } },
    });
    if (!existing) { res.status(404).json({ success: false, error: 'Lead not found' }); return; }

    if (req.user?.role === 'EMPLOYEE' && existing.assignedToId !== req.user.id) {
      res.status(403).json({ success: false, error: 'You can only transfer leads assigned to you' });
      return;
    }

    const targetUser = await prisma.user.findFirst({
      where: { id: assignedToId, organizationId: req.user?.organizationId ?? null, isActive: true },
      select: { id: true, name: true },
    });
    if (!targetUser) { res.status(404).json({ success: false, error: 'Target employee not found' }); return; }

    const lead = await prisma.lead.update({
      where: { id },
      data: { assignedToId },
      include: {
        campaign: { select: { id: true, name: true } },
        assignedTo: { select: { id: true, name: true } },
      },
    });

    const fromName = existing.assignedTo?.name ?? 'Unassigned';
    const details = reason
      ? `Transferred from ${fromName} to ${targetUser.name} — ${reason}`
      : `Transferred from ${fromName} to ${targetUser.name}`;

    await prisma.activityLog.create({
      data: { action: 'Lead Transferred', details, userId: req.user!.id, leadId: id },
    });

    await createNotification(
      assignedToId, 'NEW_LEAD_ASSIGNED',
      'Lead Transferred to You',
      `"${lead.name}" was transferred to you by ${req.user?.name}.`,
      id,
    );

    emitLeadUpdated(id);
    res.json({ success: true, data: lead });
  } catch (e) {
    console.error('[leads] transferLead error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// ─── Delete (soft) ────────────────────────────────────────────────────────────

export const deleteLead = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const existing = await prisma.lead.findFirst({ where: { id, deletedAt: null, ...orgFilter(req) } });
    if (!existing) { res.status(404).json({ success: false, error: 'Lead not found' }); return; }

    await prisma.lead.update({ where: { id }, data: { deletedAt: new Date() } });

    await prisma.activityLog.create({
      data: { action: 'Lead Deleted', details: `Deleted by ${req.user?.name}`, userId: req.user!.id, leadId: id },
    });

    res.json({ success: true, message: 'Lead deleted' });
  } catch {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// ─── Stats & Misc ─────────────────────────────────────────────────────────────

export const getStats = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const stats = await getLeadStats(req.user?.id, req.user?.role, req.user?.organizationId);
    res.json({ success: true, data: stats });
  } catch {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

export const getOverdueFollowUps = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const where: Record<string, unknown> = {
      ...orgFilter(req),
      deletedAt: null,
      status: 'FOLLOW_UP_SCHEDULED',
      followUpDone: false,
      followUpDate: { lt: new Date() },
    };
    if (req.user?.role === 'EMPLOYEE') where.assignedToId = req.user.id;

    const leads = await prisma.lead.findMany({
      where,
      include: {
        assignedTo: { select: { id: true, name: true } },
        campaign: { select: { id: true, name: true } },
      },
      orderBy: { followUpDate: 'asc' },
    });

    res.json({ success: true, data: leads });
  } catch {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

export const getRecentActivity = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const where: Record<string, unknown> =
      req.user?.role === 'EMPLOYEE' ? { userId: req.user.id } : {};

    const logs = await prisma.activityLog.findMany({
      where,
      include: {
        user: { select: { id: true, name: true } },
        lead: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });

    res.json({ success: true, data: logs });
  } catch {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

export const getDashboardStats = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const org = orgFilter(req);
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 86400000);

    const baseWhere = { ...org, deletedAt: null };

    // Run all queries in parallel
    const [
      allActiveLeads,
      todayCreated,
      todayConfirmed,
      todayLost,
      todayUpdatedLogs,
      todayTransferredLogs,
      followUpToday,
      followUpDone,
      followUpPending,
      followUpOverdue,
      recentConfirmed,
      employees,
      campaignLeads,
    ] = await Promise.all([
      // All active leads (for age distribution)
      prisma.lead.findMany({
        where: { ...baseWhere, status: { notIn: ['CONFIRMED', 'LOST'] } },
        select: { createdAt: true },
      }),
      // Today created
      prisma.lead.count({ where: { ...baseWhere, createdAt: { gte: todayStart, lt: todayEnd } } }),
      // Today confirmed
      prisma.lead.count({ where: { ...baseWhere, status: 'CONFIRMED', updatedAt: { gte: todayStart, lt: todayEnd } } }),
      // Today lost
      prisma.lead.count({ where: { ...baseWhere, status: 'LOST', updatedAt: { gte: todayStart, lt: todayEnd } } }),
      // Today updated (activity logs)
      prisma.activityLog.count({
        where: { action: 'Lead Updated', createdAt: { gte: todayStart, lt: todayEnd } },
      }),
      // Today transferred
      prisma.activityLog.count({
        where: { action: 'Lead Transferred', createdAt: { gte: todayStart, lt: todayEnd } },
      }),
      // Follow-ups today (scheduled for today)
      prisma.lead.count({
        where: { ...baseWhere, followUpDate: { gte: todayStart, lt: todayEnd }, followUpDone: false },
      }),
      // Follow-ups done (all time)
      prisma.lead.count({ where: { ...baseWhere, followUpDone: true } }),
      // Follow-ups pending (future, not done)
      prisma.lead.count({
        where: { ...baseWhere, followUpDate: { gte: todayEnd }, followUpDone: false },
      }),
      // Follow-ups overdue
      prisma.lead.count({
        where: { ...baseWhere, status: 'FOLLOW_UP_SCHEDULED', followUpDone: false, followUpDate: { lt: now } },
      }),
      // Recent confirmed bookings
      prisma.lead.findMany({
        where: { ...baseWhere, status: 'CONFIRMED' },
        orderBy: { updatedAt: 'desc' },
        take: 8,
        select: {
          id: true, name: true, phone: true, destination: true,
          budget: true, groupSize: true, updatedAt: true, createdAt: true,
          assignedTo: { select: { id: true, name: true } },
          campaign: { select: { id: true, name: true } },
        },
      }),
      // Employee workload
      prisma.user.findMany({
        where: { ...org, role: 'EMPLOYEE', isActive: true },
        select: {
          id: true, name: true,
          assignedLeads: {
            where: { deletedAt: null, status: { notIn: ['CONFIRMED', 'LOST'] } },
            select: { id: true },
          },
        },
      }),
      // Campaign leads for performance breakdown
      prisma.lead.groupBy({
        by: ['campaignId', 'status'],
        where: { ...baseWhere, campaignId: { not: null } },
        _count: true,
      }),
    ]);

    // Lead age distribution (active leads only)
    const ageDistribution = { fresh: 0, recent: 0, aging: 0, old: 0, stale: 0 };
    for (const lead of allActiveLeads) {
      const ageDays = (now.getTime() - new Date(lead.createdAt).getTime()) / 86400000;
      if (ageDays < 1) ageDistribution.fresh++;
      else if (ageDays < 3) ageDistribution.recent++;
      else if (ageDays < 7) ageDistribution.aging++;
      else if (ageDays < 14) ageDistribution.old++;
      else ageDistribution.stale++;
    }

    // Employee workload map
    const workload = employees.map((e) => ({
      id: e.id,
      name: e.name,
      activeLeads: e.assignedLeads.length,
    })).sort((a, b) => b.activeLeads - a.activeLeads);

    // Campaign performance breakdown (pending / confirmed / lost per campaign)
    const campaignBreakdown: Record<string, { pending: number; confirmed: number; lost: number }> = {};
    for (const row of campaignLeads) {
      const cid = row.campaignId!;
      if (!campaignBreakdown[cid]) campaignBreakdown[cid] = { pending: 0, confirmed: 0, lost: 0 };
      if (row.status === 'CONFIRMED') campaignBreakdown[cid].confirmed += row._count;
      else if (row.status === 'LOST') campaignBreakdown[cid].lost += row._count;
      else campaignBreakdown[cid].pending += row._count;
    }

    res.json({
      success: true,
      data: {
        leadAge: ageDistribution,
        workload,
        daily: {
          created: todayCreated,
          updated: todayUpdatedLogs,
          transferred: todayTransferredLogs,
          confirmed: todayConfirmed,
          lost: todayLost,
        },
        followUpHealth: {
          today: followUpToday,
          done: followUpDone,
          pending: followUpPending,
          overdue: followUpOverdue,
        },
        recentConfirmed,
        campaignBreakdown,
      },
    });
  } catch (e) {
    console.error('[leads] getDashboardStats error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

export const exportLeads = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { status, source, campaignId, assignedToId } = req.query;
    const where: Record<string, unknown> = { ...orgFilter(req), deletedAt: null };
    if (status) where.status = status;
    if (source) where.source = source;
    if (campaignId) where.campaignId = campaignId;
    if (assignedToId) where.assignedToId = assignedToId;

    const leads = await prisma.lead.findMany({
      where,
      include: {
        campaign: { select: { name: true } },
        assignedTo: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 5000,
    });

    const rows = leads.map((l) => ({
      Name: l.name,
      Phone: l.phone,
      Email: l.email ?? '',
      Status: l.status,
      Source: l.source,
      Destination: l.destination ?? '',
      Campaign: l.campaign?.name ?? '',
      'Assigned To': l.assignedTo?.name ?? '',
      'Group Size': l.groupSize ?? '',
      Budget: l.budget ?? '',
      'Follow-up Date': l.followUpDate ? l.followUpDate.toISOString().slice(0, 16) : '',
      'Follow-up Done': l.followUpDone ? 'Yes' : 'No',
      Notes: l.notes ?? '',
      'Created At': l.createdAt.toISOString().slice(0, 10),
    }));

    res.json({ success: true, data: rows });
  } catch (e) {
    console.error('[leads] exportLeads error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};
