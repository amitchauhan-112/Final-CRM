import { useNavigate } from 'react-router-dom';
import {
  Users2, Map, Wallet, BookOpen, Package, MapPin, Contact, Megaphone,
  Truck, Building2, UserCheck, PlaneTakeoff, LineChart,
} from 'lucide-react';

interface ReportCategory {
  key: string;
  label: string;
  description: string;
  icon: React.ElementType;
  to: string;
  color: string;
}

// A navigation hub, not a rebuild — every category here links to a report
// surface that already exists (Finance Reports' 11 tabs, Admin Reports' 5
// tabs, the new Business Intelligence module) rather than duplicating any
// of their logic.
const CATEGORIES: ReportCategory[] = [
  { key: 'sales', label: 'Sales Reports', description: 'Lead analytics, conversion, and daily trend', icon: Users2, to: '/admin/reports', color: 'bg-primary-100 text-primary-600' },
  { key: 'operations', label: 'Operations Reports', description: 'Departure revenue and trip readiness', icon: Map, to: '/admin/finance/reports', color: 'bg-blue-100 text-blue-600' },
  { key: 'finance', label: 'Finance Reports', description: 'Collections, outstanding, refunds, P&L', icon: Wallet, to: '/admin/finance/reports', color: 'bg-emerald-100 text-emerald-600' },
  { key: 'booking', label: 'Booking Reports', description: 'All bookings, status, and balances', icon: BookOpen, to: '/admin/bookings', color: 'bg-amber-100 text-amber-600' },
  { key: 'package', label: 'Package Reports', description: 'Bookings, revenue, profit, cancellation % per package', icon: Package, to: '/admin/business-intelligence?tab=packages', color: 'bg-purple-100 text-purple-600' },
  { key: 'destination', label: 'Destination Reports', description: 'Revenue, growth, and refund % by destination', icon: MapPin, to: '/admin/business-intelligence?tab=destinations', color: 'bg-pink-100 text-pink-600' },
  { key: 'customer', label: 'Customer Reports', description: 'Lifetime value, retention, referrals', icon: Contact, to: '/admin/business-intelligence?tab=customers', color: 'bg-teal-100 text-teal-600' },
  { key: 'campaign', label: 'Campaign Reports', description: 'Leads, ROI, cost per lead/booking', icon: Megaphone, to: '/admin/business-intelligence?tab=campaigns', color: 'bg-orange-100 text-orange-600' },
  { key: 'vendor', label: 'Vendor Ledger', description: 'Every vendor\'s running balance — bills owed vs. payments made', icon: Truck, to: '/admin/finance/vendor-ledger', color: 'bg-slate-200 text-slate-600' },
  { key: 'department', label: 'Department Reports', description: 'Departments and designations', icon: Building2, to: '/admin/organization', color: 'bg-cyan-100 text-cyan-600' },
  { key: 'employee', label: 'Employee Reports', description: 'Revenue generated, task completion, response time', icon: UserCheck, to: '/admin/business-intelligence?tab=employees', color: 'bg-indigo-100 text-indigo-600' },
  { key: 'trip', label: 'Trip Reports', description: 'Per-trip profitability and margin', icon: PlaneTakeoff, to: '/admin/finance/reports', color: 'bg-red-100 text-red-600' },
];

export default function ReportCenterPage() {
  const navigate = useNavigate();

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Report Center</h2>
        <p className="text-sm text-slate-500 mt-0.5">One place to find every report across Sales, Operations, Finance, and Business Intelligence</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {CATEGORIES.map((c) => {
          const Icon = c.icon;
          return (
            <button
              key={c.key}
              onClick={() => navigate(c.to)}
              className="card p-5 text-left hover:shadow-md hover:-translate-y-px transition-all duration-200"
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${c.color}`}>
                <Icon className="w-5 h-5" />
              </div>
              <p className="font-semibold text-slate-800 text-sm">{c.label}</p>
              <p className="text-xs text-slate-400 mt-1">{c.description}</p>
            </button>
          );
        })}
      </div>

      <button
        onClick={() => navigate('/admin/business-intelligence')}
        className="card p-5 w-full flex items-center gap-3 hover:shadow-md transition-all duration-200"
      >
        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-primary-100 text-primary-600 flex-shrink-0">
          <LineChart className="w-5 h-5" />
        </div>
        <div className="text-left">
          <p className="font-semibold text-slate-800 text-sm">Full Business Intelligence Module</p>
          <p className="text-xs text-slate-400">Package, Destination, Campaign, Customer, and Employee analytics in one place</p>
        </div>
      </button>
    </div>
  );
}
