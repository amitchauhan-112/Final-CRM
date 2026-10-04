import { Response } from 'express';
import prisma from '../lib/prisma.js';
import { AuthenticatedRequest } from '../types/index.js';
import { createNotification, emitLeadUpdated } from '../services/notification.service.js';
import { LOST_BUCKETS, LostBucket, bucketForReason, bucketWhere, currentMonthKey } from '../utils/lostReasons.js';

const CATEGORY_LABEL: Record<LostBucket, string> = { JUNK: 'Junk Lead', POSTPONED: 'Plan Postponed', OTHER: 'Other' };

// Admin-only pool of lost leads, split into Junk / Postponed / Other, with
// bulk revive. Reviving puts the lead back to NEW with the chosen comment
// visible to the sales person, so nothing moves on its own — an Admin always
// decides.

function orgFilter(req: AuthenticatedRequest): Record<string, unknown> {
  return req.user?.organizationId ? { organizationId: req.user.organizationId } : {};
}

const MAX_REVIVE_BATCH = 500;

// Shared by the list and export so a download always matches what's on screen.
function buildLostWhere(req: AuthenticatedRequest, bucket: LostBucket, month: unknown, search: unknown): Record<string, unknown> {
  const where: Record<string, unknown> = {
    ...orgFilter(req),
    deletedAt: null,
    status: 'LOST',
    AND: [bucketWhere(bucket)],
  };
  if (bucket === 'POSTPONED' && typeof month === 'string' && month) {
    // "DUE" = postponed month has arrived (or passed). Plain YYYY-MM is an exact match.
    where.postponedTo = month === 'DUE' ? { lte: currentMonthKey() } : month;
  }
  if (typeof search === 'string' && search.trim()) {
    const q = search.trim();
    where.OR = [{ name: { contains: q } }, { phone: { contains: q } }];
  }
  return where;
}

function parseBucket(value: unknown): LostBucket | null {
  return LOST_BUCKETS.includes(value as LostBucket) ? (value as LostBucket) : null;
}

// ─── List ─────────────────────────────────────────────────────────────────────

