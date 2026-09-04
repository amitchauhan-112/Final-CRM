import { Response } from 'express';
import { AuthenticatedRequest } from '../types/index.js';
import prisma from '../lib/prisma.js';

function orgFilter(req: AuthenticatedRequest): Record<string, unknown> {
  return req.user?.organizationId ? { organizationId: req.user.organizationId } : {};
}

function parseRange(req: AuthenticatedRequest) {
  const { startDate, endDate } = req.query as Record<string, string>;
  const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 86400000);
  const end = endDate ? new Date(new Date(endDate).setHours(23, 59, 59, 999)) : new Date();
  return { start, end };
}

export const getLeadReport = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const org = orgFilter(req);
    const { start, end } = parseRange(req);
    const baseWhere = { ...org, createdAt: { gte: start, lte: end } };

    const [
      totalLeads,
      byStatus,
      bySource,
      byPriority,
      confirmedLeads,
      lostLeads,
      bySourceStatus,
    ] = await Promise.all([
      prisma.lead.count({ where: baseWhere }),
      prisma.lead.groupBy({ by: ['status'], where: baseWhere, _count: true }),
      prisma.lead.groupBy({ by: ['source'], where: baseWhere, _count: true }),
      prisma.lead.groupBy({ by: ['priority' as any], where: baseWhere, _count: true }),
      prisma.lead.count({ where: { ...baseWhere, status: 'CONFIRMED' } }),
      prisma.lead.count({ where: { ...baseWhere, status: 'LOST' } }),
      // Same shape as employee/campaign performance — total/confirmed/lost/
      // conversionRate, just grouped by source instead. One groupBy on
      // (source, status) rather than a query per source.
      prisma.lead.groupBy({ by: ['source', 'status'], where: baseWhere, _count: true }),
    ]);

    const conversionRate = totalLeads > 0 ? ((confirmedLeads / totalLeads) * 100).toFixed(1) : '0';

    const sourceMap = new Map<string, { total: number; confirmed: number; lost: number }>();
    for (const row of bySourceStatus) {
      const key = row.source || 'Unknown';
      const entry = sourceMap.get(key) ?? { total: 0, confirmed: 0, lost: 0 };
      entry.total += row._count;
      if (row.status === 'CONFIRMED') entry.confirmed += row._count;
      if (row.status === 'LOST') entry.lost += row._count;
      sourceMap.set(key, entry);
    }
    const sourceStats = Array.from(sourceMap.entries())
      .map(([name, s]) => ({
        name, ...s,
        conversionRate: s.total > 0 ? parseFloat(((s.confirmed / s.total) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.total - a.total);

    res.json({
      success: true,
      data: {
        summary: { totalLeads, confirmedLeads, lostLeads, conversionRate: parseFloat(conversionRate) },
        byStatus: byStatus.map((r) => ({ name: r.status, count: r._count })),
        bySource: bySource.map((r) => ({ name: r.source || 'Unknown', count: r._count })),
        byPriority: (byPriority as any[]).map((r) => ({ name: r.priority || 'MEDIUM', count: r._count })),
        sourceStats,
      },
    });
  } catch (e) {
    console.error('[reports] getLeadReport error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

export const getLostReasonReport = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const org = orgFilter(req);
    const { start, end } = parseRange(req);
    const where = { ...org, status: 'LOST' as const, createdAt: { gte: start, lte: end } };

    const [byReason, total] = await Promise.all([
      (prisma.lead as any).groupBy({ by: ['lostReason'], where, _count: true }),
      prisma.lead.count({ where }),
    ]);

    const reasons = (byReason as { lostReason: string | null; _count: number }[])
      .map((r) => ({ reason: r.lostReason || 'Not specified', count: r._count }))
      .sort((a, b) => b.count - a.count);

    res.json({ success: true, data: { total, reasons } });
  } catch (e) {
    console.error('[reports] getLostReasonReport error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

export const getCampaignReport = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const org = orgFilter(req);
    const { start, end } = parseRange(req);

    const campaigns = await (prisma as any).campaign.findMany({
      where: { ...org },
      select: { id: true, name: true, status: true, destination: true },
      orderBy: { createdAt: 'desc' },
    }).catch(() => []);

    const stats = await Promise.all(
      (campaigns as { id: string; name: string; status: string; destination?: string }[]).map(async (c) => {
        const dateWhere = { ...org, campaignId: c.id, createdAt: { gte: start, lte: end } };
        const [total, confirmed, lost] = await Promise.all([
          prisma.lead.count({ where: dateWhere }),
          prisma.lead.count({ where: { ...dateWhere, status: 'CONFIRMED' } }),
          prisma.lead.count({ where: { ...dateWhere, status: 'LOST' } }),
        ]);
        return {
          ...c,
          total,
          confirmed,
          lost,
          conversionRate: total > 0 ? parseFloat(((confirmed / total) * 100).toFixed(1)) : 0,
        };
      })
    );

    res.json({
      success: true,
      data: { campaigns: stats.filter((c) => c.total > 0).sort((a, b) => b.total - a.total) },
    });
  } catch (e) {
    console.error('[reports] getCampaignReport error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

export const getDailyTrend = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const org = orgFilter(req);
    const { start, end } = parseRange(req);

    const leads = await prisma.lead.findMany({
      where: { ...org, createdAt: { gte: start, lte: end } },
      select: { createdAt: true, status: true },
    });

    const byDate: Record<string, { date: string; created: number; confirmed: number; lost: number }> = {};
    leads.forEach((l) => {
      const date = l.createdAt.toISOString().slice(0, 10);
      if (!byDate[date]) byDate[date] = { date, created: 0, confirmed: 0, lost: 0 };
      byDate[date].created++;
      if (l.status === 'CONFIRMED') byDate[date].confirmed++;
      if (l.status === 'LOST') byDate[date].lost++;
    });

    const trend = Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
    res.json({ success: true, data: { trend } });
  } catch (e) {
    console.error('[reports] getDailyTrend error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

export const getPerformanceReport = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const org = orgFilter(req);
    const { start, end } = parseRange(req);
    const baseWhere = { ...org, createdAt: { gte: start, lte: end } };

    const employees = await (prisma as any).user.findMany({
      where: { ...org, role: 'EMPLOYEE', isActive: true },
      select: { id: true, name: true, avatar: true },
    });

    const employeeStats = await Promise.all(
      employees.map(async (emp: any) => {
        const [totalLeads, confirmed, lost, followUps] = await Promise.all([
          prisma.lead.count({ where: { ...baseWhere, assignedToId: emp.id } }),
          prisma.lead.count({ where: { ...baseWhere, assignedToId: emp.id, status: 'CONFIRMED' } }),
          prisma.lead.count({ where: { ...baseWhere, assignedToId: emp.id, status: 'LOST' } }),
          // Follow-ups live as fields on Lead itself (followUpDate/followUpDone) —
          // there is no separate FollowUp model. Count this employee's leads with
          // a follow-up scheduled in the selected range.
          prisma.lead.count({ where: { ...org, assignedToId: emp.id, followUpDate: { gte: start, lte: end } } }),
        ]);
        return {
          id: emp.id,
          name: emp.name,
          avatar: emp.avatar,
          totalLeads,
          confirmed,
          lost,
          followUps,
          conversionRate: totalLeads > 0 ? parseFloat(((confirmed / totalLeads) * 100).toFixed(1)) : 0,
        };
      })
    );

    // Sort by confirmed leads desc
    employeeStats.sort((a, b) => b.confirmed - a.confirmed);

    const topCampaigns = await (prisma as any).campaign.findMany({
      where: { ...org, leads: { some: { createdAt: { gte: start, lte: end } } } },
      select: {
        id: true, name: true,
        _count: { select: { leads: true } },
      },
      orderBy: { leads: { _count: 'desc' } },
      take: 5,
    }).catch(() => []);

    res.json({
      success: true,
      data: { employees: employeeStats, topCampaigns },
    });
  } catch (e) {
    console.error('[reports] getPerformanceReport error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};
