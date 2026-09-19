import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import {
  ArrowLeft, MapPin, Calendar, Users, Building2, Truck, Bus, Phone, User,
  CheckCircle2, Circle, UtensilsCrossed, Clock,
} from 'lucide-react';
import {
  useTripCaptainDepartureDetail, useCheckInHotel, useCheckOutHotel, usePostMealUpdate,
} from '../../hooks/useTripCaptain';
import { Skeleton } from '../../components/ui/Skeleton';
import { formatRelativeTime, cn } from '../../utils/helpers';
import { MealType, PackageItinerary } from '../../types/index';

const ACTIVITY_BADGE: Record<string, string> = {
  JOURNEY: 'bg-amber-100 text-amber-700',
  STAY: 'bg-blue-100 text-blue-700',
  SIGHTSEEING: 'bg-violet-100 text-violet-700',
};

const MEAL_OPTIONS: { value: MealType; label: string }[] = [
  { value: 'BREAKFAST', label: 'Breakfast' },
  { value: 'LUNCH', label: 'Lunch' },
  { value: 'DINNER', label: 'Dinner' },
];

// Decodes the same "doubled" dayOffset encoding used everywhere else in this
// app (dayIndex = floor(dayOffset/2), night = dayOffset odd) — see
// TravelDayEditor in PackagesPage.tsx for the canonical version.
function ItineraryDay({ item }: { item: PackageItinerary }) {
  const dayIndex = Math.floor(item.dayOffset / 2);
  const isNight = item.dayOffset % 2 === 1;
  const activityType = item.notes;
  return (
    <div className="flex items-start gap-3 p-3 rounded-xl border border-slate-100 bg-white">
      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full tabular-nums flex-shrink-0 mt-0.5 bg-slate-100 text-slate-600">
        {isNight ? `N${dayIndex}` : `D${dayIndex}`}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium text-slate-700">{item.title}</p>
          {activityType && ACTIVITY_BADGE[activityType] && (
            <span className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase', ACTIVITY_BADGE[activityType])}>
              {activityType.charAt(0) + activityType.slice(1).toLowerCase()}
            </span>
          )}
          {item.location && <span className="text-xs text-primary-600 flex items-center gap-0.5"><MapPin className="w-3 h-3" />{item.location}</span>}
        </div>
        {item.description && <p className="text-xs text-slate-500 mt-0.5">{item.description}</p>}
      </div>
    </div>
  );
}

