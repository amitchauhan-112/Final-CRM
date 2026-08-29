import { useSalesTargetHistory } from '../../hooks/useHR';
import { formatCurrency } from '../../utils/helpers';
import Modal from '../ui/Modal';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function TargetHistoryModal({ userId, userName, onClose }: { userId: string | null; userName?: string; onClose: () => void }) {
  const { data, isLoading } = useSalesTargetHistory(userId ?? undefined);

  return (
    <Modal open={!!userId} onClose={onClose} title={`Target History${userName ? ` — ${userName}` : ''}`} size="lg">
      {isLoading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : !data || data.length === 0 ? (
        <p className="text-sm text-slate-400">No target history yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-500 uppercase">
              <tr>
                <th className="text-left py-2">Month</th>
                <th className="text-left py-2">Revenue Target</th>
                <th className="text-left py-2">Achieved</th>
                <th className="text-left py-2">Bookings</th>
                <th className="text-left py-2">Incentive</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.map((t) => (
                <tr key={`${t.month}-${t.year}`}>
                  <td className="py-2 font-medium text-slate-700">{MONTH_NAMES[t.month - 1]} {t.year}</td>
                  <td className="py-2 text-slate-500">{t.targetRevenue != null ? formatCurrency(t.targetRevenue) : '—'}</td>
                  <td className="py-2 text-slate-700">{formatCurrency(t.achievedRevenue)}</td>
                  <td className="py-2 text-slate-500">{t.achievedBookings}{t.targetBookings ? ` / ${t.targetBookings}` : ''}</td>
                  <td className="py-2 font-semibold text-emerald-600">{formatCurrency(t.incentiveAmount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
