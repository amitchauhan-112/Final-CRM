import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TrendingUp, Link2, Info, ChevronDown, ChevronRight, ArrowUpDown } from 'lucide-react';
import { useCampaignMonitoring } from '../../hooks/useAnalytics';
import { Skeleton } from '../../components/ui/Skeleton';
import DateRangeFilter from '../../components/ui/DateRangeFilter';
import { MONITORING_PRESETS, MonitoringPreset, monitoringRange, rangeForDays } from '../../utils/dateRange';
import { formatCurrency, cn } from '../../utils/helpers';
import { CampaignMonitoringRow } from '../../types/index';

// "Sort by" metric + direction, kept as two separate controls instead of one
// flat list — scales to every number on the table without the dropdown
// turning into a wall of "Highest to Lowest (X)" entries. Date Added is the
// one non-numeric metric (createdAt), direction still applies to it (newest
// vs oldest first).
type SortMetric = 'bookings' | 'leads' | 'travelers' | 'convLeads' | 'convPeople' | 'revenue' | 'spend' | 'cpl' | 'costPerBooking' | 'date';
const SORT_METRICS: { value: SortMetric; label: string }[] = [
  { value: 'bookings', label: 'Bookings' },
  { value: 'leads', label: 'Leads' },
  { value: 'travelers', label: 'Travelers' },
  { value: 'convLeads', label: 'Conv. % (Leads)' },
  { value: 'convPeople', label: 'Conv. % (People)' },
  { value: 'revenue', label: 'Revenue' },
  { value: 'spend', label: 'Spend' },
  { value: 'cpl', label: 'Cost Per Lead' },
  { value: 'costPerBooking', label: 'Cost Per Booking' },
  { value: 'date', label: 'Date Added' },
];

// null = "no data for this metric" (e.g. a non-Meta campaign has no spend/
// CPL) — always sinks to the bottom of the list regardless of sort
// direction, rather than looking like a 0 or sneaking to the top on an
// ascending sort.
function sortValue(c: CampaignMonitoringRow, metric: SortMetric): number | null {
  switch (metric) {
    case 'bookings': return c.bookings;
    case 'leads': return c.leadsGenerated;
    case 'travelers': return c.totalTravelers;
    case 'convLeads': return c.conversionRatePct;
    case 'convPeople': return c.travelerConversionRatePct;
    case 'revenue': return c.revenue;
    case 'spend': return c.spend;
    case 'cpl': return c.costPerLead;
    case 'costPerBooking': return c.costPerBooking;
    case 'date': return c.createdAt ? new Date(c.createdAt).getTime() : null;
  }
}

function StatPill({ value, onClick, tone = 'slate' }: { value: number; onClick?: () => void; tone?: 'slate' | 'primary' }) {
  const toneClass = tone === 'primary' ? 'bg-primary-50 text-primary-700 hover:bg-primary-100' : 'bg-slate-100 text-slate-700 hover:bg-slate-200';
  if (!onClick || value === 0) {
    return <span className="text-sm text-slate-600">{value}</span>;
  }
  return (
    <button
      onClick={onClick}
      className={cn('inline-flex items-center justify-center min-w-[2.25rem] px-2 py-1 rounded-full text-sm font-semibold transition-colors', toneClass)}
    >
      {value}
    </button>
  );
}

function CampaignRow({ c, range, navigate }: { c: CampaignMonitoringRow; range: { from: string; to: string }; navigate: ReturnType<typeof useNavigate> }) {
  const rate = c.conversionRatePct;
  const rateColor = rate >= 20 ? 'text-emerald-600' : rate >= 10 ? 'text-amber-600' : 'text-slate-500';
  const peopleRate = c.travelerConversionRatePct;
  const peopleRateColor = peopleRate >= 20 ? 'text-emerald-600' : peopleRate >= 10 ? 'text-amber-600' : 'text-slate-500';
  const isBaseline = c.id === 'no-campaign';

  const goToLeads = (status?: 'CONFIRMED') => {
    const params = new URLSearchParams({ dateFrom: range.from, dateTo: range.to });
    if (!isBaseline) params.set('campaignId', c.id);
    if (status) params.set('status', status);
    navigate(`/admin/leads?${params.toString()}`);
  };

  return (
    <tr key={c.id} className={cn('transition-colors', isBaseline ? 'bg-slate-50' : 'hover:bg-slate-50/80')}>
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
      <td className="text-right"><StatPill value={c.leadsGenerated} onClick={() => goToLeads()} tone="primary" /></td>
      <td className="text-right"><StatPill value={c.bookings} onClick={() => goToLeads('CONFIRMED')} /></td>
      <td className="text-right text-slate-600">{c.totalTravelers}</td>
      <td className={cn('text-right font-semibold', rateColor)}>{c.conversionRatePct}%</td>
      <td className={cn('text-right font-semibold', peopleRateColor)}>{c.travelerConversionRatePct}%</td>
      <td className="text-right text-slate-600">{formatCurrency(c.revenue)}</td>
      <td className="text-right text-slate-600">{c.spend != null ? formatCurrency(c.spend) : '—'}</td>
      <td className="text-right text-slate-600">{c.costPerLead != null ? formatCurrency(c.costPerLead) : '—'}</td>
      <td className="text-right text-slate-600">{c.costPerBooking != null ? formatCurrency(c.costPerBooking) : '—'}</td>
    </tr>
  );
}

