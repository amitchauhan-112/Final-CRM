import { useEffect, useRef, useState } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../utils/helpers';

interface DateTimePickerProps {
  value: string; // 'YYYY-MM-DDTHH:mm' (datetime-local format), or ''
  onChange: (value: string) => void;
  min?: string; // same format — days before this are disabled
  placeholder?: string;
  hasError?: boolean;
  className?: string;
  autoFocus?: boolean;
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const pad = (n: number) => String(n).padStart(2, '0');

function parseLocal(value: string): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function toValue(d: Date, hour: number, minute: number): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(hour)}:${pad(minute)}`;
}

function isSameDay(a: Date | null, b: Date | null): boolean {
  return !!a && !!b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatDisplay(value: string): string {
  const d = parseLocal(value);
  if (!d) return '';
  const datePart = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(d);
  const h = d.getHours();
  const displayH = h % 12 === 0 ? 12 : h % 12;
  return `${datePart} · ${displayH}:${pad(d.getMinutes())} ${h < 12 ? 'AM' : 'PM'}`;
}

// A compact, self-contained date+time picker — replaces the browser's
// native datetime-local widget with something that matches the app's
// design and closes itself the moment a full date+time is picked (Date ->
// Hour -> Minute, each tap advances a step; the last one commits & closes).
export default function DateTimePicker({
  value, onChange, min, placeholder = 'Select date & time', hasError, className, autoFocus,
}: DateTimePickerProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'date' | 'hour' | 'minute'>('date');
  const [viewMonth, setViewMonth] = useState<Date>(() => parseLocal(value) ?? new Date());
  const [pendingDate, setPendingDate] = useState<Date | null>(null);
  const [pendingHour, setPendingHour] = useState<number | null>(null);
  const [pendingAmPm, setPendingAmPm] = useState<'AM' | 'PM'>('AM');
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const minDate = min ? parseLocal(min) : null;

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const openPicker = () => {
    const existing = parseLocal(value);
    const base = existing ?? new Date();
    setViewMonth(existing ?? new Date());
    setPendingDate(existing);
    setPendingHour(existing ? existing.getHours() : null);
    setPendingAmPm(base.getHours() < 12 ? 'AM' : 'PM');
    setStep('date');
    setOpen(true);
  };

  const daysInView = (() => {
    const year = viewMonth.getFullYear();
    const month = viewMonth.getMonth();
    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: (Date | null)[] = [];
    for (let i = 0; i < firstWeekday; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
    return cells;
  })();

  const isDisabledDay = (d: Date) => {
    if (!minDate) return false;
    const dayEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
    return dayEnd < minDate;
  };

  const today = new Date();

  const handlePickDay = (d: Date) => {
    if (isDisabledDay(d)) return;
    setPendingDate(d);
    setStep('hour');
  };

  const hourNumTo24 = (hourNum: number, ampm: 'AM' | 'PM') => {
    if (ampm === 'AM') return hourNum === 12 ? 0 : hourNum;
    return hourNum === 12 ? 12 : hourNum + 12;
  };

  const handlePickHour = (hourNum: number) => {
    setPendingHour(hourNumTo24(hourNum, pendingAmPm));
    setStep('minute');
  };

  const handlePickMinute = (m: number) => {
    if (!pendingDate || pendingHour === null) return;
    onChange(toValue(pendingDate, pendingHour, m));
    setOpen(false);
  };

  const selectedHourNum = pendingHour === null ? null : (pendingHour % 12 === 0 ? 12 : pendingHour % 12);
  const dateLabel = pendingDate
    ? new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(pendingDate)
    : '';
  const hourLabel = selectedHourNum !== null ? `${selectedHourNum}:00 ${pendingHour! < 12 ? 'AM' : 'PM'}` : '';

  const minutes = Array.from({ length: 12 }, (_, i) => i * 5);
  const hours12 = Array.from({ length: 12 }, (_, i) => i + 1);

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        ref={triggerRef}
        type="button"
        autoFocus={autoFocus}
        onClick={() => (open ? setOpen(false) : openPicker())}
        className={cn(
          'input flex items-center justify-between gap-2 text-left w-full',
          hasError && 'border-red-300 ring-1 ring-red-200',
          !value && 'text-slate-400'
        )}
      >
        <span className="truncate">{value ? formatDisplay(value) : placeholder}</span>
        <CalendarIcon className="w-4 h-4 text-slate-400 flex-shrink-0" />
      </button>

      {open && (
        <div className="mt-2 w-full bg-white rounded-2xl shadow-lg ring-card border border-slate-100 p-3.5">
          {step === 'date' && (
            <>
              <div className="flex items-center justify-between mb-2.5">
                <button
                  type="button"
                  onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))}
                  className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <p className="text-sm font-semibold text-slate-800">{MONTHS[viewMonth.getMonth()]} {viewMonth.getFullYear()}</p>
                <button
                  type="button"
                  onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))}
                  className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-7 gap-0.5 mb-1">
                {WEEKDAYS.map((w) => (
                  <div key={w} className="text-center text-[10px] font-semibold text-slate-400 py-1">{w}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-0.5">
                {daysInView.map((d, idx) => {
                  if (!d) return <div key={idx} />;
                  const disabled = isDisabledDay(d);
                  const isToday = isSameDay(d, today);
                  const isSelected = isSameDay(d, pendingDate);
                  return (
                    <button
                      key={idx}
                      type="button"
                      disabled={disabled}
                      onClick={() => handlePickDay(d)}
                      className={cn(
                        'aspect-square rounded-lg text-xs font-medium flex items-center justify-center transition-colors',
                        disabled
                          ? 'text-slate-200 cursor-not-allowed'
                          : isSelected
                            ? 'bg-primary-600 text-white shadow-sm'
                            : isToday
                              ? 'bg-primary-50 text-primary-700 font-semibold'
                              : 'text-slate-700 hover:bg-slate-100'
                      )}
                    >
                      {d.getDate()}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {step === 'hour' && (
            <>
              <div className="flex items-center gap-2 mb-3">
                <button type="button" onClick={() => setStep('date')} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 flex-shrink-0">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="min-w-0">
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide font-semibold">Pick a time</p>
                  <p className="text-sm font-semibold text-slate-800 truncate">{dateLabel}</p>
                </div>
                <div className="ml-auto flex rounded-lg border border-slate-200 overflow-hidden flex-shrink-0">
                  {(['AM', 'PM'] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPendingAmPm(p)}
                      className={cn(
                        'px-2 py-1 text-[11px] font-semibold transition-colors',
                        pendingAmPm === p ? 'bg-primary-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'
                      )}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {hours12.map((h) => {
                  const isSelected = selectedHourNum === h && pendingHour !== null && (pendingHour < 12) === (pendingAmPm === 'AM');
                  return (
                    <button
                      key={h}
                      type="button"
                      onClick={() => handlePickHour(h)}
                      className={cn(
                        'py-2 rounded-lg text-sm font-medium transition-colors',
                        isSelected ? 'bg-primary-600 text-white shadow-sm' : 'text-slate-700 hover:bg-slate-100 bg-slate-50'
                      )}
                    >
                      {h}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {step === 'minute' && (
            <>
              <div className="flex items-center gap-2 mb-3">
                <button type="button" onClick={() => setStep('hour')} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 flex-shrink-0">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="min-w-0">
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide font-semibold">Pick minutes</p>
                  <p className="text-sm font-semibold text-slate-800 truncate">{dateLabel} · {hourLabel.replace(':00', '')}</p>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {minutes.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => handlePickMinute(m)}
                    className="py-2 rounded-lg text-sm font-medium text-slate-700 bg-slate-50 hover:bg-primary-50 hover:text-primary-700 transition-colors"
                  >
                    :{pad(m)}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
