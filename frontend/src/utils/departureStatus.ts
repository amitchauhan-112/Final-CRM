// An ACTIVE departure whose return date (or departure date, when there is no
// return date) is before today has run past its end and still isn't marked
// complete — Operations needs to act on it.
export function isDepartureOverdue(d: { status: string; departureDate: string; returnDate?: string | null }): boolean {
  if (d.status !== 'ACTIVE') return false;
  const end = new Date(d.returnDate ?? d.departureDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return end < today;
}
