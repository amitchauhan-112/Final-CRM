
import prisma from '../lib/prisma.js';
import { getRuleNumber } from './businessRule.service.js';

// ─── Notification taxonomy ───────────────────────────────────────────────────
// Layered on top of the existing free-string `type` — every known type gets a
// sensible category/severity default here so existing call sites (which
// don't pass these explicitly) still get meaningfully categorized
// notifications. `channel` stays IN_APP-only everywhere: EMAIL/SMS/WHATSAPP
// are architecture-ready tags for a future integration, never dispatched.
const TYPE_META: Record<string, { category: string; severity: string }> = {
  FOLLOW_UP_DUE: { category: 'SALES', severity: 'REMINDER' },
  FOLLOW_UP_OVERDUE: { category: 'SALES', severity: 'WARNING' },
  FOLLOW_UP_ESCALATED: { category: 'SALES', severity: 'CRITICAL' },
  LEAD_STATUS_CHANGED: { category: 'SALES', severity: 'INFO' },
  NEW_LEAD_ASSIGNED: { category: 'SALES', severity: 'INFO' },
  WHATSAPP_MESSAGE_RECEIVED: { category: 'SALES', severity: 'INFO' },
  DEPARTURE_APPROACHING: { category: 'OPERATIONS', severity: 'REMINDER' },
  HOTEL_PENDING: { category: 'OPERATIONS', severity: 'WARNING' },
  HOTEL_CONFIRMED: { category: 'OPERATIONS', severity: 'SUCCESS' },
  VEHICLE_PENDING: { category: 'OPERATIONS', severity: 'WARNING' },
  VEHICLE_CONFIRMED: { category: 'OPERATIONS', severity: 'SUCCESS' },
  ROOM_ALLOCATION_PENDING: { category: 'OPERATIONS', severity: 'WARNING' },
  TRIP_CAPTAIN_PENDING: { category: 'OPERATIONS', severity: 'WARNING' },
  PAYMENT_PENDING_OPS: { category: 'OPERATIONS', severity: 'WARNING' },
  NEW_CONFIRMED_BOOKING: { category: 'OPERATIONS', severity: 'INFO' },
  TRAVELER_SUBMITTED: { category: 'OPERATIONS', severity: 'INFO' },
  TRAVELER_REJECTED: { category: 'OPERATIONS', severity: 'WARNING' },
  TRAVELER_CORRECTION_REQUESTED: { category: 'OPERATIONS', severity: 'WARNING' },
  NEW_PAYMENT_SUBMITTED: { category: 'FINANCE', severity: 'INFO' },
  PAYMENT_APPROVED: { category: 'FINANCE', severity: 'SUCCESS' },
  PAYMENT_REJECTED: { category: 'FINANCE', severity: 'WARNING' },
  PAYMENT_CORRECTION_REQUESTED: { category: 'FINANCE', severity: 'WARNING' },
  OVERDUE_CUSTOMER_PAYMENT: { category: 'FINANCE', severity: 'WARNING' },
  VENDOR_PAYMENT_DUE: { category: 'FINANCE', severity: 'REMINDER' },
  INSTALLMENT_DUE_TOMORROW: { category: 'FINANCE', severity: 'REMINDER' },
  INSTALLMENT_DUE_TODAY: { category: 'FINANCE', severity: 'REMINDER' },
  FINAL_PAYMENT_REMINDER: { category: 'FINANCE', severity: 'REMINDER' },
  INSTALLMENT_OVERDUE: { category: 'FINANCE', severity: 'WARNING' },
  INSTALLMENT_ESCALATION: { category: 'FINANCE', severity: 'CRITICAL' },
  NEW_EXPENSE_SUBMITTED: { category: 'FINANCE', severity: 'INFO' },
  EXPENSE_APPROVED: { category: 'FINANCE', severity: 'SUCCESS' },
  EXPENSE_REJECTED: { category: 'FINANCE', severity: 'WARNING' },
  REFUND_REQUESTED: { category: 'FINANCE', severity: 'INFO' },
};
const DEFAULT_META = { category: 'SYSTEM', severity: 'INFO' };

