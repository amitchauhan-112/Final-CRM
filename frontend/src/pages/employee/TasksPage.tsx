import { useState } from 'react';
import {
  CheckSquare, Clock, AlertCircle, CheckCircle2, Calendar, User, MapPin,
  RefreshCw, ChevronDown, Filter,
} from 'lucide-react';
import { useMyTasks, useUpdateTask } from '../../hooks/useTasks';
import { BookingTask, TaskStatus } from '../../types/index';
import { cn, formatDate, formatRelativeTime } from '../../utils/helpers';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  PENDING: { label: 'Pending', color: 'text-amber-700', bg: 'bg-amber-100' },
  IN_PROGRESS: { label: 'In Progress', color: 'text-primary-700', bg: 'bg-primary-100' },
  DONE: { label: 'Done', color: 'text-emerald-700', bg: 'bg-emerald-100' },
  SKIPPED: { label: 'Skipped', color: 'text-slate-500', bg: 'bg-slate-100' },
};

const PRIORITY_COLORS: Record<string, string> = {
  HIGH: 'text-red-600 bg-red-50 border-red-200',
  MEDIUM: 'text-amber-600 bg-amber-50 border-amber-200',
  LOW: 'text-slate-500 bg-slate-50 border-slate-200',
};

const DEPT_COLORS: Record<string, string> = {
  SALES: 'bg-primary-100 text-primary-700',
  OPERATIONS: 'bg-purple-100 text-purple-700',
  CUSTOMER_CARE: 'bg-emerald-100 text-emerald-700',
  ALL: 'bg-slate-100 text-slate-600',
};

// ─── Task Card ────────────────────────────────────────────────────────────────

