import { useEffect, useState, useRef } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { Lead, LeadStatus, LeadSource, LeadPriority } from '../../types/index';
import { useCampaigns } from '../../hooks/useCampaigns';
import { useUsers } from '../../hooks/useUsers';
import { useAuthStore } from '../../store/authStore';
import { useSettings } from '../../hooks/useSettings';
import { useDestinations } from '../../hooks/useMasters';
import DuplicateWarningDialog from './DuplicateWarningDialog';
import LostReasonModal from './LostReasonModal';
import TagInput from '../ui/TagInput';
import api from '../../services/api';
import { cn } from '../../utils/helpers';

const STATUS_ORDER: LeadStatus[] = ['NEW', 'NOT_CONTACTED', 'CONTACTED', 'INTERESTED', 'FOLLOW_UP_SCHEDULED', 'CONFIRMED', 'LOST'];

interface LeadFormData {
  name: string;
  phone: string;
  email?: string;
  source: LeadSource;
  status: LeadStatus;
  priority: LeadPriority;
  message?: string;
  destination?: string;
  campaignId?: string;
  assignedToId?: string;
  notes?: string;
  groupSize?: number;
  budget?: number;
  preferredDate?: string;
  followUpDate?: string;
  followUpNotes?: string;
  tagIds?: string[];
  lostReason?: string;
  lostReasonOther?: string;
}

interface LeadFormProps {
  defaultValues?: Partial<Lead>;
  onSubmit: (data: LeadFormData) => void;
  isLoading?: boolean;
  onCancel: () => void;
}

function extractDigits(phone: string | undefined | null): string {
  if (!phone) return '';
  return phone.replace(/^\+91\s?/, '').replace(/\D/g, '').slice(0, 10);
}

