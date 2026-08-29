import { useState } from 'react';
import { Bug, Lightbulb, MessageCircle, CheckCircle2, Clock, AlertCircle, Archive, Trash2, ChevronDown, Filter } from 'lucide-react';
import { useFeedbacks, useFeedbackStats, useUpdateFeedback, useDeleteFeedback } from '../../hooks/useFeedback';
import { Feedback, FeedbackStatus } from '../../types/index';
import { formatRelativeTime, cn } from '../../utils/helpers';
import StatsCard from '../../components/ui/StatsCard';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import Modal from '../../components/ui/Modal';

const typeIcon = { BUG: Bug, SUGGESTION: Lightbulb, OTHER: MessageCircle };
const typeColor = { BUG: 'text-red-600 bg-red-50', SUGGESTION: 'text-amber-600 bg-amber-50', OTHER: 'text-blue-600 bg-blue-50' };
const priorityBadge = {
  LOW: 'bg-slate-100 text-slate-600',
  MEDIUM: 'bg-blue-100 text-blue-700',
  HIGH: 'bg-orange-100 text-orange-700',
  CRITICAL: 'bg-red-100 text-red-700',
};
const statusConfig: Record<FeedbackStatus, { label: string; color: string; icon: React.ComponentType<{ className?: string }> }> = {
  OPEN: { label: 'Open', color: 'bg-yellow-100 text-yellow-700', icon: AlertCircle },
  IN_PROGRESS: { label: 'In Progress', color: 'bg-blue-100 text-blue-700', icon: Clock },
  RESOLVED: { label: 'Resolved', color: 'bg-green-100 text-green-700', icon: CheckCircle2 },
  CLOSED: { label: 'Closed', color: 'bg-slate-100 text-slate-600', icon: Archive },
};

const statusOptions: FeedbackStatus[] = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];

