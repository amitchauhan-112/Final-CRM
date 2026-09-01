import { useState } from 'react';
import { Calendar, AlertCircle } from 'lucide-react';
import { Lead, LeadStatus } from '../../types/index';
import { formatDate, isOverdue, cn } from '../../utils/helpers';
import Avatar from '../ui/Avatar';
import Badge from '../ui/Badge';
import PriorityBadge from '../ui/PriorityBadge';
import TagChip from '../ui/TagChip';

const COLUMNS: {
  status: LeadStatus;
  label: string;
  color: string;
  bg: string;
  headerBg: string;
  dot: string;
}[] = [
  { status: 'NEW',                 label: 'New',             color: 'text-sky-700',    bg: 'bg-sky-50',     headerBg: 'bg-sky-100 border-sky-200',     dot: 'bg-sky-500' },
  { status: 'CONTACTED',           label: 'Contacted',       color: 'text-yellow-700', bg: 'bg-yellow-50',  headerBg: 'bg-yellow-100 border-yellow-200',dot: 'bg-yellow-500' },
  { status: 'INTERESTED',          label: 'Interested',      color: 'text-violet-700', bg: 'bg-violet-50',  headerBg: 'bg-violet-100 border-violet-200',dot: 'bg-violet-500' },
  { status: 'FOLLOW_UP_SCHEDULED', label: 'Follow-up',       color: 'text-orange-700', bg: 'bg-orange-50',  headerBg: 'bg-orange-100 border-orange-200',dot: 'bg-orange-500' },
  { status: 'CONFIRMED',           label: 'Confirmed',       color: 'text-emerald-700',bg: 'bg-emerald-50', headerBg: 'bg-emerald-100 border-emerald-200',dot: 'bg-emerald-500' },
  { status: 'LOST',                label: 'Lost',            color: 'text-red-700',    bg: 'bg-red-50',     headerBg: 'bg-red-100 border-red-200',     dot: 'bg-red-500' },
];

interface KanbanBoardProps {
  leads: Lead[];
  onOpenDetail: (leadId: string) => void;
  onStatusChange: (leadId: string, status: LeadStatus) => void;
}

function KanbanCard({
  lead,
  onOpenDetail,
  onDragStart,
  onDragEnd,
  isDragging,
}: {
  lead: Lead;
  onOpenDetail: (id: string) => void;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragEnd: () => void;
  isDragging: boolean;
}) {
  const tags = (lead as any).tags ?? [];
  const todayStr = new Date().toISOString().slice(0, 10);
  const hasOverdueFollowup = lead.followUpDate && !lead.followUpDone && isOverdue(lead.followUpDate);
  const hasTodayFollowup =
    lead.followUpDate && !lead.followUpDone && !hasOverdueFollowup &&
    lead.followUpDate.startsWith(todayStr);
  // Confirmed leads are permanently locked — never draggable to another column.
  const isLocked = lead.status === 'CONFIRMED';

  return (
    <div
      draggable={!isLocked}
      onDragStart={(e) => onDragStart(e, lead.id)}
      onDragEnd={onDragEnd}
      onClick={() => onOpenDetail(lead.id)}
      title={isLocked ? 'A confirmed lead\'s status can never be changed again' : undefined}
      className={cn(
        'bg-white rounded-xl border border-slate-200 p-3.5 shadow-sm hover:shadow-md cursor-pointer transition-all select-none',
        isDragging && 'opacity-40 scale-95'
      )}
    >
      {/* Header row */}
      <div className="flex items-start gap-2.5 mb-2.5">
        <Avatar name={lead.name} size="xs" className="flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800 leading-tight truncate">{lead.name}</p>
          <p className="text-xs text-slate-400 truncate">{lead.phone}</p>
        </div>
        <PriorityBadge priority={lead.priority ?? 'MEDIUM'} />
      </div>

      {/* Campaign */}
      {lead.campaign && (
        <p className="text-xs text-slate-500 truncate mb-1.5">
          <span className="text-slate-400">via </span>{lead.campaign.name}
        </p>
      )}

      {/* Destination */}
      {lead.destination && (
        <p className="text-xs text-slate-500 truncate mb-1.5">🏔 {lead.destination}</p>
      )}

      {/* Follow-up indicator */}
      {lead.followUpDate && !lead.followUpDone && (
        <div
          className={cn(
            'flex items-center gap-1 text-xs font-medium mb-2',
            hasOverdueFollowup ? 'text-red-600' : hasTodayFollowup ? 'text-orange-600' : 'text-blue-600'
          )}
        >
          {hasOverdueFollowup ? (
            <AlertCircle className="w-3 h-3 flex-shrink-0" />
          ) : (
            <Calendar className="w-3 h-3 flex-shrink-0" />
          )}
          <span>
            {hasOverdueFollowup ? 'Overdue: ' : ''}{formatDate(lead.followUpDate)}
          </span>
        </div>
      )}

      {/* Tags */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {tags.slice(0, 2).map((lt: any) => (
            <TagChip key={lt.tag?.id ?? lt.id} tag={lt.tag ?? lt} />
          ))}
          {tags.length > 2 && (
            <span className="text-xs text-slate-400">+{tags.length - 2}</span>
          )}
        </div>
      )}

      {/* Footer: source + assignee */}
      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
        <Badge source={lead.source} />
        {lead.assignedTo && (
          <span className="text-xs text-slate-400 truncate">· {lead.assignedTo.name}</span>
        )}
      </div>
    </div>
  );
}

