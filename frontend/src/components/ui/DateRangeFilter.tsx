import { RANGE_PRESETS, RangePreset, DateRange, todayStr } from '../../utils/dateRange';
import { cn } from '../../utils/helpers';

interface DateRangeFilterProps {
  preset: RangePreset;
  onPresetChange: (preset: RangePreset) => void;
  customRange: DateRange;
  onCustomRangeChange: (range: DateRange) => void;
  label?: string;
}

// Shared date-range control — used on the Sales dashboard KPI row and again
// on the Leads list, so a stat card's date scope carries through to the
// filtered list it links to instead of resetting once you click in.
export default function DateRangeFilter({ preset, onPresetChange, customRange, onCustomRangeChange, label = 'Showing:' }: DateRangeFilterProps) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs font-medium text-slate-500 mr-1">{label}</span>
      <div className="tab-strip">
        {RANGE_PRESETS.map((p) => (
          <button
            key={p.value}
            onClick={() => {
              onPresetChange(p.value);
              if (p.value === 'custom') onCustomRangeChange(customRange);
            }}
            className={cn(preset === p.value ? 'tab-item-active' : 'tab-item')}
          >
            {p.label}
          </button>
        ))}
      </div>
      {preset === 'custom' && (
        <>
          <input
            type="date"
            value={customRange.from}
            max={customRange.to}
            onChange={(e) => onCustomRangeChange({ ...customRange, from: e.target.value })}
            className="input py-1 px-2 text-xs w-auto"
          />
          <span className="text-xs text-slate-400">to</span>
          <input
            type="date"
            value={customRange.to}
            min={customRange.from}
            max={todayStr()}
            onChange={(e) => onCustomRangeChange({ ...customRange, to: e.target.value })}
            className="input py-1 px-2 text-xs w-auto"
          />
        </>
      )}
    </div>
  );
}
