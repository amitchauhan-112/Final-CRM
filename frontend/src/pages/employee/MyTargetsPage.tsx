import { useState } from 'react';
import { Target, TrendingUp, IndianRupee } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useSalesTargets, useSalesTargetHistory } from '../../hooks/useHR';
import { formatCurrency, cn } from '../../utils/helpers';
import { Skeleton } from '../../components/ui/Skeleton';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function StatCard({ icon: Icon, label, value, sub }: { icon: typeof Target; label: string; value: string; sub?: string }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-8 h-8 bg-primary-50 rounded-lg flex items-center justify-center">
          <Icon className="w-4 h-4 text-primary-600" />
        </div>
        <p className="text-xs text-slate-500">{label}</p>
      </div>
      <p className="text-xl font-bold text-slate-800">{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
      <div className={cn('h-full rounded-full transition-all', pct >= 100 ? 'bg-emerald-500' : 'bg-primary-500')} style={{ width: `${Math.min(100, pct)}%` }} />
    </div>
  );
}

export default function MyTargetsPage() {
  const { user } = useAuthStore();
  const now = new Date();
  const [month] = useState(now.getMonth() + 1);
  const [year] = useState(now.getFullYear());

  const { data, isLoading } = useSalesTargets(month, year);
  const { data: history } = useSalesTargetHistory(user?.id);

  const mine = data?.[0];

  if (isLoading) return <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>;

  if (!mine) return <p className="text-sm text-slate-400">No target data available.</p>;

  const revenuePct = mine.targetRevenue ? Math.round((mine.achievedRevenue / mine.targetRevenue) * 100) : 0;
  const bookingsPct = mine.targetBookings ? Math.round((mine.achievedBookings / mine.targetBookings) * 100) : 0;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-slate-900">My Target & Incentives</h2>
        <p className="text-sm text-slate-500 mt-0.5">{MONTH_NAMES[month - 1]} {year} — updates in real time as bookings are confirmed</p>
      </div>

      {!mine.targetRevenue && !mine.targetBookings ? (
        <div className="empty-state">
          <Target className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-400">No target set for this month yet.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <StatCard icon={IndianRupee} label="Revenue Achieved" value={formatCurrency(mine.achievedRevenue)} sub={mine.targetRevenue ? `of ${formatCurrency(mine.targetRevenue)} target` : undefined} />
            <StatCard icon={TrendingUp} label="Bookings Achieved" value={String(mine.achievedBookings)} sub={mine.targetBookings ? `of ${mine.targetBookings} target` : undefined} />
            <StatCard icon={Target} label="Incentive Earned" value={formatCurrency(mine.incentiveAmount)} sub={mine.incentivePercent ? `${mine.incentivePercent}% on revenue above target` : undefined} />
          </div>

          <div className="card p-5 space-y-4">
            {mine.targetRevenue != null && (
              <div>
                <div className="flex items-center justify-between text-sm mb-1.5">
                  <span className="text-slate-600">Revenue Progress</span>
                  <span className="font-semibold text-slate-700">{revenuePct}%</span>
                </div>
                <ProgressBar pct={revenuePct} />
              </div>
            )}
            {mine.targetBookings != null && (
              <div>
                <div className="flex items-center justify-between text-sm mb-1.5">
                  <span className="text-slate-600">Booking Count Progress</span>
                  <span className="font-semibold text-slate-700">{bookingsPct}%</span>
                </div>
                <ProgressBar pct={bookingsPct} />
              </div>
            )}
          </div>
        </>
      )}

      <div className="card p-5">
        <p className="text-sm font-semibold text-slate-700 mb-3">Previous Months</p>
        {!history || history.length <= 1 ? (
          <p className="text-xs text-slate-400">No previous month records yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-slate-500 uppercase">
                <tr>
                  <th className="text-left py-2">Month</th>
                  <th className="text-left py-2">Revenue</th>
                  <th className="text-left py-2">Bookings</th>
                  <th className="text-left py-2">Incentive</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {history.filter((h) => !(h.month === month && h.year === year)).map((h) => (
                  <tr key={`${h.month}-${h.year}`}>
                    <td className="py-2 font-medium text-slate-700">{MONTH_NAMES[h.month - 1].slice(0, 3)} {h.year}</td>
                    <td className="py-2 text-slate-600">{formatCurrency(h.achievedRevenue)}{h.targetRevenue ? ` / ${formatCurrency(h.targetRevenue)}` : ''}</td>
                    <td className="py-2 text-slate-600">{h.achievedBookings}{h.targetBookings ? ` / ${h.targetBookings}` : ''}</td>
                    <td className="py-2 font-semibold text-emerald-600">{formatCurrency(h.incentiveAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
