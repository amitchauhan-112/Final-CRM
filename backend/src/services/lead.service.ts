import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma.js';
import { createNotification } from './notification.service.js';
import { fireEvent } from './automationEngine.service.js';

export interface CreateLeadInput {
  name: string;
  phone: string;
  email?: string;
  source: string;
  message?: string;
  destination?: string;
  whatsappMsgId?: string;
  instagramLeadId?: string;
  metaPageId?: string;
  adId?: string;
  adName?: string;
  adsetId?: string;
  metaCampaignId?: string;
  groupSize?: number;
  budget?: number;
  preferredDate?: string;
  organizationId?: string | null;
  /** Direct campaign ID override — skips matchCampaign() when set */
  campaignId?: string;
  /** Backdate createdAt for historical imports (e.g. Meta lead backfill) — omit for real-time leads */
  createdAt?: Date;
  /**
   * Backdate updatedAt to match createdAt for historical imports. Without
   * this, a backfilled lead's updatedAt defaults to the moment the sync job
   * actually ran — which, under the "sort by last activity" default, would
   * put a months-old backfilled lead at the very top of the list as if it
   * had just come in. Omit for real-time leads (both should be "now").
   */
  updatedAt?: Date;
}

export const matchCampaign = async (input: {
  whatsappNumber?: string;
  instagramAdId?: string;
  message?: string;
  organizationId?: string | null;
}): Promise<string | null> => {
  const where: Prisma.CampaignWhereInput = { status: 'ACTIVE' };
  if (input.organizationId) where.organizationId = input.organizationId;

  const campaigns = await prisma.campaign.findMany({ where });

  for (const campaign of campaigns) {
    if (input.whatsappNumber && campaign.whatsappNumber === input.whatsappNumber) return campaign.id;
    if (input.instagramAdId && campaign.instagramAdId === input.instagramAdId) return campaign.id;
    if (input.message) {
      const keywords: string[] = JSON.parse(campaign.keywords || '[]');
      if (keywords.length > 0) {
        const msgLower = input.message.toLowerCase();
        if (keywords.some((kw) => msgLower.includes(kw.toLowerCase()))) return campaign.id;
      }
    }
  }
  return null;
};

// Round-robin, scoped to THIS campaign specifically — not the employee's
// overall workload. Counts how many of this campaign's leads (any status,
// not just currently-open ones — see the comment below) each assigned
// employee already has, and hands the next one to whoever has the fewest,
// ties broken by the order they were added to the campaign. This is what
// makes a 2-employee campaign alternate 1st→A, 2nd→B, 3rd→A, 4th→B, ... —
// counting only "open" leads would let the rotation drift once a lead
// moves to CONFIRMED/LOST and drops out of that count.
export const assignEmployeeForCampaign = async (campaignId: string): Promise<string | null> => {
  const assignments = await prisma.campaignEmployee.findMany({
    where: { campaignId },
    orderBy: { assignedAt: 'asc' },
    select: { userId: true },
  });
  if (assignments.length === 0) return null;

  const counts = await prisma.lead.groupBy({
    by: ['assignedToId'],
    where: { campaignId, deletedAt: null, assignedToId: { in: assignments.map((a) => a.userId) } },
    _count: true,
  });
  const countMap = new Map(counts.map((c) => [c.assignedToId, c._count]));

  let best = assignments[0].userId;
  let bestCount = countMap.get(best) ?? 0;
  for (const a of assignments.slice(1)) {
    const c = countMap.get(a.userId) ?? 0;
    if (c < bestCount) { best = a.userId; bestCount = c; }
  }
  return best;
};

// Full redistribution of a campaign's current leads across its currently
// assigned employees, in strict round-robin order by lead age (oldest
// first) — called whenever the campaign's employee roster changes, so
// "assign this campaign to an employee" means every lead under it (past
// and future) ends up with them, split evenly if there's more than one
// assignee. Leaves leads alone if the campaign has no employees assigned
// (nothing to redistribute to) — never unassigns down to null.
export const redistributeCampaignLeads = async (
  campaignId: string,
  employeeIds: string[]
): Promise<Map<string, number>> => {
  const movedCountByEmployee = new Map<string, number>();
  if (employeeIds.length === 0) return movedCountByEmployee;

  const leads = await prisma.lead.findMany({
    where: { campaignId, deletedAt: null },
    select: { id: true, assignedToId: true },
    orderBy: { createdAt: 'asc' },
  });

  await Promise.all(leads.map((lead, i) => {
    const targetId = employeeIds[i % employeeIds.length];
    if (lead.assignedToId === targetId) return null;
    movedCountByEmployee.set(targetId, (movedCountByEmployee.get(targetId) ?? 0) + 1);
    return prisma.lead.update({ where: { id: lead.id }, data: { assignedToId: targetId } });
  }));

  return movedCountByEmployee;
};

export const createLead = async (
  input: CreateLeadInput,
  matchOptions?: { whatsappNumber?: string; instagramAdId?: string }
) => {
  // Use explicit campaignId from adMap resolution; fall back to keyword/number matching
  const campaignId = input.campaignId ?? await matchCampaign({
    whatsappNumber: matchOptions?.whatsappNumber,
    instagramAdId: matchOptions?.instagramAdId,
    message: input.message,
    organizationId: input.organizationId,
  });

  const assignedToId = campaignId ? await assignEmployeeForCampaign(campaignId) : null;

  // Destructure campaignId override so it doesn't conflict with the resolved value below
  const { campaignId: _overrideCampaignId, ...restInput } = input;

  const lead = await prisma.lead.create({
    data: {
      ...restInput,
      campaignId: campaignId ?? undefined,
      assignedToId: assignedToId ?? undefined,
    } as any,
    include: { campaign: true, assignedTo: true },
  });

  if (assignedToId) {
    await createNotification(
      assignedToId,
      'NEW_LEAD_ASSIGNED',
      'New Lead Assigned',
      `New lead from ${input.source}: ${input.name} — "${input.message?.slice(0, 80) ?? 'No message'}"`,
      lead.id,
    );
  }

  // Additive — runs alongside the assignment/notification above, never
  // replaces it. Any admin-defined LEAD_CREATED automation rules fire here.
  await fireEvent('LEAD_CREATED', {
    leadId: lead.id, name: lead.name, phone: lead.phone, source: lead.source,
    destination: lead.destination, assignedToId: lead.assignedToId, organizationId: lead.organizationId,
  }).catch((err) => console.error('[automation] LEAD_CREATED fireEvent error:', err));

  return lead;
};

export const getLeadStats = async (
  userId?: string,
  role?: string,
  organizationId?: string | null,
) => {
  const where: Prisma.LeadWhereInput = { deletedAt: null };
  if (role === 'EMPLOYEE' && userId) where.assignedToId = userId;
  if (organizationId) where.organizationId = organizationId;

  const [total, byStatus, bySource, overdue] = await Promise.all([
    prisma.lead.count({ where }),
    prisma.lead.groupBy({ by: ['status'], where, _count: true }),
    prisma.lead.groupBy({ by: ['source'], where, _count: true }),
    prisma.lead.count({
      where: { ...where, status: 'FOLLOW_UP_SCHEDULED', followUpDone: false, followUpDate: { lt: new Date() } },
    }),
  ]);

  const byStatusMap: Record<string, number> = {};
  byStatus.forEach((s) => (byStatusMap[s.status] = s._count));

  const bySourceMap: Record<string, number> = {};
  bySource.forEach((s) => (bySourceMap[s.source] = s._count));

  return { total, byStatus: byStatusMap, bySource: bySourceMap, overdue };
};
