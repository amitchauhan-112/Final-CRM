import { useRef, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  ArrowLeft, Truck, Phone, Star, Calendar, IndianRupee,
  Upload, Download, Trash2, FileText,
} from 'lucide-react';
import { useVendorDetail, useUploadVendorDocument, useDeleteVendorDocument } from '../../hooks/useOperations';
import { Skeleton } from '../../components/ui/Skeleton';
import { formatDate, formatCurrency, cn } from '../../utils/helpers';

const TYPE_LABELS: Record<string, string> = {
  HOTEL: 'Hotel Vendor', VEHICLE: 'Vehicle Vendor', LOCAL_GUIDE: 'Local Guide', LOCAL_VENDOR: 'Local Vendor', OTHER: 'Other',
};
const DOC_TYPES = [
  { value: 'CONTRACT', label: 'Contract' },
  { value: 'LICENSE', label: 'License' },
  { value: 'AGREEMENT', label: 'Agreement' },
  { value: 'OTHER', label: 'Other' },
];
const TABS = [
  { key: 'trips', label: 'Trips' },
  { key: 'payments', label: 'Payments' },
  { key: 'documents', label: 'Documents' },
] as const;
type Tab = (typeof TABS)[number]['key'];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function VendorDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const base = location.pathname.startsWith('/admin') ? '/admin/operations' : '/operations';
  const [tab, setTab] = useState<Tab>('trips');
  const [docType, setDocType] = useState('OTHER');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useVendorDetail(id);
  const vendor = data?.data;
  const upload = useUploadVendorDocument(id ?? '');
  const del = useDeleteVendorDocument(id ?? '');

  if (isLoading || !vendor) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    upload.mutate({ file, type: docType });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="space-y-5">
      <button onClick={() => navigate(`${base}/vendors`)} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="w-4 h-4" />Back to Vendors
      </button>

      {/* Header */}
      <div className="card p-5">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-primary-100 flex items-center justify-center flex-shrink-0">
              <Truck className="w-6 h-6 text-primary-600" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="page-title">{vendor.name}</h2>
                <span className={cn('badge', vendor.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500')}>{vendor.status}</span>
              </div>
              <p className="text-sm text-slate-500 mt-1">{TYPE_LABELS[vendor.type] ?? vendor.type}</p>
              <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                {vendor.contact && <p className="text-sm text-slate-500 flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" />{vendor.contact}</p>}
                {vendor.rating != null && (
                  <p className="text-sm text-slate-500 flex items-center gap-1.5">
                    <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />{vendor.rating.toFixed(1)} ({vendor.ratingCount})
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
        {vendor.notes && <p className="text-sm text-slate-500 mt-3 border-t border-slate-100 pt-3">{vendor.notes}</p>}
      </div>

      {/* Payment summary strip */}
      <div className="card overflow-hidden">
        <div className="flex flex-wrap">
          <div className="flex-1 min-w-[120px] px-4 py-3 text-center border-r border-b sm:border-b-0 border-slate-100">
            <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Total Billed</p>
            <p className="text-sm font-bold text-slate-800 mt-0.5">{formatCurrency(vendor.paymentSummary.totalBilled)}</p>
          </div>
          <div className="flex-1 min-w-[120px] px-4 py-3 text-center border-r border-b sm:border-b-0 border-slate-100">
            <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Paid</p>
            <p className="text-sm font-bold text-emerald-700 mt-0.5">{formatCurrency(vendor.paymentSummary.totalPaid)}</p>
          </div>
          <div className="flex-1 min-w-[120px] px-4 py-3 text-center border-r border-slate-100">
            <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Pending</p>
            <p className={cn('text-sm font-bold mt-0.5', vendor.paymentSummary.totalPending > 0 ? 'text-orange-600' : 'text-emerald-600')}>
              {formatCurrency(vendor.paymentSummary.totalPending)}
            </p>
          </div>
          <div className="flex-1 min-w-[120px] px-4 py-3 text-center">
            <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Bills</p>
            <p className="text-sm font-bold text-slate-800 mt-0.5">{vendor.paymentSummary.billCount}</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs overflow-x-auto">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={tab === t.key ? 'tab-item-active' : 'tab-item'}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'trips' && (
        <div className="space-y-5">
          <div>
            <p className="text-sm font-semibold text-slate-700 mb-2">Upcoming Trips ({vendor.upcomingTrips.length})</p>
            {vendor.upcomingTrips.length === 0 ? (
              <div className="empty-state"><p className="text-sm text-slate-400">No upcoming trips</p></div>
            ) : (
              <div className="space-y-2">
                {vendor.upcomingTrips.map((t) => (
                  <button
                    key={`${t.service}-${t.id}`}
                    onClick={() => navigate(`${base}/departures/${t.departureId}`)}
                    className="w-full flex items-center justify-between gap-3 px-4 py-3 border border-slate-200 rounded-xl bg-white hover:border-primary-300 text-left"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="badge badge-muted flex-shrink-0">{t.service}</span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{t.destination}</p>
                        <p className="text-xs text-slate-400 flex items-center gap-1"><Calendar className="w-3 h-3" />{formatDate(t.departureDate)}</p>
                      </div>
                    </div>
                    <span className={cn('badge flex-shrink-0', t.status === 'CONFIRMED' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700')}>{t.status}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-700 mb-2">Past Trips ({vendor.pastTrips.length})</p>
            {vendor.pastTrips.length === 0 ? (
              <div className="empty-state"><p className="text-sm text-slate-400">No past trips yet</p></div>
            ) : (
              <div className="space-y-2">
                {vendor.pastTrips.map((t) => (
                  <button
                    key={`${t.service}-${t.id}`}
                    onClick={() => navigate(`${base}/departures/${t.departureId}`)}
                    className="w-full flex items-center justify-between gap-3 px-4 py-3 border border-slate-200 rounded-xl bg-white hover:border-primary-300 text-left"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="badge badge-muted flex-shrink-0">{t.service}</span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{t.destination}</p>
                        <p className="text-xs text-slate-400 flex items-center gap-1"><Calendar className="w-3 h-3" />{formatDate(t.departureDate)}</p>
                      </div>
                    </div>
                    <span className="badge bg-slate-100 text-slate-500 flex-shrink-0">{t.departureStatus}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'payments' && (
        vendor.payments.length === 0 ? (
          <div className="empty-state">
            <IndianRupee className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-400">No bills recorded for this vendor yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {vendor.payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 px-4 py-3 border border-slate-200 rounded-xl bg-white flex-wrap">
                <div>
                  <p className="text-sm font-medium text-slate-800">{p.serviceType.replace('_', ' ')} — {formatCurrency(p.totalAmount)}</p>
                  <p className="text-xs text-slate-400">
                    Paid {formatCurrency(p.advancePaid)} · Balance {formatCurrency(p.balanceAmount)}
                    {p.dueDate && ` · Due ${formatDate(p.dueDate)}`}
                  </p>
                </div>
                <span className={cn('badge', p.status === 'PAID' ? 'bg-emerald-50 text-emerald-700' : p.status === 'OVERDUE' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-700')}>
                  {p.status}
                </span>
              </div>
            ))}
          </div>
        )
      )}

      {tab === 'documents' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <select value={docType} onChange={(e) => setDocType(e.target.value)} className="input py-1.5 text-sm w-auto">
              {DOC_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} />
            <button onClick={() => fileInputRef.current?.click()} disabled={upload.isPending} className="btn-primary text-sm">
              <Upload className="w-4 h-4" />{upload.isPending ? 'Uploading...' : 'Upload Document'}
            </button>
          </div>

          {vendor.documents.length === 0 ? (
            <div className="empty-state">
              <FileText className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-400">No documents uploaded yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {vendor.documents.map((d) => {
                const fullUrl = d.fileUrl.startsWith('/') ? `${window.location.origin}${d.fileUrl}` : d.fileUrl;
                return (
                  <div key={d.id} className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 bg-white">
                    <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                      <FileText className="w-4.5 h-4.5 text-slate-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{d.name}</p>
                      <p className="text-xs text-slate-400">
                        {DOC_TYPES.find((t) => t.value === d.type)?.label ?? d.type} · {formatBytes(d.fileSize)} · {d.uploadedBy.name} · {formatDate(d.createdAt)}
                      </p>
                    </div>
                    <a href={fullUrl} download={d.name} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-primary-600">
                      <Download className="w-4 h-4" />
                    </a>
                    <button onClick={() => del.mutate(d.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
