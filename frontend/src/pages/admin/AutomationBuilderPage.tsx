import { useState } from 'react';
import { Plus, Trash2, Zap, Play, Pause, Clock } from 'lucide-react';
import {
  useAutomationRules, useCreateAutomationRule, useUpdateAutomationRule, useDeleteAutomationRule,
} from '../../hooks/useAutomationRules';
import { useUsers } from '../../hooks/useUsers';
import Modal from '../../components/ui/Modal';
import { Skeleton } from '../../components/ui/Skeleton';
import { AutomationCondition, AutomationAction, AutomationActionType, AutomationConditionOperator } from '../../types/index';
import { formatDate, cn } from '../../utils/helpers';

const TRIGGERS = [
  { value: 'LEAD_CREATED', label: 'Lead Created' },
  { value: 'BOOKING_CONFIRMED', label: 'Booking Confirmed' },
  { value: 'PAYMENT_OVERDUE', label: 'Payment Overdue' },
  { value: 'TASK_OVERDUE', label: 'Task Overdue' },
  { value: 'TRAVELER_VERIFICATION_PENDING', label: 'Traveller Verification Pending' },
  { value: 'HOTEL_PENDING', label: 'Hotel Pending' },
  { value: 'VEHICLE_PENDING', label: 'Vehicle Pending' },
];
const OPERATORS: { value: AutomationConditionOperator; label: string }[] = [
  { value: 'equals', label: 'equals' },
  { value: 'notEquals', label: 'not equals' },
  { value: 'contains', label: 'contains' },
  { value: 'greaterThan', label: 'greater than' },
  { value: 'lessThan', label: 'less than' },
];
const ACTION_TYPES: { value: AutomationActionType; label: string }[] = [
  { value: 'ASSIGN_EMPLOYEE', label: 'Assign Employee' },
  { value: 'NOTIFY_EMPLOYEE', label: 'Notify Employee' },
  { value: 'NOTIFY_MANAGER', label: 'Notify Manager' },
  { value: 'SCHEDULE_FOLLOWUP', label: 'Schedule Follow-up' },
  { value: 'SEND_REMINDER', label: 'Send Reminder' },
];

