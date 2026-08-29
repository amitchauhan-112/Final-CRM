import { LucideIcon, TrendingDown, TrendingUp } from 'lucide-react';
import { cn } from '../../utils/helpers';

interface StatsCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  iconBg?: string;
  iconColor?: string;
  trend?: number;
  trendLabel?: string;
  className?: string;
  onClick?: () => void;
}

export default function StatsCard({
  label,
  value,
  icon: Icon,
  iconBg = 'bg-primary-100',
  iconColor = 'text-primary-600',
  trend,
  trendLabel,
  className,
  onClick,
}: StatsCardProps) {
  const isPositive = trend !== undefined && trend >= 0;

  return (
    <div
      className={cn(
        'card p-5 flex flex-col gap-4 ring-card',
        onClick && 'group cursor-pointer hover:shadow-elevate-lg hover:-translate-y-1 hover:scale-[1.02] hover:border-primary-100 transition-all duration-200 ease-enterprise',
        className
      )}
      onClick={onClick}
    >
      {/* Top row: icon + trend */}
      <div className="flex items-start justify-between">
        <div className={cn(
          'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform duration-200 ease-enterprise',
          onClick && 'group-hover:scale-110',
          iconBg
        )}>
          <Icon className={cn('w-5 h-5', iconColor)} />
        </div>
        {trend !== undefined && (
          <div
            className={cn(
              'flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full',
              isPositive ? 'text-emerald-700 bg-emerald-50' : 'text-red-600 bg-red-50'
            )}
          >
            {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {Math.abs(trend)}%
          </div>
        )}
      </div>

      {/* Value + label */}
      <div>
        <p className="text-3xl font-bold text-slate-900 tracking-tight tabular">
          {value}
        </p>
        <p className="text-sm text-slate-500 mt-1">{label}</p>
        {trendLabel && (
          <p className="text-xs text-slate-400 mt-0.5">{trendLabel}</p>
        )}
      </div>
    </div>
  );
}