export default function TripCaptainTripDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isLoading } = useTripCaptainDepartureDetail(id);
  const departure = data?.data;

  const checkIn = useCheckInHotel(id ?? '');
  const checkOut = useCheckOutHotel(id ?? '');
  const postMeal = usePostMealUpdate(id ?? '');

  const today = new Date().toISOString().slice(0, 10);
  const { register, handleSubmit, reset } = useForm<{ mealType: MealType; forDate: string; menu: string }>({
    defaultValues: { mealType: 'DINNER', forDate: today, menu: '' },
  });

  const [showMealForm, setShowMealForm] = useState(false);

  if (isLoading || !departure) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  const itineraryItems = departure.package?.itineraryItems ?? [];

  const submitMeal = (data: { mealType: MealType; forDate: string; menu: string }) => {
    postMeal.mutate(data, { onSuccess: () => { reset({ mealType: 'DINNER', forDate: today, menu: '' }); setShowMealForm(false); } });
  };

  return (
    <div className="space-y-5">
      <button onClick={() => navigate('/trip-captain/dashboard')} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="w-4 h-4" />Back to My Trips
      </button>

      <div className="card p-5">
        <h2 className="text-xl font-bold text-slate-900">{departure.destination}</h2>
        <p className="text-sm text-slate-500 flex items-center gap-1.5 mt-1">
          <Calendar className="w-3.5 h-3.5" />
          {new Date(departure.departureDate).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
          {departure.package && <span>· {departure.package.name}</span>}
        </p>
        <p className="text-sm text-slate-500 flex items-center gap-1.5 mt-1">
          <Users className="w-3.5 h-3.5" />{departure.totalTravelers} travelers
        </p>
      </div>

      {itineraryItems.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Day-wise Itinerary</p>
          <div className="space-y-1.5">
            {itineraryItems.map((item) => <ItineraryDay key={item.id} item={item} />)}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Hotels</p>
        {departure.hotels.length === 0 ? (
          <p className="text-sm text-slate-400">No hotels added by Operations yet.</p>
        ) : (
          <div className="space-y-2">
            {departure.hotels.map((h) => (
              <div key={h.id} className="card p-4 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
                      <Building2 className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-800 text-sm">{h.name}</p>
                      {h.location && <p className="text-xs text-slate-400">{h.location}</p>}
                    </div>
                  </div>
                </div>
                <div className="text-xs text-slate-500 space-y-1">
                  {h.checkInDate && <p>Planned check-in: {new Date(h.checkInDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>}
                  {h.checkOutDate && <p>Planned check-out: {new Date(h.checkOutDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>}
                  {h.numberOfRooms && <p>{h.numberOfRooms} room(s){h.roomAllocation ? ` — ${h.roomAllocation}` : ''}</p>}
                  {h.contactPerson && <p className="flex items-center gap-1"><User className="w-3 h-3" />{h.contactPerson}</p>}
                  {h.vendorContact && <p className="flex items-center gap-1"><Phone className="w-3 h-3" />{h.vendorContact}</p>}
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => checkIn.mutate(h.id)}
                    disabled={!!h.checkedInAt || checkIn.isPending}
                    className={cn(
                      'flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors',
                      h.checkedInAt ? 'bg-emerald-50 text-emerald-700 cursor-default' : 'bg-primary-50 text-primary-700 hover:bg-primary-100'
                    )}
                  >
                    {h.checkedInAt ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5" />}
                    {h.checkedInAt ? `Checked in ${formatRelativeTime(h.checkedInAt)}` : 'Check In'}
                  </button>
                  <button
                    onClick={() => checkOut.mutate(h.id)}
                    disabled={!h.checkedInAt || !!h.checkedOutAt || checkOut.isPending}
                    className={cn(
                      'flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40',
                      h.checkedOutAt ? 'bg-emerald-50 text-emerald-700 cursor-default' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    )}
                  >
                    {h.checkedOutAt ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5" />}
                    {h.checkedOutAt ? `Checked out ${formatRelativeTime(h.checkedOutAt)}` : 'Check Out'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Vehicles</p>
        {departure.vehicles.length === 0 ? (
          <p className="text-sm text-slate-400">No vehicles added by Operations yet.</p>
        ) : (
          <div className="space-y-2">
            {departure.vehicles.map((v) => (
              <div key={v.id} className="card p-4">
                <div className="flex items-center gap-2 mb-1">
                  {v.transportType === 'VOLVO' ? <Bus className="w-4 h-4 text-slate-400" /> : <Truck className="w-4 h-4 text-slate-400" />}
                  <p className="font-semibold text-slate-800 text-sm">{v.transportType === 'VOLVO' ? (v.operatorName || 'Volvo') : (v.vehicleType || 'Cab')}</p>
                  {v.serviceDate && (
                    <span className="badge bg-primary-50 text-primary-700">
                      {new Date(v.serviceDate).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-500 space-y-0.5">
                  {v.vehicleNumber && <p>{v.vehicleNumber}</p>}
                  {v.driverName && <p className="flex items-center gap-1"><User className="w-3 h-3" />{v.driverName} {v.driverMobile && `· ${v.driverMobile}`}</p>}
                  {v.pickupLocation && <p className="flex items-center gap-1"><MapPin className="w-3 h-3" />{v.pickupLocation}</p>}
                  {v.pickupTime && <p className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(v.pickupTime).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Meal Updates</p>
          <button onClick={() => setShowMealForm((v) => !v)} className="text-xs font-medium text-primary-600 hover:text-primary-700">
            {showMealForm ? 'Cancel' : '+ Post Update'}
          </button>
        </div>

        {showMealForm && (
          <form onSubmit={handleSubmit(submitMeal)} className="card p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Meal</label>
                <select {...register('mealType', { required: true })} className="input">
                  {MEAL_OPTIONS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Date</label>
                <input type="date" {...register('forDate', { required: true })} className="input" />
              </div>
            </div>
            <div>
              <label className="label">Menu</label>
              <textarea {...register('menu', { required: true })} rows={2} className="input" placeholder="e.g. Dal, rice, roti, paneer sabzi, salad" />
            </div>
            <button type="submit" disabled={postMeal.isPending} className="btn-primary text-sm">{postMeal.isPending ? 'Posting…' : 'Post Update'}</button>
          </form>
        )}

        {departure.mealUpdates.length === 0 ? (
          <p className="text-sm text-slate-400">No meal updates posted yet.</p>
        ) : (
          <div className="space-y-2">
            {departure.mealUpdates.map((m) => (
              <div key={m.id} className="flex items-start gap-3 p-3 rounded-xl border border-slate-100 bg-white">
                <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
                  <UtensilsCrossed className="w-4 h-4 text-amber-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-700">
                    {m.mealType.charAt(0) + m.mealType.slice(1).toLowerCase()} · {new Date(m.forDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">{m.menu}</p>
                  <p className="text-xs text-slate-400 mt-1">{m.postedBy.name} · {formatRelativeTime(m.createdAt)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