export const createNotification = async (
  userId: string,
  type: string,
  title: string,
  message: string,
  leadId?: string,
  departureId?: string,
  severity?: string,
  category?: string
) => {
  const meta = TYPE_META[type] ?? DEFAULT_META;
  const notification = await prisma.notification.create({
    data: {
      userId, type, title, message, leadId, departureId,
      severity: severity ?? meta.severity,
      category: category ?? meta.category,
    },
  });
  return notification;
};

export const sendFollowUpReminders = async () => {
  const now = new Date();
  const dueSoonMinutes = await getRuleNumber('FOLLOWUP_DUE_SOON_MINUTES', 60);
  const oneHourLater = new Date(now.getTime() + dueSoonMinutes * 60 * 1000);

  const dueLeads = await prisma.lead.findMany({
    where: { status: 'FOLLOW_UP_SCHEDULED', followUpDone: false, followUpDate: { gte: now, lte: oneHourLater }, assignedToId: { not: null } },
  });

  for (const lead of dueLeads) {
    if (!lead.assignedToId) continue;
    const alreadyNotified = await prisma.notification.findFirst({
      where: { leadId: lead.id, type: 'FOLLOW_UP_DUE', createdAt: { gte: new Date(now.getTime() - 60 * 60 * 1000) } },
    });
    if (!alreadyNotified) {
      await createNotification(lead.assignedToId, 'FOLLOW_UP_DUE', 'Follow-up Due Soon',
        `Follow-up with ${lead.name} is due within the hour.${lead.followUpNotes ? ' Note: ' + lead.followUpNotes : ''}`, lead.id);
    }
  }

  const overdueLeads = await prisma.lead.findMany({
    where: { status: 'FOLLOW_UP_SCHEDULED', followUpDone: false, followUpDate: { lt: now }, assignedToId: { not: null } },
  });

  for (const lead of overdueLeads) {
    if (!lead.assignedToId) continue;
    const existing = await prisma.notification.findFirst({
      where: { leadId: lead.id, type: 'FOLLOW_UP_OVERDUE', createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) } },
    });
    if (!existing) {
      await createNotification(lead.assignedToId, 'FOLLOW_UP_OVERDUE', 'Overdue Follow-up',
        `Follow-up with ${lead.name} is overdue! Please take action immediately.`, lead.id);
    }
  }

  // Real escalation — beyond the configurable threshold overdue, notify Admin
  // (not just re-fire to the same assignee).
  const escalationHours = await getRuleNumber('FOLLOWUP_ESCALATION_HOURS', 24);
  const escalationCutoff = new Date(now.getTime() - escalationHours * 60 * 60 * 1000);
  const severelyOverdueLeads = overdueLeads.filter((l) => l.followUpDate && l.followUpDate < escalationCutoff);
  for (const lead of severelyOverdueLeads) {
    const alreadyEscalated = await prisma.notification.findFirst({
      where: { leadId: lead.id, type: 'FOLLOW_UP_ESCALATED', createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) } },
    });
    if (alreadyEscalated) continue;
    const admins = await prisma.user.findMany({
      where: { role: 'ADMIN', isActive: true, ...(lead.organizationId ? { organizationId: lead.organizationId } : {}) },
      select: { id: true },
    });
    for (const admin of admins) {
      await createNotification(admin.id, 'FOLLOW_UP_ESCALATED', 'Follow-up Escalated',
        `${lead.name}'s follow-up has been overdue for over ${escalationHours} hours and still hasn't been actioned.`, lead.id);
    }
  }
};

// No-op now that Socket.IO has been removed (frontend polls via React Query
// refetchInterval instead) — kept as a stub so the ~12 call sites elsewhere
// don't need to change.
export const emitLeadUpdated = (_leadId: string) => {};

// ─── Operations Panel ────────────────────────────────────────────────────────

// No-op now that Socket.IO has been removed — see emitLeadUpdated above.
export const emitOperationsUpdated = (_departureId: string) => {};

export const notifyOperationsTeam = async (
  organizationId: string | null,
  type: string,
  title: string,
  message: string,
  departureId?: string,
  severity?: string
) => {
  const team = await prisma.user.findMany({
    where: { role: { in: ['ADMIN', 'OPERATIONS'] }, isActive: true, ...(organizationId ? { organizationId } : {}) },
    select: { id: true },
  });
  for (const member of team) {
    await createNotification(member.id, type, title, message, undefined, departureId, severity);
  }
};

