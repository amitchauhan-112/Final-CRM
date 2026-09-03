import { useNavigate } from 'react-router-dom';
import { Clock, Phone, X, ArrowRight } from 'lucide-react';
import { useFollowUpNotifications } from '../../hooks/useFollowUpNotifications';
import { useAuthStore } from '../../store/authStore';
import { cn } from '../../utils/helpers';

// Rendered once in each dashboard layout (Admin/Employee) — pops a real modal
// over the whole app the moment a follow-up comes due, instead of relying on
// a toast that auto-dismisses or a bell icon nobody's watching. Queues up if
// several come due close together; one is shown at a time.
export default function FollowUpPopup() {
  const { current, remaining, dismissCurrent } = useFollowUpNotifications();
  const { user } = useAuthStore();
  const navigate = useNavigate();

  if (!current) return null;

  const { lead, timeLabel } = current;
  const isOverdue = timeLabel === 'overdue';
  const basePath = user?.role === 'ADMIN' ? '/admin' : '/employee';

  const handleView = () => {
    navigate(`${basePath}/leads?id=${lead.id}`);
    dismissCurrent();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm">
      <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl ring-card p-6 animate-fade-in-up">
        <button
          onClick={dismissCurrent}
          className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-start gap-3 mb-4 pr-6">
          <div className={cn(
            'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0',
            isOverdue ? 'bg-red-100' : 'bg-orange-100'
          )}>
            <Clock className={cn('w-5 h-5', isOverdue ? 'text-red-600' : 'text-orange-600')} />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-900">Follow-up Reminder</p>
            <p className={cn('text-xs font-medium', isOverdue ? 'text-red-600' : 'text-orange-600')}>
              {isOverdue ? 'Overdue' : 'Due now'}
            </p>
          </div>
        </div>

        <p className="font-semibold text-slate-800">{lead.name}</p>
        <div className="flex items-center gap-1.5 text-sm text-slate-500 mt-1">
          <Phone className="w-3.5 h-3.5 text-slate-400" />
          {lead.phone}
        </div>
        {lead.followUpNotes && (
          <p className="text-sm text-slate-600 italic mt-2 bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
            "{lead.followUpNotes}"
          </p>
        )}

        {remaining > 0 && (
          <p className="text-xs text-slate-400 mt-3">+{remaining} more follow-up{remaining !== 1 ? 's' : ''} waiting</p>
        )}

        <div className="flex gap-3 mt-5">
          <button onClick={dismissCurrent} className="btn-secondary flex-1">Dismiss</button>
          <button onClick={handleView} className="btn-primary flex-1 gap-1.5">
            View Lead <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
