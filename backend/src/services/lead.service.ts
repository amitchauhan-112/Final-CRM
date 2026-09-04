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
// overall workload, and scoped to "since the roster last changed" — not
// all-time. CampaignEmployee.assignedAt is reset for the whole current
// roster every time updateCampaign touches employeeIds (see
// reconcileCampaignEmployees below), so "since the latest assignedAt among
// current members" means: only leads that came in after the roster reached
// its current shape count towards fairness. This is what makes a fresh
// 2-employee campaign alternate 1st→A, 2nd→B, 3rd→A, ... while also making
// a newcomer joining an already-busy campaign share new leads fairly from
// here on, instead of being buried under the incumbent's head start (or
// instead of the incumbent's history being used against them).
export const assignEmployeeForCampaign = async (campaignId: string): Promise<string | null> => {
  const assignments = await prisma.campaignEmployee.findMany({
    where: { campaignId },
    orderBy: { assignedAt: 'asc' },
    select: { userId: true, assignedAt: true },
  });
  if (assignments.length === 0) return null;

  const cutoff = assignments.reduce((max, a) => (a.assignedAt > max ? a.assignedAt : max), assignments[0].assignedAt);

  const counts = await prisma.lead.groupBy({
    by: ['assignedToId'],
    where: {
      campaignId, deletedAt: null, createdAt: { gte: cutoff },
      assignedToId: { in: assignments.map((a) => a.userId) },
    },
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

// Reconciles a campaign's leads against a change to its employee roster.
// Three rules, per how the business actually wants this to work:
//  1. First-ever assignment (campaign had no employees before): every
//     existing lead is up for grabs, split round-robin by age across the
//     whole new roster.
//  2. An employee is added alongside employees who were already there:
//     existing leads are left exactly where they are — the incumbent keeps
//     what they already have. The newcomer only starts receiving leads
//     going forward (via assignEmployeeForCampaign's "since roster changed"
//     rotation, which naturally divides future leads between old and new).
//  3. An employee is removed from the roster: every lead they're currently
//     holding from this campaign (any status, unchanged otherwise) hands
//     off to whoever remains, split round-robin by age. If nobody remains,
//     their leads are left alone (nothing to hand off to).
// Returns how many leads each employee received, for a summary notification.
export const reconcileCampaignEmployees = async (
  campaignId: string,
  oldEmployeeIds: string[],
  newEmployeeIds: string[]
): Promise<Map<string, number>> => {
  const movedCountByEmployee = new Map<string, number>();
  if (newEmployeeIds.length === 0) return movedCountByEmployee;

  const transfer = async (leads: { id: string }[]) => {
    await Promise.all(leads.map((lead, i) => {
      const targetId = newEmployeeIds[i % newEmployeeIds.length];
      movedCountByEmployee.set(targetId, (movedCountByEmployee.get(targetId) ?? 0) + 1);
      return prisma.lead.update({ where: { id: lead.id }, data: { assignedToId: targetId } });
    }));
  };

  if (oldEmployeeIds.length === 0) {
    // Rule 1 — nobody owned this campaign's leads before; everything's in play.
    const leads = await prisma.lead.findMany({
      where: { campaignId, deletedAt: null },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    await transfer(leads);
    return movedCountByEmployee;
  }

  // Rule 3 — hand off each removed employee's leads to whoever remains.
  // Employees who stayed (rule 2) are simply never touched here.
  const removed = oldEmployeeIds.filter((id) => !newEmployeeIds.includes(id));
  for (const removedId of removed) {
    const leads = await prisma.lead.findMany({
      where: { campaignId, assignedToId: removedId, deletedAt: null },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    await transfer(leads);
  }

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
