import { Fragment, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, Truck, IndianRupee, ChevronDown, ChevronUp } from 'lucide-react';
import { useFinanceVendors, useVendorLedger } from '../../hooks/useFinance';
import { Skeleton } from '../../components/ui/Skeleton';
import AddVendorPaymentEntryModal from '../../components/finance/AddVendorPaymentEntryModal';
import { formatCurrency, formatDate, formatRelativeTime, cn } from '../../utils/helpers';

const STATUS_BADGE: Record<string, string> = {
  PENDING: 'bg-amber-50 text-amber-700',
  PARTIAL: 'bg-primary-50 text-primary-700',
  PAID: 'bg-emerald-50 text-emerald-700',
  OVERDUE: 'bg-red-50 text-red-600',
  RECEIVABLE: 'bg-mountain-50 text-mountain-700',
};

const METHOD_LABEL: Record<string, string> = {
  CASH: 'Cash', UPI: 'UPI', BANK_TRANSFER: 'Bank Transfer', CHEQUE: 'Cheque',
  CUSTOMER_DIRECT: 'Customer paid directly', CREDIT: 'On credit', VENDOR_REFUND: 'Vendor refund',
};

export default function VendorLedgerPage() {
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(searchParams.get('vendorId'));
  const [expandedBillId, setExpandedBillId] = useState<string | null>(null);
  const [addEntryFor, setAddEntryFor] = useState<string | null>(null);

  const { data: vendorsData, isLoading: loadingVendors } = useFinanceVendors();
  const { data: ledgerData, isLoading: loadingLedger } = useVendorLedger(selectedVendorId ?? undefined);
  const vendors = (vendorsData?.data ?? []).filter((v) => v.name.toLowerCase().includes(search.toLowerCase()));
  const ledger = ledgerData?.data;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="page-title">Vendor Ledger</h2>
        <p className="text-sm text-slate-500 mt-0.5">Running statement per vendor across every bill</p>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setSelectedVendorId(null); }}
          placeholder="Search vendor by name..."
          className="input pl-9"
        />
      </div>

      {search && !selectedVendorId && (
        <div className="card divide-y divide-slate-100">
          {loadingVendors ? (
            <div className="p-4 text-sm text-slate-400">Loading…</div>
          ) : vendors.length === 0 ? (
            <div className="p-4 text-sm text-slate-400">No vendors found</div>
          ) : vendors.map((v) => (
            <button
              key={v.id}
              onClick={() => setSelectedVendorId(v.id)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 text-left transition-colors"
            >
              <div>
                <p className="font-medium text-slate-800 text-sm">{v.name}</p>
                <p className="text-xs text-slate-400">{v.type.replace('_', ' ')}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {selectedVendorId && (
        <div className="space-y-4">
          <button onClick={() => { setSelectedVendorId(null); setSearch(''); }} className="text-sm text-primary-600 hover:text-primary-700 font-medium">
            ← Back to search
          </button>

          {loadingLedger || !ledger ? (
            <Skeleton className="h-64 rounded-2xl" />
          ) : (
            <>
              <div className="card p-5">
                <h3 className="font-bold text-slate-900">{ledger.name}</h3>
                <p className="text-sm text-slate-500">{ledger.type.replace('_', ' ')} · {ledger.contact ?? 'No contact on file'}</p>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                  <div>
                    <p className="text-xs text-slate-400">Total Billed</p>
                    <p className="text-lg font-bold text-slate-800">{formatCurrency(ledger.ledger.totalBilled)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Total Paid</p>
                    <p className="text-lg font-bold text-emerald-600">{formatCurrency(ledger.ledger.totalPaid)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">{ledger.ledger.totalOutstanding < 0 ? 'They Owe Us' : 'Outstanding'}</p>
                    <p className={cn('text-lg font-bold', ledger.ledger.totalOutstanding < 0 ? 'text-mountain-600' : 'text-orange-500')}>{formatCurrency(Math.abs(ledger.ledger.totalOutstanding))}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Bills</p>
                    <p className="text-lg font-bold text-slate-800">{ledger.ledger.billCount}{ledger.ledger.overdueCount > 0 ? ` (${ledger.ledger.overdueCount} overdue)` : ''}</p>
                  </div>
                </div>
              </div>

              <div className="card overflow-x-auto">
                {ledger.payments.length === 0 ? (
                  <div className="empty-state">
                    <IndianRupee className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm text-slate-400">No bills for this vendor yet</p>
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50">
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase">Trip</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase">Service</th>
                        <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase">Total</th>
                        <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase">Paid</th>
                        <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase">Balance</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase">Status</th>
                        <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {ledger.payments.map((p) => {
                        const entries = p.entries ?? [];
                        const expanded = expandedBillId === p.id;
                        return (
                          <Fragment key={p.id}>
                            <tr className="hover:bg-slate-50">
                              <td className="px-4 py-2.5">{p.departure ? `${p.departure.destination} — ${formatDate(p.departure.departureDate)}` : '—'}</td>
                              <td className="px-4 py-2.5">{p.serviceType.replace('_', ' ')}</td>
                              <td className="px-4 py-2.5 text-right">{formatCurrency(p.totalAmount)}</td>
                              <td className="px-4 py-2.5 text-right">{formatCurrency(p.advancePaid)}</td>
                              <td className={cn('px-4 py-2.5 text-right font-medium', p.balanceAmount < 0 && 'text-mountain-600')}>{formatCurrency(Math.abs(p.balanceAmount))}</td>
                              <td className="px-4 py-2.5"><span className={cn('badge', STATUS_BADGE[p.status])}>{p.status === 'RECEIVABLE' ? 'THEY OWE US' : p.status}</span></td>
                              <td className="px-4 py-2.5 text-right whitespace-nowrap">
                                <button onClick={() => setAddEntryFor(p.id)} className="text-xs font-medium text-emerald-600 hover:text-emerald-700 mr-2">Add</button>
                                {entries.length > 0 && (
                                  <button onClick={() => setExpandedBillId(expanded ? null : p.id)} className="text-xs font-medium text-slate-500 hover:text-slate-700 inline-flex items-center gap-0.5">
                                    {entries.length} {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                  </button>
                                )}
                              </td>
                            </tr>
                            {expanded && entries.map((e) => (
                              <tr key={e.id} className="bg-slate-50/60 text-xs">
                                <td colSpan={6} className="px-4 py-1.5 pl-8 text-slate-500">
                                  {formatCurrency(e.amount)} · {METHOD_LABEL[e.method] ?? e.method} · {e.createdBy.name} · {formatRelativeTime(e.createdAt)}{e.note ? ` · ${e.note}` : ''}
                                </td>
                                <td />
                              </tr>
                            ))}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {addEntryFor && (
        <AddVendorPaymentEntryModal open onClose={() => setAddEntryFor(null)} vendorPaymentId={addEntryFor} />
      )}

      {!search && !selectedVendorId && (
        <div className="empty-state">
          <Truck className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-400">Search for a vendor to view their ledger</p>
        </div>
      )}
    </div>
  );
}
