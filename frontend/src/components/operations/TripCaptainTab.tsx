import { useForm } from 'react-hook-form';
import { UserCog, Phone, UtensilsCrossed } from 'lucide-react';
import { useUpdateDeparture } from '../../hooks/useOperations';
import { useUsers } from '../../hooks/useUsers';
import { Departure } from '../../types/index';
import { cn, formatRelativeTime } from '../../utils/helpers';

const CAPTAIN_STATUS_BADGE: Record<string, string> = {
  UNASSIGNED: 'bg-red-50 text-red-600',
  ASSIGNED: 'bg-amber-50 text-amber-700',
  CONFIRMED: 'bg-emerald-50 text-emerald-700',
};

interface CaptainForm { tripCaptainUserId?: string; tripCaptainStatus: string; }

// Relocated from the old header-button + modal into a proper tab — same
// logic (captain select from TRIP_CAPTAIN-role accounts + status), just
// inline instead of a popup.
export default function TripCaptainTab({ departure }: { departure: Departure }) {
  const update = useUpdateDeparture(departure.id);
  const { data: captainsData } = useUsers({ role: 'TRIP_CAPTAIN', isActive: true, limit: 200 });
  const captains = captainsData?.data ?? [];

  const { register, handleSubmit } = useForm<CaptainForm>({
    defaultValues: {
      tripCaptainUserId: departure.tripCaptainUserId ?? '',
      tripCaptainStatus: departure.tripCaptainStatus,
    },
  });

  const onSubmit = (data: CaptainForm) => update.mutate(data as any);

  return (
    <div className="card p-5 max-w-lg space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center flex-shrink-0">
          <UserCog className="w-5 h-5 text-primary-600" />
        </div>
        <div>
          <p className="font-semibold text-slate-800 text-sm">
            {departure.tripCaptainName || 'Not assigned'}
            {departure.tripCaptainPhone && <span className="text-slate-400 font-normal"> · <Phone className="w-3 h-3 inline" /> {departure.tripCaptainPhone}</span>}
          </p>
          <span className={cn('badge mt-1', CAPTAIN_STATUS_BADGE[departure.tripCaptainStatus])}>{departure.tripCaptainStatus}</span>
        </div>
      </div>

      <form id="captain-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="label">Trip Captain</label>
          <select {...register('tripCaptainUserId')} className="input">
            <option value="">Not assigned</option>
            {captains.map((c) => (
              <option key={c.id} value={c.id}>{c.name}{c.phone ? ` — ${c.phone}` : ''}</option>
            ))}
          </select>
          {captains.length === 0 && (
            <p className="text-xs text-slate-400 mt-1">
              No Trip Captain accounts yet — create one from Organization → Employees (role: Trip Captain).
            </p>
          )}
        </div>
        <div>
          <label className="label">Status</label>
          <select {...register('tripCaptainStatus')} className="input">
            <option value="UNASSIGNED">Unassigned</option>
            <option value="ASSIGNED">Assigned</option>
            <option value="CONFIRMED">Confirmed</option>
          </select>
        </div>
        <button type="submit" disabled={update.isPending} className="btn-primary">
          {update.isPending ? 'Saving…' : 'Save'}
        </button>
      </form>

      {departure.mealUpdates.length > 0 && (
        <div className="pt-2 border-t border-slate-200 space-y-2">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Meal Updates from Trip Captain</p>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {departure.mealUpdates.map((m) => (
              <div key={m.id} className="flex items-start gap-2 p-2.5 rounded-lg bg-slate-50 border border-slate-100 text-sm">
                <UtensilsCrossed className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-slate-700">
                    {m.mealType.charAt(0) + m.mealType.slice(1).toLowerCase()} · {new Date(m.forDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                  </p>
                  <p className="text-xs text-slate-500">{m.menu}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">{m.postedBy.name} · {formatRelativeTime(m.createdAt)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