function toLocalDatetimeInput(iso: string | undefined | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function LeadForm({ defaultValues, onSubmit, isLoading, onCancel }: LeadFormProps) {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'ADMIN';
  const isEmployee = user?.role === 'EMPLOYEE';
  const isEditMode = !!defaultValues?.id;
  const isConfirmedLead = isEditMode && defaultValues?.status === 'CONFIRMED';

  const { data: campaignsData } = useCampaigns({ limit: 100 });
  const { data: usersData } = useUsers({ role: 'EMPLOYEE', limit: 100, isActive: true });
  const { data: settings } = useSettings();
  const { data: destinationsData } = useDestinations({ status: 'ACTIVE' });

  const [duplicates, setDuplicates] = useState<any[]>([]);
  const [pendingSubmit, setPendingSubmit] = useState<LeadFormData | null>(null);
  const [lostModalOpen, setLostModalOpen] = useState(false);
  const [pendingLostData, setPendingLostData] = useState<LeadFormData | null>(null);
  const dupCheckedRef = useRef<{ phone: string; email: string }>({ phone: '', email: '' });
  const [destOpen, setDestOpen] = useState(false);
  const [destQuery, setDestQuery] = useState(defaultValues?.destination ?? '');
  const destRef = useRef<HTMLDivElement>(null);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    control,
    setValue,
    formState: { errors },
  } = useForm<LeadFormData>({
    defaultValues: {
      name: '',
      phone: extractDigits(defaultValues?.phone),
      source: 'MANUAL',
      status: 'NEW',
      priority: 'MEDIUM',
      ...defaultValues,
      campaignId: defaultValues?.campaignId ?? '',
      assignedToId: defaultValues?.assignedToId ?? '',
      tagIds: (defaultValues as any)?.tags?.map((lt: any) => lt.tagId ?? lt.id) ?? [],
    },
  });

  useEffect(() => {
    if (defaultValues) {
      reset({
        name: defaultValues.name ?? '',
        phone: extractDigits(defaultValues.phone),
        email: defaultValues.email ?? '',
        source: defaultValues.source ?? 'MANUAL',
        status: defaultValues.status ?? 'NEW',
        priority: (defaultValues as any).priority ?? 'MEDIUM',
        message: defaultValues.message ?? '',
        destination: defaultValues.destination ?? '',
        campaignId: defaultValues.campaignId ?? '',
        assignedToId: defaultValues.assignedToId ?? '',
        notes: defaultValues.notes ?? '',
        groupSize: defaultValues.groupSize,
        budget: defaultValues.budget,
        preferredDate: defaultValues.preferredDate?.slice(0, 10) ?? '',
        followUpDate: toLocalDatetimeInput(defaultValues.followUpDate),
        followUpNotes: defaultValues.followUpNotes ?? '',
        tagIds: (defaultValues as any)?.tags?.map((lt: any) => lt.tagId ?? lt.id) ?? [],
      });
      setDestQuery(defaultValues.destination ?? '');
    }
  }, [defaultValues, reset]);

  const allCampaigns = campaignsData?.data ?? [];
  const employees = usersData?.data ?? [];
  const masterDestinations = destinationsData?.data ?? [];

  // Campaign filtering: only show campaigns whose destination matches the selected destination
  const selectedDestination = watch('destination');
  const filteredCampaigns = selectedDestination
    ? allCampaigns.filter((c) => c.destination.toLowerCase() === selectedDestination.toLowerCase())
    : allCampaigns;

  // Clear campaign if selected destination no longer has it
  useEffect(() => {
    const currentCampaignId = watch('campaignId');
    if (currentCampaignId && selectedDestination) {
      const stillValid = filteredCampaigns.some((c) => c.id === currentCampaignId);
      if (!stillValid) setValue('campaignId', '');
    }
  }, [selectedDestination]); // eslint-disable-line react-hooks/exhaustive-deps

  // Destination combobox: filtered suggestions
  const destSuggestions = masterDestinations.filter((d) =>
    d.name.toLowerCase().includes(destQuery.toLowerCase())
  );

  // Close destination dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (destRef.current && !destRef.current.contains(e.target as Node)) setDestOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Status options based on role + edit mode
  const getStatusOptions = (): LeadStatus[] => {
    if (isConfirmedLead) return ['CONFIRMED', 'LOST'];
    const currentIdx = STATUS_ORDER.indexOf((defaultValues?.status as LeadStatus) ?? 'NEW');
    if (isEmployee && isEditMode) {
      // Employees can only move forward, never backward, never set CONFIRMED directly
      return STATUS_ORDER.slice(currentIdx).filter((s) => s !== 'CONFIRMED');
    }
    // Admins and new-lead creation: all except CONFIRMED (that goes through booking flow)
    return STATUS_ORDER.filter((s) => s !== 'CONFIRMED');
  };

  const statusOptions = getStatusOptions();

  const messageText = watch('message') ?? '';
  const wordCount = messageText.trim() ? messageText.trim().split(/\s+/).length : 0;

  const nowLocal = toLocalDatetimeInput(new Date().toISOString());
  const todayDate = new Date().toISOString().split('T')[0];

  // ─── Duplicate detection ─────────────────────────────────────────────────────

  const checkDuplicate = async (phone: string, email: string) => {
    if (isEditMode) return;
    const phoneDigits = phone.replace(/\D/g, '');
    const key = `${phoneDigits}|${email}`;
    if (dupCheckedRef.current.phone === phoneDigits && dupCheckedRef.current.email === email) return;
    dupCheckedRef.current = { phone: phoneDigits, email };
    if (!phoneDigits && !email) return;

    try {
      const params: Record<string, string> = {};
      if (phoneDigits.length === 10) params.phone = `+91${phoneDigits}`;
      if (email) params.email = email;
      const { data } = await api.get('/leads/check-duplicate', { params });
      if (data?.data?.length > 0) setDuplicates(data.data);
    } catch {
      // silently ignore
    }
  };

  // ─── Form submit intercept ───────────────────────────────────────────────────

  const handleFormSubmit = (data: LeadFormData) => {
    const payload: LeadFormData = {
      ...data,
      phone: `+91${data.phone.replace(/\D/g, '')}`,
      followUpDate: data.followUpDate ? new Date(data.followUpDate).toISOString() : undefined,
    };

    // Intercept LOST status — require reason if not already set
    if (payload.status === 'LOST' && !payload.lostReason) {
      setPendingLostData(payload);
      setLostModalOpen(true);
      return;
    }

    // Duplicate check blocks create (not update)
    if (!isEditMode && duplicates.length > 0) {
      setPendingSubmit(payload);
      return;
    }

    onSubmit(payload);
  };

  const handleContinueAnyway = () => {
    setDuplicates([]);
    if (pendingSubmit) {
      onSubmit(pendingSubmit);
      setPendingSubmit(null);
    }
  };

  const handleLostConfirm = (reason: string, otherText?: string) => {
    setLostModalOpen(false);
    if (!pendingLostData) return;
    const payload = { ...pendingLostData, lostReason: reason, lostReasonOther: otherText };
    setPendingLostData(null);

    if (!isEditMode && duplicates.length > 0) {
      setPendingSubmit(payload);
      return;
    }
    onSubmit(payload);
  };

  const inputClass = (hasError: boolean) =>
    cn('input', hasError && 'border-red-500 focus:ring-red-500 focus:border-red-500');

  const sources = settings?.sources ?? ['MANUAL', 'WHATSAPP', 'INSTAGRAM', 'WEBSITE', 'META_ADS'];

  return (
    <>
      <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Full Name <span className="text-red-500">*</span></label>
            <input
              {...register('name', { required: 'Name is required', minLength: { value: 2, message: 'Name is too short' } })}
              className={inputClass(!!errors.name)}
              placeholder="Customer name"
            />
            {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
          </div>
          <div>
            <label className="label">Phone <span className="text-red-500">*</span></label>
            <div className="flex">
              <span className="flex items-center px-3 bg-slate-100 border border-r-0 border-slate-300 rounded-l-lg text-sm text-slate-600 font-medium select-none">+91</span>
              <input
                {...register('phone', {
                  required: 'Phone is required',
                  pattern: { value: /^[0-9]{10}$/, message: 'Enter exactly 10 digits' },
                  onBlur: (e) => checkDuplicate(e.target.value, watch('email') ?? ''),
                })}
                className={cn(inputClass(!!errors.phone), 'rounded-l-none')}
                placeholder="98765 43210"
                inputMode="numeric"
                maxLength={10}
                onInput={(e) => { const t = e.currentTarget; t.value = t.value.replace(/\D/g, '').slice(0, 10); }}
              />
            </div>
            {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone.message}</p>}
          </div>
        </div>

        <div>
          <label className="label">Email</label>
          <input
            {...register('email', {
              pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Enter a valid email address' },
              onBlur: (e) => checkDuplicate(watch('phone') ?? '', e.target.value),
            })}
            type="email"
            className={inputClass(!!errors.email)}
            placeholder="customer@example.com"
          />
          {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="label">Source <span className="text-red-500">*</span></label>
            <select {...register('source', { required: true })} className="input">
              {sources.map((s) => (
                <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase().replace('_', ' ')}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Status <span className="text-red-500">*</span></label>
            <select {...register('status', { required: true })} className="input">
              {statusOptions.map((s) => (
                <option key={s} value={s}>
                  {s === 'NEW' ? 'New'
                    : s === 'NOT_CONTACTED' ? 'Not Contacted'
                    : s === 'CONTACTED' ? 'Contacted'
                    : s === 'INTERESTED' ? 'Interested'
                    : s === 'FOLLOW_UP_SCHEDULED' ? 'Follow-up Scheduled'
                    : s === 'CONFIRMED' ? 'Confirmed ✓'
                    : 'Lost'}
                </option>
              ))}
            </select>
            {isConfirmedLead && (
              <p className="text-xs text-amber-600 mt-1">Confirmed bookings can only be marked as Lost from here.</p>
            )}
            {isEmployee && isEditMode && !isConfirmedLead && (
              <p className="text-xs text-slate-400 mt-1">Status can only move forward in the workflow.</p>
            )}
          </div>
          <div>
            <label className="label">Priority</label>
            <select {...register('priority')} className="input">
              <option value="HIGH">🔴 High</option>
              <option value="MEDIUM">🟡 Medium</option>
              <option value="LOW">🟢 Low</option>
            </select>
          </div>
        </div>

        {/* Tags */}
        <div>
          <label className="label">Tags</label>
          <Controller
            name="tagIds"
            control={control}
            render={({ field }) => (
              <TagInput value={field.value ?? []} onChange={field.onChange} />
            )}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Destination combobox */}
          <div>
            <label className="label">Destination</label>
            <div ref={destRef} className="relative">
              <input
                {...register('destination')}
                value={destQuery}
                onChange={(e) => {
                  setDestQuery(e.target.value);
                  setValue('destination', e.target.value);
                  setDestOpen(true);
                }}
                onFocus={() => setDestOpen(true)}
                className="input"
                placeholder="Type or select a destination"
                autoComplete="off"
              />
              {destOpen && (destSuggestions.length > 0) && (
                <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {destSuggestions.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center justify-between gap-2"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setDestQuery(d.name);
                        setValue('destination', d.name);
                        setDestOpen(false);
                      }}
                    >
                      <span className="font-medium text-slate-800">{d.name}</span>
                      <span className="text-xs text-slate-400 shrink-0">{d.state ? `${d.state}, ` : ''}{d.country}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Campaign — filtered by destination */}
          <div>
            <label className="label">Campaign</label>
            {!selectedDestination ? (
              <div className="input bg-slate-50 text-slate-400 text-sm cursor-not-allowed select-none">
                Select a destination first
              </div>
            ) : filteredCampaigns.length === 0 ? (
              <div className="input bg-slate-50 text-slate-400 text-sm cursor-not-allowed select-none">
                No active campaigns for this destination
              </div>
            ) : (
              <select {...register('campaignId')} className="input">
                <option value="">No Campaign</option>
                {filteredCampaigns.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            )}
            {selectedDestination && filteredCampaigns.length > 0 && (
              <p className="text-xs text-slate-400 mt-1">{filteredCampaigns.length} campaign{filteredCampaigns.length !== 1 ? 's' : ''} for this destination</p>
            )}
          </div>
        </div>

        {isAdmin && (
          <div>
            <label className="label">Assign To</label>
            <select {...register('assignedToId')} className="input">
              <option value="">Unassigned</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Group Size</label>
            <input
              {...register('groupSize', { valueAsNumber: true, min: { value: 1, message: 'At least 1 person' }, max: { value: 100, message: 'Max 100' } })}
              type="number"
              className={inputClass(!!errors.groupSize)}
              placeholder="Number of people"
              min={1} max={100}
            />
            {errors.groupSize && <p className="text-red-500 text-xs mt-1">{errors.groupSize.message}</p>}
          </div>
          <div>
            <label className="label">Budget (INR)</label>
            <input {...register('budget', { valueAsNumber: true, min: 0 })} type="number" className="input" placeholder="e.g. 25000" min={0} />
          </div>
        </div>

        <div>
          <label className="label">Preferred Date</label>
          <input {...register('preferredDate')} type="date" className="input" min={todayDate} />
        </div>

        <div>
          <label className="label">Message / Inquiry</label>
          <textarea {...register('message')} rows={4} className="input resize-none" placeholder="Customer's original inquiry message..." />
          <div className="flex justify-end mt-1">
            <span className={cn('text-xs', wordCount > 200 ? 'text-amber-500' : 'text-slate-400')}>
              {wordCount} word{wordCount !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        <div>
          <label className="label">Internal Notes</label>
          <textarea {...register('notes')} rows={2} className="input resize-none" placeholder="Private notes for team..." />
        </div>

        <div className="border-t border-slate-200 pt-4">
          <p className="text-sm font-medium text-slate-700 mb-3">Follow-up</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Follow-up Date & Time</label>
              <input
                {...register('followUpDate', {
                  validate: (val) => !val || new Date(val) > new Date() || 'Follow-up date must be in the future',
                })}
                type="datetime-local"
                className={inputClass(!!errors.followUpDate)}
                min={nowLocal}
              />
              {errors.followUpDate && <p className="text-red-500 text-xs mt-1">{errors.followUpDate.message}</p>}
            </div>
            <div>
              <label className="label">Follow-up Notes</label>
              <input {...register('followUpNotes')} className="input" placeholder="Reminder note..." />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onCancel} className="btn-secondary">Cancel</button>
          <button type="submit" disabled={isLoading} className="btn-primary">
            {isLoading ? 'Saving...' : isEditMode ? 'Update Lead' : 'Create Lead'}
          </button>
        </div>
      </form>

      {/* Duplicate Warning */}
      {duplicates.length > 0 && (
        <DuplicateWarningDialog
          duplicates={duplicates}
          onViewLead={(id) => { setDuplicates([]); onCancel(); navigate(`/admin/leads?highlight=${id}`); }}
          onContinueAnyway={handleContinueAnyway}
          onCancel={() => { setDuplicates([]); setPendingSubmit(null); }}
        />
      )}

      {/* Lost Reason */}
      <LostReasonModal
        open={lostModalOpen}
        onConfirm={handleLostConfirm}
        onCancel={() => { setLostModalOpen(false); setPendingLostData(null); }}
        reasons={settings?.lostReasons}
      />
    </>
  );
}
