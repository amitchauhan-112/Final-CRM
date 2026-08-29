import { ChevronLeft, ChevronRight } from 'lucide-react';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function MonthPicker({ month, year, onChange }: { month: number; year: number; onChange: (month: number, year: number) => void }) {
  function shift(delta: number) {
    let m = month + delta;
    let y = year;
    if (m < 1) { m = 12; y -= 1; }
    if (m > 12) { m = 1; y += 1; }
    onChange(m, y);
  }

  return (
    <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl px-1 py-1 shadow-sm">
      <button onClick={() => shift(-1)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"><ChevronLeft className="w-4 h-4" /></button>
      <span className="text-sm font-semibold text-slate-700 px-2 min-w-[130px] text-center">{MONTH_NAMES[month - 1]} {year}</span>
      <button onClick={() => shift(1)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"><ChevronRight className="w-4 h-4" /></button>
    </div>
  );
}
