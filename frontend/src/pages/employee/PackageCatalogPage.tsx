import { useState, useEffect } from 'react';
import {
  Package, Search, Star, MapPin, Tag, Clock, IndianRupee, ChevronDown,
  Plus, Info, UserCircle, Eye, Pencil, Trash2, AlertTriangle,
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import { usePackages, useCreatePackage, useUpdatePackage, useDeletePackage } from '../../hooks/usePackages';
import { useItinerary } from '../../hooks/useItinerary';
import { useDestinations, useTourCategories } from '../../hooks/useMasters';
import { Package as PkgType, PackageItinerary } from '../../types/index';
import { Skeleton } from '../../components/ui/Skeleton';
import Modal from '../../components/ui/Modal';
import { formatCurrency, cn } from '../../utils/helpers';
import { useAuthStore } from '../../store/authStore';

const parseList = (raw: string | string[]): string[] => {
  if (Array.isArray(raw)) return raw;
  try { return JSON.parse(raw) ?? []; } catch { return []; }
};

// ─── Itinerary row helpers ────────────────────────────────────────────────────

type ActivityType = 'JOURNEY' | 'STAY' | 'SIGHTSEEING';

interface ItineraryRow {
  key: string;
  label: string;
  rowType: 'day' | 'night';
  dayIndex: number;
  activityType: ActivityType;
  activityDetails: string;
}

function buildItineraryRows(nights: number): ItineraryRow[] {
  const rows: ItineraryRow[] = [];
  for (let i = 0; i <= nights + 1; i++) {
    const isEdge = i === 0 || i === nights + 1;
    rows.push({ key: `day-${i}`, label: `Day ${i}`, rowType: 'day', dayIndex: i, activityType: isEdge ? 'JOURNEY' : 'SIGHTSEEING', activityDetails: '' });
    rows.push({ key: `night-${i}`, label: `Night ${i}`, rowType: 'night', dayIndex: i, activityType: isEdge ? 'JOURNEY' : 'STAY', activityDetails: '' });
  }
  return rows;
}

function itemsToRows(items: PackageItinerary[]): ItineraryRow[] {
  return [...items]
    .sort((a, b) => a.dayOffset - b.dayOffset)
    .map((item) => {
      const dayIndex = Math.floor(item.dayOffset / 2);
      const rowType: 'day' | 'night' = item.dayOffset % 2 === 1 ? 'night' : 'day';
      return {
        key: `${rowType}-${dayIndex}`,
        label: `${rowType === 'day' ? 'Day' : 'Night'} ${dayIndex}`,
        rowType,
        dayIndex,
        activityType: ((item.notes as ActivityType) || (rowType === 'night' ? 'STAY' : 'SIGHTSEEING')),
        activityDetails: item.description ?? '',
      };
    });
}

const ACTIVITY_OPTIONS: { value: ActivityType; label: string }[] = [
  { value: 'JOURNEY', label: 'Journey' },
  { value: 'STAY', label: 'Stay' },
  { value: 'SIGHTSEEING', label: 'Sightseeing' },
];

// ─── Shared itinerary table (read-only or editable) ──────────────────────────

function ItineraryTable({ rows, nights, readOnly, onUpdateRow }: {
  rows: ItineraryRow[];
  nights: number;
  readOnly: boolean;
  onUpdateRow?: (key: string, field: 'activityType' | 'activityDetails', value: string) => void;
}) {
  return (
    <div>
      <div className="hidden sm:grid sm:grid-cols-[9rem_8rem_1fr] gap-x-3 mb-1.5 px-1">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Day / Night</p>
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Activity Type</p>
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Activity Details</p>
      </div>
      <div className="space-y-1.5">
        {rows.map((row) => {
          const isDep = row.dayIndex === 0;
          const isRet = row.dayIndex === nights + 1;
          const isJourney = row.activityType === 'JOURNEY';
          const badgeColor = isDep
            ? 'bg-amber-100 text-amber-700'
            : isRet
            ? 'bg-emerald-100 text-emerald-700'
            : row.rowType === 'day' ? 'bg-sky-100 text-sky-700' : 'bg-blue-100 text-blue-700';
          const badgeText = row.rowType === 'day' ? `D${row.dayIndex}` : `N${row.dayIndex}`;
          return (
            <div key={row.key} className="grid grid-cols-1 sm:grid-cols-[9rem_8rem_1fr] gap-2 sm:gap-x-3 sm:items-center">
              <div className="flex items-center gap-2">
                <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-full tabular-nums flex-shrink-0', badgeColor)}>
                  {badgeText}
                </span>
                <span className="text-xs font-medium text-slate-700 whitespace-nowrap">{row.label}</span>
              </div>
              {readOnly ? (
                <span className="text-xs text-slate-600 capitalize">{row.activityType.toLowerCase()}</span>
              ) : (
                <select
                  value={row.activityType}
                  onChange={(e) => onUpdateRow?.(row.key, 'activityType', e.target.value)}
                  className="input text-sm py-1.5"
                >
                  {ACTIVITY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              )}
              {readOnly ? (
                <span className="text-xs text-slate-500">{row.activityDetails || '—'}</span>
              ) : (
                <input
                  type="text"
                  value={row.activityDetails}
                  onChange={(e) => onUpdateRow?.(row.key, 'activityDetails', e.target.value)}
                  disabled={isJourney}
                  placeholder={
                    isJourney ? '—'
                    : row.activityType === 'STAY' ? 'Hotel / camp name or location…'
                    : 'Place or activity name…'
                  }
                  className={cn('input text-sm py-1.5', isJourney && 'bg-slate-50 text-slate-300 cursor-not-allowed')}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── FIT View Modal ───────────────────────────────────────────────────────────

function FITViewModal({ pkg, onClose }: { pkg: PkgType; onClose: () => void }) {
  const { data: itinData, isLoading } = useItinerary(pkg.id);
  const rows = itinData?.data ? itemsToRows(itinData.data) : [];
  const highlights = parseList(pkg.highlights ?? '[]');
  const inclusions = parseList(pkg.inclusions ?? '[]');
  const exclusions = parseList(pkg.exclusions ?? '[]');

  return (
    <Modal open onClose={onClose} title={pkg.name} size="2xl"
      footer={<button type="button" onClick={onClose} className="btn-secondary">Close</button>}
    >
      <div className="space-y-5">
        <div className="flex flex-wrap gap-2 text-xs">
          <span className={cn('font-bold px-1.5 py-0.5 rounded', pkg.packageType === 'GIT' ? 'bg-blue-100 text-blue-700' : 'bg-violet-100 text-violet-700')}>{pkg.packageType ?? 'GIT'}</span>
          {pkg.destination && <span className="flex items-center gap-1 text-slate-600"><MapPin className="w-3 h-3" />{pkg.destination.name}, {pkg.destination.country}</span>}
          {pkg.tourCategory && <span className="flex items-center gap-1 text-slate-600"><Tag className="w-3 h-3" />{pkg.tourCategory.name}</span>}
          <span className="flex items-center gap-1 text-slate-600"><Clock className="w-3 h-3" />{pkg.nights}N / {pkg.days}D</span>
        </div>

        {pkg.description && <p className="text-sm text-slate-600">{pkg.description}</p>}

        <div className="bg-primary-50 rounded-xl p-3">
          <p className="text-[10px] font-semibold text-primary-400 uppercase tracking-wider mb-1">Pricing</p>
          {pkg.offerPrice ? (
            <div className="flex items-baseline gap-2">
              <p className="text-lg font-bold text-primary-600">{formatCurrency(pkg.offerPrice)}</p>
              <p className="text-xs text-slate-400 line-through">{formatCurrency(pkg.pricePerPerson)}</p>
            </div>
          ) : (
            <p className="text-lg font-bold text-primary-600">{formatCurrency(pkg.pricePerPerson)}<span className="text-xs text-slate-400 font-normal"> /person</span></p>
          )}
          {(pkg.priceSingle || pkg.priceDouble || pkg.priceTriple || pkg.priceQuad) && (
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
              {pkg.priceSingle && <span className="text-[10px] text-slate-500">1 pax: {formatCurrency(pkg.priceSingle)}</span>}
              {pkg.priceDouble && <span className="text-[10px] text-slate-500">2 pax: {formatCurrency(pkg.priceDouble)}</span>}
              {pkg.priceTriple && <span className="text-[10px] text-slate-500">3 pax: {formatCurrency(pkg.priceTriple)}</span>}
              {pkg.priceQuad && <span className="text-[10px] text-slate-500">4 pax: {formatCurrency(pkg.priceQuad)}</span>}
            </div>
          )}
        </div>

        {(highlights.length > 0 || inclusions.length > 0 || exclusions.length > 0) && (
          <div className="space-y-3 text-xs border-t border-slate-100 pt-3">
            {highlights.length > 0 && (
              <div>
                <p className="font-semibold text-slate-500 mb-1">Highlights</p>
                <ul className="space-y-0.5">{highlights.map((h, i) => <li key={i} className="text-slate-600 flex gap-1"><span className="text-primary-400">✦</span>{h}</li>)}</ul>
              </div>
            )}
            {inclusions.length > 0 && (
              <div>
                <p className="font-semibold text-emerald-600 mb-1">Included</p>
                <ul className="space-y-0.5">{inclusions.map((h, i) => <li key={i} className="text-slate-600 flex gap-1"><span className="text-emerald-500">✓</span>{h}</li>)}</ul>
              </div>
            )}
            {exclusions.length > 0 && (
              <div>
                <p className="font-semibold text-red-500 mb-1">Not Included</p>
                <ul className="space-y-0.5">{exclusions.map((h, i) => <li key={i} className="text-slate-600 flex gap-1"><span className="text-red-400">✗</span>{h}</li>)}</ul>
              </div>
            )}
          </div>
        )}

        <div>
          <p className="label mb-2">Day Plan</p>
          {isLoading ? (
            <div className="space-y-1.5">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 rounded-lg" />)}</div>
          ) : rows.length === 0 ? (
            <p className="text-xs text-slate-400">No itinerary data</p>
          ) : (
            <ItineraryTable rows={rows} nights={pkg.nights ?? 3} readOnly />
          )}
        </div>
      </div>
    </Modal>
  );
}

// ─── FIT Edit Modal ───────────────────────────────────────────────────────────

function EditFITModal({ pkg, onClose }: { pkg: PkgType; onClose: () => void }) {
  const updatePkg = useUpdatePackage();
  const { data: itinData, isLoading: itinLoading } = useItinerary(pkg.id);

  const [nights, setNights] = useState(pkg.nights ?? 3);
  const [rows, setRows] = useState<ItineraryRow[]>([]);
  const [itinInitialized, setItinInitialized] = useState(false);

  useEffect(() => {
    if (!itinInitialized && itinData?.data) {
      const loaded = itemsToRows(itinData.data);
      setRows(loaded.length > 0 ? loaded : buildItineraryRows(pkg.nights ?? 3));
      setItinInitialized(true);
    }
  }, [itinData, itinInitialized, pkg.nights]);

  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: { name: pkg.name },
  });

  const changeNights = (n: number) => {
    setNights(n);
    setRows((prev) => {
      const next = buildItineraryRows(n);
      return next.map((row) => {
        const existing = prev.find((r) => r.key === row.key);
        return existing ? { ...row, activityType: existing.activityType, activityDetails: existing.activityDetails } : row;
      });
    });
  };

  const changeDays = (d: number) => changeNights(Math.max(1, d - 2));

  const updateRow = (key: string, field: 'activityType' | 'activityDetails', value: string) => {
    setRows((prev) => prev.map((r) => {
      if (r.key !== key) return r;
      const updated = { ...r, [field]: value as ActivityType };
      if (field === 'activityType' && value === 'JOURNEY') updated.activityDetails = '';
      return updated;
    }));
  };

  const onSubmit = (data: { name: string }) => {
    updatePkg.mutate({
      id: pkg.id,
      name: data.name,
      nights,
      itineraryRows: rows.map((r) => ({
        dayOffset: r.dayIndex * 2 + (r.rowType === 'night' ? 1 : 0),
        title: r.label,
        activityType: r.activityType,
        activityDetails: r.activityDetails,
      })),
    } as any, { onSuccess: onClose });
  };

  const totalDays = nights + 2;
  const nightsOptions = Array.from({ length: 30 }, (_, i) => i + 1);
  const daysOptions = Array.from({ length: 30 }, (_, i) => i + 3);

  return (
    <Modal
      open onClose={onClose}
      title="Edit FIT Package"
      size="2xl"
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button form="edit-fit-form" type="submit" disabled={updatePkg.isPending || itinLoading} className="btn-primary">
            {updatePkg.isPending ? 'Saving…' : 'Save Changes'}
          </button>
        </>
      }
    >
      {itinLoading ? (
        <div className="space-y-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 rounded-xl" />)}</div>
      ) : (
        <form id="edit-fit-form" onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="label">Package Name *</label>
              <input {...register('name', { required: 'Name is required' })} className="input" />
              {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
            </div>
            <div className="flex items-center gap-3 px-4 py-2 bg-violet-50 border border-violet-200 rounded-xl self-end sm:col-span-2">
              <UserCircle className="w-4 h-4 text-violet-500 flex-shrink-0" />
              <div>
                <p className="text-xs font-semibold text-violet-700">FIT Package</p>
                <p className="text-[10px] text-violet-500">Individual / independent tour</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Total Stay Nights</label>
              <select value={nights} onChange={(e) => changeNights(Number(e.target.value))} className="input">
                {nightsOptions.map((n) => (
                  <option key={n} value={n}>{n} {n === 1 ? 'Night' : 'Nights'}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Total Days</label>
              <select value={totalDays} onChange={(e) => changeDays(Number(e.target.value))} className="input">
                {daysOptions.map((d) => (
                  <option key={d} value={d}>{d} {d === 1 ? 'Day' : 'Days'}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="label mb-2">Day Plan</label>
            <ItineraryTable rows={rows} nights={nights} readOnly={false} onUpdateRow={updateRow} />
          </div>
        </form>
      )}
    </Modal>
  );
}

// ─── FIT Create Modal ─────────────────────────────────────────────────────────

function NewFITModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const createPkg = useCreatePackage();

  const [nights, setNights] = useState(3);
  const [rows, setRows] = useState<ItineraryRow[]>(() => buildItineraryRows(3));

  const { register, handleSubmit, formState: { errors }, reset } = useForm<{ name: string }>({
    defaultValues: { name: '' },
  });

  const changeNights = (n: number) => {
    setNights(n);
    setRows((prev) => {
      const next = buildItineraryRows(n);
      return next.map((row) => {
        const existing = prev.find((r) => r.key === row.key);
        return existing ? { ...row, activityType: existing.activityType, activityDetails: existing.activityDetails } : row;
      });
    });
  };

  const changeDays = (d: number) => changeNights(Math.max(1, d - 2));

  const updateRow = (key: string, field: 'activityType' | 'activityDetails', value: string) => {
    setRows((prev) => prev.map((r) => {
      if (r.key !== key) return r;
      const updated = { ...r, [field]: value as ActivityType };
      if (field === 'activityType' && value === 'JOURNEY') updated.activityDetails = '';
      return updated;
    }));
  };

  const handleClose = () => {
    onClose(); reset();
    setNights(3); setRows(buildItineraryRows(3));
  };

  const onSubmit = (data: { name: string }) => {
    createPkg.mutate({
      name: data.name, nights, packageType: 'FIT',
      itineraryRows: rows.map((r) => ({
        dayOffset: r.dayIndex * 2 + (r.rowType === 'night' ? 1 : 0),
        title: r.label,
        activityType: r.activityType,
        activityDetails: r.activityDetails,
      })),
    } as any, { onSuccess: handleClose });
  };

  const totalDays = nights + 2;
  const nightsOptions = Array.from({ length: 30 }, (_, i) => i + 1);
  const daysOptions = Array.from({ length: 30 }, (_, i) => i + 3);

  return (
    <Modal
      open={open} onClose={handleClose}
      title="New FIT Package"
      size="2xl"
      footer={
        <>
          <button type="button" onClick={handleClose} className="btn-secondary">Cancel</button>
          <button form="fit-form" type="submit" disabled={createPkg.isPending} className="btn-primary">
            {createPkg.isPending ? 'Creating…' : 'Create FIT Package'}
          </button>
        </>
      }
    >
      <div className="mb-4 flex items-start gap-2 px-3 py-2.5 bg-violet-50 border border-violet-200 rounded-xl text-xs text-violet-700">
        <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
        <span>FIT packages are Individual / Independent tours you create for specific customers. Add pricing and full details after creation.</span>
      </div>
      <form id="fit-form" onSubmit={handleSubmit(onSubmit)} className="space-y-5">

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="label">Package Name *</label>
            <input {...register('name', { required: 'Name is required' })} className="input" placeholder="e.g. Manali Private Trip — Sharma Family" />
            {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
          </div>
          <div className="flex items-center gap-3 px-4 py-2 bg-violet-50 border border-violet-200 rounded-xl self-end sm:col-span-2">
            <UserCircle className="w-4 h-4 text-violet-500 flex-shrink-0" />
            <div>
              <p className="text-xs font-semibold text-violet-700">FIT Package</p>
              <p className="text-[10px] text-violet-500">Individual / independent tour</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Total Stay Nights</label>
            <select value={nights} onChange={(e) => changeNights(Number(e.target.value))} className="input">
              {nightsOptions.map((n) => (
                <option key={n} value={n}>{n} {n === 1 ? 'Night' : 'Nights'}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Total Days</label>
            <select value={totalDays} onChange={(e) => changeDays(Number(e.target.value))} className="input">
              {daysOptions.map((d) => (
                <option key={d} value={d}>{d} {d === 1 ? 'Day' : 'Days'}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="label mb-2">Day Plan</label>
          <ItineraryTable rows={rows} nights={nights} readOnly={false} onUpdateRow={updateRow} />
        </div>

      </form>
    </Modal>
  );
}

// ─── Delete Confirm Dialog ────────────────────────────────────────────────────

function DeleteFITDialog({ pkg, onClose }: { pkg: PkgType; onClose: () => void }) {
  const deletePkg = useDeletePackage();
  return (
    <Modal open onClose={onClose} title="Delete Package" size="sm"
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button
            type="button"
            disabled={deletePkg.isPending}
            onClick={() => deletePkg.mutate(pkg.id, { onSuccess: onClose })}
            className="btn-danger"
          >
            {deletePkg.isPending ? 'Deleting…' : 'Delete'}
          </button>
        </>
      }
    >
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0 mt-0.5">
          <AlertTriangle className="w-4.5 h-4.5 text-red-600" />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-800">Delete "{pkg.name}"?</p>
          <p className="text-xs text-slate-500 mt-1">This will permanently delete the package and its itinerary. This cannot be undone.</p>
        </div>
      </div>
    </Modal>
  );
}

// ─── Package Card ─────────────────────────────────────────────────────────────

function PackageCard({
  pkg, currentUserId, onView, onEdit, onDelete,
}: {
  pkg: PkgType;
  currentUserId: string;
  onView: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const highlights = parseList(pkg.highlights ?? '[]');
  const inclusions = parseList(pkg.inclusions ?? '[]');
  const exclusions = parseList(pkg.exclusions ?? '[]');

  const isMyFIT = pkg.packageType === 'FIT' && pkg.createdById === currentUserId;

  return (
    <div className="card p-5 hover:shadow-lg transition-all flex flex-col">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {pkg.isPopular && <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500 flex-shrink-0" />}
            <h3 className="font-semibold text-slate-800 text-sm leading-tight truncate">{pkg.name}</h3>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={cn(
              'text-[10px] font-bold px-1.5 py-0.5 rounded',
              pkg.packageType === 'GIT' ? 'bg-blue-100 text-blue-700' : 'bg-violet-100 text-violet-700'
            )}>{pkg.packageType ?? 'GIT'}</span>
            {isMyFIT && (
              <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-medium">My Package</span>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-1.5 mb-3 flex-1">
        {pkg.destination && (
          <div className="flex items-center gap-1.5 text-xs text-slate-600">
            <MapPin className="w-3 h-3 text-slate-400" />
            <span>{pkg.destination.name}, {pkg.destination.country}</span>
          </div>
        )}
        {pkg.tourCategory && (
          <div className="flex items-center gap-1.5 text-xs text-slate-600">
            <Tag className="w-3 h-3 text-slate-400" />
            <span>{pkg.tourCategory.icon && `${pkg.tourCategory.icon} `}{pkg.tourCategory.name}</span>
          </div>
        )}
        <div className="flex items-center gap-1.5 text-xs text-slate-600">
          <Clock className="w-3 h-3 text-slate-400" />
          <span>{pkg.nights}N / {pkg.days}D</span>
        </div>
        {pkg.createdBy && pkg.packageType === 'FIT' && (
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <UserCircle className="w-3 h-3" />
            <span>Created by {pkg.createdBy.name}{pkg.createdBy.employeeId ? ` (${pkg.createdBy.employeeId})` : ''}</span>
          </div>
        )}
        {pkg.description && <p className="text-xs text-slate-500 leading-relaxed">{pkg.description}</p>}
      </div>

      <div className="bg-primary-50 rounded-xl p-3 mb-3">
        <p className="text-[10px] font-semibold text-primary-400 uppercase tracking-wider mb-1">Starting From</p>
        {pkg.offerPrice ? (
          <div className="flex items-baseline gap-2">
            <p className="text-lg font-bold text-primary-600">{formatCurrency(pkg.offerPrice)}</p>
            <p className="text-xs text-slate-400 line-through">{formatCurrency(pkg.pricePerPerson)}</p>
          </div>
        ) : (
          <p className="text-lg font-bold text-primary-600">
            {formatCurrency(pkg.pricePerPerson)}<span className="text-xs text-slate-400 font-normal"> /person</span>
          </p>
        )}
        {(pkg.priceSingle || pkg.priceDouble || pkg.priceTriple || pkg.priceQuad) && (
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
            {pkg.priceSingle && <span className="text-[10px] text-slate-500">1 pax: {formatCurrency(pkg.priceSingle)}</span>}
            {pkg.priceDouble && <span className="text-[10px] text-slate-500">2 pax: {formatCurrency(pkg.priceDouble)}</span>}
            {pkg.priceTriple && <span className="text-[10px] text-slate-500">3 pax: {formatCurrency(pkg.priceTriple)}</span>}
            {pkg.priceQuad && <span className="text-[10px] text-slate-500">4 pax: {formatCurrency(pkg.priceQuad)}</span>}
          </div>
        )}
      </div>

      {(highlights.length > 0 || inclusions.length > 0) && (
        <>
          <button
            onClick={() => setShowDetails((v) => !v)}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition-colors mb-2"
          >
            <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', showDetails && 'rotate-180')} />
            {showDetails ? 'Hide details' : 'View inclusions & highlights'}
          </button>
          {showDetails && (
            <div className="space-y-3 text-xs border-t border-slate-100 pt-3 mb-3">
              {highlights.length > 0 && (
                <div>
                  <p className="font-semibold text-slate-500 mb-1">Highlights</p>
                  <ul className="space-y-0.5">
                    {highlights.map((h, i) => <li key={i} className="text-slate-600 flex gap-1"><span className="text-primary-400">✦</span>{h}</li>)}
                  </ul>
                </div>
              )}
              {inclusions.length > 0 && (
                <div>
                  <p className="font-semibold text-emerald-600 mb-1">What's Included</p>
                  <ul className="space-y-0.5">
                    {inclusions.map((h, i) => <li key={i} className="text-slate-600 flex gap-1"><span className="text-emerald-500">✓</span>{h}</li>)}
                  </ul>
                </div>
              )}
              {exclusions.length > 0 && (
                <div>
                  <p className="font-semibold text-red-500 mb-1">Not Included</p>
                  <ul className="space-y-0.5">
                    {exclusions.map((h, i) => <li key={i} className="text-slate-600 flex gap-1"><span className="text-red-400">✗</span>{h}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Action row */}
      <div className="flex items-center gap-2 pt-2 border-t border-slate-100 mt-auto">
        <button
          onClick={onView}
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-primary-600 transition-colors"
        >
          <Eye className="w-3.5 h-3.5" /> View
        </button>
        {isMyFIT && onEdit && (
          <button
            onClick={onEdit}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-primary-600 transition-colors ml-2"
          >
            <Pencil className="w-3.5 h-3.5" /> Edit
          </button>
        )}
        {isMyFIT && onDelete && (
          <button
            onClick={onDelete}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-red-600 transition-colors ml-2"
          >
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PackageCatalogPage() {
  const [search, setSearch] = useState('');
  const [filterDest, setFilterDest] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [filterType, setFilterType] = useState('');
  const [showNewFIT, setShowNewFIT] = useState(false);
  const [viewPkg, setViewPkg] = useState<PkgType | null>(null);
  const [editPkg, setEditPkg] = useState<PkgType | null>(null);
  const [deletePkg, setDeletePkg] = useState<PkgType | null>(null);
  const currentUser = useAuthStore((s) => s.user);

  const { data, isLoading } = usePackages({ search, status: 'ACTIVE', destinationId: filterDest, tourCategoryId: filterCat, packageType: filterType });
  const { data: destData } = useDestinations({ status: 'ACTIVE' });
  const { data: catData } = useTourCategories();

  const packages = data?.data ?? [];
  const destinations = destData?.data ?? [];
  const categories = catData?.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Package Catalog</h2>
          <p className="text-sm text-slate-500 mt-0.5">Browse GIT group packages or create your own FIT packages</p>
        </div>
        <button onClick={() => setShowNewFIT(true)} className="btn-primary gap-2 self-start sm:self-auto">
          <Plus className="w-4 h-4" /> New FIT Package
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} className="input pl-9" placeholder="Search packages…" />
        </div>
        <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="input sm:w-32">
          <option value="">All Types</option>
          <option value="GIT">GIT</option>
          <option value="FIT">FIT</option>
        </select>
        <select value={filterDest} onChange={(e) => setFilterDest(e.target.value)} className="input sm:w-44">
          <option value="">All Destinations</option>
          {destinations.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)} className="input sm:w-40">
          <option value="">All Categories</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-64 rounded-2xl" />)}
        </div>
      ) : packages.length === 0 ? (
        <div className="empty-state">
          <Package className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="font-semibold text-slate-600">No packages found</p>
          <p className="text-sm text-slate-400 mt-1">
            {search || filterDest || filterCat || filterType
              ? 'Try adjusting filters'
              : 'No active packages yet — ask admin to add GIT packages, or create a FIT package'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {packages.map((pkg) => (
            <PackageCard
              key={pkg.id}
              pkg={pkg}
              currentUserId={currentUser?.id ?? ''}
              onView={() => setViewPkg(pkg)}
              onEdit={() => setEditPkg(pkg)}
              onDelete={() => setDeletePkg(pkg)}
            />
          ))}
        </div>
      )}

      {showNewFIT && <NewFITModal open={showNewFIT} onClose={() => setShowNewFIT(false)} />}
      {viewPkg && <FITViewModal pkg={viewPkg} onClose={() => setViewPkg(null)} />}
      {editPkg && <EditFITModal pkg={editPkg} onClose={() => setEditPkg(null)} />}
      {deletePkg && <DeleteFITDialog pkg={deletePkg} onClose={() => setDeletePkg(null)} />}
    </div>
  );
}
