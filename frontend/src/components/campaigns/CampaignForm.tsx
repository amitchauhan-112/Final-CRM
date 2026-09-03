import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { X, Plus, Link2 } from 'lucide-react';
import { Campaign, CampaignStatus } from '../../types/index';
import { useUsers } from '../../hooks/useUsers';
import { blockDecimalKey, wholeNumberRule } from '../../utils/helpers';

function parseKeywords(value: unknown): string[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value) {
    try { return JSON.parse(value); } catch { return []; }
  }
  return [];
}

interface CampaignFormData {
  name: string;
  destination: string;
  description?: string;
  status: CampaignStatus;
  startDate?: string;
  endDate?: string;
  targetLeads?: number;
  budget?: number;
  whatsappNumber?: string;
  instagramAdId?: string;
  utmSource?: string;
  utmCampaign?: string;
  keywords: string[];
  employeeIds: string[];
}

interface CampaignFormProps {
  defaultValues?: Partial<Campaign>;
  onSubmit: (data: CampaignFormData) => void;
  isLoading?: boolean;
  onCancel: () => void;
}

export default function CampaignForm({
  defaultValues,
  onSubmit,
  isLoading,
  onCancel,
}: CampaignFormProps) {
  const isMetaCampaign = Boolean(defaultValues?.isFromMeta);

  const { data: usersData } = useUsers({ role: 'EMPLOYEE', limit: 100, isActive: true });
  const employees = usersData?.data ?? [];

  const [keywords, setKeywords] = useState<string[]>(() => parseKeywords(defaultValues?.keywords));
  const [keywordInput, setKeywordInput] = useState('');
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>(
    defaultValues?.employees?.map((e) => e.userId) ?? []
  );

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<Omit<CampaignFormData, 'keywords' | 'employeeIds'>>({
    defaultValues: {
      name: defaultValues?.name ?? '',
      destination: defaultValues?.destination ?? '',
      description: defaultValues?.description ?? '',
      status: defaultValues?.status ?? 'DRAFT',
      startDate: defaultValues?.startDate?.slice(0, 10) ?? '',
      endDate: defaultValues?.endDate?.slice(0, 10) ?? '',
      targetLeads: defaultValues?.targetLeads,
      budget: defaultValues?.budget,
      whatsappNumber: defaultValues?.whatsappNumber ?? '',
      instagramAdId: defaultValues?.instagramAdId ?? '',
      utmSource: defaultValues?.utmSource ?? '',
      utmCampaign: defaultValues?.utmCampaign ?? '',
    },
  });

  useEffect(() => {
    if (defaultValues) {
      reset({
        name: defaultValues.name ?? '',
        destination: defaultValues.destination ?? '',
        description: defaultValues.description ?? '',
        status: defaultValues.status ?? 'DRAFT',
        startDate: defaultValues.startDate?.slice(0, 10) ?? '',
        endDate: defaultValues.endDate?.slice(0, 10) ?? '',
        targetLeads: defaultValues.targetLeads,
        budget: defaultValues.budget,
        whatsappNumber: defaultValues.whatsappNumber ?? '',
        instagramAdId: defaultValues.instagramAdId ?? '',
        utmSource: defaultValues.utmSource ?? '',
        utmCampaign: defaultValues.utmCampaign ?? '',
      });
      setKeywords(parseKeywords(defaultValues.keywords));
      setSelectedEmployees(defaultValues.employees?.map((e) => e.userId) ?? []);
    }
  }, [defaultValues, reset]);

  const addKeyword = () => {
    const kw = keywordInput.trim();
    if (kw && !keywords.includes(kw)) {
      setKeywords([...keywords, kw]);
    }
    setKeywordInput('');
  };

  const removeKeyword = (kw: string) => setKeywords(keywords.filter((k) => k !== kw));

  const toggleEmployee = (id: string) => {
    setSelectedEmployees((prev) =>
      prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id]
    );
  };

  const handleFormSubmit = (data: Omit<CampaignFormData, 'keywords' | 'employeeIds'>) => {
    onSubmit({ ...data, keywords, employeeIds: selectedEmployees });
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
      {isMetaCampaign && (
        <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-700">
          <Link2 className="w-3.5 h-3.5 flex-shrink-0" />
          <span>This campaign is synced from Meta Ads. Name, status, dates, and budget are managed by Meta and cannot be edited here.</span>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label">Campaign Name *</label>
          <input
            {...register('name', { required: 'Name is required' })}
            className={isMetaCampaign ? 'input bg-slate-50 cursor-not-allowed' : 'input'}
            placeholder="e.g. Kedarnath Summer 2025"
            readOnly={isMetaCampaign}
          />
          {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
        </div>
        <div>
          <label className="label">Destination *</label>
          <input
            {...register('destination', { required: 'Destination is required' })}
            className="input"
            placeholder="e.g. Kedarnath"
          />
          {errors.destination && (
            <p className="text-red-500 text-xs mt-1">{errors.destination.message}</p>
          )}
        </div>
      </div>

      <div>
        <label className="label">Description</label>
        <textarea
          {...register('description')}
          rows={2}
          className="input resize-none"
          placeholder="Brief description of this campaign..."
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label">Status</label>
          <select {...register('status')} className={isMetaCampaign ? 'input bg-slate-50 cursor-not-allowed' : 'input'} disabled={isMetaCampaign}>
            <option value="DRAFT">Draft</option>
            <option value="ACTIVE">Active</option>
            <option value="PAUSED">Paused</option>
            <option value="COMPLETED">Completed</option>
          </select>
        </div>
        <div>
          <label className="label">Target Leads</label>
          <input
            {...register('targetLeads', { valueAsNumber: true, min: 1 })}
            type="number"
            className="input"
            placeholder="e.g. 100"
            min={1}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label">Start Date</label>
          <input
            {...register('startDate')}
            type="date"
            className={isMetaCampaign ? 'input bg-slate-50 cursor-not-allowed' : 'input'}
            readOnly={isMetaCampaign}
          />
        </div>
        <div>
          <label className="label">End Date</label>
          <input
            {...register('endDate')}
            type="date"
            className={isMetaCampaign ? 'input bg-slate-50 cursor-not-allowed' : 'input'}
            readOnly={isMetaCampaign}
          />
        </div>
      </div>

      <div>
        <label className="label">Budget (INR)</label>
        <input
          {...register('budget', { valueAsNumber: true, min: 0, ...wholeNumberRule })}
          type="number"
          step="1"
          onKeyDown={blockDecimalKey}
          className={isMetaCampaign ? 'input bg-slate-50 cursor-not-allowed' : 'input'}
          placeholder="e.g. 50000"
          min={0}
          readOnly={isMetaCampaign}
        />
      </div>

      <div className="border-t border-slate-200 pt-4">
        <p className="text-sm font-semibold text-slate-700 mb-3">Integration Settings</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">WhatsApp Number</label>
            <input
              {...register('whatsappNumber')}
              className="input"
              placeholder="+91 98765 43210"
            />
          </div>
          <div>
            <label className="label">Instagram Ad ID</label>
            <input
              {...register('instagramAdId')}
              className="input"
              placeholder="Instagram ad identifier"
            />
          </div>
          <div>
            <label className="label">UTM Source</label>
            <input {...register('utmSource')} className="input" placeholder="e.g. instagram" />
          </div>
          <div>
            <label className="label">UTM Campaign</label>
            <input
              {...register('utmCampaign')}
              className="input"
              placeholder="e.g. kedarnath_2025"
            />
          </div>
        </div>
      </div>

      {/* Keywords */}
      <div className="border-t border-slate-200 pt-4">
        <label className="label">Keywords</label>
        <div className="flex gap-2 mb-2">
          <input
            value={keywordInput}
            onChange={(e) => setKeywordInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addKeyword();
              }
            }}
            className="input flex-1"
            placeholder="Type keyword and press Enter"
          />
          <button type="button" onClick={addKeyword} className="btn-secondary px-3">
            <Plus className="w-4 h-4" />
          </button>
        </div>
        {keywords.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {keywords.map((kw) => (
              <span
                key={kw}
                className="inline-flex items-center gap-1 bg-primary-100 text-primary-700 text-xs font-medium px-2.5 py-1 rounded-full"
              >
                {kw}
                <button type="button" onClick={() => removeKeyword(kw)}>
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Assigned Employees */}
      {employees.length > 0 && (
        <div className="border-t border-slate-200 pt-4">
          <label className="label">Assigned Employees</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto scrollbar-thin">
            {employees.map((emp) => (
              <label
                key={emp.id}
                className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selectedEmployees.includes(emp.id)}
                  onChange={() => toggleEmployee(emp.id)}
                  className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="text-sm text-slate-700">{emp.name}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel} className="btn-secondary">
          Cancel
        </button>
        <button type="submit" disabled={isLoading} className="btn-primary">
          {isLoading ? 'Saving...' : defaultValues?.id ? 'Update Campaign' : 'Create Campaign'}
        </button>
      </div>
    </form>
  );
}
