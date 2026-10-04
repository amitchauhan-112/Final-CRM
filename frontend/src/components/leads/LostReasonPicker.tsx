import { useState } from 'react';
import { ChevronDown, ChevronRight, Check } from 'lucide-react';
import { cn } from '../../utils/helpers';
import {
  JUNK_REASONS, BUDGET_REASON, POSTPONED_REASON, OTHER_REASON,
  bucketForReason, nextPostponeMonths, LostPayload,
} from '../../utils/lostReasons';

export interface LostSelection {
  reason: string;
  postponedTo: string;
  otherText: string;
}

export const EMPTY_LOST_SELECTION: LostSelection = { reason: '', postponedTo: '', otherText: '' };

export function lostSelectionError(sel: LostSelection): string | null {
  if (!sel.reason) return 'Please select a reason';
  if (sel.reason === POSTPONED_REASON && !sel.postponedTo) return 'Pick the month the customer wants to be contacted again';
  if (sel.reason === OTHER_REASON && !sel.otherText.trim()) return 'Please describe the reason';
  return null;
}

export function toLostPayload(sel: LostSelection): LostPayload {
  return {
    lostReason: sel.reason,
    lostReasonOther: sel.reason === OTHER_REASON ? sel.otherText.trim() : undefined,
    postponedTo: sel.reason === POSTPONED_REASON ? sel.postponedTo : undefined,
  };
}

interface Props {
  value: LostSelection;
  onChange: (next: LostSelection) => void;
}

// Two-level picker: Junk Lead and Plan Postponed expand into sub-options;
// Budget Issue and Other are single choices. Other reveals a required text box.
export default function LostReasonPicker({ value, onChange }: Props) {
  const [openGroup, setOpenGroup] = useState<'JUNK' | 'POSTPONED' | null>(() => {
    const b = bucketForReason(value.reason);
    return b === 'JUNK' || b === 'POSTPONED' ? b : null;
  });
  const months = nextPostponeMonths();

  const leafClass = (active: boolean) => cn(
    'w-full text-left px-4 py-2.5 rounded-xl border text-sm font-medium transition-all flex items-center justify-between',
    active
      ? 'bg-red-50 border-red-400 text-red-700 ring-1 ring-red-300'
      : 'border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50'
  );

  const groupHeaderClass = (active: boolean) => cn(
    'w-full text-left px-4 py-2.5 rounded-xl border text-sm font-semibold transition-all flex items-center justify-between',
    active ? 'border-red-400 text-red-700 bg-red-50' : 'border-slate-200 text-slate-800 hover:bg-slate-50'
  );

  const toggleGroup = (group: 'JUNK' | 'POSTPONED') => setOpenGroup((g) => (g === group ? null : group));

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-slate-700">Reason <span className="text-red-500">*</span></p>

      {/* Junk Lead */}
      <button type="button" onClick={() => toggleGroup('JUNK')} className={groupHeaderClass(JUNK_REASONS.includes(value.reason))}>
        <span>Junk Lead</span>
        {openGroup === 'JUNK' ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </button>
      {openGroup === 'JUNK' && (
        <div className="pl-4 grid grid-cols-1 gap-1.5">
          {JUNK_REASONS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => onChange({ reason: r, postponedTo: '', otherText: '' })}
              className={leafClass(value.reason === r)}
            >
              {r}
              {value.reason === r && <Check className="w-4 h-4" />}
            </button>
          ))}
        </div>
      )}

      {/* Budget Issue */}
      <button
        type="button"
        onClick={() => onChange({ reason: BUDGET_REASON, postponedTo: '', otherText: '' })}
        className={leafClass(value.reason === BUDGET_REASON)}
      >
        {BUDGET_REASON}
        {value.reason === BUDGET_REASON && <Check className="w-4 h-4" />}
      </button>

      {/* Plan Postponed */}
      <button type="button" onClick={() => toggleGroup('POSTPONED')} className={groupHeaderClass(value.reason === POSTPONED_REASON)}>
        <span>Plan Postponed</span>
        {openGroup === 'POSTPONED' ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </button>
      {openGroup === 'POSTPONED' && (
        <div className="pl-4 grid grid-cols-1 gap-1.5">
          {months.map((m) => {
            const active = value.reason === POSTPONED_REASON && value.postponedTo === m.value;
            return (
              <button
                key={m.value}
                type="button"
                onClick={() => onChange({ reason: POSTPONED_REASON, postponedTo: m.value, otherText: '' })}
                className={leafClass(active)}
              >
                Plan in {m.label}
                {active && <Check className="w-4 h-4" />}
              </button>
            );
          })}
        </div>
      )}

      {/* Other */}
      <button
        type="button"
        onClick={() => onChange({ reason: OTHER_REASON, postponedTo: '', otherText: value.reason === OTHER_REASON ? value.otherText : '' })}
        className={leafClass(value.reason === OTHER_REASON)}
      >
        Other
        {value.reason === OTHER_REASON && <Check className="w-4 h-4" />}
      </button>
      {value.reason === OTHER_REASON && (
        <div className="pl-4">
          <label className="label">Describe the reason <span className="text-red-500">*</span></label>
          <textarea
            value={value.otherText}
            onChange={(e) => onChange({ ...value, otherText: e.target.value })}
            rows={2}
            className="input resize-none"
            placeholder="Briefly describe why the lead was lost..."
          />
        </div>
      )}
    </div>
  );
}
