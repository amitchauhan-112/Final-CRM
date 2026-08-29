export type RangePreset = '30' | '60' | '90' | 'custom';

export const RANGE_PRESETS: { value: RangePreset; label: string }[] = [
  { value: '30', label: '30 Days' },
  { value: '60', label: '60 Days' },
  { value: '90', label: '90 Days' },
  { value: 'custom', label: 'Custom' },
];

export interface DateRange {
  from: string;
  to: string;
}

export function rangeForDays(days: number): DateRange {
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - days);
  return { from: fmt(from), to: fmt(to) };
}

export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}
