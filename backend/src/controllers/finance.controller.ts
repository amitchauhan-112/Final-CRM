import { Response } from 'express';
import prisma from '../lib/prisma.js';
import { AuthenticatedRequest } from '../types/index.js';

const orgId = (req: AuthenticatedRequest) => req.user?.organizationId ?? null;

// ─── Finance summary ──────────────────────────────────────────────────────────

export const getFinanceSummary = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const oid = orgId(req);
    const { month, year } = req.query;

    const now = new Date();
    const filterYear = year ? Number(year) : now.getFullYear();
    const filterMonth = month ? Number(month) : null;

    let dateFilter: any = {};
    if (filterMonth) {
      const start = new Date(filterYear, filterMonth - 1, 1);
      const end = new Date(filterYear, filterMonth, 0, 23, 59, 59);
      dateFilter = { createdAt: { gte: start, lte: end } };
    } else {
      const start = new Date(filterYear, 0, 1);
      const end = new Date(filterYear, 11, 31, 23, 59, 59);
      dateFilter = { createdAt: { gte: start, lte: end } };
    }

    const bookings = await prisma.booking.findMany({
      where: { organizationId: oid, status: 'ACTIVE', ...dateFilter },
      include: {
        lead: {
          select: {
            id: true, name: true, phone: true, email: true,
            destination: true, preferredDate: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const totalRevenue = bookings.reduce((s, b) => s + b.finalPrice, 0);
    const totalCollected = bookings.reduce((s, b) => s + b.amountPaid, 0);
    const totalBalance = bookings.reduce((s, b) => s + b.balanceAmount, 0);
    const fullyPaid = bookings.filter((b) => b.balanceAmount === 0).length;
    const partiallyPaid = bookings.filter((b) => b.amountPaid > 0 && b.balanceAmount > 0).length;
    const unpaid = bookings.filter((b) => b.amountPaid === 0).length;

    // Overdue: balance due date passed
    const overdueBalance = bookings
      .filter((b) => b.balanceAmount > 0 && b.balanceDueDate && new Date(b.balanceDueDate) < now)
      .reduce((s, b) => s + b.balanceAmount, 0);

    // Monthly breakdown for current year
    const monthlyData = Array.from({ length: 12 }, (_, i) => {
      const monthBookings = bookings.filter((b) => new Date(b.createdAt).getMonth() === i);
      return {
        month: i + 1,
        revenue: monthBookings.reduce((s, b) => s + b.finalPrice, 0),
        collected: monthBookings.reduce((s, b) => s + b.amountPaid, 0),
        count: monthBookings.length,
      };
    });

    res.json({
      success: true,
      data: {
        summary: { totalRevenue, totalCollected, totalBalance, overdueBalance, fullyPaid, partiallyPaid, unpaid, total: bookings.length },
        bookings,
        monthlyData,
      },
    });
  } catch (e) {
    console.error('[finance] summary error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// ─── All bookings (for bookings list page) ───────────────────────────────────

export const getAllBookings = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const oid = orgId(req);
    const { status, search, page = '1', limit = '20', from, to } = req.query;

    const skip = (Number(page) - 1) * Number(limit);
    const where: any = { organizationId: oid };
    // Sales only ever sees their own bookings here — scoped server-side by
    // role, same pattern as getLeads, not trusted from a client-side param.
    if (req.user?.role === 'EMPLOYEE') where.lead = { assignedToId: req.user.id };
    if (status) where.status = status;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from as string);
      if (to) where.createdAt.lte = new Date(to as string);
    }
    if (search) {
      where.OR = [
        { travelerName: { contains: search as string, mode: 'insensitive' } },
        { lead: { name: { contains: search as string, mode: 'insensitive' } } },
        { lead: { phone: { contains: search as string, mode: 'insensitive' } } },
        { departureLocation: { contains: search as string, mode: 'insensitive' } },
        { departurePackage: { contains: search as string, mode: 'insensitive' } },
      ];
    }

    const [bookings, total] = await Promise.all([
      prisma.booking.findMany({
        where,
        include: {
          lead: {
            select: {
              id: true, name: true, phone: true, email: true,
              destination: true, preferredDate: true, assignedTo: { select: { id: true, name: true } },
            },
          },
        },
        // Sorted by last activity, not just creation time — a booking that
        // was just confirmed, edited, or had a new payment recorded should
        // rise back to the top instead of staying wherever its original
        // createdAt placed it (a booking's own createdAt never changes, so
        // sorting by it alone left recently-touched bookings buried below
        // newer, untouched ones).
        orderBy: { updatedAt: 'desc' },
        skip,
        take: Number(limit),
      }),
      prisma.booking.count({ where }),
    ]);

    res.json({
      success: true,
      data: bookings,
      meta: { total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / Number(limit)) },
    });
  } catch (e) {
    console.error('[finance] getAllBookings error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// ─── Operations: upcoming trips ───────────────────────────────────────────────

export const getUpcomingTrips = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const oid = orgId(req);
    const now = new Date();

    // Get all confirmed leads with preferredDate >= today
    const leads = await prisma.lead.findMany({
      where: {
        organizationId: oid,
        status: 'CONFIRMED',
        deletedAt: null,
        preferredDate: { not: null },
      },
      include: {
        booking: true,
        assignedTo: { select: { id: true, name: true } },
        campaign: { select: { id: true, name: true, destination: true } },
      },
      orderBy: { preferredDate: 'asc' },
    });

    // Group by departure date
    const grouped: Record<string, typeof leads> = {};
    for (const lead of leads) {
      const dateKey = lead.preferredDate!;
      if (!grouped[dateKey]) grouped[dateKey] = [];
      grouped[dateKey].push(lead);
    }

    const trips = Object.entries(grouped).map(([date, tripLeads]) => ({
      departureDate: date,
      totalPax: tripLeads.reduce((s, l) => s + (l.booking?.numberOfTravelers ?? l.groupSize ?? 1), 0),
      totalRevenue: tripLeads.reduce((s, l) => s + (l.booking?.finalPrice ?? 0), 0),
      totalCollected: tripLeads.reduce((s, l) => s + (l.booking?.amountPaid ?? 0), 0),
      bookings: tripLeads,
    }));

    // Upcoming (today and future)
    const today = now.toISOString().split('T')[0];
    const upcoming = trips.filter((t) => t.departureDate >= today);
    const past = trips.filter((t) => t.departureDate < today).slice(-10); // last 10 past dates

    res.json({ success: true, data: { upcoming, past } });
  } catch (e) {
    console.error('[finance] getUpcomingTrips error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// ─── Customers: confirmed leads with booking details ─────────────────────────

export const getCustomers = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const oid = orgId(req);
    const { search, page = '1', limit = '20' } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const where: any = { organizationId: oid, status: 'CONFIRMED', deletedAt: null };
    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: 'insensitive' } },
        { phone: { contains: search as string, mode: 'insensitive' } },
        { email: { contains: search as string, mode: 'insensitive' } },
      ];
    }

    const [leads, total] = await Promise.all([
      prisma.lead.findMany({
        where,
        include: {
          booking: true,
          assignedTo: { select: { id: true, name: true } },
          campaign: { select: { id: true, name: true, destination: true } },
        },
        orderBy: { updatedAt: 'desc' },
        skip,
        take: Number(limit),
      }),
      prisma.lead.count({ where }),
    ]);

    res.json({
      success: true,
      data: leads,
      meta: { total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / Number(limit)) },
    });
  } catch (e) {
    console.error('[finance] getCustomers error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};
