// Operations tabs are driven by dates. The stored status only holds
// COMPLETED / CANCELLED (set by Operations or the completion sweep) and the
// UPCOMING → ACTIVE step from the daily cron. Everything else is read off the
// departure and return dates, so the tabs can never disagree with the calendar.
//   Upcoming  : departure date is after today
//   Active    : today is between departure date and end date
//   Overdue   : end date has passed, but the trip isn't Completed yet
//   Completed : end date has passed AND every applicable checklist item is done
//   Cancelled : cancelled

export const DEPARTURE_TABS = ['UPCOMING', 'ACTIVE', 'OVERDUE', 'COMPLETED', 'CANCELLED'] as const;
export type DepartureTab = (typeof DEPARTURE_TABS)[number];

export function startOfDay(now: Date = new Date()): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfTomorrow(now: Date = new Date()): Date {
  const d = startOfDay(now);
  d.setDate(d.getDate() + 1);
  return d;
}

// Prisma where-fragment for one tab. Meant to be combined via `AND`.
export function tabWhere(tab: DepartureTab, now: Date = new Date()): Record<string, unknown> {
  const today = startOfDay(now);
  const tomorrow = startOfTomorrow(now);
  const notClosed = { status: { in: ['UPCOMING', 'ACTIVE'] } };
  const endPassed = { OR: [{ returnDate: { lt: today } }, { returnDate: null, departureDate: { lt: today } }] };
  const endNotPassed = { OR: [{ returnDate: { gte: today } }, { returnDate: null, departureDate: { gte: today } }] };

  switch (tab) {
    case 'UPCOMING':
      return { ...notClosed, departureDate: { gte: tomorrow } };
    case 'ACTIVE':
      return { ...notClosed, departureDate: { lt: tomorrow }, AND: [endNotPassed] };
    case 'OVERDUE':
      return { ...notClosed, ...endPassed };
    case 'COMPLETED':
      return { status: 'COMPLETED' };
    case 'CANCELLED':
      return { status: 'CANCELLED' };
  }
}

// The label a departure should show right now, given its stored status and dates.
export function displayStatus(d: { status: string; departureDate: Date | string; returnDate?: Date | string | null }, now: Date = new Date()): string {
  if (d.status === 'COMPLETED' || d.status === 'CANCELLED') return d.status;
  const end = new Date(d.returnDate ?? d.departureDate);
  if (end < startOfDay(now)) return 'OVERDUE';
  if (new Date(d.departureDate) < startOfTomorrow(now)) return 'ACTIVE';
  return 'UPCOMING';
}