export default function KanbanBoard({ leads, onOpenDetail, onStatusChange }: KanbanBoardProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overColumn, setOverColumn] = useState<LeadStatus | null>(null);

  const byStatus = COLUMNS.reduce<Record<string, Lead[]>>((acc, col) => {
    acc[col.status] = leads.filter((l) => l.status === col.status);
    return acc;
  }, {});

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggingId(id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => {
    setDraggingId(null);
    setOverColumn(null);
  };

  const handleDragOver = (e: React.DragEvent, status: LeadStatus) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (overColumn !== status) setOverColumn(status);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    // Only clear if leaving the column entirely (not entering a child element)
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (
      e.clientX < rect.left || e.clientX > rect.right ||
      e.clientY < rect.top || e.clientY > rect.bottom
    ) {
      setOverColumn(null);
    }
  };

  const handleDrop = (e: React.DragEvent, status: LeadStatus) => {
    e.preventDefault();
    if (!draggingId) return;

    const lead = leads.find((l) => l.id === draggingId);
    if (!lead || lead.status === status || lead.status === 'CONFIRMED') {
      setDraggingId(null);
      setOverColumn(null);
      return;
    }

    if (status === 'CONFIRMED') {
      // Open lead detail for the full booking confirmation flow
      onOpenDetail(draggingId);
    } else {
      onStatusChange(draggingId, status);
    }

    setDraggingId(null);
    setOverColumn(null);
  };

  return (
    <div className="flex gap-3 overflow-x-auto pb-4" style={{ minHeight: 520 }}>
      {COLUMNS.map((col) => {
        const colLeads = byStatus[col.status] ?? [];
        const isOver = overColumn === col.status;

        return (
          <div
            key={col.status}
            className="flex-shrink-0 w-[255px] flex flex-col"
            onDragOver={(e) => handleDragOver(e, col.status)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, col.status)}
          >
            {/* Column header */}
            <div className={cn('flex items-center justify-between px-3 py-2 rounded-xl border mb-2.5', col.headerBg)}>
              <div className="flex items-center gap-2">
                <span className={cn('w-2 h-2 rounded-full', col.dot)} />
                <span className={cn('text-xs font-bold uppercase tracking-wider', col.color)}>
                  {col.label}
                </span>
              </div>
              <span className={cn(
                'text-xs font-bold min-w-[20px] text-center px-1.5 py-0.5 rounded-full',
                col.bg, col.color
              )}>
                {colLeads.length}
              </span>
            </div>

            {/* Drop zone */}
            <div
              className={cn(
                'flex-1 space-y-2 rounded-xl p-1.5 transition-colors',
                isOver ? cn('ring-2', col.color.replace('text-', 'ring-'), col.bg) : 'ring-2 ring-transparent'
              )}
            >
              {colLeads.map((lead) => (
                <KanbanCard
                  key={lead.id}
                  lead={lead}
                  onOpenDetail={onOpenDetail}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  isDragging={draggingId === lead.id}
                />
              ))}

              {colLeads.length === 0 && (
                <div
                  className={cn(
                    'h-24 rounded-xl border-2 border-dashed flex items-center justify-center transition-colors',
                    isOver ? cn('border-opacity-60', col.color.replace('text-', 'border-'), col.bg) : 'border-slate-200'
                  )}
                >
                  <span className="text-xs text-slate-400">
                    {isOver ? 'Release to move' : 'Drop here'}
                  </span>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
