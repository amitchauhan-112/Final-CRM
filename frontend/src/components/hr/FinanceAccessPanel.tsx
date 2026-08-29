import { useState } from 'react';
import { ShieldCheck, ShieldOff, Clock } from 'lucide-react';
import { useSalaryAccessGrants, useGrantSalaryAccess, useRevokeSalaryAccess } from '../../hooks/useHR';
import { formatDate, cn } from '../../utils/helpers';
import { Skeleton } from '../ui/Skeleton';

export default function FinanceAccessPanel() {
  const { data, isLoading } = useSalaryAccessGrants();
  const grant = useGrantSalaryAccess();
  const revoke = useRevokeSalaryAccess();
  const [months, setMonths] = useState<Record<string, string>>({});

  if (isLoading) return <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>;

  const rows = data ?? [];

  return (
    <div className="card overflow-hidden">
      <div className="p-4 border-b border-slate-100">
        <p className="text-sm font-semibold text-slate-700">Finance salary/incentive visibility</p>
        <p className="text-xs text-slate-400 mt-0.5">Off by default — grant a Finance employee time-boxed access to see everyone's salary and incentive data. Revoke anytime, regardless of the original duration.</p>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
          <tr>
            <th className="text-left px-4 py-3">Finance Employee</th>
            <th className="text-left px-4 py-3">Status</th>
            <th className="text-left px-4 py-3">Grant Access</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((f) => {
            const active = f.access?.currentlyActive;
            return (
              <tr key={f.id}>
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-700">{f.name}</p>
                  <p className="text-xs text-slate-400">{f.email}</p>
                </td>
                <td className="px-4 py-3">
                  {active ? (
                    <div>
                      <span className="badge bg-emerald-50 text-emerald-700 flex items-center gap-1 w-fit"><ShieldCheck className="w-3 h-3" />Active</span>
                      <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1"><Clock className="w-3 h-3" />Until {formatDate(f.access!.expiresAt)}</p>
                    </div>
                  ) : (
                    <span className="badge bg-slate-100 text-slate-500 flex items-center gap-1 w-fit"><ShieldOff className="w-3 h-3" />No access</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="number" min={1} placeholder="Months"
                      value={months[f.id] ?? ''}
                      onChange={(e) => setMonths((m) => ({ ...m, [f.id]: e.target.value }))}
                      className="input py-1.5 text-sm w-24"
                    />
                    <button
                      onClick={() => { const n = Number(months[f.id]); if (n > 0) grant.mutate({ userId: f.id, months: n }); }}
                      disabled={!Number(months[f.id]) || grant.isPending}
                      className={cn('text-xs font-medium', 'text-primary-600 hover:text-primary-700')}
                    >Grant</button>
                    {active && (
                      <button onClick={() => revoke.mutate(f.id)} disabled={revoke.isPending} className="text-xs font-medium text-red-500 hover:text-red-600">Revoke</button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr><td colSpan={3} className="px-4 py-8 text-center text-sm text-slate-400">No Finance employees found</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
