import { useState } from 'react';
import { Pencil, Check, X } from 'lucide-react';
import { useSalaryConfig, useSetSalaryConfig } from '../../hooks/useHR';
import { formatCurrency, blockDecimalKey } from '../../utils/helpers';
import { Skeleton } from '../ui/Skeleton';

export default function SalaryConfigPanel() {
  const { data, isLoading } = useSalaryConfig();
  const setSalary = useSetSalaryConfig();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [value, setValue] = useState('');

  if (isLoading) return <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-xl" />)}</div>;

  const rows = data ?? [];

  return (
    <div className="card overflow-hidden">
      <div className="p-4 border-b border-slate-100">
        <p className="text-sm font-semibold text-slate-700">Base salary configuration</p>
        <p className="text-xs text-slate-400 mt-0.5">One fixed monthly amount per employee — feeds the Payroll tab's salary line every month.</p>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
          <tr>
            <th className="text-left px-4 py-3">Employee</th>
            <th className="text-left px-4 py-3">Role</th>
            <th className="text-left px-4 py-3">Base Salary</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr key={r.user.id}>
              <td className="px-4 py-3 font-medium text-slate-700">{r.user.name}</td>
              <td className="px-4 py-3 text-xs text-slate-400">{r.user.role}</td>
              <td className="px-4 py-3">
                {editingId === r.user.id ? (
                  <div className="flex items-center gap-1">
                    <input type="number" step="1" onKeyDown={blockDecimalKey} value={value} onChange={(e) => setValue(e.target.value)} className="input py-1 text-sm w-32" autoFocus />
                    <button
                      onClick={() => { const n = Number(value); if (n >= 0) setSalary.mutate({ userId: r.user.id, baseSalary: n }, { onSuccess: () => setEditingId(null) }); }}
                      className="text-emerald-600 hover:text-emerald-700"
                    ><Check className="w-4 h-4" /></button>
                    <button onClick={() => setEditingId(null)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setEditingId(r.user.id); setValue(r.baseSalary != null ? String(r.baseSalary) : ''); }}
                    className="flex items-center gap-1.5 text-slate-700 hover:text-primary-600"
                  >
                    {r.baseSalary != null ? formatCurrency(r.baseSalary) : <span className="text-slate-300">Not set</span>}
                    <Pencil className="w-3 h-3" />
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