const TABLE_HEAD = (
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
);

export default function CampaignMonitoringPage() {
  const [preset, setPreset] = useState<MonitoringPreset>('7d');
  const [customRange, setCustomRange] = useState(rangeForDays(7));
  const range = monitoringRange(preset, customRange);
  const navigate = useNavigate();

  const [sortMetric, setSortMetric] = useState<SortMetric>('bookings');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');
  const [showNonPerforming, setShowNonPerforming] = useState(false);

  const { data, isLoading } = useCampaignMonitoring(range);
  const rows = data?.data ?? [];

  const { baseline, performing, nonPerforming, totals } = useMemo(() => {
    const baselineRow = rows.find((r) => r.id === 'no-campaign');
    const campaignRows = rows.filter((r) => r.id !== 'no-campaign');
    const perf = campaignRows.filter((r) => r.leadsGenerated > 0);
    const nonPerf = campaignRows.filter((r) => r.leadsGenerated === 0);

    const sorted = [...perf].sort((a, b) => {
      const av = sortValue(a, sortMetric);
      const bv = sortValue(b, sortMetric);
      if (av == null && bv == null) return 0;
      if (av == null) return 1; // nulls always last
      if (bv == null) return -1;
      return sortDir === 'desc' ? bv - av : av - bv;
    });

    const sumRows = rows; // totals reflect everything, regardless of collapse state
    const totalsRow = {
      leadsGenerated: sumRows.reduce((s, r) => s + r.leadsGenerated, 0),
      bookings: sumRows.reduce((s, r) => s + r.bookings, 0),
      totalTravelers: sumRows.reduce((s, r) => s + r.totalTravelers, 0),
      revenue: sumRows.reduce((s, r) => s + r.revenue, 0),
      spend: sumRows.reduce((s, r) => s + (r.spend ?? 0), 0),
    };

    return { baseline: baselineRow, performing: sorted, nonPerforming: nonPerf, totals: totalsRow };
  }, [rows, sortMetric, sortDir]);

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

      <div className="card p-3 flex items-center justify-between flex-wrap gap-3">
        <DateRangeFilter
          preset={preset}
          onPresetChange={setPreset}
          customRange={customRange}
          onCustomRangeChange={setCustomRange}
          presets={MONITORING_PRESETS}
        />
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-slate-500">Sort by:</span>
          <select value={sortMetric} onChange={(e) => setSortMetric(e.target.value as SortMetric)} className="input py-1.5 text-xs w-auto">
            {SORT_METRICS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <button
            onClick={() => setSortDir((d) => d === 'desc' ? 'asc' : 'desc')}
            title={sortDir === 'desc' ? 'Highest first — click for lowest first' : 'Lowest first — click for highest first'}
            className="btn-ghost py-1.5 px-2 text-xs flex items-center gap-1"
          >
            <ArrowUpDown className="w-3.5 h-3.5" />
            {sortDir === 'desc' ? 'High → Low' : 'Low → High'}
          </button>
        </div>
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
        <>
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="data-table">
                {TABLE_HEAD}
                <tbody>
                  {performing.map((c) => <CampaignRow key={c.id} c={c} range={range} navigate={navigate} />)}
                  {baseline && <CampaignRow c={baseline} range={range} navigate={navigate} />}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
                    <td className="text-sm text-slate-600">Total</td>
                    <td className="text-right text-sm text-slate-800">{totals.leadsGenerated}</td>
                    <td className="text-right text-sm text-slate-800">{totals.bookings}</td>
                    <td className="text-right text-sm text-slate-800">{totals.totalTravelers}</td>
                    <td />
                    <td />
                    <td className="text-right text-sm text-slate-800">{formatCurrency(totals.revenue)}</td>
                    <td className="text-right text-sm text-slate-800">{formatCurrency(totals.spend)}</td>
                    <td />
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {nonPerforming.length > 0 && (
            <div className="card overflow-hidden">
              <button
                onClick={() => setShowNonPerforming((v) => !v)}
                className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-slate-50 transition-colors"
              >
                {showNonPerforming ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                <span className="text-sm font-semibold text-slate-600">Non-Performing Ads</span>
                <span className="text-xs text-slate-400">({nonPerforming.length} — no leads in this period)</span>
              </button>
              {showNonPerforming && (
                <div className="overflow-x-auto border-t border-slate-100">
                  <table className="data-table">
                    {TABLE_HEAD}
                    <tbody>
                      {nonPerforming.map((c) => <CampaignRow key={c.id} c={c} range={range} navigate={navigate} />)}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
