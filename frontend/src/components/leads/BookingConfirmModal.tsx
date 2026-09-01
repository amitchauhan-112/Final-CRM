import { useEffect, useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import {
  IndianRupee, Users, MapPin, Package, Utensils, BedDouble, Calendar, FileText,
  ChevronRight, Info,
} from 'lucide-react';
import Modal from '../ui/Modal';
import { Lead, Booking, FoodPreference, RoomSharing, TourType } from '../../types/index';
import { useCreateBooking, useUpdateBooking } from '../../hooks/useBookings';
import { usePackages, usePackage, useCreatePackage } from '../../hooks/usePackages';
import { formatCurrency, cn } from '../../utils/helpers';
import toast from 'react-hot-toast';

interface BookingForm {
  travelerName: string;
  numberOfTravelers: number;
  aadharNumber: string;
  foodPreference: string;
  roomSharing: string;
  tourType: string;
  specialRequest: string;
  bookingNotes: string;
  packageId: string;
  departureDate: string;
  returnDate: string;
  finalPrice: number;
  amountPaid: number;
  balanceDueDate: string;
  paymentMode: 'CASH' | 'ONLINE';
  paymentMethod: 'UPI' | 'BANK_TRANSFER';
  paymentReference: string;
  handedOverTo: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  lead: Lead;
  existingBooking?: Booking | null;
}

function SectionHeader({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-2 pt-1 pb-1 border-b border-slate-100 mb-3">
      <Icon className="w-3.5 h-3.5 text-primary-500" />
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</p>
    </div>
  );
}

export default function BookingConfirmModal({ open, onClose, lead, existingBooking }: Props) {
  const createBooking = useCreateBooking();
  const updateBooking = useUpdateBooking();
  const isEdit = !!existingBooking;
  const todayDate = new Date().toISOString().split('T')[0];

  // Split room types — only offered when creating a booking (not editing one
  // already confirmed, since per-traveler rows are managed by Operations
  // from that point on via the Passenger Table).
  const [splitEnabled, setSplitEnabled] = useState(false);
  const [roomSplit, setRoomSplit] = useState<{ count: number; roomSharing: RoomSharing }[]>([
    { count: 0, roomSharing: 'DOUBLE' },
  ]);
  const [splitError, setSplitError] = useState<string | null>(null);

  // Inline "create a new FIT package" — Sales can already create FIT
  // packages (the backend allows it: only GIT is Admin-only), but previously
  // had to leave this form and go to the Package Master screen to do it.
  const createPackage = useCreatePackage();
  const [showCreatePackage, setShowCreatePackage] = useState(false);
  const [newPkg, setNewPkg] = useState({ name: '', code: '', nights: '', pricePerPerson: '' });

  const { register, handleSubmit, control, setValue, formState: { errors } } = useForm<BookingForm>({
    defaultValues: {
      travelerName: existingBooking?.travelerName ?? lead.name,
      numberOfTravelers: existingBooking?.numberOfTravelers ?? lead.groupSize ?? 1,
      aadharNumber: existingBooking?.aadharNumber ?? '',
      foodPreference: existingBooking?.foodPreference ?? 'NO_PREFERENCE',
      roomSharing: existingBooking?.roomSharing ?? 'DOUBLE',
      tourType: existingBooking?.tourType ?? 'GIT',
      specialRequest: existingBooking?.specialRequest ?? '',
      bookingNotes: existingBooking?.bookingNotes ?? '',
      packageId: existingBooking?.packageId ?? '',
      departureDate: existingBooking?.departureDate ? existingBooking.departureDate.split('T')[0] : '',
      returnDate: existingBooking?.returnDate ? existingBooking.returnDate.split('T')[0] : '',
      finalPrice: existingBooking?.finalPrice ?? lead.budget ?? 0,
      amountPaid: existingBooking?.amountPaid ?? 0,
      balanceDueDate: existingBooking?.balanceDueDate ? existingBooking.balanceDueDate.split('T')[0] : '',
      paymentMode: 'CASH',
      paymentMethod: 'UPI',
      paymentReference: '',
      handedOverTo: '',
    },
  });

  const finalPrice = useWatch({ control, name: 'finalPrice' });
  const amountPaid = useWatch({ control, name: 'amountPaid' });
  const watchedTourType = useWatch({ control, name: 'tourType' });
  const watchedPackageId = useWatch({ control, name: 'packageId' });
  const watchedDepartureDate = useWatch({ control, name: 'departureDate' });
  const watchedPaymentMode = useWatch({ control, name: 'paymentMode' });
  const watchedNumberOfTravelers = useWatch({ control, name: 'numberOfTravelers' });

  const balanceAmount = Math.max(0, Number(finalPrice || 0) - Number(amountPaid || 0));

  // Type-filtered package list
  const { data: packagesData } = usePackages({ status: 'ACTIVE', packageType: watchedTourType });
  const packages = packagesData?.data ?? [];

  // Destination-matching within type-filtered list
  const matchingPackages = useMemo(
    () => (lead.destination
      ? packages.filter((p) => p.destination?.name?.toLowerCase() === lead.destination!.toLowerCase())
      : []),
    [packages, lead.destination]
  );
  const [showAllPackages, setShowAllPackages] = useState(false);
  const displayedPackages = matchingPackages.length > 0 && !showAllPackages ? matchingPackages : packages;

  // Fetch selected package detail (with itinerary)
  const { data: selectedPkgData } = usePackage(watchedPackageId || null);
  const selectedPkg = selectedPkgData?.data ?? null;

  // Auto-fill price and return date when package or departure date changes
  useEffect(() => {
    if (!selectedPkg) return;
    setValue('finalPrice', selectedPkg.offerPrice ?? selectedPkg.pricePerPerson);
    if (watchedDepartureDate) {
      const dep = new Date(watchedDepartureDate);
      dep.setDate(dep.getDate() + selectedPkg.nights + 1);
      setValue('returnDate', dep.toISOString().split('T')[0]);
    }
  }, [watchedPackageId, watchedDepartureDate, selectedPkg]);

  // Reset package when tour type changes
  useEffect(() => {
    if (!isEdit) setValue('packageId', '');
    setShowCreatePackage(false);
  }, [watchedTourType]);

  useEffect(() => {
    if (open) {
      setValue('travelerName', existingBooking?.travelerName ?? lead.name);
      setValue('numberOfTravelers', existingBooking?.numberOfTravelers ?? lead.groupSize ?? 1);
      setValue('aadharNumber', existingBooking?.aadharNumber ?? '');
      setValue('foodPreference', existingBooking?.foodPreference ?? 'NO_PREFERENCE');
      setValue('roomSharing', existingBooking?.roomSharing ?? 'DOUBLE');
      setValue('tourType', existingBooking?.tourType ?? 'GIT');
      setValue('specialRequest', existingBooking?.specialRequest ?? '');
      setValue('bookingNotes', existingBooking?.bookingNotes ?? '');
      setValue('packageId', existingBooking?.packageId ?? '');
      setValue('departureDate', existingBooking?.departureDate ? existingBooking.departureDate.split('T')[0] : '');
      setValue('returnDate', existingBooking?.returnDate ? existingBooking.returnDate.split('T')[0] : '');
      setValue('finalPrice', existingBooking?.finalPrice ?? lead.budget ?? 0);
      setValue('amountPaid', existingBooking?.amountPaid ?? 0);
      setValue('balanceDueDate', existingBooking?.balanceDueDate ? existingBooking.balanceDueDate.split('T')[0] : '');
      setValue('paymentMode', 'CASH');
      setValue('paymentMethod', 'UPI');
      setValue('paymentReference', '');
      setValue('handedOverTo', '');
      setSplitEnabled(false);
      setRoomSplit([{ count: 0, roomSharing: 'DOUBLE' }]);
      setSplitError(null);
      setShowCreatePackage(false);
      setNewPkg({ name: '', code: '', nights: '', pricePerPerson: '' });
    }
    // Deliberately keyed on IDs, not the whole `lead`/`existingBooking`
    // objects — both come from polling hooks (refetchInterval: 20000) that
    // hand back a new object reference every ~20s even when nothing changed.
    // Depending on the objects themselves reset every field on each poll
    // while this form was open, silently discarding anything the employee
    // had just typed/picked (e.g. a just-changed departure date reverting
    // back to the booking's old saved value before they could hit Save).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, existingBooking?.id, lead.id]);

  const onSubmit = (data: BookingForm) => {
    if (splitEnabled) {
      const validRows = roomSplit.filter((r) => r.count > 0);
      const sum = validRows.reduce((s, r) => s + r.count, 0);
      if (validRows.length === 0 || sum !== Number(data.numberOfTravelers)) {
        setSplitError(`Room split must add up to exactly ${data.numberOfTravelers} traveler${Number(data.numberOfTravelers) === 1 ? '' : 's'} (currently ${sum}).`);
        return;
      }
      setSplitError(null);
    }

    const payload = {
      leadId: lead.id,
      travelerName: data.travelerName,
      numberOfTravelers: Number(data.numberOfTravelers),
      aadharNumber: data.aadharNumber || undefined,
      foodPreference: data.foodPreference as FoodPreference,
      roomSharing: data.roomSharing as RoomSharing,
      roomSplit: splitEnabled ? roomSplit.filter((r) => r.count > 0) : undefined,
      tourType: data.tourType as TourType,
      specialRequest: data.specialRequest || undefined,
      bookingNotes: data.bookingNotes || undefined,
      packageId: data.packageId || undefined,
      departureDate: data.departureDate || undefined,
      returnDate: data.returnDate || undefined,
      finalPrice: Number(data.finalPrice),
      amountPaid: Number(data.amountPaid),
      balanceDueDate: data.balanceDueDate || undefined,
      paymentMode: data.paymentMode,
      paymentMethod: data.paymentMethod,
      paymentReference: data.paymentReference || undefined,
      handedOverTo: data.handedOverTo || undefined,
    };

    if (isEdit && existingBooking) {
      updateBooking.mutate({ ...payload, id: existingBooking.id }, { onSuccess: onClose });
    } else {
      createBooking.mutate(payload, { onSuccess: onClose });
    }
  };

  const handleCreatePackage = async () => {
    if (!newPkg.name.trim() || !newPkg.code.trim() || !newPkg.nights || isNaN(Number(newPkg.nights))) {
      toast.error('Name, code and nights are required'); return;
    }
    const nights = Number(newPkg.nights);
    try {
      const result: any = await createPackage.mutateAsync({
        name: newPkg.name.trim(),
        code: newPkg.code.trim(),
        nights,
        days: nights + 2,
        packageType: 'FIT',
        status: 'ACTIVE',
        isPopular: false,
        pricePerPerson: newPkg.pricePerPerson ? Number(newPkg.pricePerPerson) : 0,
        inclusions: '[]', exclusions: '[]', highlights: '[]', thingsToCarry: '[]',
        bestSeason: '[]', images: '[]', gallery: '[]',
      } as any);
      const created = result?.data;
      if (created?.id) setValue('packageId', created.id);
      setShowCreatePackage(false);
      setNewPkg({ name: '', code: '', nights: '', pricePerPerson: '' });
    } catch {
      // useCreatePackage's onError already toasts the server's message
    }
  };

  const isPending = createBooking.isPending || updateBooking.isPending;

  // Itinerary preview items (TRIP_DAY type only, sorted by dayOffset)
  const itineraryPreview = (selectedPkg?.itineraryItems ?? [])
    .filter((i) => i.taskType === 'TRIP_DAY')
    .sort((a, b) => a.dayOffset - b.dayOffset);

  const returnOffset = selectedPkg ? selectedPkg.nights + 1 : -1;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit Booking Details' : 'Confirm Booking'}
      size="2xl"
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button form="booking-form" type="submit" disabled={isPending} className="btn-primary gap-2">
            {isPending ? 'Saving…' : isEdit ? 'Update Booking' : 'Confirm & Save'}
          </button>
        </>
      }
    >
      <form id="booking-form" onSubmit={handleSubmit(onSubmit)} className="space-y-5">

        {isEdit && existingBooking?.bookingNumber && (
          <div className="flex items-center gap-2 px-3 py-2 bg-primary-50 border border-primary-200 rounded-xl">
            <span className="text-xs font-semibold text-primary-600">Booking #</span>
            <span className="font-mono text-sm font-bold text-primary-800">{existingBooking.bookingNumber}</span>
          </div>
        )}

        {/* ── Package & Trip Dates ─────────────────────────────────────────── */}
        <div>
          <SectionHeader icon={Package} label="Package & Dates" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

            {/* Tour Type */}
            <div className="sm:col-span-2">
              <label className="label">Package Type</label>
              <div className="flex gap-2">
                {(['GIT', 'FIT'] as const).map((type) => (
                  <label key={type} className={cn(
                    'flex-1 flex items-center justify-center gap-2 p-2.5 border-2 rounded-xl cursor-pointer transition-colors text-sm font-medium',
                    watchedTourType === type
                      ? type === 'GIT'
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-violet-500 bg-violet-50 text-violet-700'
                      : 'border-slate-200 text-slate-500 hover:border-slate-300'
                  )}>
                    <input type="radio" value={type} {...register('tourType')} className="sr-only" />
                    <span>{type}</span>
                    <span className="text-xs font-normal opacity-70">
                      {type === 'GIT' ? '— Group Tour' : '— Individual Tour'}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Package selector — filtered by tour type */}
            <div className="sm:col-span-2">
              <label className="label">Tour Package</label>
              <select {...register('packageId')} className="input">
                <option value="">-- Select a {watchedTourType} package --</option>
                {displayedPackages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} — {p.name} ({p.nights}N/{p.days}D) — {formatCurrency(p.offerPrice ?? p.pricePerPerson)}/person
                  </option>
                ))}
              </select>
              <div className="flex items-center justify-between mt-0.5">
                <p className="text-[10px] text-slate-400">
                  {packages.length === 0
                    ? `No active ${watchedTourType} packages found. Create one in Package Master first.`
                    : 'Linking a package auto-generates workflow tasks on departure date'}
                </p>
                {matchingPackages.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowAllPackages((v) => !v)}
                    className="text-[10px] font-medium text-primary-600 hover:text-primary-700 flex-shrink-0"
                  >
                    {showAllPackages ? `Show only ${lead.destination} packages` : 'Show all packages'}
                  </button>
                )}
              </div>

              {/* Inline FIT package creation — Sales can already create FIT
                  packages (only GIT is Admin-only), no need to leave this
                  form to go create one first. */}
              {watchedTourType === 'FIT' && (
                <div className="mt-2">
                  {!showCreatePackage ? (
                    <button
                      type="button"
                      onClick={() => setShowCreatePackage(true)}
                      className="text-xs font-medium text-primary-600 hover:text-primary-700"
                    >
                      + Create a new FIT package
                    </button>
                  ) : (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2.5">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="label text-xs">Package Name *</label>
                          <input
                            value={newPkg.name}
                            onChange={(e) => setNewPkg((p) => ({ ...p, name: e.target.value }))}
                            className="input text-sm"
                            placeholder="e.g. Kashmir Custom Trip"
                          />
                        </div>
                        <div>
                          <label className="label text-xs">Package Code *</label>
                          <input
                            value={newPkg.code}
                            onChange={(e) => setNewPkg((p) => ({ ...p, code: e.target.value }))}
                            className="input text-sm font-mono"
                            placeholder="e.g. FIT-KASH-01"
                          />
                        </div>
                        <div>
                          <label className="label text-xs">Nights *</label>
                          <input
                            type="number" min={1}
                            value={newPkg.nights}
                            onChange={(e) => setNewPkg((p) => ({ ...p, nights: e.target.value }))}
                            className="input text-sm"
                          />
                        </div>
                        <div>
                          <label className="label text-xs">Price / Person (₹)</label>
                          <input
                            type="number" min={0}
                            value={newPkg.pricePerPerson}
                            onChange={(e) => setNewPkg((p) => ({ ...p, pricePerPerson: e.target.value }))}
                            className="input text-sm"
                          />
                        </div>
                      </div>
                      <p className="text-[10px] text-slate-400">
                        Creates a minimal FIT package you can select right away — add full details (inclusions, itinerary, etc.) later from Package Master if needed.
                      </p>
                      <div className="flex items-center gap-2 justify-end">
                        <button type="button" onClick={() => setShowCreatePackage(false)} className="btn-secondary py-1.5 text-xs">Cancel</button>
                        <button
                          type="button"
                          onClick={handleCreatePackage}
                          disabled={createPackage.isPending}
                          className="btn-primary py-1.5 text-xs"
                        >
                          {createPackage.isPending ? 'Creating…' : 'Create & Select'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Selected package summary */}
            {selectedPkg && (
              <div className="sm:col-span-2 rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full',
                    selectedPkg.packageType === 'GIT' ? 'bg-blue-100 text-blue-700' : 'bg-violet-100 text-violet-700'
                  )}>{selectedPkg.packageType}</span>
                  <span className="text-xs font-mono font-bold bg-white border border-slate-200 text-slate-600 px-2 py-0.5 rounded">
                    {selectedPkg.code}
                  </span>
                  <span className="text-xs font-semibold text-slate-800">{selectedPkg.name}</span>
                  <span className="text-xs text-slate-500 ml-auto">{selectedPkg.nights}N / {selectedPkg.days}D</span>
                </div>
                <div className="flex items-center gap-1 text-xs text-slate-600">
                  <Info className="w-3 h-3 text-slate-400" />
                  <span>Price auto-filled: <strong>{formatCurrency(selectedPkg.offerPrice ?? selectedPkg.pricePerPerson)}</strong>/person</span>
                  {watchedDepartureDate && (
                    <span className="ml-2 text-slate-400">· Return auto-set to <strong>{new Date(watchedDepartureDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</strong> + {selectedPkg.nights + 1}d</span>
                  )}
                </div>

                {/* Day Plan preview */}
                {itineraryPreview.length > 0 && (
                  <div className="space-y-1 pt-1 border-t border-slate-200 mt-1">
                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Day Plan</p>
                    {itineraryPreview.map((item) => {
                      const isDepart = item.dayOffset === 0;
                      const isReturn = item.dayOffset === returnOffset;
                      return (
                        <div key={item.id} className="flex items-start gap-2 py-0.5">
                          <span className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 mt-0.5 tabular-nums',
                            isDepart ? 'bg-amber-100 text-amber-700'
                            : isReturn ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-blue-100 text-blue-700'
                          )}>D{item.dayOffset}</span>
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-slate-700 leading-tight">{item.title}</p>
                            {item.description && (
                              <p className="text-[10px] text-slate-400 truncate">{item.description}</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Departure + Return dates */}
            <div>
              <label className="label">Departure Date</label>
              <input
                type="date"
                {...register('departureDate', {
                  validate: (v) => {
                    if (!v) return true;
                    const existingDate = existingBooking?.departureDate?.split('T')[0];
                    if (existingDate === v) return true; // unchanged — don't block an already-past trip
                    return v >= todayDate || 'Departure date cannot be in the past';
                  },
                })}
                min={todayDate}
                className="input"
              />
              {errors.departureDate && <p className="text-red-500 text-xs mt-1">{errors.departureDate.message}</p>}
            </div>
            <div>
              <label className="label">Return Date {selectedPkg ? '(Auto)' : ''}</label>
              <input
                type="date"
                {...register('returnDate', {
                  validate: (v, formValues) => !v || !formValues.departureDate || v >= formValues.departureDate || 'Return date cannot be before departure date',
                })}
                className="input"
              />
              {errors.returnDate && <p className="text-red-500 text-xs mt-1">{errors.returnDate.message}</p>}
              {selectedPkg && watchedDepartureDate && (
                <p className="text-[10px] text-slate-400 mt-0.5">Auto-calculated from departure + {selectedPkg.nights + 1} days</p>
              )}
            </div>
          </div>
        </div>

        {/* ── Traveler Details ────────────────────────────────────────────── */}
        <div>
          <SectionHeader icon={Users} label="Traveler Details" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="label">Lead / Traveler Name *</label>
              <input {...register('travelerName', { required: 'Name is required' })} className="input" />
              {errors.travelerName && <p className="text-red-500 text-xs mt-1">{errors.travelerName.message}</p>}
            </div>
            <div>
              <label className="label">No. of Travelers *</label>
              <input
                type="number" min={1}
                {...register('numberOfTravelers', { required: 'Required', min: { value: 1, message: 'At least 1' }, valueAsNumber: true })}
                className="input"
              />
              {errors.numberOfTravelers && <p className="text-red-500 text-xs mt-1">{errors.numberOfTravelers.message}</p>}
            </div>
            <div>
              <label className="label">Aadhar Card No.</label>
              <input
                {...register('aadharNumber', { validate: (v) => !v || /^\d{12}$/.test(v.replace(/\s/g, '')) || 'Aadhar number must be 12 digits' })}
                className="input font-mono" placeholder="XXXX XXXX XXXX" maxLength={14}
              />
              {errors.aadharNumber && <p className="text-red-500 text-xs mt-1">{errors.aadharNumber.message}</p>}
            </div>
            <div>
              <label className="label">Food Preference *</label>
              <select {...register('foodPreference', { required: 'Required' })} className="input">
                <option value="">-- Select --</option>
                <option value="NO_PREFERENCE">No Preference</option>
                <option value="VEG">Vegetarian</option>
                <option value="NON_VEG">Non-Vegetarian</option>
                <option value="JAIN">Jain</option>
              </select>
              {errors.foodPreference && <p className="text-red-500 text-xs mt-1">{errors.foodPreference.message}</p>}
            </div>
            <div>
              <label className="label">Room Sharing *</label>
              <select {...register('roomSharing', { required: 'Required' })} className="input">
                <option value="">-- Select --</option>
                <option value="SINGLE">Single Occupancy</option>
                <option value="DOUBLE">Double Sharing</option>
                <option value="TRIPLE">Triple Sharing</option>
                <option value="QUAD">Quad Sharing</option>
              </select>
              {errors.roomSharing && <p className="text-red-500 text-xs mt-1">{errors.roomSharing.message}</p>}
              <p className="text-[10px] text-slate-400 mt-0.5">Used as the default for the whole group — split into different room types below if needed.</p>
            </div>

            {/* Split into different room types — group bookings only, at creation time */}
            {!isEdit && Number(watchedNumberOfTravelers) > 1 && (
              <div className="sm:col-span-2 rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2.5">
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={splitEnabled}
                    onChange={(e) => {
                      setSplitEnabled(e.target.checked);
                      setSplitError(null);
                      if (e.target.checked) setRoomSplit([{ count: Number(watchedNumberOfTravelers), roomSharing: 'DOUBLE' }]);
                    }}
                    className="w-4 h-4 rounded border-slate-300"
                  />
                  Split this group into different room types
                </label>

                {splitEnabled && (
                  <div className="space-y-2 pl-6">
                    {roomSplit.map((row, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <input
                          type="number"
                          min={1}
                          value={row.count || ''}
                          onChange={(e) => {
                            const next = [...roomSplit];
                            next[idx] = { ...row, count: Number(e.target.value) || 0 };
                            setRoomSplit(next);
                            setSplitError(null);
                          }}
                          placeholder="0"
                          className="input w-20 text-sm"
                        />
                        <span className="text-xs text-slate-400 flex-shrink-0">travelers →</span>
                        <select
                          value={row.roomSharing}
                          onChange={(e) => {
                            const next = [...roomSplit];
                            next[idx] = { ...row, roomSharing: e.target.value as RoomSharing };
                            setRoomSplit(next);
                          }}
                          className="input text-sm flex-1"
                        >
                          <option value="SINGLE">Single Occupancy</option>
                          <option value="DOUBLE">Double Sharing</option>
                          <option value="TRIPLE">Triple Sharing</option>
                          <option value="QUAD">Quad Sharing</option>
                        </select>
                        {roomSplit.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setRoomSplit(roomSplit.filter((_, i) => i !== idx))}
                            className="text-slate-400 hover:text-red-500 text-xs flex-shrink-0 px-1"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                    <div className="flex items-center justify-between pt-1">
                      <button
                        type="button"
                        onClick={() => setRoomSplit([...roomSplit, { count: 0, roomSharing: 'DOUBLE' }])}
                        className="text-xs font-medium text-primary-600 hover:text-primary-700"
                      >
                        + Add another room type
                      </button>
                      <span className={cn(
                        'text-xs font-medium',
                        roomSplit.reduce((s, r) => s + r.count, 0) === Number(watchedNumberOfTravelers) ? 'text-emerald-600' : 'text-amber-600'
                      )}>
                        Total: {roomSplit.reduce((s, r) => s + r.count, 0)} / {watchedNumberOfTravelers} travelers
                      </span>
                    </div>
                    {splitError && <p className="text-red-500 text-xs">{splitError}</p>}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Trip Details ─────────────────────────────────────────────────── */}
        <div>
          <SectionHeader icon={MapPin} label="Trip Details" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Special Request</label>
              <input {...register('specialRequest')} className="input" placeholder="Any special requirement…" />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Internal Booking Notes</label>
              <textarea {...register('bookingNotes')} className="input resize-none text-sm" rows={2} placeholder="Internal notes about this booking…" />
            </div>
          </div>
        </div>

        {/* ── Payment Details ──────────────────────────────────────────────── */}
        <div>
          <SectionHeader icon={IndianRupee} label="Payment Details" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Price Finalised (₹) *</label>
              <input
                type="number" min={0} step="0.01"
                {...register('finalPrice', { required: 'Price is required', min: { value: 0, message: 'Must be ≥ 0' }, valueAsNumber: true })}
                className="input"
              />
              {selectedPkg && (
                <p className="text-[10px] text-slate-400 mt-0.5">Auto-filled from package — edit if negotiated differently</p>
              )}
              {errors.finalPrice && <p className="text-red-500 text-xs mt-1">{errors.finalPrice.message}</p>}
            </div>
            <div>
              <label className="label">Amount Paid (₹){!isEdit && <span className="text-red-500"> *</span>}</label>
              <input
                type="number" min={isEdit ? 0 : 0.01} step="0.01"
                {...register('amountPaid', {
                  valueAsNumber: true,
                  required: isEdit ? false : 'An advance payment is required to confirm a booking',
                  min: isEdit ? { value: 0, message: 'Must be ≥ 0' } : { value: 0.01, message: 'An advance payment is required to confirm a booking' },
                  validate: (v, formValues) => !(v > Number(formValues.finalPrice || 0)) || 'Amount paid cannot exceed the final price',
                })}
                className="input"
              />
              {errors.amountPaid && <p className="text-red-500 text-xs mt-1">{errors.amountPaid.message}</p>}
              {!isEdit && !errors.amountPaid && (
                <p className="text-[10px] text-slate-400 mt-0.5">An advance must be recorded to confirm this booking.</p>
              )}
            </div>
          </div>

          <div className="mt-3 flex items-center gap-4 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
            <div className="flex-1 text-center">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Final Price</p>
              <p className="text-sm font-bold text-slate-800 mt-0.5">{formatCurrency(Number(finalPrice) || 0)}</p>
            </div>
            <div className="w-px h-8 bg-slate-200" />
            <div className="flex-1 text-center">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Amount Paid</p>
              <p className="text-sm font-bold text-emerald-700 mt-0.5">{formatCurrency(Number(amountPaid) || 0)}</p>
            </div>
            <div className="w-px h-8 bg-slate-200" />
            <div className="flex-1 text-center">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Balance Due</p>
              <p className={cn('text-sm font-bold mt-0.5', balanceAmount > 0 ? 'text-orange-600' : 'text-emerald-600')}>
                {formatCurrency(balanceAmount)}
              </p>
            </div>
          </div>

          {/* Payment mode — only for new bookings when advance is entered */}
          {!isEdit && Number(amountPaid) > 0 && (
            <div className="mt-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">How was the payment received?</p>

              {/* Cash / Online toggle */}
              <div className="flex gap-2">
                {(['CASH', 'ONLINE'] as const).map((mode) => (
                  <label key={mode} className={cn(
                    'flex-1 flex items-center justify-center gap-2 py-2.5 border-2 rounded-xl cursor-pointer transition-colors text-sm font-medium',
                    watchedPaymentMode === mode
                      ? mode === 'CASH'
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                        : 'border-indigo-500 bg-indigo-50 text-indigo-700'
                      : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                  )}>
                    <input type="radio" value={mode} {...register('paymentMode')} className="sr-only" />
                    {mode === 'CASH' ? 'Cash' : 'Online'}
                  </label>
                ))}
              </div>

              {/* Online sub-options */}
              {watchedPaymentMode === 'ONLINE' && (
                <div className="space-y-2">
                  <div>
                    <label className="label">Select Mode</label>
                    <select {...register('paymentMethod')} className="input bg-white">
                      <option value="UPI">UPI</option>
                      <option value="BANK_TRANSFER">Bank Transfer</option>
                    </select>
                  </div>
                  <div>
                    <label className="label">Transaction / UTR ID</label>
                    <input
                      {...register('paymentReference')}
                      className="input bg-white font-mono"
                      placeholder="Enter transaction or UTR ID"
                    />
                  </div>
                </div>
              )}

              {/* Cash — handed over to */}
              {watchedPaymentMode === 'CASH' && (
                <div>
                  <label className="label">Cash Handed Over To *</label>
                  <input
                    {...register('handedOverTo', {
                      validate: (v) =>
                        watchedPaymentMode !== 'CASH' || Number(amountPaid) <= 0 || !!v?.trim() ||
                        'Enter the name of the person who received the cash',
                    })}
                    className="input bg-white"
                    placeholder="Enter name of person who received the cash"
                  />
                  {errors.handedOverTo && <p className="text-red-500 text-xs mt-1">{errors.handedOverTo.message}</p>}
                </div>
              )}
            </div>
          )}

          {balanceAmount > 0 && (
            <div className="mt-3">
              <label className="label">Balance Due Date</label>
              <input
                type="date"
                {...register('balanceDueDate', {
                  validate: (val, formValues) => {
                    if (!val) return true;
                    if (val < todayDate) return 'Balance due date cannot be in the past';
                    if (formValues.departureDate && val > formValues.departureDate) return 'Balance due date must be before the departure date';
                    return true;
                  },
                })}
                className="input"
                min={todayDate}
                max={watchedDepartureDate || undefined}
              />
              {errors.balanceDueDate && <p className="text-red-500 text-xs mt-1">{errors.balanceDueDate.message}</p>}
            </div>
          )}
        </div>
      </form>
    </Modal>
  );
}