function FeedbackDetailModal({
  item,
  onClose,
}: {
  item: Feedback;
  onClose: () => void;
}) {
  const [adminNotes, setAdminNotes] = useState(item.adminNotes || '');
  const [status, setStatus] = useState<FeedbackStatus>(item.status);
  const update = useUpdateFeedback();

  const handleSave = () => {
    update.mutate({ id: item.id, status, adminNotes }, { onSuccess: onClose });
  };

  const Icon = typeIcon[item.type] ?? MessageCircle;
  const cfg = statusConfig[item.status];

  return (
    <Modal open onClose={onClose} title="Feedback Detail" size="lg">
      <div className="space-y-5">
        {/* Header info */}
        <div className="flex flex-wrap gap-2 items-start">
          <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium', typeColor[item.type])}>
            <Icon className="w-3.5 h-3.5" />
            {item.type}
          </span>
          <span className={cn('px-2.5 py-1 rounded-lg text-xs font-medium', priorityBadge[item.priority])}>
            {item.priority} PRIORITY
          </span>
          <span className={cn('inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium', cfg.color)}>
            <cfg.icon className="w-3 h-3" />
            {cfg.label}
          </span>
        </div>

        <div>
          <h3 className="text-base font-semibold text-slate-900">{item.title}</h3>
          <p className="text-xs text-slate-500 mt-1">
            By <span className="font-medium">{item.submittedBy?.name}</span> ({item.submittedBy?.role?.toLowerCase()}) ·{' '}
            {formatRelativeTime(item.createdAt)}
            {item.page && <> · <span className="font-mono">{item.page}</span></>}
          </p>
        </div>

        <div className="bg-slate-50 rounded-xl p-4">
          <p className="text-sm text-slate-700 whitespace-pre-wrap">{item.description}</p>
        </div>

        {/* Admin controls */}
        <div className="border-t border-slate-200 pt-4 space-y-3">
          <div>
            <label className="label">Update Status</label>
            <div className="relative mt-1">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as FeedbackStatus)}
                className="input appearance-none pr-8"
              >
                {statusOptions.map((s) => (
                  <option key={s} value={s}>{statusConfig[s].label}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>
          </div>

          <div>
            <label className="label">Admin Notes (internal)</label>
            <textarea
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              rows={3}
              placeholder="Add internal notes about this feedback…"
              className="input mt-1 resize-none"
            />
          </div>

          <div className="flex gap-3">
            <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button
              onClick={handleSave}
              disabled={update.isPending}
              className="btn-primary flex-1"
            >
              {update.isPending ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

export default function FeedbackPage() {
  const [page] = useState(1);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Feedback | null>(null);

  const { data, isLoading } = useFeedbacks(page, filters);
  const { data: statsData } = useFeedbackStats();
  const deleteMutation = useDeleteFeedback();

  const stats = statsData?.data;
  const items = data?.data ?? [];

  const handleFilter = (key: string, value: string) => {
    setFilters((prev) => value ? { ...prev, [key]: value } : (() => { const n = { ...prev }; delete n[key]; return n; })());
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Peer Feedback</h1>
        <p className="text-sm text-slate-500 mt-1">Bug reports and suggestions from your team during peer testing</p>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <StatsCard label="Total" value={stats.total} icon={MessageCircle} iconBg="bg-blue-100" iconColor="text-blue-600" onClick={() => setFilters({})} />
          <StatsCard label="Open" value={stats.open} icon={AlertCircle} iconBg="bg-yellow-100" iconColor="text-yellow-600" onClick={() => handleFilter('status', 'OPEN')} />
          <StatsCard label="In Progress" value={stats.inProgress} icon={Clock} iconBg="bg-purple-100" iconColor="text-purple-600" onClick={() => handleFilter('status', 'IN_PROGRESS')} />
          <StatsCard label="Bug Reports" value={stats.bugs} icon={Bug} iconBg="bg-red-100" iconColor="text-red-600" onClick={() => handleFilter('type', 'BUG')} />
          <StatsCard label="Suggestions" value={stats.suggestions} icon={Lightbulb} iconBg="bg-green-100" iconColor="text-green-600" onClick={() => handleFilter('type', 'SUGGESTION')} />
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4">
        <div className="flex flex-wrap gap-3 items-center">
          <Filter className="w-4 h-4 text-slate-400" />

          <select
            className="input w-auto text-sm"
            value={filters.type ?? ''}
            onChange={(e) => handleFilter('type', e.target.value)}
          >
            <option value="">All Types</option>
            <option value="BUG">Bug Reports</option>
            <option value="SUGGESTION">Suggestions</option>
            <option value="OTHER">Other</option>
          </select>

          <select
            className="input w-auto text-sm"
            value={filters.status ?? ''}
            onChange={(e) => handleFilter('status', e.target.value)}
          >
            <option value="">All Statuses</option>
            {statusOptions.map((s) => (
              <option key={s} value={s}>{statusConfig[s].label}</option>
            ))}
          </select>

          <select
            className="input w-auto text-sm"
            value={filters.priority ?? ''}
            onChange={(e) => handleFilter('priority', e.target.value)}
          >
            <option value="">All Priorities</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
        </div>
      </div>

      {/* List */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-12"><LoadingSpinner /></div>
        ) : items.length === 0 ? (
          <div className="text-center py-12">
            <MessageSquarePlusIcon className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 text-sm">No feedback submitted yet</p>
            <p className="text-slate-400 text-xs mt-1">Share the app with peers and their feedback will appear here</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {items.map((item) => {
              const Icon = typeIcon[item.type] ?? MessageCircle;
              const cfg = statusConfig[item.status] ?? statusConfig.OPEN;
              return (
                <div
                  key={item.id}
                  className="flex items-start gap-4 px-6 py-4 hover:bg-slate-50 transition-colors cursor-pointer"
                  onClick={() => setSelected(item)}
                >
                  <div className={cn('p-2 rounded-xl flex-shrink-0', typeColor[item.type])}>
                    <Icon className="w-4 h-4" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-900 truncate">{item.title}</p>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', priorityBadge[item.priority])}>
                          {item.priority}
                        </span>
                        <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', cfg.color)}>
                          <cfg.icon className="w-3 h-3" />
                          {cfg.label}
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{item.description}</p>
                    <div className="flex items-center gap-3 mt-1.5">
                      <span className="text-xs text-slate-400">{item.submittedBy?.name}</span>
                      {item.page && <span className="text-xs text-slate-300 font-mono">{item.page}</span>}
                      <span className="text-xs text-slate-400">{formatRelativeTime(item.createdAt)}</span>
                    </div>
                  </div>

                  <button
                    onClick={(e) => { e.stopPropagation(); if (confirm('Delete this feedback?')) deleteMutation.mutate(item.id); }}
                    className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors flex-shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {selected && <FeedbackDetailModal item={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function MessageSquarePlusIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      <line x1="12" y1="8" x2="12" y2="14" />
      <line x1="9" y1="11" x2="15" y2="11" />
    </svg>
  );
}