function ActionConfigFields({ action, onChange, employees }: {
  action: AutomationAction; onChange: (config: Record<string, string>) => void; employees: { id: string; name: string }[];
}) {
  const set = (key: string, value: string) => onChange({ ...action.config, [key]: value });

  if (action.type === 'ASSIGN_EMPLOYEE') {
    return (
      <select value={action.config.employeeId ?? ''} onChange={(e) => set('employeeId', e.target.value)} className="input text-sm">
        <option value="">Select employee…</option>
        {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
      </select>
    );
  }
  if (action.type === 'SCHEDULE_FOLLOWUP') {
    return (
      <div className="flex gap-2">
        <input type="number" min={0} placeholder="Days from now" value={action.config.days ?? ''} onChange={(e) => set('days', e.target.value)} className="input text-sm w-32" />
        <input placeholder="Note (optional)" value={action.config.notes ?? ''} onChange={(e) => set('notes', e.target.value)} className="input text-sm flex-1" />
      </div>
    );
  }
  // NOTIFY_EMPLOYEE | NOTIFY_MANAGER | SEND_REMINDER
  return (
    <div className="flex gap-2">
      <input placeholder="Title" value={action.config.title ?? ''} onChange={(e) => set('title', e.target.value)} className="input text-sm flex-1" />
      <input placeholder="Message" value={action.config.message ?? ''} onChange={(e) => set('message', e.target.value)} className="input text-sm flex-1" />
    </div>
  );
}

function NewRuleModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const create = useCreateAutomationRule();
  const { data: employeesData } = useUsers({ role: 'EMPLOYEE' });
  const employees = employeesData?.data ?? [];

  const [name, setName] = useState('');
  const [triggerType, setTriggerType] = useState('LEAD_CREATED');
  const [delayMinutes, setDelayMinutes] = useState('');
  const [conditions, setConditions] = useState<AutomationCondition[]>([]);
  const [actions, setActions] = useState<AutomationAction[]>([{ type: 'NOTIFY_EMPLOYEE', config: {} }]);

  const reset = () => {
    setName(''); setTriggerType('LEAD_CREATED'); setDelayMinutes('');
    setConditions([]); setActions([{ type: 'NOTIFY_EMPLOYEE', config: {} }]);
  };

  const submit = () => {
    create.mutate(
      { name, triggerType, conditions, actions, delayMinutes: delayMinutes ? Number(delayMinutes) : null },
      { onSuccess: () => { reset(); onClose(); } }
    );
  };

  return (
    <Modal
      open={open} onClose={onClose} title="New Automation Rule" size="xl"
      footer={<>
        <button onClick={onClose} className="btn-secondary">Cancel</button>
        <button onClick={submit} disabled={create.isPending || !name.trim() || actions.length === 0} className="btn-primary">
          {create.isPending ? 'Saving…' : 'Save Rule'}
        </button>
      </>}
    >
      <div className="space-y-4">
        <div>
          <label className="label">Rule Name *</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Escalate uncontacted WhatsApp leads" className="input" />
        </div>

        <div>
          <label className="label">Trigger *</label>
          <select value={triggerType} onChange={(e) => setTriggerType(e.target.value)} className="input">
            {TRIGGERS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="label mb-0">Conditions (optional — runs for all events if empty)</label>
            <button onClick={() => setConditions((c) => [...c, { field: '', operator: 'equals', value: '' }])} className="text-xs text-primary-600 hover:text-primary-700 flex items-center gap-1">
              <Plus className="w-3 h-3" />Add Condition
            </button>
          </div>
          <div className="space-y-2">
            {conditions.map((cond, i) => (
              <div key={i} className="flex items-center gap-2">
                <input placeholder="field, e.g. source" value={cond.field} onChange={(e) => setConditions((cs) => cs.map((c, j) => j === i ? { ...c, field: e.target.value } : c))} className="input text-sm flex-1" />
                <select value={cond.operator} onChange={(e) => setConditions((cs) => cs.map((c, j) => j === i ? { ...c, operator: e.target.value as AutomationConditionOperator } : c))} className="input text-sm w-36">
                  {OPERATORS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <input placeholder="value" value={cond.value} onChange={(e) => setConditions((cs) => cs.map((c, j) => j === i ? { ...c, value: e.target.value } : c))} className="input text-sm flex-1" />
                <button onClick={() => setConditions((cs) => cs.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-500 flex-shrink-0"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="label mb-0">Actions *</label>
            <button onClick={() => setActions((a) => [...a, { type: 'NOTIFY_EMPLOYEE', config: {} }])} className="text-xs text-primary-600 hover:text-primary-700 flex items-center gap-1">
              <Plus className="w-3 h-3" />Add Action
            </button>
          </div>
          <div className="space-y-2">
            {actions.map((action, i) => (
              <div key={i} className="flex items-start gap-2">
                <select
                  value={action.type}
                  onChange={(e) => setActions((as) => as.map((a, j) => j === i ? { type: e.target.value as AutomationActionType, config: {} } : a))}
                  className="input text-sm w-48 flex-shrink-0"
                >
                  {ACTION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                <div className="flex-1">
                  <ActionConfigFields action={action} employees={employees} onChange={(config) => setActions((as) => as.map((a, j) => j === i ? { ...a, config } : a))} />
                </div>
                {actions.length > 1 && (
                  <button onClick={() => setActions((as) => as.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-500 flex-shrink-0 mt-2"><Trash2 className="w-4 h-4" /></button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div>
          <label className="label">Delay Before Actions (minutes, optional)</label>
          <input type="number" min={0} value={delayMinutes} onChange={(e) => setDelayMinutes(e.target.value)} placeholder="e.g. 1440 for 24 hours" className="input w-48" />
          <p className="text-xs text-slate-400 mt-1">Leave empty to run actions immediately when the trigger fires.</p>
        </div>
      </div>
    </Modal>
  );
}

export default function AutomationBuilderPage() {
  const { data, isLoading } = useAutomationRules();
  const update = useUpdateAutomationRule();
  const deleteRule = useDeleteAutomationRule();
  const rules = data?.data ?? [];
  const [newOpen, setNewOpen] = useState(false);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="page-title">Automation Builder</h2>
          <p className="text-sm text-slate-500 mt-0.5">Configure Trigger → Condition → Action automation without writing code</p>
        </div>
        <button onClick={() => setNewOpen(true)} className="btn-primary text-sm"><Plus className="w-4 h-4" />New Rule</button>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : rules.length === 0 ? (
        <div className="empty-state">
          <Zap className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-400">No automation rules yet — create one to get started</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {rules.map((r) => (
            <div key={r.id} className="card p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-800 text-sm truncate">{r.name}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {TRIGGERS.find((t) => t.value === r.triggerType)?.label ?? r.triggerType}
                    {r.delayMinutes ? ` · waits ${r.delayMinutes}m` : ''}
                  </p>
                </div>
                <span className={cn('badge flex-shrink-0', r.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500')}>
                  {r.isActive ? 'Active' : 'Paused'}
                </span>
              </div>

              <div className="flex flex-wrap gap-1">
                {r.actions.map((a, i) => (
                  <span key={i} className="badge bg-primary-50 text-primary-700 text-[10px]">
                    {ACTION_TYPES.find((t) => t.value === a.type)?.label ?? a.type}
                  </span>
                ))}
              </div>

              <p className="text-[11px] text-slate-400">
                {r.conditions.length > 0 ? `${r.conditions.length} condition(s)` : 'No conditions — runs for every event'} · Created by {r.createdBy.name} · {formatDate(r.createdAt)}
              </p>

              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={() => update.mutate({ id: r.id, isActive: !r.isActive })}
                  className="text-xs font-medium text-slate-600 hover:text-slate-800 flex items-center gap-1"
                >
                  {r.isActive ? <><Pause className="w-3 h-3" />Pause</> : <><Play className="w-3 h-3" />Activate</>}
                </button>
                {r.delayMinutes ? <span className="text-xs text-slate-400 flex items-center gap-1"><Clock className="w-3 h-3" />Delayed</span> : null}
                <button onClick={() => deleteRule.mutate(r.id)} className="text-xs font-medium text-red-500 hover:text-red-600 flex items-center gap-1 ml-auto">
                  <Trash2 className="w-3 h-3" />Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <NewRuleModal open={newOpen} onClose={() => setNewOpen(false)} />
    </div>
  );
}
