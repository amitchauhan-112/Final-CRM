import { useState } from 'react';
import { TrendingUp, Link2, Info } from 'lucide-react';
import { useCampaignMonitoring } from '../../hooks/useAnalytics';
import { Skeleton } from '../../components/ui/Skeleton';
import DateRangeFilter from '../../components/ui/DateRangeFilter';
import { MONITORING_PRESETS, MonitoringPreset, monitoringRange, rangeForDays } from '../../utils/dateRange';
import { formatCurrency, cn } from '../../utils/helpers';

export default function CampaignMonitoringPage() {
  const [preset, setPreset] = useState<MonitoringPreset>('7d');
  const [customRange, setCustomRange] = useState(rangeForDays(7));
  const range = monitoringRange(preset, customRange);

  const { data, isLoading } = useCampaignMonitoring(range);
  const rows = data?.data ?? [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-primary-500" />
          Campaign Monitoring
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Every campaign — active and ended — for the selected period, with real Meta spend where available. "No Campaign" is the organic/manual baseline for comparison.
        </p>
      </div>

      <div className="card p-3">
        <DateRangeFilter
          preset={preset}
          onPresetChange={setPreset}
          customRange={customRange}
          onCustomRangeChange={setCustomRange}
          presets={MONITORING_PRESETS}
        />
      </div>

      {isLoading ? (
        <div className="card p-5 space-y-3">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="card py-16 text-center">
          <TrendingUp className="w-10 h-10 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-400 text-sm">No campaign activity in this period</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="text-left">Campaign</th>
                  <th className="text-right">Leads</th>
                  <th className="text-right">Bookings</th>
                  <th className="text-right">Travelers</th>
                  <th className="text-right">Conv. % (Leads)</th>
                  <th className="text-right">Conv. % (People)</th>
                  <th className="text-right">Revenue</th>
                  <th className="text-right">Spend</th>
                  <th className="text-right">CPL</th>
                  <th className="text-right">Cost/Booking</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => {
                  const rate = c.conversionRatePct;
                  const rateColor = rate >= 20 ? 'text-emerald-600' : rate >= 10 ? 'text-amber-600' : 'text-slate-500';
                  const peopleRate = c.travelerConversionRatePct;
                  const peopleRateColor = peopleRate >= 20 ? 'text-emerald-600' : peopleRate >= 10 ? 'text-amber-600' : 'text-slate-500';
                  const isBaseline = c.id === 'no-campaign';
                  return (
                    <tr key={c.id} className={cn(isBaseline && 'bg-slate-50')}>
                      <td>
                        <div className="flex items-center gap-2">
                          <span className={cn('text-sm', isBaseline ? 'text-slate-500 italic' : 'font-medium text-slate-800')}>{c.name}</span>
                          {c.isFromMeta && (
                            <span className="inline-flex items-center gap-1 bg-primary-50 text-primary-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full tracking-wide">
                              <Link2 className="w-2.5 h-2.5" />META
                            </span>
                          )}
                          {c.isFromMeta && !c.hasSpendData && (
                            <span title="No Meta spend data yet for this period — synced twice daily">
                              <Info className="w-3.5 h-3.5 text-slate-300" />
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="text-right font-semibold text-slate-700">{c.leadsGenerated}</td>
                      <td className="text-right text-slate-600">{c.bookings}</td>
                      <td className="text-right text-slate-600">{c.totalTravelers}</td>
                      <td className={cn('text-right font-semibold', rateColor)}>{c.conversionRatePct}%</td>
                      <td className={cn('text-right font-semibold', peopleRateColor)}>{c.travelerConversionRatePct}%</td>
                      <td className="text-right text-slate-600">{formatCurrency(c.revenue)}</td>
                      <td className="text-right text-slate-600">{c.spend != null ? formatCurrency(c.spend) : '—'}</td>
                      <td className="text-right text-slate-600">{c.costPerLead != null ? formatCurrency(c.costPerLead) : '—'}</td>
                      <td className="text-right text-slate-600">{c.costPerBooking != null ? formatCurrency(c.costPerBooking) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
