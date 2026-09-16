import { useState } from 'react';
import { Wallet, Landmark, History, HandCoins, ArrowDownCircle, ArrowUpCircle } from 'lucide-react';
import { useEmployeeCashList, useEmployeeCashHistory, useCollectEmployeeCash } from '../../hooks/useEmployeeCash';
import { EmployeeCashRow } from '../../types/index';
import Modal from '../../components/ui/Modal';
import { Skeleton } from '../../components/ui/Skeleton';
import { formatCurrency, formatDateTime, cn } from '../../utils/helpers';

// ─── Collect modal ────────────────────────────────────────────────────────────

function CollectModal({ employee, onClose }: { employee: EmployeeCashRow | null; onClose: () => void }) {
  const collect = useCollectEmployeeCash();
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');

  const handleClose = () => { setAmount(''); setNotes(''); onClose(); };
  const numAmount = Number(amount);
  const invalid = !amount || isNaN(numAmount) || numAmount <= 0 || (employee ? numAmount > employee.currentHolding : false);

  return (
    <Modal open={!!employee} onClose={handleClose} title="Collect Cash" size="sm"
      footer={<>
        <button onClick={handleClose} className="btn-secondary">Cancel</button>
        <button
          onClick={() => {
            if (!employee) return;
            collect.mutate({ employeeId: employee.id, amount: numAmount, notes: notes.trim() || undefined }, { onSuccess: handleClose });
          }}
          disabled={collect.isPending || invalid}
          className="btn-primary"
        >
          {collect.isPending ? 'Collecting…' : 'Collect'}
        </button>
      </>}
    >
      {employee && (
        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
            <p className="text-sm font-medium text-slate-700">{employee.name}</p>
            <p className="text-sm text-slate-500">Currently holds <span className="font-bold text-slate-800">{formatCurrency(employee.currentHolding)}</span></p>
          </div>
          <div>
            <label className="label">Amount to collect *</label>
            <input
              type="number" min={1} max={employee.currentHolding} step="1"
              value={amount} onChange={(e) => setAmount(e.target.value)}
              className="input" placeholder="0" autoFocus
            />
            <p className="text-xs text-slate-400 mt-1">Partial collection is fine — up to {formatCurrency(employee.currentHolding)}.</p>
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="input resize-none" placeholder="Optional" />
          </div>
        </div>
      )}
    </Modal>
  );
}

// ─── History modal ────────────────────────────────────────────────────────────

function HistoryModal({ employee, onClose }: { employee: EmployeeCashRow | null; onClose: () => void }) {
  const { data, isLoading } = useEmployeeCashHistory(employee?.id ?? null);
  const entries = data?.data ?? [];

  return (
    <Modal open={!!employee} onClose={onClose} title={employee ? `${employee.name} — Cash History` : 'Cash History'} size="md">
      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
      ) : entries.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-8">No cash activity yet</p>
      ) : (
        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          {entries.map((e) => (
            <div key={e.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
              {e.type === 'HANDOVER' ? (
                <ArrowDownCircle className="w-5 h-5 text-emerald-500 flex-shrink-0" />
              ) : (
                <ArrowUpCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800">
                  {e.type === 'HANDOVER' ? '+' : '−'}{formatCurrency(e.amount)}
                </p>
                <p className="text-xs text-slate-400 truncate">
                  {e.type === 'HANDOVER'
                    ? `Cash payment${e.payment?.booking?.bookingNumber ? ` · ${e.payment.booking.bookingNumber}` : ''}`
                    : `Collected by ${e.collectedBy?.name ?? '—'}`}
                  {' · '}{formatDateTime(e.createdAt)}
                </p>
                {e.notes && <p className="text-xs text-slate-500 mt-0.5">{e.notes}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function EmployeeCashPage() {
  const { data, isLoading } = useEmployeeCashList();
  const [collectingEmployee, setCollectingEmployee] = useState<EmployeeCashRow | null>(null);
  const [historyEmployee, setHistoryEmployee] = useState<EmployeeCashRow | null>(null);

  const rows = data?.data ?? [];
  const summary = data?.summary;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Employee Cash</h2>
        <p className="text-sm text-slate-500 mt-0.5">Cash currently held by each employee, and what's been collected from them</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="card flex items-center gap-3 px-4 py-3">
          <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
            <Wallet className="w-4 h-4 text-amber-600" />
          </div>
          <div>
            <p className="text-base font-bold text-amber-600">{formatCurrency(summary?.totalWithEmployees ?? 0)}</p>
            <p className="text-[11px] text-slate-400">Currently with employees</p>
          </div>
        </div>
        <div className="card flex items-center gap-3 px-4 py-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
            <Landmark className="w-4 h-4 text-emerald-600" />
          </div>
          <div>
            <p className="text-base font-bold text-emerald-600">{formatCurrency(summary?.totalCollectedByCompany ?? 0)}</p>
            <p className="text-[11px] text-slate-400">Collected by company (all-time)</p>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
      ) : rows.length === 0 ? (
        <div className="empty-state">
          <HandCoins className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-400">No cash handovers recorded yet</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">Employee</th>
                <th className="text-right px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">Current Holding</th>
                <th className="text-right px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider hidden sm:table-cell">Lifetime Handed Over</th>
                <th className="text-right px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider hidden sm:table-cell">Lifetime Collected</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-800">{r.name}</p>
                    <p className="text-xs text-slate-400">{r.email}</p>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <p className={cn('font-bold tabular', r.currentHolding > 0 ? 'text-amber-600' : 'text-slate-400')}>
                      {formatCurrency(r.currentHolding)}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-right hidden sm:table-cell text-slate-600 tabular">{formatCurrency(r.totalHandedOver)}</td>
                  <td className="px-4 py-3 text-right hidden sm:table-cell text-slate-600 tabular">{formatCurrency(r.totalCollected)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => setHistoryEmployee(r)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-primary-600 transition-colors" title="History">
                        <History className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setCollectingEmployee(r)}
                        disabled={r.currentHolding <= 0}
                        className="btn-secondary text-xs py-1.5 px-2.5 disabled:opacity-40"
                      >
                        Collect
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CollectModal employee={collectingEmployee} onClose={() => setCollectingEmployee(null)} />
      <HistoryModal employee={historyEmployee} onClose={() => setHistoryEmployee(null)} />
    </div>
  );
}
