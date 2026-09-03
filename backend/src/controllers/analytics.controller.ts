import { Response } from 'express';
import prisma from '../lib/prisma.js';
import { AuthenticatedRequest } from '../types/index.js';

const orgId = (req: AuthenticatedRequest) => req.user?.organizationId ?? null;
const orgFilter = (req: AuthenticatedRequest) => (orgId(req) ? { organizationId: orgId(req) } : {});

// ─── Business Intelligence & Analytics ───────────────────────────────────────
// Every function here is a NEW, purpose-built aggregation for the Admin-only
// BI module — none of these replace or modify the existing Finance reports
// (getPackageProfitabilityReport, getDestinationRevenueReport, etc.), which
// keep working exactly as before. Where the underlying formula is the same
// (revenue/cost/profit), the same "compute on read" idiom is reused, just
// with the additional fields this module needs (cancellation %, growth,
// referral count, response time, etc.) and without Finance's role guard.
//
// Known approximations (documented, not silently faked — see the plan):
// - "Returning customers" / referral attribution: Booking.leadId is @unique,
//   so repeat customers are matched by Lead.phone across CONFIRMED leads.
// - Campaign "expenses"/ROI use Campaign.budget as the cost basis — there is
//   no separate ad-spend ledger in this schema.
// - Employee "response time" is approximated as time from Lead.createdAt to
//   that lead's first ActivityLog entry — there is no explicit
//   "first contacted at" field.
// - Employee "follow-up delay" is approximated as Lead.updatedAt minus
//   Lead.followUpDate for completed follow-ups — there is no explicit
//   "follow-up completed at" field, so a later, unrelated edit to the same
//   lead after completion would inflate this figure slightly.

// ─── Package Analytics ────────────────────────────────────────────────────────