function TaskCard({ task, onStatusChange }: { task: BookingTask; onStatusChange: (id: string, status: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = STATUS_CONFIG[task.status] ?? STATUS_CONFIG.PENDING;
  const isDone = task.status === 'DONE';
  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && !isDone;

  return (
    <div className={cn(
      'card p-4 transition-all',
      isDone && 'opacity-60',
      isOverdue && 'border-red-200 bg-red-50/40'
    )}>
      <div className="flex items-start gap-3">
        {/* Quick complete checkbox */}
        <button
          onClick={() => onStatusChange(task.id, isDone ? 'PENDING' : 'DONE')}
          className={cn(
            'w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors',
            isDone ? 'border-emerald-500 bg-emerald-500' : 'border-slate-300 hover:border-primary-400'
          )}
        >
          {isDone && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className={cn('text-sm font-semibold text-slate-800', isDone && 'line-through text-slate-400')}>
                {task.title}
              </p>
              {/* Lead / booking info */}
              {task.booking?.lead && (
                <div className="flex items-center gap-1.5 mt-0.5">
                  <User className="w-3 h-3 text-slate-400 flex-shrink-0" />
                  <span className="text-xs text-slate-500 truncate">{task.booking.lead.name}</span>
                  {task.booking.lead.destination && (
                    <>
                      <MapPin className="w-3 h-3 text-slate-300 flex-shrink-0" />
                      <span className="text-xs text-slate-400 truncate">{task.booking.lead.destination}</span>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Status badge + quick actions */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <select
                value={task.status}
                onChange={(e) => onStatusChange(task.id, e.target.value)}
                className={cn('text-[10px] font-bold px-2 py-1 rounded-lg border-0 cursor-pointer outline-none', cfg.bg, cfg.color)}
              >
                <option value="PENDING">Pending</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="DONE">Done</option>
                <option value="SKIPPED">Skipped</option>
              </select>
            </div>
          </div>

          {/* Meta */}
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {task.dueDate && (
              <span className={cn(
                'flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full',
                isOverdue ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'
              )}>
                <Clock className="w-3 h-3" />
                {isOverdue ? 'Overdue: ' : ''}{formatDate(task.dueDate)}
              </span>
            )}
            <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium', DEPT_COLORS[task.department])}>
              {task.department}
            </span>
            <span className={cn('text-[10px] px-2 py-0.5 rounded-full border font-medium', PRIORITY_COLORS[task.priority])}>
              {task.priority}
            </span>
          </div>

          {/* Description expand */}
          {task.description && (
            <>
              {expanded && (
                <p className="text-xs text-slate-500 mt-2 leading-relaxed">{task.description}</p>
              )}
              <button
                onClick={() => setExpanded((v) => !v)}
                className="flex items-center gap-0.5 text-[10px] text-slate-400 hover:text-slate-600 mt-1.5"
              >
                <ChevronDown className={cn('w-3 h-3 transition-transform', expanded && 'rotate-180')} />
                {expanded ? 'Less' : 'Details'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type TabKey = 'overdue' | 'today' | 'upcoming' | 'completed';

const TAB_CONFIG: { key: TabKey; label: string; icon: React.ElementType; emptyMsg: string }[] = [
  { key: 'overdue', label: 'Overdue', icon: AlertCircle, emptyMsg: 'No overdue tasks' },
  { key: 'today', label: "Today", icon: Calendar, emptyMsg: 'No tasks due today' },
  { key: 'upcoming', label: 'Upcoming', icon: Clock, emptyMsg: 'No upcoming tasks' },
  { key: 'completed', label: 'Done', icon: CheckSquare, emptyMsg: 'No completed tasks' },
];

export default function TasksPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('today');
  const [filterDept, setFilterDept] = useState('');

  const { data, isLoading, refetch } = useMyTasks({ department: filterDept || undefined });
  const updateTask = useUpdateTask();

  const taskData = data?.data ?? { overdue: [], today: [], upcoming: [], completed: [], all: [] };

  const tabCounts: Record<TabKey, number> = {
    overdue: taskData.overdue?.length ?? 0,
    today: taskData.today?.length ?? 0,
    upcoming: taskData.upcoming?.length ?? 0,
    completed: taskData.completed?.length ?? 0,
  };

  const currentTasks: BookingTask[] = taskData[activeTab] ?? [];

  const handleStatusChange = (id: string, status: string) => {
    updateTask.mutate({ id, status: status as TaskStatus });
  };

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="page-title">My Tasks</h2>
          <p className="text-sm text-slate-500 mt-0.5">Booking workflow tasks assigned to you</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <Filter className="w-4 h-4 text-slate-400" />
            <select value={filterDept} onChange={(e) => setFilterDept(e.target.value)} className="input sm:w-40 text-sm">
              <option value="">All Departments</option>
              <option value="SALES">Sales</option>
              <option value="OPERATIONS">Operations</option>
              <option value="CUSTOMER_CARE">Customer Care</option>
            </select>
          </div>
          <button onClick={() => refetch()} className="btn-ghost p-2" title="Refresh">
            <RefreshCw className="w-4 h-4 text-slate-400" />
          </button>
        </div>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {TAB_CONFIG.map((t) => {
          const count = tabCounts[t.key];
          return (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={cn(
                'card px-4 py-3 text-left transition-all',
                activeTab === t.key ? 'ring-2 ring-primary-500 ring-offset-1' : 'hover:border-slate-300'
              )}
            >
              <div className="flex items-center justify-between mb-1">
                <t.icon className={cn('w-4 h-4',
                  t.key === 'overdue' ? 'text-red-500' :
                  t.key === 'today' ? 'text-amber-500' :
                  t.key === 'upcoming' ? 'text-primary-500' : 'text-emerald-500'
                )} />
                <span className={cn('text-xl font-bold',
                  t.key === 'overdue' && count > 0 ? 'text-red-600' :
                  t.key === 'today' ? 'text-amber-700' : 'text-slate-800'
                )}>{count}</span>
              </div>
              <p className="text-xs text-slate-500 font-medium">{t.label}</p>
            </button>
          );
        })}
      </div>

      {/* Tab strip */}
      <div className="flex gap-1 border-b border-slate-200 -mb-2">
        {TAB_CONFIG.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
              activeTab === t.key ? 'border-primary-600 text-primary-700' : 'border-transparent text-slate-500 hover:text-slate-700'
            )}
          >
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
            {tabCounts[t.key] > 0 && (
              <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-full ml-0.5',
                t.key === 'overdue' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'
              )}>{tabCounts[t.key]}</span>
            )}
          </button>
        ))}
      </div>

      {/* Task list */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card p-4 animate-pulse">
              <div className="h-4 bg-slate-200 rounded w-3/4 mb-2" />
              <div className="h-3 bg-slate-100 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : currentTasks.length === 0 ? (
        <div className="empty-state">
          {(() => { const t = TAB_CONFIG.find((x) => x.key === activeTab)!; return <t.icon className="empty-state-icon" />; })()}
          <p className="empty-state-title">{TAB_CONFIG.find((x) => x.key === activeTab)?.emptyMsg}</p>
          <p className="empty-state-body">
            {activeTab === 'overdue' ? 'All caught up!' :
              activeTab === 'today' ? 'Nothing scheduled for today' :
              activeTab === 'upcoming' ? 'Check back later for upcoming tasks' :
              'Complete some tasks to see them here'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {currentTasks.map((task) => (
            <TaskCard key={task.id} task={task} onStatusChange={handleStatusChange} />
          ))}
        </div>
      )}

    </div>
  );
}