export const sendOperationsReminders = async () => {
  const now = new Date();
  const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0);
  const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  const dedupWindow = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const upcomingDepartures = await prisma.departure.findMany({
    where: { status: { in: ['UPCOMING', 'ACTIVE'] }, departureDate: { gte: startOfToday, lte: in48h } },
    include: {
      hotels: { select: { status: true } },
      vehicles: { select: { status: true } },
      bookings: { select: { balanceAmount: true } },
    },
  });

  for (const dep of upcomingDepartures) {
    const checks: Array<{ type: string; title: string; message: string; when: boolean }> = [
      {
        type: 'DEPARTURE_APPROACHING',
        title: 'Departure Approaching',
        message: `${dep.destination} departs ${dep.departureDate.toDateString()} — within 48 hours.`,
        when: true,
      },
      {
        type: 'HOTEL_PENDING',
        title: 'Hotel Booking Pending',
        message: `${dep.destination} (${dep.departureDate.toDateString()}) has no confirmed hotel yet.`,
        when: dep.hotels.length === 0 || dep.hotels.every((h) => h.status === 'PENDING'),
      },
      {
        type: 'VEHICLE_PENDING',
        title: 'Vehicle Booking Pending',
        message: `${dep.destination} (${dep.departureDate.toDateString()}) has no confirmed vehicle yet.`,
        when: dep.vehicles.length === 0 || dep.vehicles.every((v) => v.status === 'PENDING'),
      },
      {
        type: 'ROOM_ALLOCATION_PENDING',
        title: 'Room Allocation Pending',
        message: `${dep.destination} (${dep.departureDate.toDateString()}) still needs room allocation.`,
        when: dep.hotels.length > 0 && dep.hotels.every((h) => !(h as unknown as { roomAllocation?: string }).roomAllocation),
      },
      {
        type: 'TRIP_CAPTAIN_PENDING',
        title: 'Trip Captain Not Assigned',
        message: `${dep.destination} (${dep.departureDate.toDateString()}) has no trip captain assigned.`,
        when: dep.tripCaptainStatus === 'UNASSIGNED',
      },
      {
        type: 'PAYMENT_PENDING_OPS',
        title: 'Customer Payment Pending',
        message: `${dep.destination} (${dep.departureDate.toDateString()}) has travelers with pending balance.`,
        when: dep.bookings.some((b) => b.balanceAmount > 0),
      },
    ];

    for (const check of checks) {
      if (!check.when) continue;
      const alreadyNotified = await prisma.notification.findFirst({
        where: { type: check.type, message: check.message, createdAt: { gte: dedupWindow } },
      });
      if (!alreadyNotified) {
        await notifyOperationsTeam(dep.organizationId, check.type, check.title, check.message, dep.id);
      }
    }
  }
};

// Auto-transitions departure status based on today vs. departure/return dates —
// keeps Active Trips / Completed Trips dashboard counts accurate without manual input.
export const updateDepartureStatuses = async () => {
  const now = new Date();
  const today = new Date(now); today.setHours(0, 0, 0, 0);

  await prisma.departure.updateMany({
    where: { status: 'UPCOMING', departureDate: { lte: now } },
    data: { status: 'ACTIVE' },
  });

  const active = await prisma.departure.findMany({ where: { status: 'ACTIVE' }, select: { id: true, departureDate: true, returnDate: true } });
  const toComplete = active
    .filter((d) => (d.returnDate ?? d.departureDate) < today)
    .map((d) => d.id);
  if (toComplete.length) {
    await prisma.departure.updateMany({ where: { id: { in: toComplete } }, data: { status: 'COMPLETED' } });
  }
};

// ─── Finance Panel ───────────────────────────────────────────────────────────

// No-op now that Socket.IO has been removed — see emitLeadUpdated above.
export const emitFinanceUpdated = () => {};

export const notifyFinanceTeam = async (
  organizationId: string | null,
  type: string,
  title: string,
  message: string,
  departureId?: string,
  severity?: string
) => {
  const team = await prisma.user.findMany({
    where: { role: { in: ['ADMIN', 'FINANCE'] }, isActive: true, ...(organizationId ? { organizationId } : {}) },
    select: { id: true },
  });
  for (const member of team) {
    await createNotification(member.id, type, title, message, undefined, departureId, severity);
  }
};

