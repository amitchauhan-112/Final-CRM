import { useState } from 'react';
import { Target, IndianRupee, Wallet, ShieldCheck } from 'lucide-react';
import MonthPicker from '../../components/hr/MonthPicker';
import SalesTargetsTable from '../../components/hr/SalesTargetsTable';
import PayrollTable from '../../components/hr/PayrollTable';
import SalaryConfigPanel from '../../components/hr/SalaryConfigPanel';
import FinanceAccessPanel from '../../components/hr/FinanceAccessPanel';
import TargetHistoryModal from '../../components/hr/TargetHistoryModal';
import { cn } from '../../utils/helpers';

const TABS = [
  { key: 'targets', label: 'Sales Targets', icon: Target },
  { key: 'payroll', label: 'Payroll', icon: IndianRupee },
  { key: 'salary-config', label: 'Salary Config', icon: Wallet },
  { key: 'finance-access', label: 'Finance Access', icon: ShieldCheck },
];

export default function AdminPayrollPage() {
  const now = new Date();
  const [activeTab, setActiveTab] = useState('targets');
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [historyUser, setHistoryUser] = useState<{ id: string; name: string } | null>(null);

  const showMonthPicker = activeTab === 'targets' || activeTab === 'payroll';

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Payroll & Incentives</h2>
          <p className="text-sm text-slate-500 mt-0.5">Sales targets, achievement, incentives, salary, and payment release</p>
        </div>
        {showMonthPicker && <MonthPicker month={month} year={year} onChange={(m, y) => { setMonth(m); setYear(y); }} />}
      </div>

      <div className="flex gap-1 p-1 bg-slate-100 rounded-xl w-fit flex-wrap">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
              activeTab === key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            )}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'targets' && (
        <SalesTargetsTable
          month={month} year={year} canEdit
          onViewHistory={(userId) => setHistoryUser({ id: userId, name: '' })}
        />
      )}
      {activeTab === 'payroll' && <PayrollTable month={month} year={year} />}
      {activeTab === 'salary-config' && <SalaryConfigPanel />}
      {activeTab === 'finance-access' && <FinanceAccessPanel />}

      <TargetHistoryModal userId={historyUser?.id ?? null} onClose={() => setHistoryUser(null)} />
    </div>
  );
}
