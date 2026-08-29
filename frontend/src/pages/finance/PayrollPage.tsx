import { useState } from 'react';
import MonthPicker from '../../components/hr/MonthPicker';
import PayrollTable from '../../components/hr/PayrollTable';

export default function FinancePayrollPage() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Payroll</h2>
          <p className="text-sm text-slate-500 mt-0.5">Employee salary and incentive payments</p>
        </div>
        <MonthPicker month={month} year={year} onChange={(m, y) => { setMonth(m); setYear(y); }} />
      </div>

      <PayrollTable month={month} year={year} />
    </div>
  );
}
