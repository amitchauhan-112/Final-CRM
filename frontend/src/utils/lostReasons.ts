// Lost-reason taxonomy shared by every "mark as lost" picker. Must stay in sync
// with backend/src/utils/lostReasons.ts (the server re-validates these values).

export const JUNK_REASONS = ['No Response', 'Booked Elsewhere', 'Date Not Suitable', 'Cancelled Trip', 'Not Interested'];
export const BUDGET_REASON = 'Budget Issue';
export const POSTPONED_REASON = 'Plan Postponed';
export const OTHER_REASON = 'Other';

export type LostBucket = 'JUNK' | 'POSTPONED' | 'OTHER';

export const BUCKET_LABEL: Record<LostBucket, string> = {
  JUNK: 'Junk Lead',
  POSTPONED: 'Plan Postponed',
  OTHER: 'Other',
};

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "YYYY-MM" → "Nov 2026"
export function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return `${MONTH_SHORT[m - 1]} ${y}`;
}

export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// The five months after the current one — the only ones a postponement can target.
export function nextPostponeMonths(now: Date = new Date()): { value: string; label: string }[] {
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() + 1 + i, 1);
    return { value: monthKey(d), label: monthLabel(monthKey(d)) };
  });
}

export function bucketForReason(reason?: string | null): LostBucket {
  if (reason && JUNK_REASONS.includes(reason)) return 'JUNK';
  if (reason === POSTPONED_REASON) return 'POSTPONED';
  return 'OTHER';
}

// Human-readable reason for a lead, e.g. "No Response", "Plan Postponed · Nov 2026", "Other: <text>".
export function formatLostReason(lead: { lostReason?: string | null; lostReasonOther?: string | null; postponedTo?: string | null }): string {
  if (!lead.lostReason) return '—';
  if (lead.lostReason === POSTPONED_REASON) {
    return lead.postponedTo ? `${POSTPONED_REASON} · ${monthLabel(lead.postponedTo)}` : POSTPONED_REASON;
  }
  if (lead.lostReason === OTHER_REASON) return lead.lostReasonOther ? `${OTHER_REASON}: ${lead.lostReasonOther}` : OTHER_REASON;
  return lead.lostReason;
}

export interface LostPayload {
  lostReason: string;
  lostReasonOther?: string;
  postponedTo?: string;
}
