import { useState } from 'react';
import { Search, BookOpen, FileText, Receipt as ReceiptIcon } from 'lucide-react';
import { useAllBookings } from '../../hooks/useErp';
import { useCustomerLedger } from '../../hooks/useFinance';
import LedgerTable from '../../components/finance/LedgerTable';
import ReceiptView from '../../components/finance/ReceiptView';
import PaymentScheduleView from '../../components/finance/PaymentScheduleView';
import FinanceDocumentsPanel from '../../components/finance/FinanceDocumentsPanel';
import { Skeleton } from '../../components/ui/Skeleton';
import { formatCurrency } from '../../utils/helpers';

export default function CustomerLedgerPage() {
  const [search, setSearch] = useState('');
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [printKind, setPrintKind] = useState<'invoice' | 'receipt'>('receipt');

  const { data: bookingsData, isLoading: searching } = useAllBookings({ search: search || undefined, limit: 10 });
  const { data: ledgerData, isLoading: loadingLedger } = useCustomerLedger(selectedBookingId ?? undefined);
  const bookings = bookingsData?.data ?? [];
  const ledger = ledgerData?.data;

  const handlePrint = (kind: 'invoice' | 'receipt') => {
    setPrintKind(kind);
    requestAnimationFrame(() => {
      document.body.classList.add('printing');
      window.print();
      document.body.classList.remove('printing');
    });
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="page-title">Customer Ledger</h2>
        <p className="text-sm text-slate-500 mt-0.5">Complete financial history per booking</p>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by customer name, phone, booking ID..."
          className="input pl-9"
        />
      </div>

      {search && !selectedBookingId && (
        <div className="card divide-y divide-slate-100">
          {searching ? (
            <div className="p-4 text-sm text-slate-400">Searching…</div>
          ) : bookings.length === 0 ? (
            <div className="p-4 text-sm text-slate-400">No bookings found</div>
          ) : bookings.map((b) => (
            <button
              key={b.id}
              onClick={() => setSelectedBookingId(b.id)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 text-left transition-colors"
            >
              <div>
                <p className="font-medium text-slate-800 text-sm">{b.lead.name}</p>
                <p className="text-xs text-slate-400">{b.lead.phone} · {b.bookingNumber ?? b.id.slice(0, 8)}</p>
              </div>
              <p className="text-sm font-semibold text-slate-700">{formatCurrency(b.finalPrice)}</p>
            </button>
          ))}
        </div>
      )}

      {selectedBookingId && (
        <div className="space-y-4">
          <button onClick={() => { setSelectedBookingId(null); setSearch(''); }} className="text-sm text-primary-600 hover:text-primary-700 font-medium">
            ← Back to search
          </button>

          {loadingLedger || !ledger ? (
            <Skeleton className="h-64 rounded-2xl" />
          ) : (
            <>
              <div className="card p-5 flex items-center justify-between flex-wrap gap-4">
                <div>
                  <h3 className="font-bold text-slate-900">{ledger.lead.name}</h3>
                  <p className="text-sm text-slate-500">{ledger.lead.phone} · {ledger.bookingNumber}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => handlePrint('invoice')} className="btn-secondary text-sm">
                    <FileText className="w-4 h-4" />Invoice
                  </button>
                  <button onClick={() => handlePrint('receipt')} className="btn-secondary text-sm">
                    <ReceiptIcon className="w-4 h-4" />Receipt
                  </button>
                </div>
              </div>

              <PaymentScheduleView bookingId={selectedBookingId ?? undefined} editable />

              <LedgerTable ledger={ledger} />

              <FinanceDocumentsPanel bookingId={selectedBookingId!} />

              {/* Off-screen (not display:none, so it still renders for printing) —
                  shown only while body.printing is active, via print CSS. */}
              <div className="fixed -left-[10000px] top-0 print-area">
                <ReceiptView ledger={ledger} kind={printKind} />
              </div>
            </>
          )}
        </div>
      )}

      {!search && !selectedBookingId && (
        <div className="empty-state">
          <BookOpen className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-400">Search for a customer or booking to view their ledger</p>
        </div>
      )}
    </div>
  );
}
