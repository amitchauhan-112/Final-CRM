import { Calendar, Target, Users, Edit, Trash2, MapPin, Link2, TrendingUp, DollarSign } from 'lucide-react';
import { Campaign } from '../../types/index';
import Badge from '../ui/Badge';
import Avatar from '../ui/Avatar';
import { formatDate, formatCurrency, cn, campaignStatusConfig } from '../../utils/helpers';

interface CampaignCardProps {
  campaign: Campaign;
  onEdit?: (campaign: Campaign) => void;
  onDelete?: (campaign: Campaign) => void;
  onView?: (campaign: Campaign) => void;
}

const BANNER_GRADIENT: Record<string, string> = {
  ACTIVE:   'from-primary-500 to-primary-700',
  PAUSED:   'from-amber-400 to-amber-600',
  COMPLETED:'from-emerald-500 to-emerald-700',
  ENDED:    'from-purple-500 to-purple-700',
  DRAFT:    'from-slate-400 to-slate-600',
};

export default function CampaignCard({ campaign, onEdit, onDelete, onView }: CampaignCardProps) {
  const leadCount = campaign._count?.leads ?? 0;
  const target = campaign.targetLeads ?? 0;
  const progress = target > 0 ? Math.min((leadCount / target) * 100, 100) : 0;
  const confirmed = (campaign as any)._count?.confirmedLeads ?? 0;
  const conversion = leadCount > 0 ? Math.round((confirmed / leadCount) * 100) : 0;

  const gradient = BANNER_GRADIENT[campaign.status] ?? 'from-slate-400 to-slate-600';
  const statusCfg = campaignStatusConfig[campaign.status];

  return (
    <div className="card overflow-hidden hover:shadow-elevate-lg hover:-translate-y-1 hover:scale-[1.01] hover:border-primary-100 transition-all duration-200 ease-enterprise group">

      {/* ── Gradient banner ──────────────────────────────────────────── */}
      <div
        className={cn('relative bg-gradient-to-br px-5 pt-4 pb-10 cursor-pointer', gradient)}
        onClick={() => onView?.(campaign)}
      >
        {/* Action buttons — top right */}
        <div
          className="absolute top-3 right-3 flex items-center gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          {onEdit && (
            <button
              onClick={() => onEdit(campaign)}
              className="p-1.5 rounded-lg bg-white/15 hover:bg-white/30 text-white transition-colors"
              title="Edit"
            >
              <Edit className="w-3.5 h-3.5" />
            </button>
          )}
          {onDelete && (
            <button
              onClick={() => onDelete(campaign)}
              className="p-1.5 rounded-lg bg-white/15 hover:bg-red-500/60 text-white transition-colors"
              title="Delete"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Destination + META badge */}
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          {campaign.destination && (
            <span className="inline-flex items-center gap-1 text-white/90 text-xs font-medium">
              <MapPin className="w-3 h-3" />
              {campaign.destination}
            </span>
          )}
          {campaign.isFromMeta && (
            <span className="inline-flex items-center gap-1 bg-white/20 text-white text-[10px] font-bold px-2 py-0.5 rounded-full tracking-wide">
              <Link2 className="w-2.5 h-2.5" />
              META
            </span>
          )}
        </div>

        {/* Campaign name */}
        <h3 className="text-white font-bold text-base leading-snug pr-14 line-clamp-2">
          {campaign.name}
        </h3>

        {/* Status pill — overlapping below */}
        <div className="absolute -bottom-3.5 left-5">
          <span className={cn(
            'inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold shadow-sm border border-slate-100',
            statusCfg.bg, statusCfg.color
          )}>
            {statusCfg.label}
          </span>
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────────────────── */}
      <div className="px-5 pt-7 pb-5">
        {campaign.description && (
          <p className="text-xs text-slate-500 line-clamp-2 mb-4">{campaign.description}</p>
        )}

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <StatPill
            icon={Target}
            label="Leads"
            value={String(leadCount)}
            sub={target > 0 ? `/ ${target}` : undefined}
          />
          <StatPill
            icon={Users}
            label="Confirmed"
            value={String(confirmed)}
          />
          <StatPill
            icon={TrendingUp}
            label="Conversion"
            value={`${conversion}%`}
            valueColor={conversion >= 50 ? 'text-emerald-600' : conversion >= 25 ? 'text-amber-600' : 'text-slate-700'}
          />
        </div>

        {/* Progress bar */}
        {target > 0 && (
          <div className="mb-4">
            <div className="flex justify-between text-xs text-slate-500 mb-1">
              <span>Lead target</span>
              <span className="font-semibold text-slate-700">{Math.round(progress)}%</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-1.5">
              <div
                className={cn(
                  'h-1.5 rounded-full transition-all duration-500',
                  progress >= 80 ? 'bg-emerald-500' : progress >= 50 ? 'bg-primary-500' : 'bg-mountain-500'
                )}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Dates + Budget */}
        <div className="flex items-center justify-between text-xs text-slate-500 mb-4 flex-wrap gap-2">
          {(campaign.startDate || campaign.endDate) && (
            <div className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              <span>
                {formatDate(campaign.startDate)}
                {campaign.endDate && ` → ${formatDate(campaign.endDate)}`}
              </span>
            </div>
          )}
          {campaign.budget && (
            <div className="flex items-center gap-1 font-medium text-slate-700">
              <DollarSign className="w-3 h-3 text-slate-400" />
              {formatCurrency(campaign.budget)}
            </div>
          )}
        </div>

        {/* Employee avatars */}
        {campaign.employees.length > 0 && (
          <div className="flex items-center gap-2 pt-4 border-t border-slate-100">
            <div className="flex -space-x-2">
              {campaign.employees.slice(0, 5).map((ce) => (
                <Avatar key={ce.id} name={ce.user.name} size="xs" className="ring-2 ring-white" />
              ))}
              {campaign.employees.length > 5 && (
                <div className="w-6 h-6 rounded-full bg-slate-200 text-slate-600 text-[10px] flex items-center justify-center ring-2 ring-white font-semibold">
                  +{campaign.employees.length - 5}
                </div>
              )}
            </div>
            <span className="text-xs text-slate-400">
              {campaign.employees.length} employee{campaign.employees.length !== 1 ? 's' : ''}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function StatPill({
  icon: Icon,
  label,
  value,
  sub,
  valueColor = 'text-slate-800',
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  valueColor?: string;
}) {
  return (
    <div className="bg-slate-50 rounded-xl p-2.5 text-center border border-slate-100">
      <Icon className="w-3.5 h-3.5 text-slate-400 mx-auto mb-1" />
      <p className={cn('text-sm font-bold tabular leading-none', valueColor)}>
        {value}
        {sub && <span className="text-xs font-normal text-slate-400 ml-0.5">{sub}</span>}
      </p>
      <p className="text-[10px] text-slate-400 mt-0.5">{label}</p>
    </div>
  );
}
