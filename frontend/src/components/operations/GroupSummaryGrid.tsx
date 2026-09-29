import {
  Users, User, BedDouble, BedSingle, Layers, Sofa,
  Salad, Beef, Leaf, Baby, Accessibility, IndianRupee, AlertCircle,
} from 'lucide-react';
import { GroupSummary } from '../../types/index';
import { formatCurrency } from '../../utils/helpers';

export default function GroupSummaryGrid({ summary }: { summary: GroupSummary }) {
  const tiles = [
    { label: 'Total Travelers', value: summary.totalTravelers, icon: Users, color: 'text-primary-600 bg-primary-50', alwaysShow: true },
    { label: 'Male', value: summary.maleCount, icon: User, color: 'text-primary-600 bg-primary-50' },
    { label: 'Female', value: summary.femaleCount, icon: User, color: 'text-pink-600 bg-pink-50' },
    { label: 'Double Rooms Required', value: summary.doubleSharingRoomsRequired, icon: BedDouble, color: 'text-slate-600 bg-slate-100' },
    { label: 'Triple Rooms Required', value: summary.tripleSharingRoomsRequired, icon: Layers, color: 'text-slate-600 bg-slate-100' },
    { label: 'Quad Rooms Required', value: summary.quadSharingRoomsRequired, icon: Sofa, color: 'text-slate-600 bg-slate-100' },
    { label: 'Extra Mattress Required', value: summary.extraMattressRequired, icon: BedSingle, color: 'text-amber-600 bg-amber-50' },
    { label: 'Veg Meals', value: summary.vegMeals, icon: Leaf, color: 'text-emerald-600 bg-emerald-50' },
    { label: 'Non-Veg Meals', value: summary.nonVegMeals, icon: Beef, color: 'text-red-600 bg-red-50' },
    { label: 'Jain Meals', value: summary.jainMeals, icon: Salad, color: 'text-emerald-600 bg-emerald-50' },
    { label: 'Children', value: summary.childrenCount, icon: Baby, color: 'text-mountain-600 bg-mountain-50' },
    { label: 'Senior Citizens', value: summary.seniorCitizenCount, icon: Accessibility, color: 'text-mountain-600 bg-mountain-50' },
    { label: 'Pending Payments', value: summary.pendingPayments, icon: AlertCircle, color: 'text-orange-600 bg-orange-50' },
    { label: 'Total Pending Amount', value: formatCurrency(summary.totalPendingAmount), icon: IndianRupee, color: 'text-orange-600 bg-orange-50', numeric: summary.totalPendingAmount },
  ];

  // Only show a breakdown tile once it actually applies to this trip — a
  // "Triple Rooms Required: 0" tile is noise, not information.
  const visibleTiles = tiles.filter((t) => t.alwaysShow || (t.numeric !== undefined ? t.numeric : t.value) > 0);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
      {visibleTiles.map((t) => {
        const Icon = t.icon;
        return (
          <div key={t.label} className="card p-4 flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${t.color}`}>
              <Icon className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold text-slate-800 truncate">{t.value}</p>
              <p className="text-[11px] text-slate-400">{t.label}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
