import { useState } from 'react';
import { Settings2, Pencil, RotateCcw } from 'lucide-react';
import { useBusinessRules, useUpdateBusinessRule, BusinessRule } from '../../hooks/useBusinessRules';
import Modal from '../../components/ui/Modal';
import { Skeleton } from '../../components/ui/Skeleton';
import { formatDate, cn } from '../../utils/helpers';

const CATEGORY_BADGE: Record<string, string> = {
  SALES: 'bg-primary-50 text-primary-700',
  OPERATIONS: 'bg-primary-50 text-primary-700',
  FINANCE: 'bg-emerald-50 text-emerald-700',
  CUSTOMER: 'bg-pink-50 text-pink-700',
  SYSTEM: 'bg-slate-100 text-slate-600',
};

function EditRuleModal({ rule, onClose }: { rule: BusinessRule | null; onClose: () => void }) {
  const update = useUpdateBusinessRule();
  const [value, setValue] = useState(rule?.value ?? '');

  if (!rule) return null;
  return (
    <Modal
      open={!!rule} onClose={onClose} title={rule.key} size="sm"
      footer={<>
        <button onClick={onClose} className="btn-secondary">Cancel</button>
        <button
          onClick={() => update.mutate({ key: rule.key, value }, { onSuccess: onClose })}
          disabled={update.isPending || !value.trim()} className="btn-primary"
        >{update.isPending ? 'Saving…' : 'Save'}</button>
      </>}
    >
      <div className="space-y-3">
        <p className="text-sm text-slate-500">{rule.description}</p>
        <div>
          <label className="label">Value</label>
          <input value={value} onChange={(e) => setValue(e.target.value)} className="input" />
          <p className="text-xs text-slate-400 mt-1">Default: {rule.defaultValue}</p>
        </div>
      </div>
    </Modal>
  );
}

export default function BusinessRulesPage() {
  const { data, isLoading } = useBusinessRules();
  const update = useUpdateBusinessRule();
  const rules = data?.data ?? [];
  const [editing, setEditing] = useState<BusinessRule | null>(null);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="page-title">Business Rules</h2>
        <p className="text-sm text-slate-500 mt-0.5">Every threshold that drives automatic reminders and payment schedules — edit without touching code</p>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : (
        <div className="card divide-y divide-slate-100">
          {rules.map((r) => {
            const isCustomized = r.value !== r.defaultValue;
            return (
              <div key={r.key} className="flex items-start justify-between gap-4 px-4 py-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0', CATEGORY_BADGE[r.category] ?? CATEGORY_BADGE.SYSTEM)}>
                    <Settings2 className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800">{r.key}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{r.description}</p>
                    {r.updatedBy && r.updatedAt && (
                      <p className="text-[11px] text-slate-400 mt-1">Last changed by {r.updatedBy.name} · {formatDate(r.updatedAt)}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-sm font-bold text-slate-800 tabular">{r.value}</span>
                  {isCustomized && (
                    <button
                      onClick={() => update.mutate({ key: r.key, value: r.defaultValue })}
                      title={`Reset to default (${r.defaultValue})`}
                      className="text-slate-400 hover:text-slate-600"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button onClick={() => setEditing(r)} className="text-primary-600 hover:text-primary-700">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <EditRuleModal rule={editing} onClose={() => setEditing(null)} />
    </div>
  );
}
