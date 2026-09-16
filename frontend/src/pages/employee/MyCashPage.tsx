import { Wallet, HandCoins, ArrowDownCircle, ArrowUpCircle } from 'lucide-react';
import { useMyCashHolding } from '../../hooks/useEmployeeCash';
import { Skeleton } from '../../components/ui/Skeleton';
import { formatCurrency, formatDateTime } from '../../utils/helpers';

export default function MyCashPage() {
  const { data, isLoading } = useMyCashHolding();
  const holding = data?.data.holding ?? 0;
  const history = data?.data.history ?? [];

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-slate-900">My Cash</h2>
        <p className="text-sm text-slate-500 mt-0.5">Cash currently with you, and your handover/collection history</p>
      </div>

      {isLoading ? (
        <Skeleton className="h-28 rounded-2xl" />
      ) : (
        <div className="card p-6 flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-amber-100 flex items-center justify-center flex-shrink-0">
            <Wallet className="w-7 h-7 text-amber-600" />
          </div>
          <div>
            <p className="text-3xl font-bold text-slate-900">{formatCurrency(holding)}</p>
            <p className="text-sm text-slate-400">Currently with you</p>
          </div>
        </div>
      )}

      <div>
        <p className="text-sm font-semibold text-slate-700 mb-3">History</p>
        {isLoading ? (
          <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
        ) : history.length === 0 ? (
          <div className="empty-state">
            <HandCoins className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-400">No cash activity yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {history.map((e) => (
              <div key={e.id} className="flex items-center gap-3 p-3 card">
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
                      ? `Cash payment you handled${e.payment?.booking?.bookingNumber ? ` · ${e.payment.booking.bookingNumber}` : ''}`
                      : `Collected by ${e.collectedBy?.name ?? 'Finance'}`}
                    {' · '}{formatDateTime(e.createdAt)}
                  </p>
                  {e.notes && <p className="text-xs text-slate-500 mt-0.5">{e.notes}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
