// Lost-reason taxonomy. A lead's lostReason stores the leaf label
// ("No Response", "Budget Issue", "Plan Postponed", "Other"), which is enough to
// recover the category, so legacy rows need no backfill.

export const JUNK_REASONS = ['No Response', 'Booked Elsewhere', 'Date Not Suitable', 'Cancelled Trip', 'Not Interested'];
export const BUDGET_REASON = 'Budget Issue';
export const POSTPONED_REASON = 'Plan Postponed';
export const OTHER_REASON = 'Other';

export type LostBucket = 'JUNK' | 'POSTPONED' | 'OTHER';

export const LOST_BUCKETS: LostBucket[] = ['JUNK', 'POSTPONED', 'OTHER'];

// Budget Issue and Other both land in OTHER, as do legacy/unknown reasons.
export function bucketForReason(reason: string | null | undefined): LostBucket {
  if (reason && JUNK_REASONS.includes(reason)) return 'JUNK';
  if (reason === POSTPONED_REASON) return 'POSTPONED';
  return 'OTHER';
}

// Prisma `where` fragment that selects one bucket. OTHER also matches null,
// because Prisma's `notIn` alone would silently drop rows with a null reason.
export function bucketWhere(bucket: LostBucket): Record<string, unknown> {
  if (bucket === 'JUNK') return { lostReason: { in: JUNK_REASONS } };
  if (bucket === 'POSTPONED') return { lostReason: POSTPONED_REASON };
  return {
    OR: [
      { lostReason: null },
      { lostReason: { notIn: [...JUNK_REASONS, POSTPONED_REASON] } },
    ],
  };
}

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function currentMonthKey(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function isValidMonthKey(value: unknown): value is string {
  return typeof value === 'string' && MONTH_RE.test(value);
}

// Validates and normalises the lost-reason fields from a request body.
// Returns the values to store, or an error message.
export function resolveLostFields(input: {
  lostReason?: string | null;
  lostReasonOther?: string | null;
  postponedTo?: string | null;
}): { ok: true; lostReason: string | null; lostReasonOther: string | null; postponedTo: string | null } | { ok: false; error: string } {
  const reason = input.lostReason || null;
  if (reason === POSTPONED_REASON) {
    if (!isValidMonthKey(input.postponedTo)) {
      return { ok: false, error: 'Pick the month the customer wants to be contacted again' };
    }
    return { ok: true, lostReason: reason, lostReasonOther: null, postponedTo: input.postponedTo };
  }
  return {
    ok: true,
    lostReason: reason,
    lostReasonOther: reason === OTHER_REASON ? (input.lostReasonOther?.trim() || null) : null,
    postponedTo: null,
  };
}