export const getPackageAnalytics = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const packages = await prisma.package.findMany({
      where: { ...orgFilter(req) },
      select: {
        id: true, name: true, code: true,
        bookings: { select: { finalPrice: true, amountPaid: true, numberOfTravelers: true, status: true, departureDate: true, refunds: { where: { status: 'PAID' }, select: { amount: true } } } },
        departures: {
          select: {
            status: true, departureDate: true,
            vendorPayments: { select: { totalAmount: true } },
            expenses: { where: { status: 'APPROVED' }, select: { amount: true } },
          },
        },
      },
    });

    const rows = packages
      .map((p) => {
        const activeBookings = p.bookings.filter((b) => b.status === 'ACTIVE' || b.status === 'COMPLETED');
        const cancelledBookings = p.bookings.filter((b) => b.status === 'CANCELLED');
        const revenue = activeBookings.reduce((s, b) => s + b.finalPrice, 0);
        const collected = activeBookings.reduce((s, b) => s + b.amountPaid, 0);
        const passengers = activeBookings.reduce((s, b) => s + b.numberOfTravelers, 0);
        const vendorCost = p.departures.reduce((s, d) => s + d.vendorPayments.reduce((vs, v) => vs + v.totalAmount, 0), 0);
        const expenseCost = p.departures.reduce((s, d) => s + d.expenses.reduce((es, e) => es + e.amount, 0), 0);
        const refunds = p.bookings.reduce((s, b) => s + b.refunds.reduce((rs, r) => rs + r.amount, 0), 0);
        const profit = collected - vendorCost - expenseCost - refunds;
        const totalBookings = p.bookings.length;
        const upcomingTrips = p.departures.filter((d) => d.status === 'UPCOMING').length;

        const monthCounts: Record<string, number> = {};
        for (const b of activeBookings) {
          if (!b.departureDate) continue;
          const key = b.departureDate.toLocaleString('en-US', { month: 'long' });
          monthCounts[key] = (monthCounts[key] ?? 0) + 1;
        }
        const mostPopularMonth = Object.entries(monthCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

        return {
          id: p.id, name: p.name, code: p.code,
          bookings: totalBookings, passengers, revenue, expenses: vendorCost + expenseCost, profit,
          averageRating: null as number | null, // not yet collected anywhere in this schema
          cancellationPct: totalBookings > 0 ? Math.round((cancelledBookings.length / totalBookings) * 1000) / 10 : 0,
          upcomingTrips, mostPopularMonth,
        };
      })
      .filter((p) => p.bookings > 0 || p.upcomingTrips > 0);

    res.json({ success: true, data: rows });
  } catch (e) {
    console.error('[analytics] getPackageAnalytics error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// ─── Destination Analytics ────────────────────────────────────────────────────

export const getDestinationAnalytics = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const bookings = await prisma.booking.findMany({
      where: { ...orgFilter(req) },
      select: {
        status: true, finalPrice: true, amountPaid: true, numberOfTravelers: true, createdAt: true,
        packageId: true, package: { select: { name: true } },
        departure: { select: { destination: true } },
        lead: { select: { destination: true } },
        refunds: { where: { status: 'PAID' }, select: { amount: true } },
      },
    });
    const vendorPayments = await prisma.vendorPayment.findMany({
      where: { ...orgFilter(req) },
      select: { totalAmount: true, departure: { select: { destination: true } } },
    });
    const expenses = await prisma.expense.findMany({
      where: { status: 'APPROVED', ...orgFilter(req) },
      select: { amount: true, departure: { select: { destination: true } } },
    });

    type Bucket = { revenue: number; collected: number; refunds: number; passengers: number; packageCounts: Record<string, { name: string; count: number }>; thisMonthRevenue: number; prevMonthRevenue: number };
    const byDest: Record<string, Bucket> = {};
    const bucket = (dest: string): Bucket => {
      if (!byDest[dest]) byDest[dest] = { revenue: 0, collected: 0, refunds: 0, passengers: 0, packageCounts: {}, thisMonthRevenue: 0, prevMonthRevenue: 0 };
      return byDest[dest];
    };

    for (const b of bookings) {
      const dest = b.departure?.destination || b.lead.destination || 'Unspecified';
      const bk = bucket(dest);
      if (b.status === 'ACTIVE' || b.status === 'COMPLETED') {
        bk.revenue += b.finalPrice;
        bk.collected += b.amountPaid;
        bk.passengers += b.numberOfTravelers;
        if (b.packageId && b.package) {
          if (!bk.packageCounts[b.packageId]) bk.packageCounts[b.packageId] = { name: b.package.name, count: 0 };
          bk.packageCounts[b.packageId].count += 1;
        }
        if (b.createdAt >= monthStart) bk.thisMonthRevenue += b.finalPrice;
        else if (b.createdAt >= prevMonthStart && b.createdAt < monthStart) bk.prevMonthRevenue += b.finalPrice;
      }
      bk.refunds += b.refunds.reduce((s, r) => s + r.amount, 0);
    }

    const tripCounts: Record<string, number> = {};
    const allDepartures = await prisma.departure.findMany({ where: { ...orgFilter(req) }, select: { destination: true } });
    for (const d of allDepartures) tripCounts[d.destination] = (tripCounts[d.destination] ?? 0) + 1;

    const costByDest: Record<string, number> = {};
    for (const vp of vendorPayments) { const d = vp.departure?.destination; if (d) costByDest[d] = (costByDest[d] ?? 0) + vp.totalAmount; }
    for (const e of expenses) { const d = e.departure?.destination; if (d) costByDest[d] = (costByDest[d] ?? 0) + e.amount; }

    const rows = Object.entries(byDest).map(([destination, b]) => {
      const cost = costByDest[destination] ?? 0;
      const profit = b.collected - cost - b.refunds;
      const growthPct = b.prevMonthRevenue > 0 ? Math.round(((b.thisMonthRevenue - b.prevMonthRevenue) / b.prevMonthRevenue) * 1000) / 10 : null;
      const topPackages = Object.values(b.packageCounts).sort((a, c) => c.count - a.count).slice(0, 3).map((p) => p.name);
      return {
        destination, revenue: b.revenue, profit, trips: tripCounts[destination] ?? 0, passengers: b.passengers,
        growthPct, refundPct: b.revenue > 0 ? Math.round((b.refunds / b.revenue) * 1000) / 10 : 0, topPackages,
      };
    }).filter((r) => r.revenue > 0 || r.trips > 0).sort((a, b) => b.revenue - a.revenue);

    res.json({ success: true, data: rows });
  } catch (e) {
    console.error('[analytics] getDestinationAnalytics error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// ─── Campaign Analytics ───────────────────────────────────────────────────────

export const getCampaignAnalytics = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const campaigns = await prisma.campaign.findMany({
      where: { ...orgFilter(req) },
      select: {
        id: true, name: true, budget: true,
        leads: { where: { deletedAt: null }, select: { status: true, booking: { select: { finalPrice: true, status: true, createdAt: true } } } },
      },
    });

    const rows = campaigns.map((c) => {
      const leadsGenerated = c.leads.length;
      const confirmedLeads = c.leads.filter((l) => l.status === 'CONFIRMED' && l.booking);
      const bookings = confirmedLeads.length;
      const revenue = confirmedLeads.reduce((s, l) => s + (l.booking?.finalPrice ?? 0), 0);
      const cost = c.budget ?? 0;

      const monthCounts: Record<string, number> = {};
      for (const l of confirmedLeads) {
        if (!l.booking) continue;
        const key = l.booking.createdAt.toLocaleString('en-US', { month: 'long' });
        monthCounts[key] = (monthCounts[key] ?? 0) + 1;
      }
      const bestPerformingMonth = Object.entries(monthCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

      return {
        id: c.id, name: c.name,
        leadsGenerated, bookings, revenue, expenses: cost,
        roi: cost > 0 ? Math.round(((revenue - cost) / cost) * 1000) / 10 : null,
        costPerLead: leadsGenerated > 0 && cost > 0 ? Math.round((cost / leadsGenerated) * 100) / 100 : null,
        costPerBooking: bookings > 0 && cost > 0 ? Math.round((cost / bookings) * 100) / 100 : null,
        conversionRatePct: leadsGenerated > 0 ? Math.round((bookings / leadsGenerated) * 1000) / 10 : 0,
        bestPerformingMonth,
      };
    }).filter((c) => c.leadsGenerated > 0);

    res.json({ success: true, data: rows });
  } catch (e) {
    console.error('[analytics] getCampaignAnalytics error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// ─── Customer Analytics ───────────────────────────────────────────────────────
// "Customer" = a CONFIRMED Lead. Since Booking.leadId is @unique, repeat
// customers are grouped by phone number across multiple CONFIRMED leads.

export const getCustomerAnalytics = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const leads = await prisma.lead.findMany({
      where: { ...orgFilter(req), deletedAt: null, status: 'CONFIRMED' },
      select: {
        name: true, phone: true, destination: true,
        booking: {
          select: {
            finalPrice: true, status: true, packageId: true, package: { select: { name: true } },
            referralReceivedAt: true,
          },
        },
      },
    });

    type CustomerRow = {
      name: string; phone: string; totalSpending: number; tripsCompleted: number; tripsUpcoming: number; tripsCancelled: number;
      destinations: Record<string, number>; packages: Record<string, number>; referralCount: number; bookingCount: number;
    };
    const byPhone: Record<string, CustomerRow> = {};
    for (const l of leads) {
      if (!byPhone[l.phone]) byPhone[l.phone] = { name: l.name, phone: l.phone, totalSpending: 0, tripsCompleted: 0, tripsUpcoming: 0, tripsCancelled: 0, destinations: {}, packages: {}, referralCount: 0, bookingCount: 0 };
      const row = byPhone[l.phone];
      if (l.destination) row.destinations[l.destination] = (row.destinations[l.destination] ?? 0) + 1;
      if (!l.booking) continue;
      row.bookingCount += 1;
      row.totalSpending += l.booking.finalPrice;
      if (l.booking.status === 'COMPLETED') row.tripsCompleted += 1;
      else if (l.booking.status === 'ACTIVE') row.tripsUpcoming += 1;
      else if (l.booking.status === 'CANCELLED') row.tripsCancelled += 1;
      if (l.booking.packageId && l.booking.package) row.packages[l.booking.package.name] = (row.packages[l.booking.package.name] ?? 0) + 1;
      if (l.booking.referralReceivedAt) row.referralCount += 1;
    }

    const customers = Object.values(byPhone).map((r) => ({
      name: r.name, phone: r.phone,
      totalSpending: r.totalSpending, lifetimeValue: r.totalSpending,
      tripsCompleted: r.tripsCompleted, tripsUpcoming: r.tripsUpcoming, tripsCancelled: r.tripsCancelled,
      preferredDestination: Object.entries(r.destinations).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
      preferredPackage: Object.entries(r.packages).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
      referralCount: r.referralCount, isReturning: r.bookingCount > 1,
    })).sort((a, b) => b.totalSpending - a.totalSpending);

    const totalCustomers = customers.length;
    const returningCustomers = customers.filter((c) => c.isReturning).length;
    const summary = {
      totalCustomers, returningCustomers,
      averageSpending: totalCustomers > 0 ? Math.round(customers.reduce((s, c) => s + c.totalSpending, 0) / totalCustomers) : 0,
      totalReferrals: customers.reduce((s, c) => s + c.referralCount, 0),
    };

    res.json({ success: true, data: { summary, customers: customers.slice(0, 200) } });
  } catch (e) {
    console.error('[analytics] getCustomerAnalytics error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// ─── Employee Analytics ───────────────────────────────────────────────────────

export const getEmployeeAnalytics = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const employees = await prisma.user.findMany({
      where: { role: 'EMPLOYEE', isActive: true, ...orgFilter(req) },
      select: {
        id: true, name: true,
        assignedLeads: {
          where: { deletedAt: null },
          select: {
            status: true, createdAt: true, updatedAt: true, followUpDate: true, followUpDone: true,
            booking: { select: { finalPrice: true, status: true } },
            activityLogs: { select: { createdAt: true }, orderBy: { createdAt: 'asc' }, take: 1 },
          },
        },
        assignedTasks: { select: { status: true } },
      },
    });

    const rows = employees.map((emp) => {
      const leads = emp.assignedLeads;
      const total = leads.length;
      const confirmed = leads.filter((l) => l.status === 'CONFIRMED');
      const active = leads.filter((l) => !['CONFIRMED', 'LOST'].includes(l.status)).length;
      const revenueGenerated = confirmed.reduce((s, l) => s + (l.booking?.finalPrice ?? 0), 0);
      const conversionRatePct = total > 0 ? Math.round((confirmed.length / total) * 1000) / 10 : 0;

      const pendingFollowUps = leads.filter((l) => l.status === 'FOLLOW_UP_SCHEDULED' && !l.followUpDone).length;
      const completedFollowUps = leads.filter((l) => l.status === 'FOLLOW_UP_SCHEDULED' && l.followUpDone).length;

      const responseTimes = leads
        .filter((l) => l.activityLogs.length > 0)
        .map((l) => (l.activityLogs[0].createdAt.getTime() - l.createdAt.getTime()) / (1000 * 60 * 60));
      const avgResponseTimeHours = responseTimes.length ? Math.round((responseTimes.reduce((s, t) => s + t, 0) / responseTimes.length) * 10) / 10 : null;

      // How overdue a follow-up was by the time it got done — checked
      // regardless of the lead's current status (unlike pendingFollowUps/
      // completedFollowUps above, which only look at leads still sitting at
      // FOLLOW_UP_SCHEDULED — most completed follow-ups move the lead
      // forward to a new status, so scoping this the same way would miss
      // almost all of them). Only counts genuinely late completions — an
      // early/on-time one contributes 0, not a negative number.
      const followUpDelays = leads
        .filter((l) => l.followUpDone && l.followUpDate)
        .map((l) => Math.max(0, (l.updatedAt.getTime() - new Date(l.followUpDate!).getTime()) / (1000 * 60 * 60)));
      const avgFollowUpDelayHours = followUpDelays.length
        ? Math.round((followUpDelays.reduce((s, t) => s + t, 0) / followUpDelays.length) * 10) / 10
        : null;

      // Per-status pipeline breakdown — every LeadStatus, always present
      // (0 when the employee has none in that status) so the table column
      // set is consistent across employees.
      const byStatus: Record<string, number> = {
        NEW: 0, NOT_CONTACTED: 0, CONTACTED: 0, INTERESTED: 0,
        FOLLOW_UP_SCHEDULED: 0, CONFIRMED: 0, LOST: 0,
      };
      leads.forEach((l) => { byStatus[l.status] = (byStatus[l.status] ?? 0) + 1; });

      const tasks = emp.assignedTasks;
      const taskCompletionRatePct = tasks.length > 0 ? Math.round((tasks.filter((t) => t.status === 'DONE').length / tasks.length) * 1000) / 10 : null;

      return {
        id: emp.id, name: emp.name,
        assignedLeads: total, activeLeads: active, bookings: confirmed.length, revenueGenerated,
        conversionRatePct, avgResponseTimeHours, pendingFollowUps, completedFollowUps,
        avgFollowUpDelayHours, byStatus,
        taskCompletionRatePct, customerRating: null as number | null, // not yet collected — Future Ready per spec
      };
    }).sort((a, b) => b.revenueGenerated - a.revenueGenerated);

    res.json({ success: true, data: rows });
  } catch (e) {
    console.error('[analytics] getEmployeeAnalytics error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};
