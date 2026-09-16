import { useState } from 'react';
import { ClipboardList, Trash2, CheckCircle2, Circle } from 'lucide-react';
import { useCreateRequirement, useToggleRequirement, useDeleteRequirement } from '../../hooks/useOperations';
import { DepartureRequirement } from '../../types/index';
import { useAuthStore } from '../../store/authStore';
import { formatRelativeTime } from '../../utils/helpers';
import { cn } from '../../utils/helpers';

// Manual checklist for anything that doesn't fit Trip Captain / Hotel /
// Vehicle — e.g. "permits for restricted area", "special dietary request",
// "extra luggage vehicle". Modeled directly on NotesTab, plus a status toggle.
export default function OthersTab({ departureId, requirements }: { departureId: string; requirements: DepartureRequirement[] }) {
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const { user } = useAuthStore();
  const createRequirement = useCreateRequirement(departureId);
  const toggleRequirement = useToggleRequirement(departureId);
  const deleteRequirement = useDeleteRequirement(departureId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    createRequirement.mutate({ title: title.trim(), notes: notes.trim() || undefined }, {
      onSuccess: () => { setTitle(''); setNotes(''); },
    });
  };

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="space-y-2">
        <div className="flex items-start gap-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Permits for restricted area, extra luggage vehicle…"
            className="input flex-1"
          />
          <button type="submit" disabled={createRequirement.isPending || !title.trim()} className="btn-primary">
            {createRequirement.isPending ? 'Adding…' : 'Add'}
          </button>
        </div>
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes (optional)"
          className="input text-sm"
        />
      </form>

      {requirements.length === 0 ? (
        <div className="empty-state">
          <ClipboardList className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-400">No other requirements added</p>
        </div>
      ) : (
        <div className="space-y-2">
          {requirements.map((r) => (
            <div key={r.id} className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 bg-white">
              <button
                onClick={() => toggleRequirement.mutate(r.id)}
                className="flex-shrink-0 mt-0.5 text-slate-300 hover:text-emerald-500 transition-colors"
                title={r.status === 'DONE' ? 'Mark as pending' : 'Mark as done'}
              >
                {r.status === 'DONE' ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> : <Circle className="w-5 h-5" />}
              </button>
              <div className="flex-1 min-w-0">
                <p className={cn('text-sm text-slate-700', r.status === 'DONE' && 'line-through text-slate-400')}>{r.title}</p>
                {r.notes && <p className="text-xs text-slate-500 mt-0.5">{r.notes}</p>}
                <p className="text-xs text-slate-400 mt-1">{r.createdBy.name} · {formatRelativeTime(r.createdAt)}</p>
              </div>
              {(user?.role === 'ADMIN' || user?.id === r.createdById) && (
                <button onClick={() => deleteRequirement.mutate(r.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 flex-shrink-0">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