export const sendFinanceReminders = async () => {
  const now = new Date();
  const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const dedupWindow = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // Overdue customer balances
  const overdueBookings = await prisma.booking.findMany({
    where: { status: 'ACTIVE', balanceAmount: { gt: 0 }, balanceDueDate: { lt: now } },
    include: { lead: { select: { name: true } } },
  });
  for (const b of overdueBookings) {
    const message = `${b.lead.name} — ₹${b.balanceAmount.toLocaleString()} overdue since ${b.balanceDueDate!.toDateString()}.`;
    const alreadyNotified = await prisma.notification.findFirst({
      where: { type: 'OVERDUE_CUSTOMER_PAYMENT', message, createdAt: { gte: dedupWindow } },
    });
    if (!alreadyNotified) {
      await notifyFinanceTeam(b.organizationId, 'OVERDUE_CUSTOMER_PAYMENT', 'Overdue Customer Payment', message, b.departureId ?? undefined);
    }
  }

  // Vendor payments due within 7 days
  const dueVendorPayments = await prisma.vendorPayment.findMany({
    where: { status: { in: ['PENDING', 'PARTIAL'] }, dueDate: { gte: now, lte: in7Days } },
    include: { vendor: { select: { name: true } } },
  });
  for (const vp of dueVendorPayments) {
    const message = `${vp.vendor.name} — ₹${vp.balanceAmount.toLocaleString()} due ${vp.dueDate!.toDateString()}.`;
    const alreadyNotified = await prisma.notification.findFirst({
      where: { type: 'VENDOR_PAYMENT_DUE', message, createdAt: { gte: dedupWindow } },
    });
    if (!alreadyNotified) {
      await notifyFinanceTeam(vp.organizationId, 'VENDOR_PAYMENT_DUE', 'Vendor Payment Due', message, vp.departureId ?? undefined);
    }
  }

  // Payment schedule installments — escalating reminder tiers (due tomorrow /
  // due today / overdue / final reminder / escalation). Internal-only for now
  // (Sales/Finance/Admin in-app notification) — customer email/SMS reminders
  // are a fast-follow once the email service gets built.
  const in7DaysForSchedule = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const dueScheduleItems = await prisma.paymentScheduleItem.findMany({
    where: { status: { in: ['PENDING', 'PARTIAL'] }, dueDate: { lte: in7DaysForSchedule } },
    include: { booking: { select: { organizationId: true, departureId: true, lead: { select: { name: true } } } } },
  });
  for (const item of dueScheduleItems) {
    const daysUntilDue = Math.round((item.dueDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
    const outstanding = item.amount - item.paidAmount;
    const isFinal = item.label === 'Balance Payment';

    let type: string | null = null;
    let title = '';
    if (daysUntilDue === 1) { type = isFinal ? 'FINAL_PAYMENT_REMINDER' : 'INSTALLMENT_DUE_TOMORROW'; title = isFinal ? 'Final Payment Due Tomorrow' : 'Installment Due Tomorrow'; }
    else if (daysUntilDue === 0) { type = isFinal ? 'FINAL_PAYMENT_REMINDER' : 'INSTALLMENT_DUE_TODAY'; title = isFinal ? 'Final Payment Due Today' : 'Installment Due Today'; }
    else if (daysUntilDue < 0 && daysUntilDue >= -6) { type = 'INSTALLMENT_OVERDUE'; title = 'Installment Overdue'; }
    else if (daysUntilDue <= -7) { type = 'INSTALLMENT_ESCALATION'; title = 'Overdue Installment — Escalation'; }
    if (!type) continue;

    const message = `${item.booking.lead.name} — ${item.label} ₹${outstanding.toLocaleString()} ${daysUntilDue >= 0 ? `due ${item.dueDate.toDateString()}` : `overdue since ${item.dueDate.toDateString()}`}.`;
    const alreadyNotified = await prisma.notification.findFirst({
      where: { type, message, createdAt: { gte: dedupWindow } },
    });
    if (!alreadyNotified) {
      await notifyFinanceTeam(item.booking.organizationId, type, title, message, item.booking.departureId ?? undefined);
    }
  }
};
