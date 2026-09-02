import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import AdminLayout from './components/layout/AdminLayout';
import EmployeeLayout from './components/layout/EmployeeLayout';
import OperationsLayout from './components/layout/OperationsLayout';
import FinanceLayout from './components/layout/FinanceLayout';
import LoginPage from './pages/LoginPage';
import WelcomePage from './pages/WelcomePage';
import TravelerPortalPage from './pages/portal/TravelerPortalPage';
import AdminDashboard from './components/dashboard/AdminDashboard';
import ExecutiveDashboardPage from './pages/admin/ExecutiveDashboardPage';
import BusinessIntelligencePage from './pages/admin/BusinessIntelligencePage';
import ReportCenterPage from './pages/admin/ReportCenterPage';
import BusinessRulesPage from './pages/admin/BusinessRulesPage';
import AutomationBuilderPage from './pages/admin/AutomationBuilderPage';
import SystemHealthPage from './pages/admin/SystemHealthPage';
import EmployeeDashboard from './components/dashboard/EmployeeDashboard';
import AdminLeadsPage from './pages/admin/LeadsPage';
import AdminCampaignsPage from './pages/admin/CampaignsPage';
import OrganizationPage from './pages/admin/OrganizationPage';
import AdminSettingsPage from './pages/admin/SettingsPage';
import AdminFeedbackPage from './pages/admin/FeedbackPage';
import AdminActivityFeedPage from './pages/admin/ActivityFeedPage';
import AdminReportsPage from './pages/admin/ReportsPage';
import MastersPage from './pages/admin/MastersPage';
import PackagesPage from './pages/admin/PackagesPage';
import BookingsPage from './pages/admin/BookingsPage';
import CustomersPage from './pages/admin/CustomersPage';
import EmployeeLeadsPage from './pages/employee/LeadsPage';
import EmployeeFollowUpsPage from './pages/employee/FollowUpsPage';
import EmployeeSettingsPage from './pages/employee/SettingsPage';
import PackageCatalogPage from './pages/employee/PackageCatalogPage';
import MyCustomersPage from './pages/employee/MyCustomersPage';
import MyBookingsPage from './pages/employee/MyBookingsPage';
import TasksPage from './pages/employee/TasksPage';
import OperationsDashboardPage from './pages/operations/DashboardPage';
import DeparturesPage from './pages/operations/DeparturesPage';
import DepartureDetailPage from './pages/operations/DepartureDetailPage';
import StayPlanningPage from './pages/operations/StayPlanningPage';
import RoomsRequiredPage from './pages/operations/RoomsRequiredPage';
import VendorsPage from './pages/operations/VendorsPage';
import VendorDetailPage from './pages/operations/VendorDetailPage';
import FinanceDashboardPage from './pages/finance/DashboardPage';
import PaymentVerificationPage from './pages/finance/PaymentVerificationPage';
import CustomerLedgerPage from './pages/finance/CustomerLedgerPage';
import PendingTrackerPage from './pages/finance/PendingTrackerPage';
import RefundsPage from './pages/finance/RefundsPage';
import VendorPaymentsPage from './pages/finance/VendorPaymentsPage';
import VendorLedgerPage from './pages/finance/VendorLedgerPage';
import ExpensesPage from './pages/finance/ExpensesPage';
import FinanceReportsPage from './pages/finance/ReportsPage';
import AdminPayrollPage from './pages/admin/PayrollPage';
import FinancePayrollPage from './pages/finance/PayrollPage';
import MyTargetsPage from './pages/employee/MyTargetsPage';
import AdminWhatsAppInboxPage from './pages/admin/WhatsAppInboxPage';
import EmployeeWhatsAppInboxPage from './pages/employee/WhatsAppInboxPage';

function RoleRedirect() {
  const { user, isAuthenticated } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (user?.role === 'ADMIN') return <Navigate to="/admin/dashboard" replace />;
  if (user?.role === 'OPERATIONS') return <Navigate to="/operations/dashboard" replace />;
  if (user?.role === 'FINANCE') return <Navigate to="/finance/dashboard" replace />;
  return <Navigate to="/employee/dashboard" replace />;
}

