import { Response } from 'express';
import prisma from '../lib/prisma.js';
import { AuthenticatedRequest } from '../types/index.js';

const orgId = (req: AuthenticatedRequest) => req.user?.organizationId ?? null;
const orgFilter = (req: AuthenticatedRequest) => (orgId(req) ? { organizationId: orgId(req) } : {});

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function endOfDay(d: Date) { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }

export const getDashboardStats = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const today = startOfDay(new Date());
    const todayEnd = endOfDay(new Date());
    const in7 = addDays(today, 7);
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

    const bookingOrgFilter = orgId(req) ? { organizationId: orgId(req) } : {};

    const [
      todaysCollections,
      monthlyCollections,
      activeBookings,
      pendingPaymentVerification,
      pendingBalanceBookings,
      upcomingDueBookings,
      overdueBookings,
      refundRequests,
      vendorPaymentsPending,
      monthlyByMethod,
      todaysExpenses,
      pendingExpenseApproval,
      monthlyVendorCosts,
      monthlyExpenses,
      monthlyRefunds,
      scheduleTotals,
    ] = await Promise.all([
      prisma.payment.aggregate({ where: { status: 'VERIFIED', verifiedAt: { gte: today, lte: todayEnd }, booking: bookingOrgFilter }, _sum: { amount: true } }),
      prisma.payment.aggregate({ where: { status: 'VERIFIED', verifiedAt: { gte: monthStart }, booking: bookingOrgFilter }, _sum: { amount: true } }),
      prisma.booking.findMany({ where: { status: 'ACTIVE', ...bookingOrgFilter }, select: { finalPrice: true } }),
      prisma.payment.count({ where: { status: 'PENDING', booking: bookingOrgFilter } }),
      prisma.booking.count({ where: { status: 'ACTIVE', balanceAmount: { gt: 0 }, ...bookingOrgFilter } }),
      prisma.booking.count({ where: { status: 'ACTIVE', balanceAmount: { gt: 0 }, balanceDueDate: { gte: today, lte: in7 }, ...bookingOrgFilter } }),
      prisma.booking.count({ where: { status: 'ACTIVE', balanceAmount: { gt: 0 }, balanceDueDate: { lt: today }, ...bookingOrgFilter } }),
      prisma.refund.count({ where: { status: 'REQUESTED', ...orgFilter(req) } }),
      prisma.vendorPayment.count({ where: { status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] }, ...orgFilter(req) } }),
      prisma.payment.groupBy({ by: ['method'], where: { status: 'VERIFIED', verifiedAt: { gte: monthStart }, booking: bookingOrgFilter }, _sum: { amount: true } }),
      prisma.expense.aggregate({ where: { status: 'APPROVED', approvedAt: { gte: today, lte: todayEnd }, ...orgFilter(req) }, _sum: { amount: true } }),
      prisma.expense.count({ where: { status: 'PENDING', ...orgFilter(req) } }),
      prisma.vendorPayment.aggregate({ where: { createdAt: { gte: monthStart }, ...orgFilter(req) }, _sum: { totalAmount: true } }),
      prisma.expense.aggregate({ where: { status: 'APPROVED', approvedAt: { gte: monthStart }, ...orgFilter(req) }, _sum: { amount: true } }),
      prisma.refund.aggregate({ where: { status: 'PAID', refundDate: { gte: monthStart }, ...orgFilter(req) }, _sum: { amount: true } }),
      prisma.paymentScheduleItem.aggregate({ where: { booking: bookingOrgFilter }, _sum: { amount: true, paidAmount: true } }),
    ]);

    // Cash currently with employees vs. already collected by the company —
    // same two aggregates the Employee Cash page computes, surfaced here too.
    const [cashHandedOver, cashCollected] = await Promise.all([
      prisma.employeeCashLedger.aggregate({ where: { type: 'HANDOVER', ...orgFilter(req) }, _sum: { amount: true } }),
      prisma.employeeCashLedger.aggregate({ where: { type: 'COLLECTION', ...orgFilter(req) }, _sum: { amount: true } }),
    ]);
    const cashCollectedByCompany = cashCollected._sum.amount ?? 0;
    const cashWithEmployees = (cashHandedOver._sum.amount ?? 0) - cashCollectedByCompany;

    const totalRevenue = activeBookings.reduce((s, b) => s + b.finalPrice, 0);
    const collectionByMethod: Record<string, number> = { CASH: 0, ONLINE: 0, UPI: 0, BANK_TRANSFER: 0, CHEQUE: 0 };
    for (const row of monthlyByMethod) collectionByMethod[row.method] = row._sum.amount ?? 0;

    // Collection trend — last 14 days
    const trendStart = addDays(today, -13);
    const trendPayments = await prisma.payment.findMany({
      where: { status: 'VERIFIED', verifiedAt: { gte: trendStart, lte: todayEnd }, booking: bookingOrgFilter },
      select: { amount: true, verifiedAt: true },
    });
    const trendMap: Record<string, number> = {};
    for (let i = 0; i < 14; i++) {
      const day = addDays(trendStart, i).toISOString().slice(0, 10);
      trendMap[day] = 0;
    }
    for (const p of trendPayments) {
      const day = p.verifiedAt!.toISOString().slice(0, 10);
      if (day in trendMap) trendMap[day] += p.amount;
    }
    const collectionTrend = Object.entries(trendMap).map(([date, amount]) => ({ date, amount }));

    // Revenue by destination — via linked Departure, falling back to Lead.destination
    const bookingsWithDest = await prisma.booking.findMany({
      where: { status: 'ACTIVE', ...bookingOrgFilter },
      select: { finalPrice: true, departure: { select: { destination: true } }, lead: { select: { destination: true } } },
    });
    const byDestination: Record<string, number> = {};
    for (const b of bookingsWithDest) {
      const dest = b.departure?.destination || b.lead?.destination || 'Unspecified';
      byDestination[dest] = (byDestination[dest] ?? 0) + b.finalPrice;
    }
    const revenueByDestination = Object.entries(byDestination).map(([destination, revenue]) => ({ destination, revenue })).sort((a, b) => b.revenue - a.revenue);

    // Revenue by departure
    const departures = await prisma.departure.findMany({
      where: { ...orgFilter(req) },
      select: { id: true, destination: true, departureDate: true, bookings: { where: { status: 'ACTIVE' }, select: { finalPrice: true } } },
      orderBy: { departureDate: 'asc' },
    });
    const revenueByDeparture = departures
      .map((d) => ({ id: d.id, label: `${d.destination} — ${d.departureDate.toISOString().slice(0, 10)}`, revenue: d.bookings.reduce((s, b) => s + b.finalPrice, 0) }))
      .filter((d) => d.revenue > 0);

    const profitThisMonth = (monthlyCollections._sum.amount ?? 0)
      - (monthlyVendorCosts._sum.totalAmount ?? 0)
      - (monthlyExpenses._sum.amount ?? 0)
      - (monthlyRefunds._sum.amount ?? 0);

    const scheduleTotalAmount = scheduleTotals._sum.amount ?? 0;
    const paymentCompletionPct = scheduleTotalAmount > 0
      ? Math.round(((scheduleTotals._sum.paidAmount ?? 0) / scheduleTotalAmount) * 1000) / 10
      : 0;

    // Top revenue package — same shape as revenue-by-destination, grouped by package instead
    const bookingsWithPackage = await prisma.booking.findMany({
      where: { status: 'ACTIVE', ...bookingOrgFilter },
      select: { finalPrice: true, package: { select: { id: true, name: true } } },
    });
    const byPackage: Record<string, { name: string; revenue: number }> = {};
    for (const b of bookingsWithPackage) {
      if (!b.package) continue;
      if (!byPackage[b.package.id]) byPackage[b.package.id] = { name: b.package.name, revenue: 0 };
      byPackage[b.package.id].revenue += b.finalPrice;
    }
    const topRevenuePackage = Object.values(byPackage).sort((a, b) => b.revenue - a.revenue)[0] ?? null;

    res.json({
      success: true,
      data: {
        todaysCollections: todaysCollections._sum.amount ?? 0,
        monthlyCollections: monthlyCollections._sum.amount ?? 0,
        totalRevenue,
        pendingPaymentVerification,
        pendingCustomerBalances: pendingBalanceBookings,
        upcomingDuePayments: upcomingDueBookings,
        overduePayments: overdueBookings,
        refundRequests,
        vendorPaymentsPending,
        todaysExpenses: todaysExpenses._sum.amount ?? 0,
        pendingExpenseApproval,
        profitThisMonth,
        topRevenuePackage,
        paymentCompletionPct,
        cashWithEmployees,
        cashCollectedByCompany,
        cashCollection: collectionByMethod.CASH,
        onlineCollection: collectionByMethod.ONLINE,
        upiCollection: collectionByMethod.UPI,
        bankTransferCollection: collectionByMethod.BANK_TRANSFER,
        collectionTrend,
        revenueByDestination,
        revenueByDeparture,
      },
    });
  } catch (e) {
    console.error('[finance] getDashboardStats error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};