export const getLostLeads = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const bucket = parseBucket(req.query.bucket);
    if (!bucket) { res.status(400).json({ success: false, error: 'bucket must be JUNK, POSTPONED or OTHER' }); return; }

    const where = buildLostWhere(req, bucket, req.query.month, req.query.search);
    const base = { ...orgFilter(req), deletedAt: null, status: 'LOST' };

    const [leads, total, counts, postponedByMonth] = await Promise.all([
      prisma.lead.findMany({
        where,
        include: {
          campaign: { select: { id: true, name: true } },
          assignedTo: { select: { id: true, name: true } },
        },
        orderBy: [{ lostAt: 'desc' }, { updatedAt: 'desc' }],
        take: 2000,
      }),
      prisma.lead.count({ where }),
      Promise.all(LOST_BUCKETS.map((b) => prisma.lead.count({ where: { ...base, AND: [bucketWhere(b)] } }))),
      prisma.lead.groupBy({
        by: ['postponedTo'],
        where: { ...base, AND: [bucketWhere('POSTPONED')], postponedTo: { not: null } },
        _count: true,
      }),
    ]);

    res.json({
      success: true,
      data: leads.map((l) => ({ ...l, lostBucket: bucketForReason(l.lostReason) })),
      meta: {
        total,
        truncated: total > leads.length,
        counts: Object.fromEntries(LOST_BUCKETS.map((b, i) => [b, counts[i]])),
        // Keyed by "YYYY-MM"; the page turns these into the Postponed sub-tabs.
        postponedByMonth: Object.fromEntries(
          (postponedByMonth as { postponedTo: string | null; _count: number }[])
            .filter((r) => r.postponedTo)
            .map((r) => [r.postponedTo as string, r._count])
        ),
        currentMonth: currentMonthKey(),
      },
    });
  } catch (e) {
    console.error('[lost-leads] getLostLeads error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// ─── Export ───────────────────────────────────────────────────────────────────

export const exportLostLeads = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const bucket = parseBucket(req.query.bucket);
    if (!bucket) { res.status(400).json({ success: false, error: 'bucket must be JUNK, POSTPONED or OTHER' }); return; }

    const leads = await prisma.lead.findMany({
      where: buildLostWhere(req, bucket, req.query.month, req.query.search),
      include: {
        campaign: { select: { name: true } },
        assignedTo: { select: { name: true } },
      },
      orderBy: [{ lostAt: 'desc' }, { updatedAt: 'desc' }],
      take: 5000,
    });

    const rows = leads.map((l) => ({
      Name: l.name,
      Phone: l.phone,
      Email: l.email ?? '',
      Category: CATEGORY_LABEL[bucketForReason(l.lostReason)],
      Reason: l.lostReason ?? '',
      'Reason Detail': l.lostReasonOther ?? '',
      'Postponed To': l.postponedTo ?? '',
      'Assigned To': l.assignedTo?.name ?? '',
      Campaign: l.campaign?.name ?? '',
      Destination: l.destination ?? '',
      Budget: l.budget ?? '',
      'Group Size': l.groupSize ?? '',
      'Lost On': l.lostAt ? l.lostAt.toISOString().slice(0, 10) : '',
      Notes: l.notes ?? '',
      'Created At': l.createdAt.toISOString().slice(0, 10),
    }));

    res.json({ success: true, data: rows });
  } catch (e) {
    console.error('[lost-leads] exportLostLeads error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// ─── Revive ───────────────────────────────────────────────────────────────────

export const reviveLostLeads = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const admin = req.user!;
    const { leadIds, comment, assignedToId } = req.body as { leadIds?: unknown; comment?: unknown; assignedToId?: unknown };

    if (!Array.isArray(leadIds) || leadIds.length === 0 || !leadIds.every((id) => typeof id === 'string')) {
      res.status(400).json({ success: false, error: 'Select at least one lead to revive' }); return;
    }
    if (leadIds.length > MAX_REVIVE_BATCH) {
      res.status(400).json({ success: false, error: `Revive at most ${MAX_REVIVE_BATCH} leads at a time` }); return;
    }
    const note = typeof comment === 'string' ? comment.trim() : '';
    if (!note) { res.status(400).json({ success: false, error: 'A comment is required — the sales person will see it' }); return; }

    let newAssigneeId: string | null = null;
    if (typeof assignedToId === 'string' && assignedToId) {
      const assignee = await prisma.user.findFirst({ where: { id: assignedToId, isActive: true, ...orgFilter(req) } });
      if (!assignee) { res.status(400).json({ success: false, error: 'Selected employee not found' }); return; }
      newAssigneeId = assignee.id;
    }

    // Only leads that are still LOST in this org — anything else in the
    // selection is skipped and reported back rather than silently changed.
    const leads = await prisma.lead.findMany({
      where: { id: { in: leadIds }, status: 'LOST', deletedAt: null, ...orgFilter(req) },
      select: { id: true, name: true, assignedToId: true },
    });
    if (leads.length === 0) { res.status(400).json({ success: false, error: 'None of the selected leads are lost leads' }); return; }

    const ids = leads.map((l) => l.id);
    const revivedAt = new Date();

    await prisma.$transaction([
      prisma.lead.updateMany({
        where: { id: { in: ids } },
        data: {
          status: 'NEW',
          lostAt: null,
          lostReason: null,
          lostReasonOther: null,
          postponedTo: null,
          revivedAt,
          ...(newAssigneeId ? { assignedToId: newAssigneeId } : {}),
        },
      }),
      prisma.leadComment.createMany({
        data: ids.map((leadId) => ({ leadId, authorId: admin.id, content: `Revived by ${admin.name}: ${note}` })),
      }),
      prisma.activityLog.createMany({
        data: ids.map((leadId) => ({
          action: 'Lead Revived',
          details: `Revived by ${admin.name}: ${note}`,
          entityType: 'LEAD',
          entityId: leadId,
          userId: admin.id,
          leadId,
        })),
      }),
    ]);

    // One notification per salesperson, not per lead, so a bulk revive doesn't flood the bell.
    const byAssignee = new Map<string, typeof leads>();
    for (const lead of leads) {
      const target = newAssigneeId ?? lead.assignedToId;
      if (!target) continue;
      byAssignee.set(target, [...(byAssignee.get(target) ?? []), lead]);
    }
    await Promise.all(
      [...byAssignee.entries()].map(([userId, group]) =>
        createNotification(
          userId,
          'NEW_LEAD_ASSIGNED',
          group.length === 1 ? 'Lost lead revived' : `${group.length} lost leads revived`,
          group.length === 1
            ? `"${group[0].name}" was revived by ${admin.name}: ${note}`
            : `${admin.name} revived ${group.length} leads for you. Open the leads to read the comment.`,
          group.length === 1 ? group[0].id : undefined,
        )
      )
    );

    ids.forEach((id) => emitLeadUpdated(id));
    res.json({
      success: true,
      data: { revived: ids.length, skipped: leadIds.length - ids.length },
    });
  } catch (e) {
    console.error('[lost-leads] reviveLostLeads error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};
