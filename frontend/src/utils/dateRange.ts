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

// ─── Employee-monitoring presets (Today / Yesterday / rolling windows) ────────

export type MonitoringPreset = 'today' | 'yesterday' | '7d' | '15d' | 'month' | 'custom';

export const MONITORING_PRESETS: { value: MonitoringPreset; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: '7d', label: 'Last 7 Days' },
  { value: '15d', label: 'Last 15 Days' },
  { value: 'month', label: 'Last Month' },
  { value: 'custom', label: 'Custom' },
];

// Resolves a preset (plus the custom range, used only when preset==='custom')
// to a concrete { from, to } pair of YYYY-MM-DD strings.
export function monitoringRange(preset: MonitoringPreset, custom: DateRange): DateRange {
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const now = new Date();
  const today = fmt(now);
  switch (preset) {
    case 'today':
      return { from: today, to: today };
    case 'yesterday': {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      return { from: fmt(y), to: fmt(y) };
    }
    case '7d':
      return rangeForDays(7);
    case '15d':
      return rangeForDays(15);
    case 'month':
      return rangeForDays(30);
    case 'custom':
      return custom;
  }
}
