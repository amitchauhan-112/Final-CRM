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

export const assignEmployeeForCampaign = async (campaignId: string): Promise<string | null> => {
  const assignments = await prisma.campaignEmployee.findMany({
    where: { campaignId },
    include: {
      user: {
        include: {
          assignedLeads: {
            where: { status: { notIn: ['CONFIRMED', 'LOST'] }, deletedAt: null },
          },
        },
      },
    },
  });

  if (assignments.length === 0) return null;
  return assignments.sort((a, b) => a.user.assignedLeads.length - b.user.assignedLeads.length)[0].user.id;
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
