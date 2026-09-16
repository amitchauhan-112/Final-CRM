import { useSearchParams } from 'react-router-dom';
import { Users, Building2, Award, Archive } from 'lucide-react';
import { cn } from '../../utils/helpers';
import EmployeesTab from './organization/EmployeesTab';
import DepartmentsTab from './organization/DepartmentsTab';
import DesignationsTab from './organization/DesignationsTab';
import DeletedEmployeesTab from './organization/DeletedEmployeesTab';

type OrgTab = 'employees' | 'departments' | 'designations' | 'deleted-employees';

const TABS: { key: OrgTab; label: string; icon: React.ElementType }[] = [
  { key: 'employees',    label: 'Employees',    icon: Users },
  { key: 'departments',  label: 'Departments',  icon: Building2 },
  { key: 'designations', label: 'Designations', icon: Award },
  { key: 'deleted-employees', label: 'Deleted Employees', icon: Archive },
];

export default function OrganizationPage() {
  const [params, setParams] = useSearchParams();
  const activeTab = (params.get('tab') as OrgTab) || 'employees';

  const setTab = (tab: OrgTab) => setParams({ tab });

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h2 className="page-title">Organization</h2>
          <p className="page-subtitle">Manage your team, departments, and designations</p>
        </div>
      </div>

      {/* Tab Strip */}
      <div className="flex gap-1 p-1 bg-slate-100 rounded-xl w-fit">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150',
              activeTab === key
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/60'
            )}
          >
            <Icon className="w-4 h-4" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'employees'    && <EmployeesTab />}
      {activeTab === 'departments'  && <DepartmentsTab />}
      {activeTab === 'designations' && <DesignationsTab />}
      {activeTab === 'deleted-employees' && <DeletedEmployeesTab />}
    </div>
  );
}
