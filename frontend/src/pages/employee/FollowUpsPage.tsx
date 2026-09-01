import { useState } from 'react';
import { AlertCircle, Clock, Calendar, CheckCircle, RotateCcw, History } from 'lucide-react';
import { useLeads, useUpdateLead } from '../../hooks/useLeads';
import { useAuthStore } from '../../store/authStore';
import { Lead } from '../../types/index';
import LeadDetail from '../../components/leads/LeadDetail';
import FollowUpOutcomeModal from '../../components/leads/FollowUpOutcomeModal';
import BookingConfirmModal from '../../components/leads/BookingConfirmModal';
import { useStarredLeads } from '../../hooks/useStarredLeads';
import { useRecentViews } from '../../hooks/useRecentViews';
import Modal from '../../components/ui/Modal';
import Badge from '../../components/ui/Badge';
import DateTimePicker from '../../components/ui/DateTimePicker';
import { formatDate, formatDateTime, isOverdue, cn } from '../../utils/helpers';
import { useForm, Controller } from 'react-hook-form';

interface RescheduleForm {
  followUpDate: string;
  followUpNotes?: string;
}

function toLocalDatetimeInput(iso: string | undefined | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function RescheduleModal({
  open,
  onClose,
  lead,
}: {
  open: boolean;
  onClose: () => void;
  lead: Lead | null;
}) {
  const updateLead = useUpdateLead();
  const { register, handleSubmit, reset, control, formState: { errors } } = useForm<RescheduleForm>();

  const onSubmit = (data: RescheduleForm) => {
    if (!lead) return;
    const followUpISO = data.followUpDate ? new Date(data.followUpDate).toISOString() : undefined;
    updateLead.mutate(
      { id: lead.id, followUpDate: followUpISO, followUpNotes: data.followUpNotes, followUpDone: false },
      { onSuccess: () => { onClose(); reset(); } }
    );
  };

  const minDatetime = toLocalDatetimeInput(new Date().toISOString());

  return (
    <Modal open={open} onClose={onClose} title="Reschedule Follow-up" size="sm">
      {lead && (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
            <p className="text-sm font-medium text-slate-700">{lead.name}</p>
            <p className="text-xs text-slate-500">{lead.phone}</p>
          </div>
          <div>
            <label className="label">New Follow-up Date & Time *</label>
            <Controller
              name="followUpDate"
              control={control}
              rules={{
                required: 'Please select a date and time',
                validate: (val) => {
                  if (!val) return true;
                  return new Date(val) > new Date() || 'Follow-up date must be in the future';
                },
              }}
              render={({ field }) => (
                <DateTimePicker
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  min={minDatetime}
                  hasError={!!errors.followUpDate}
                />
              )}
            />
            {errors.followUpDate && <p className="text-red-500 text-xs mt-1">{errors.followUpDate.message}</p>}
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea
              {...register('followUpNotes')}
              rows={2}
              className="input resize-none"
              placeholder="Reminder note..."
            />
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={updateLead.isPending} className="btn-primary">
              {updateLead.isPending ? 'Saving...' : 'Reschedule'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function FollowUpCard({
  lead,
  onView,
  onMarkDone,
  onReschedule,
  variant,
}: {
  lead: Lead;
  onView: (lead: Lead) => void;
  onMarkDone: (lead: Lead) => void;
  onReschedule: (lead: Lead) => void;
  variant: 'overdue' | 'today' | 'upcoming' | 'later';
}) {
  const daysOverdue = variant === 'overdue' && lead.followUpDate
    ? Math.floor((Date.now() - new Date(lead.followUpDate).getTime()) / 86400000)
    : 0;

  const colorMap = {
    overdue: 'bg-red-50 border-red-200',
    today: 'bg-orange-50 border-orange-200',
    upcoming: 'bg-blue-50 border-blue-100',
    later: 'bg-slate-50 border-slate-200',
  };

  const textMap = {
    overdue: 'text-red-700',
    today: 'text-orange-700',
    upcoming: 'text-blue-700',
    later: 'text-slate-600',
  };

  return (
    <div className={cn('rounded-xl border p-4', colorMap[variant])}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="font-semibold text-slate-900">{lead.name}</p>
          <p className="text-sm text-slate-500">{lead.phone}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge status={lead.status} />
          <Badge source={lead.source} />
        </div>
      </div>

      <div className={cn('flex items-center gap-1.5 text-xs font-medium mb-1', textMap[variant])}>
        {variant === 'overdue' ? (
          <AlertCircle className="w-3.5 h-3.5" />
        ) : variant === 'today' ? (
          <Clock className="w-3.5 h-3.5" />
        ) : (
          <Calendar className="w-3.5 h-3.5" />
        )}
        {/* upcoming and later share the same calendar icon — only the section heading tells them apart */}
        <span>{formatDateTime(lead.followUpDate)}</span>
      </div>

      {variant === 'overdue' && daysOverdue > 0 && (
        <p className="text-xs text-red-500 font-medium mb-1">
          {daysOverdue === 1 ? '1 day overdue' : `${daysOverdue} days overdue`}
        </p>
      )}

      {lead.followUpNotes && (
        <p className="text-xs text-slate-600 italic mb-3 line-clamp-2">"{lead.followUpNotes}"</p>
      )}

      {lead.destination && (
        <p className="text-xs text-slate-500 mb-3">
          <span className="mr-1">🏔</span>
          {lead.destination}
        </p>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => onMarkDone(lead)}
          className="flex items-center gap-1.5 text-xs font-medium bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg transition-colors"
        >
          <CheckCircle className="w-3.5 h-3.5" />
          Mark Done
        </button>
        <button
          onClick={() => onReschedule(lead)}
          className="flex items-center gap-1.5 text-xs font-medium btn-secondary py-1.5"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Reschedule
        </button>
        <button
          onClick={() => onView(lead)}
          className="text-xs font-medium text-slate-600 hover:text-slate-800 underline"
        >
          View Lead
        </button>
      </div>
    </div>
  );
}

function CompletedCard({ lead, onView, onReschedule }: {
  lead: Lead;
  onView: (lead: Lead) => void;
  onReschedule: (lead: Lead) => void;
}) {
  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <p className="font-semibold text-slate-900">{lead.name}</p>
          <p className="text-sm text-slate-500">{lead.phone}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge status={lead.status} />
          <span className="flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-100 border border-emerald-200 rounded-full px-2 py-0.5">
            <CheckCircle className="w-3 h-3" /> Done
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1.5 text-xs text-emerald-700 font-medium mb-1">
        <Calendar className="w-3.5 h-3.5" />
        <span>{formatDate(lead.followUpDate)}</span>
      </div>

      {lead.followUpNotes && (
        <p className="text-xs text-slate-600 italic mb-2 line-clamp-2">"{lead.followUpNotes}"</p>
      )}

      {lead.destination && (
        <p className="text-xs text-slate-500 mb-2">🏔 {lead.destination}</p>
      )}

      <div className="flex items-center gap-2 mt-2 flex-wrap">
        <button
          onClick={() => onReschedule(lead)}
          className="flex items-center gap-1.5 text-xs font-medium btn-secondary py-1.5"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Reschedule
        </button>
        <button
          onClick={() => onView(lead)}
          className="text-xs font-medium text-slate-600 hover:text-slate-800 underline"
        >
          View Lead
        </button>
      </div>
    </div>
  );
}

type TabKey = 'pending' | 'completed';

export default function EmployeeFollowUpsPage() {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<TabKey>('pending');
  const [detailLeadId, setDetailLeadId] = useState<string | null>(null);
  const [rescheduleLeadId, setRescheduleLeadId] = useState<Lead | null>(null);
  const [outcomeLead, setOutcomeLead] = useState<Lead | null>(null);
  const [bookingLead, setBookingLead] = useState<Lead | null>(null);
  const { isStarred, toggle: toggleStar } = useStarredLeads();
  const { trackView } = useRecentViews();

  const openDetail = (id: string) => { setDetailLeadId(id); trackView(id); };

  const { data, isLoading, refetch } = useLeads({
    assignedToId: user?.id,
    limit: 300,
  });

  const updateLead = useUpdateLead();

  const allLeads = data?.data ?? [];
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  // Pending: has followUpDate and NOT done
  const pendingLeads = allLeads.filter((l) => l.followUpDate && !l.followUpDone);
  const completedLeads = allLeads.filter((l) => l.followUpDate && l.followUpDone)
    .sort((a, b) => new Date(b.followUpDate!).getTime() - new Date(a.followUpDate!).getTime());

  const overdue = pendingLeads.filter((l) => new Date(l.followUpDate!) < now);
  const today = pendingLeads.filter((l) => {
    const d = new Date(l.followUpDate!);
    return d >= now && l.followUpDate!.startsWith(todayStr);
  });
  const upcoming = pendingLeads.filter((l) => {
    const d = new Date(l.followUpDate!);
    return d > now && !l.followUpDate!.startsWith(todayStr) && d <= nextWeek;
  });
  // Anything scheduled further out than a week used to be fetched but never
  // shown in any section here — silently invisible until it drifted inside
  // the 7-day window. This is the same "pending, not done" set, just further
  // in the future, so every follow-up now always lands somewhere.
  const later = pendingLeads
    .filter((l) => new Date(l.followUpDate!) > nextWeek)
    .sort((a, b) => new Date(a.followUpDate!).getTime() - new Date(b.followUpDate!).getTime());

  // A completed follow-up must always resolve to one of four outcomes — never
  // just silently marked done and left stuck at Follow-up Scheduled with no
  // next step, so Mark Done opens the outcome picker instead of mutating directly.
  const handleMarkDone = (lead: Lead) => {
    // A confirmed lead's status is permanently locked, so none of the four
    // outcomes apply — just clear the stale reminder directly.
    if (lead.status === 'CONFIRMED') {
      updateLead.mutate({ id: lead.id, followUpDone: true });
    } else {
      setOutcomeLead(lead);
    }
  };

  const handleOutcomeReschedule = (followUpDate: string, followUpNotes?: string) => {
    if (!outcomeLead) return;
    updateLead.mutate(
      { id: outcomeLead.id, status: 'FOLLOW_UP_SCHEDULED', followUpDate, followUpNotes, followUpDone: false },
      { onSuccess: () => setOutcomeLead(null) }
    );
  };
  const handleOutcomeInterested = () => {
    if (!outcomeLead) return;
    updateLead.mutate(
      { id: outcomeLead.id, status: 'INTERESTED', followUpDone: true },
      { onSuccess: () => setOutcomeLead(null) }
    );
  };
  const handleOutcomeConfirmed = () => {
    if (!outcomeLead) return;
    const lead = outcomeLead;
    updateLead.mutate(
      { id: lead.id, followUpDone: true },
      { onSuccess: () => { setOutcomeLead(null); setBookingLead(lead); } }
    );
  };
  const handleOutcomeLost = (reason: string, otherText?: string) => {
    if (!outcomeLead) return;
    updateLead.mutate(
      { id: outcomeLead.id, status: 'LOST', followUpDone: true, lostReason: reason, lostReasonOther: otherText },
      { onSuccess: () => setOutcomeLead(null) }
    );
  };

  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: 'pending', label: 'Pending', count: pendingLeads.length },
    { key: 'completed', label: 'Completed', count: completedLeads.length },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Follow-ups</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            {overdue.length > 0 && <span className="text-red-600 font-medium">{overdue.length} overdue · </span>}
            {today.length} today · {upcoming.length} upcoming · {later.length} later · {completedLeads.length} completed
          </p>
        </div>
        <button onClick={() => refetch()} className="btn-secondary flex items-center gap-2 py-2">
          <RotateCcw className="w-4 h-4" />
          <span className="hidden sm:inline text-sm">Refresh</span>
        </button>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 p-1 bg-slate-100 rounded-xl w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all',
              activeTab === tab.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            )}
          >
            {tab.key === 'completed' ? <History className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
            {tab.label}
            {tab.count > 0 && (
              <span className={cn(
                'text-xs px-1.5 py-0.5 rounded-full font-semibold',
                activeTab === tab.key
                  ? (tab.key === 'pending' && overdue.length > 0 ? 'bg-red-100 text-red-700' : 'bg-primary-100 text-primary-700')
                  : 'bg-slate-200 text-slate-600'
              )}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Pending Tab ── */}
      {activeTab === 'pending' && (
        <>
          {/* Overdue */}
          {overdue.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <AlertCircle className="w-4 h-4 text-red-500" />
                <h3 className="text-sm font-bold text-red-700">Overdue ({overdue.length})</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {overdue.map((lead) => (
                  <FollowUpCard
                    key={lead.id}
                    lead={lead}
                    variant="overdue"
                    onView={(l) => openDetail(l.id)}
                    onMarkDone={handleMarkDone}
                    onReschedule={setRescheduleLeadId}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Today */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4 text-orange-500" />
              <h3 className="text-sm font-bold text-orange-700">
                Today's Follow-ups {today.length > 0 ? `(${today.length})` : ''}
              </h3>
            </div>
            {today.length === 0 ? (
              <div className="card p-8 text-center">
                <Clock className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-slate-500 text-sm">No follow-ups scheduled for today</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {today.map((lead) => (
                  <FollowUpCard
                    key={lead.id}
                    lead={lead}
                    variant="today"
                    onView={(l) => openDetail(l.id)}
                    onMarkDone={handleMarkDone}
                    onReschedule={setRescheduleLeadId}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Upcoming 7 days */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Calendar className="w-4 h-4 text-primary-500" />
              <h3 className="text-sm font-bold text-primary-700">
                Upcoming (Next 7 Days) {upcoming.length > 0 ? `(${upcoming.length})` : ''}
              </h3>
            </div>
            {upcoming.length === 0 ? (
              <div className="card p-8 text-center">
                <Calendar className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-slate-500 text-sm">No upcoming follow-ups in the next 7 days</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {upcoming.map((lead) => (
                  <FollowUpCard
                    key={lead.id}
                    lead={lead}
                    variant="upcoming"
                    onView={(l) => openDetail(l.id)}
                    onMarkDone={handleMarkDone}
                    onReschedule={setRescheduleLeadId}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Later (beyond 7 days) */}
          {later.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Calendar className="w-4 h-4 text-slate-400" />
                <h3 className="text-sm font-bold text-slate-600">
                  Later {later.length > 0 ? `(${later.length})` : ''}
                </h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {later.map((lead) => (
                  <FollowUpCard
                    key={lead.id}
                    lead={lead}
                    variant="later"
                    onView={(l) => openDetail(l.id)}
                    onMarkDone={handleMarkDone}
                    onReschedule={setRescheduleLeadId}
                  />
                ))}
              </div>
            </div>
          )}

          {!isLoading && overdue.length === 0 && today.length === 0 && upcoming.length === 0 && later.length === 0 && (
            <div className="card p-12 text-center">
              <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-3" />
              <p className="text-slate-700 font-semibold text-lg">All caught up!</p>
              <p className="text-slate-400 text-sm mt-1">No pending follow-ups. Great work!</p>
            </div>
          )}
        </>
      )}

      {/* ── Completed Tab ── */}
      {activeTab === 'completed' && (
        <>
          {completedLeads.length === 0 ? (
            <div className="card p-12 text-center">
              <History className="w-12 h-12 text-slate-200 mx-auto mb-3" />
              <p className="text-slate-700 font-semibold">No completed follow-ups yet</p>
              <p className="text-slate-400 text-sm mt-1">Follow-ups you mark as done will appear here.</p>
            </div>
          ) : (
            <div>
              <p className="text-xs text-slate-500 mb-3">{completedLeads.length} completed follow-up{completedLeads.length !== 1 ? 's' : ''}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {completedLeads.map((lead) => (
                  <CompletedCard
                    key={lead.id}
                    lead={lead}
                    onView={(l) => openDetail(l.id)}
                    onReschedule={setRescheduleLeadId}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <LeadDetail
        leadId={detailLeadId}
        open={!!detailLeadId}
        onClose={() => setDetailLeadId(null)}
        isStarred={detailLeadId ? isStarred(detailLeadId) : false}
        onToggleStar={detailLeadId ? () => toggleStar(detailLeadId) : undefined}
      />

      <RescheduleModal
        open={!!rescheduleLeadId}
        onClose={() => setRescheduleLeadId(null)}
        lead={rescheduleLeadId}
      />

      <FollowUpOutcomeModal
        open={!!outcomeLead}
        lead={outcomeLead}
        onClose={() => setOutcomeLead(null)}
        onReschedule={handleOutcomeReschedule}
        onInterested={handleOutcomeInterested}
        onConfirmed={handleOutcomeConfirmed}
        onLost={handleOutcomeLost}
      />

      {bookingLead && (
        <BookingConfirmModal
          open={!!bookingLead}
          onClose={() => setBookingLead(null)}
          lead={bookingLead}
        />
      )}
    </div>
  );
}
