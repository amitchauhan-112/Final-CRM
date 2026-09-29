import { useNavigate } from 'react-router-dom';
import { Wallet, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import { useVendorCredits } from '../../hooks/useFinance';
import { Skeleton } from '../../components/ui/Skeleton';
import { formatCurrency, cn } from '../../utils/helpers';

// Cross-vendor "who do I owe, who owes me" — one place instead of opening
// every vendor's ledger one by one. Click any row to jump to that vendor's
// full itemized ledger.
export default function VendorCreditsPage() {
  const navigate = useNavigate();
  const { data, isLoading } = useVendorCredits();
  const credits = data?.data?.credits ?? [];
  const totalPayable = data?.data?.totalPayable ?? 0;
  const totalReceivable = data?.data?.totalReceivable ?? 0;

  const weOwe = credits.filter((c) => c.netBalance > 0);
  const owedToUs = credits.filter((c) => c.netBalance < 0);

  const goToVendor = (vendorId: string) => navigate(`/finance/vendor-ledger?vendorId=${vendorId}`);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Vendor Credits</h2>
        <p className="text-sm text-slate-500 mt-0.5">Net balance with every vendor, in one place</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="card p-5">
          <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider flex items-center gap-1"><ArrowUpRight className="w-3.5 h-3.5 text-orange-500" />We Owe</p>
          <p className="text-2xl font-bold text-orange-500 mt-1">{formatCurrency(totalPayable)}</p>
        </div>
        <div className="card p-5">
          <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider flex items-center gap-1"><ArrowDownLeft className="w-3.5 h-3.5 text-violet-600" />Owed To Us</p>
          <p className="text-2xl font-bold text-violet-600 mt-1">{formatCurrency(totalReceivable)}</p>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-2xl" />)}</div>
      ) : credits.length === 0 ? (
        <div className="empty-state">
          <Wallet className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-400">Every vendor is settled — nothing outstanding either way</p>
        </div>
      ) : (
        <div className="space-y-5">
          {weOwe.length > 0 && (
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">We Owe</p>
              <div className="card divide-y divide-slate-100">
                {weOwe.map((c) => (
                  <button key={c.vendorId} onClick={() => goToVendor(c.vendorId)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 text-left transition-colors">
                    <div>
                      <p className="font-medium text-slate-800 text-sm">{c.vendorName}</p>
                      <p className="text-xs text-slate-400">{c.vendorType.replace('_', ' ')} · {c.billCount} bill{c.billCount !== 1 ? 's' : ''}</p>
                    </div>
                    <p className="font-bold text-orange-500">{formatCurrency(c.netBalance)}</p>
                  </button>
                ))}
              </div>
            </div>
          )}
          {owedToUs.length > 0 && (
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Owed To Us</p>
              <div className="card divide-y divide-slate-100">
                {owedToUs.map((c) => (
                  <button key={c.vendorId} onClick={() => goToVendor(c.vendorId)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 text-left transition-colors">
                    <div>
                      <p className="font-medium text-slate-800 text-sm">{c.vendorName}</p>
                      <p className="text-xs text-slate-400">{c.vendorType.replace('_', ' ')} · {c.billCount} bill{c.billCount !== 1 ? 's' : ''}</p>
                    </div>
                    <p className="font-bold text-violet-600">{formatCurrency(Math.abs(c.netBalance))}</p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
