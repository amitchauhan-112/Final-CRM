import { Phone, Mail, Calendar, AlertCircle, User, Megaphone, MessageCircle } from 'lucide-react';
import { Lead } from '../../types/index';
import Badge from '../ui/Badge';
import Avatar from '../ui/Avatar';
import { formatDate, formatRelativeTime, isOverdue, cn, buildWhatsAppLink } from '../../utils/helpers';

interface LeadCardProps {
  lead: Lead;
  onClick?: (lead: Lead) => void;
}

export default function LeadCard({ lead, onClick }: LeadCardProps) {
  const overdue = isOverdue(lead.followUpDate) && !lead.followUpDone;
  const whatsappLink = buildWhatsAppLink(lead.phone, `Hi ${lead.name}, this is regarding your ${lead.destination || 'trip'} enquiry with FOD Holidays.`);

  return (
    <div
      onClick={() => onClick?.(lead)}
      className={cn(
        'card p-4 hover:shadow-md transition-all cursor-pointer',
        overdue && 'border-red-200 bg-red-50/30',
        !lead.isRead && 'border-l-4 border-l-primary-500'
      )}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <Avatar name={lead.name} size="md" />
          <div className="min-w-0">
            <p className="font-semibold text-slate-900 truncate">{lead.name}</p>
            <div className="flex items-center gap-1 text-slate-500 text-xs mt-0.5">
              <Phone className="w-3 h-3" />
              <span>{lead.phone}</span>
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          <div className="flex items-center gap-1.5">
            {whatsappLink && (
              <a
                href={whatsappLink}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                title="Chat on WhatsApp"
                className="p-1 rounded-lg text-green-600 hover:bg-green-50 transition-colors"
              >
                <MessageCircle className="w-4 h-4" />
              </a>
            )}
            <Badge status={lead.status} />
          </div>
          <Badge source={lead.source} />
        </div>
      </div>

      {lead.email && (
        <div className="flex items-center gap-1.5 text-slate-500 text-xs mb-2">
          <Mail className="w-3 h-3" />
          <span className="truncate">{lead.email}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 mt-2">
        {lead.destination && (
          <span className="flex items-center gap-1">
            <span>🏔</span>
            <span>{lead.destination}</span>
          </span>
        )}
        {lead.campaign && (
          <span className="flex items-center gap-1">
            <Megaphone className="w-3 h-3" />
            <span className="truncate max-w-[120px]">{lead.campaign.name}</span>
          </span>
        )}
        {lead.assignedTo && (
          <span className="flex items-center gap-1">
            <User className="w-3 h-3" />
            <span>{lead.assignedTo.name}</span>
          </span>
        )}
      </div>

      <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
        <span className="text-xs text-slate-400">{formatRelativeTime(lead.createdAt)}</span>

        {lead.followUpDate && (
          <div
            className={cn(
              'flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full',
              overdue
                ? 'bg-red-100 text-red-700'
                : 'bg-orange-50 text-orange-700'
            )}
          >
            {overdue && <AlertCircle className="w-3 h-3" />}
            <Calendar className="w-3 h-3" />
            <span>
              {overdue ? 'Overdue: ' : 'Follow-up: '}
              {formatDate(lead.followUpDate)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
