// Every money amount in this app is whole rupees only, never paise — the
// frontend blocks decimal entry at the input level (see frontend's
// blockDecimalKey/wholeNumberRule in utils/helpers.ts), and this is the
// server-side backstop for anyone hitting the API directly.
export function isWholeAmount(v: unknown): boolean {
  if (v === undefined || v === null || v === '') return true; // let required-ness be checked separately
  const n = Number(v);
  return Number.isFinite(n) && Number.isInteger(n);
}

export const WHOLE_AMOUNT_ERROR = 'Amount must be a whole number, no decimals';
