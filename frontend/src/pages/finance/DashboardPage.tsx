import { useNavigate, useLocation } from 'react-router-dom';
import {
  IndianRupee, CalendarDays, TrendingUp, CheckSquare, Wallet, CalendarClock,
  AlertCircle, RotateCcw, Truck, Banknote, Smartphone, CreditCard, Landmark,
  ArrowRight, FileBarChart, Receipt, PiggyBank, Award, Percent,
} from 'lucide-react';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useFinanceDashboard } from '../../hooks/useFinance';
import StatsCard from '../../components/ui/StatsCard';
import { Skeleton } from '../../components/ui/Skeleton';
import { formatCurrency } from '../../utils/helpers';

const DEST_COLORS = ['#0ea5e9', '#8b5cf6', '#f59e0b', '#ef4444', '#22c55e', '#14b8a6', '#ec4899'];

export default function FinanceDashboardPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const base = location.pathname.startsWith('/admin') ? '/admin/finance' : '/finance';
  const { data, isLoading } = useFinanceDashboard();
  const stats = data?.data;

  const collectionByMode = stats
    ? [
        { name: 'Cash', value: stats.cashCollection },
        { name: 'Online', value: stats.onlineCollection },
        { name: 'UPI', value: stats.upiCollection },
        { name: 'Bank Transfer', value: stats.bankTransferCollection },
      ].filter((d) => d.value > 0)
    : [];

  const revenueByDestination = (stats?.revenueByDestination ?? []).slice(0, 8).map((d) => ({ name: d.destination, revenue: d.revenue }));

  const cards = stats
    ? [
        { label: "Today's Collections", value: formatCurrency(stats.todaysCollections), icon: CalendarDays, iconBg: 'bg-emerald-100', iconColor: 'text-emerald-600', onClick: () => navigate(`${base}/reports`) },
        { label: 'Monthly Collections', value: formatCurrency(stats.monthlyCollections), icon: TrendingUp, iconBg: 'bg-emerald-100', iconColor: 'text-emerald-600', onClick: () => navigate(`${base}/reports`) },
        { label: 'Total Revenue', value: formatCurrency(stats.totalRevenue), icon: IndianRupee, iconBg: 'bg-primary-100', iconColor: 'text-primary-600', onClick: () => navigate(`${base}/reports`) },
        { label: 'Pending Verification', value: stats.pendingPaymentVerification, icon: CheckSquare, iconBg: 'bg-amber-100', iconColor: 'text-amber-600', onClick: () => navigate(`${base}/verification`) },
        { label: 'Pending Customer Balances', value: stats.pendingCustomerBalances, icon: Wallet, iconBg: 'bg-amber-100', iconColor: 'text-amber-600', onClick: () => navigate(`${base}/pending`) },
        { label: 'Upcoming Due Payments', value: stats.upcomingDuePayments, icon: CalendarClock, iconBg: 'bg-amber-100', iconColor: 'text-amber-600', onClick: () => navigate(`${base}/pending?status=DUE_SOON`) },
        { label: 'Overdue Payments', value: stats.overduePayments, icon: AlertCircle, iconBg: 'bg-red-100', iconColor: 'text-red-600', onClick: () => navigate(`${base}/pending?status=OVERDUE`) },
        { label: 'Refund Requests', value: stats.refundRequests, icon: RotateCcw, iconBg: 'bg-red-100', iconColor: 'text-red-600', onClick: () => navigate(`${base}/refunds`) },
        { label: 'Vendor Payments Pending', value: stats.vendorPaymentsPending, icon: Truck, iconBg: 'bg-amber-100', iconColor: 'text-amber-600', onClick: () => navigate(`${base}/vendor-payments`) },
        { label: "Today's Expenses", value: formatCurrency(stats.todaysExpenses), icon: Receipt, iconBg: 'bg-red-100', iconColor: 'text-red-600', onClick: () => navigate(`${base}/expenses`) },
        { label: 'Pending Expense Approval', value: stats.pendingExpenseApproval, icon: CheckSquare, iconBg: 'bg-amber-100', iconColor: 'text-amber-600', onClick: () => navigate(`${base}/expenses`) },
        { label: 'Profit This Month', value: formatCurrency(stats.profitThisMonth), icon: PiggyBank, iconBg: 'bg-emerald-100', iconColor: 'text-emerald-600', onClick: () => navigate(`${base}/reports`) },
        { label: 'Top Revenue Package', value: stats.topRevenuePackage ? stats.topRevenuePackage.name : '—', icon: Award, iconBg: 'bg-primary-100', iconColor: 'text-primary-600', onClick: () => navigate(`${base}/reports`) },
        { label: 'Payment Completion', value: `${stats.paymentCompletionPct}%`, icon: Percent, iconBg: 'bg-primary-100', iconColor: 'text-primary-600', onClick: () => navigate(`${base}/reports`) },
        { label: 'Cash Collection', value: formatCurrency(stats.cashCollection), icon: Banknote, iconBg: 'bg-slate-100', iconColor: 'text-slate-600', onClick: () => navigate(`${base}/reports`) },
        { label: 'Online Collection', value: formatCurrency(stats.onlineCollection), icon: CreditCard, iconBg: 'bg-slate-100', iconColor: 'text-slate-600', onClick: () => navigate(`${base}/reports`) },
        { label: 'UPI Collection', value: formatCurrency(stats.upiCollection), icon: Smartphone, iconBg: 'bg-slate-100', iconColor: 'text-slate-600', onClick: () => navigate(`${base}/reports`) },
        { label: 'Bank Transfer Collection', value: formatCurrency(stats.bankTransferCollection), icon: Landmark, iconBg: 'bg-slate-100', iconColor: 'text-slate-600', onClick: () => navigate(`${base}/reports`) },
      ]
    : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Finance Dashboard</h2>
          <p className="text-sm text-slate-500 mt-0.5">Collections, balances, and vendor payments at a glance</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => navigate(`${base}/verification`)} className="btn-secondary text-sm">
            <CheckSquare className="w-4 h-4" />Verify Payments
          </button>
          <button onClick={() => navigate(`${base}/reports`)} className="btn-secondary text-sm">
            <FileBarChart className="w-4 h-4" />Reports
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 18 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {cards.map((c) => (
              <StatsCard key={c.label} label={c.label} value={c.value} icon={c.icon} iconBg={c.iconBg} iconColor={c.iconColor} onClick={c.onClick} />
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="card p-5">
              <h3 className="font-semibold text-slate-800 mb-4 text-sm">Collection Trend (14 days)</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={stats?.collectionTrend ?? []} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <XAxis dataKey="date" tick={{ fontSize: 9 }} tickFormatter={(d) => d.slice(5)} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                  <Bar dataKey="amount" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="card p-5">
              <h3 className="font-semibold text-slate-800 mb-4 text-sm">Collection by Mode (this month)</h3>
              {collectionByMode.length === 0 ? (
                <div className="h-[220px] flex items-center justify-center text-sm text-slate-400">No collections yet this month</div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={collectionByMode} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                      {collectionByMode.map((_, idx) => <Cell key={idx} fill={DEST_COLORS[idx % DEST_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => formatCurrency(v)} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="card p-5">
            <h3 className="font-semibold text-slate-800 mb-4 text-sm">Revenue by Destination</h3>
            {revenueByDestination.length === 0 ? (
              <div className="h-[220px] flex items-center justify-center text-sm text-slate-400">No revenue yet</div>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={revenueByDestination} layout="vertical" margin={{ top: 0, right: 20, left: 20, bottom: 0 }}>
                  <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(v)} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={100} />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                  <Bar dataKey="revenue" fill="#0ea5e9" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="card p-5">
            <h3 className="font-semibold text-slate-800 mb-4 text-sm">Quick Actions</h3>
            <div className="flex flex-wrap gap-3">
              <button onClick={() => navigate(`${base}/verification`)} className="btn-secondary text-sm">
                <CheckSquare className="w-4 h-4" />Payment Verification<ArrowRight className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => navigate(`${base}/pending`)} className="btn-secondary text-sm">
                <Wallet className="w-4 h-4" />Pending Tracker<ArrowRight className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => navigate(`${base}/refunds`)} className="btn-secondary text-sm">
                <RotateCcw className="w-4 h-4" />Refunds<ArrowRight className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => navigate(`${base}/vendor-payments`)} className="btn-secondary text-sm">
                <Truck className="w-4 h-4" />Vendor Payments<ArrowRight className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => navigate(`${base}/expenses`)} className="btn-secondary text-sm">
                <Receipt className="w-4 h-4" />Expenses<ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