function RequireAuth({ children, role }: { children: React.ReactNode; role?: 'ADMIN' | 'EMPLOYEE' | 'OPERATIONS' | 'FINANCE' }) {
  const { isAuthenticated, user } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (role && user?.role !== role) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/Website" element={<WelcomePage />} />
      <Route path="/traveller/:token" element={<TravelerPortalPage />} />
      <Route path="/" element={<RoleRedirect />} />

      <Route
        path="/admin"
        element={
          <RequireAuth role="ADMIN">
            <AdminLayout />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="/admin/dashboard" replace />} />
        <Route path="dashboard" element={<AdminDashboard />} />
        <Route path="executive" element={<ExecutiveDashboardPage />} />
        <Route path="business-intelligence" element={<BusinessIntelligencePage />} />
        <Route path="report-center" element={<ReportCenterPage />} />
        <Route path="business-rules" element={<BusinessRulesPage />} />
        <Route path="automation-builder" element={<AutomationBuilderPage />} />
        <Route path="system-health" element={<SystemHealthPage />} />
        <Route path="leads" element={<AdminLeadsPage />} />
        <Route path="campaigns" element={<AdminCampaignsPage />} />
        <Route path="employees" element={<Navigate to="/admin/organization" replace />} />
        <Route path="organization" element={<OrganizationPage />} />
        <Route path="settings" element={<AdminSettingsPage />} />
        <Route path="feedback" element={<AdminFeedbackPage />} />
        <Route path="activity" element={<AdminActivityFeedPage />} />
        <Route path="reports" element={<AdminReportsPage />} />
        <Route path="masters" element={<MastersPage />} />
        <Route path="packages" element={<PackagesPage />} />
        <Route path="bookings" element={<BookingsPage />} />
        <Route path="customers" element={<CustomersPage />} />
        <Route path="whatsapp" element={<AdminWhatsAppInboxPage />} />
        <Route path="operations" element={<Navigate to="/admin/operations/dashboard" replace />} />
        <Route path="operations/dashboard" element={<OperationsDashboardPage />} />
        <Route path="operations/departures" element={<DeparturesPage />} />
        <Route path="operations/departures/:id" element={<DepartureDetailPage />} />
        <Route path="operations/stay-plan" element={<StayPlanningPage />} />
        <Route path="operations/rooms-required" element={<RoomsRequiredPage />} />
        <Route path="operations/vendors" element={<VendorsPage />} />
        <Route path="operations/vendors/:id" element={<VendorDetailPage />} />
        <Route path="finance" element={<Navigate to="/admin/finance/dashboard" replace />} />
        <Route path="finance/dashboard" element={<FinanceDashboardPage />} />
        <Route path="finance/verification" element={<PaymentVerificationPage />} />
        <Route path="finance/ledger" element={<CustomerLedgerPage />} />
        <Route path="finance/pending" element={<PendingTrackerPage />} />
        <Route path="finance/refunds" element={<RefundsPage />} />
        <Route path="finance/vendor-payments" element={<VendorPaymentsPage />} />
        <Route path="finance/vendor-ledger" element={<VendorLedgerPage />} />
        <Route path="finance/expenses" element={<ExpensesPage />} />
        <Route path="finance/reports" element={<FinanceReportsPage />} />
        <Route path="payroll" element={<AdminPayrollPage />} />
      </Route>

      <Route
        path="/operations"
        element={
          <RequireAuth role="OPERATIONS">
            <OperationsLayout />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="/operations/dashboard" replace />} />
        <Route path="dashboard" element={<OperationsDashboardPage />} />
        <Route path="departures" element={<DeparturesPage />} />
        <Route path="departures/:id" element={<DepartureDetailPage />} />
        <Route path="stay-plan" element={<StayPlanningPage />} />
        <Route path="rooms-required" element={<RoomsRequiredPage />} />
        <Route path="vendors" element={<VendorsPage />} />
        <Route path="vendors/:id" element={<VendorDetailPage />} />
        <Route path="settings" element={<EmployeeSettingsPage />} />
      </Route>

      <Route
        path="/finance"
        element={
          <RequireAuth role="FINANCE">
            <FinanceLayout />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="/finance/dashboard" replace />} />
        <Route path="dashboard" element={<FinanceDashboardPage />} />
        <Route path="verification" element={<PaymentVerificationPage />} />
        <Route path="ledger" element={<CustomerLedgerPage />} />
        <Route path="pending" element={<PendingTrackerPage />} />
        <Route path="refunds" element={<RefundsPage />} />
        <Route path="vendor-payments" element={<VendorPaymentsPage />} />
        <Route path="vendor-ledger" element={<VendorLedgerPage />} />
        <Route path="expenses" element={<ExpensesPage />} />
        <Route path="reports" element={<FinanceReportsPage />} />
        <Route path="payroll" element={<FinancePayrollPage />} />
        <Route path="settings" element={<EmployeeSettingsPage />} />
      </Route>

      <Route
        path="/employee"
        element={
          <RequireAuth role="EMPLOYEE">
            <EmployeeLayout />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="/employee/dashboard" replace />} />
        <Route path="dashboard" element={<EmployeeDashboard />} />
        <Route path="leads" element={<EmployeeLeadsPage />} />
        <Route path="follow-ups" element={<EmployeeFollowUpsPage />} />
        <Route path="packages" element={<PackageCatalogPage />} />
        <Route path="customers" element={<MyCustomersPage />} />
        <Route path="bookings" element={<MyBookingsPage />} />
        <Route path="tasks" element={<TasksPage />} />
        <Route path="targets" element={<MyTargetsPage />} />
        <Route path="whatsapp" element={<EmployeeWhatsAppInboxPage />} />
        <Route path="settings" element={<EmployeeSettingsPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
