import { useState, useRef, useEffect } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  Mountain, LayoutDashboard, Users2, Bell, Settings,
  LogOut, ChevronDown, Menu, X, UserCircle, Megaphone,
  MessageSquarePlus, Activity, BarChart2, Building2,
  UserCheck, Database, ChevronRight, Package, BookOpen,
  Contact, Wallet, Map, Home, Gauge, LineChart, FolderKanban, Settings2, Zap, HeartPulse, IndianRupee,
  MessageCircle,
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useNotifications, useMarkAllAsRead, useMarkAsRead } from '../../hooks/useNotifications';
import Avatar from '../ui/Avatar';
import FeedbackButton from '../feedback/FeedbackButton';
import { formatRelativeTime, cn } from '../../utils/helpers';
import { SEVERITY_DOT, CATEGORIES } from '../../utils/notificationMeta';
import GlobalSearch from './GlobalSearch';
import BookingLookup from './BookingLookup';

// ─── Nav Configuration ────────────────────────────────────────────────────────

type NavItem = { to: string; label: string; icon: React.ElementType };

type NavEntry =
  | { type: 'item'; to: string; label: string; icon: React.ElementType }
  | { type: 'group'; label: string; icon: React.ElementType; items: NavItem[] }
  | { type: 'divider'; label?: string };

const NAV: NavEntry[] = [
  { type: 'item', to: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { type: 'item', to: '/admin/executive', label: 'Executive Dashboard', icon: Gauge },
  { type: 'item', to: '/admin/business-intelligence', label: 'Business Intelligence', icon: LineChart },

  { type: 'divider', label: 'CRM' },
  {
    type: 'group', label: 'CRM', icon: Users2,
    items: [
      { to: '/admin/leads',     label: 'Leads',     icon: UserCheck },
      { to: '/admin/campaigns', label: 'Campaigns', icon: Megaphone },
    ],
  },
  { type: 'item', to: '/admin/organization', label: 'Organization', icon: Building2 },

  { type: 'divider', label: 'ERP' },
  {
    type: 'group', label: 'ERP', icon: Package,
    items: [
      { to: '/admin/packages',   label: 'Packages',   icon: Package },
      { to: '/admin/bookings',   label: 'Bookings',   icon: BookOpen },
      { to: '/admin/customers',  label: 'Customers',  icon: Contact },
      { to: '/admin/finance',    label: 'Finance',    icon: Wallet },
      { to: '/admin/operations', label: 'Operations', icon: Map },
      { to: '/admin/masters',    label: 'Masters',    icon: Database },
    ],
  },
  { type: 'item', to: '/admin/payroll', label: 'Payroll & Incentives', icon: IndianRupee },

  { type: 'divider', label: 'SYSTEM' },
  { type: 'item', to: '/admin/report-center', label: 'Report Center', icon: FolderKanban },
  { type: 'item', to: '/admin/reports',  label: 'Reports',  icon: BarChart2 },
  { type: 'item', to: '/admin/activity', label: 'Audit Center', icon: Activity },
  { type: 'item', to: '/admin/feedback', label: 'Feedback', icon: MessageSquarePlus },
  { type: 'item', to: '/admin/automation-builder', label: 'Automation Builder', icon: Zap },
  { type: 'item', to: '/admin/business-rules', label: 'Business Rules', icon: Settings2 },
  { type: 'item', to: '/admin/system-health', label: 'System Health', icon: HeartPulse },
  { type: 'item', to: '/admin/settings', label: 'Settings', icon: Settings },
];

// Sub-page labels for the deeper ERP sections (Finance/Operations), which
// otherwise all collapse to the same top-level "Finance"/"Operations" title —
// this is what actually tells someone buried in Payment Verification where
// they are and how to get back out.
const SUB_LABELS: Record<string, string> = {
  'finance/dashboard': 'Dashboard',
  'finance/verification': 'Payment Verification',
  'finance/ledger': 'Customer Ledger',
  'finance/pending': 'Pending Tracker',
  'finance/refunds': 'Refunds',
  'finance/vendor-payments': 'Vendor Payments',
  'finance/vendor-ledger': 'Vendor Ledger',
  'finance/expenses': 'Expenses',
  'finance/reports': 'Reports',
  'operations/dashboard': 'Dashboard',
  'operations/departures': 'Departures',
  'operations/vendors': 'Vendors',
};

// Breadcrumb trail: Dashboard > [ERP group, if any] > [specific sub-page, if any].
// Every admin page — however deep — is always one click from Dashboard.
function resolveBreadcrumb(pathname: string): { label: string; to?: string }[] {
  if (pathname === '/admin/dashboard') return [{ label: 'Dashboard' }];
  const trail: { label: string; to?: string }[] = [{ label: 'Dashboard', to: '/admin/dashboard' }];

  for (const entry of NAV) {
    if (entry.type !== 'group') continue;
    const match = entry.items.find((i) => pathname.startsWith(i.to));
    if (!match) continue;

    trail.push({ label: match.label, to: match.to === '/admin/finance' || match.to === '/admin/operations' ? `${match.to}/dashboard` : match.to });

    const rest = pathname.replace(/^\/admin\//, '');
    if (rest.includes('/departures/')) trail.push({ label: 'Trip Detail' });
    else if (rest.includes('/vendors/') && rest.split('/').length > 2) trail.push({ label: 'Vendor Detail' });
    else {
      const subLabel = SUB_LABELS[rest];
      if (subLabel && subLabel !== match.label) trail.push({ label: subLabel });
    }
    return trail;
  }

  const topMatch = NAV.find((e) => e.type === 'item' && pathname.startsWith(e.to)) as Extract<NavEntry, { type: 'item' }> | undefined;
  if (topMatch) trail.push({ label: topMatch.label });
  return trail;
}

// ─── Sidebar Group Component ──────────────────────────────────────────────────

function NavGroupItem({
  entry,
  pathname,
  onNavClick,
}: {
  entry: Extract<NavEntry, { type: 'group' }>;
  pathname: string;
  onNavClick: () => void;
}) {
  const isActive = entry.items.some((i) => pathname.startsWith(i.to));
  const [open, setOpen] = useState(isActive);

  // Auto-open when navigating to an item in this group
  useEffect(() => {
    if (isActive) setOpen(true);
  }, [isActive]);

  const Icon = entry.icon;

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all',
          isActive ? 'text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
        )}
      >
        <span className="flex items-center gap-3">
          <Icon className="w-5 h-5 flex-shrink-0" />
          {entry.label}
        </span>
        <ChevronDown className={cn('w-4 h-4 transition-transform duration-200 flex-shrink-0', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="mt-1 ml-3 pl-3 border-l border-slate-700/60 space-y-0.5">
          {entry.items.map((item) => {
            const ItemIcon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={onNavClick}
                className={({ isActive: ia }) =>
                  cn(
                    'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all',
                    ia
                      ? 'bg-primary-600 text-white shadow-md shadow-primary-900/40'
                      : 'text-slate-400 hover:text-white hover:bg-slate-700/60'
                  )
                }
              >
                <ItemIcon className="w-4 h-4 flex-shrink-0" />
                {item.label}
              </NavLink>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Layout ───────────────────────────────────────────────────────────────────

export default function AdminLayout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notifCategory, setNotifCategory] = useState('');
  const notifRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const { data: notifData } = useNotifications(1, 10);
  const markAllRead = useMarkAllAsRead();
  const markOneRead = useMarkAsRead();

  const notifications = notifData?.data ?? [];
  const filteredNotifications = notifCategory ? notifications.filter((n) => n.category === notifCategory) : notifications;
  const unreadCount = notifData?.meta?.unreadCount ?? 0;
  const breadcrumb = resolveBreadcrumb(location.pathname);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) setUserMenuOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const closeSidebar = () => setSidebarOpen(false);

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 z-20 lg:hidden" onClick={closeSidebar} />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-30 w-64 bg-gradient-to-b from-slate-900 to-slate-800 flex flex-col transition-transform duration-300 lg:static lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-700/60 flex-shrink-0">
          <div className="w-9 h-9 bg-gradient-to-br from-primary-400 to-mountain-500 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg">
            <Mountain className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <p className="font-bold text-white text-sm leading-tight">Travel ERP</p>
            <p className="text-slate-400 text-[11px]">Enterprise Suite</p>
          </div>
          <button onClick={closeSidebar} className="ml-auto lg:hidden text-slate-400 hover:text-white p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-3 overflow-y-auto scrollbar-thin space-y-0.5">
          {NAV.map((entry, idx) => {
            if (entry.type === 'divider') {
              return (
                <div key={`divider-${idx}`} className="pt-4 pb-1 px-1">
                  {entry.label && (
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{entry.label}</p>
                  )}
                </div>
              );
            }

            if (entry.type === 'group') {
              return (
                <NavGroupItem
                  key={entry.label}
                  entry={entry}
                  pathname={location.pathname}
                  onNavClick={closeSidebar}
                />
              );
            }

            const Icon = entry.icon;
            return (
              <NavLink
                key={entry.to}
                to={entry.to}
                onClick={closeSidebar}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all',
                    isActive
                      ? 'bg-primary-600 text-white shadow-lg shadow-primary-900/40'
                      : 'text-slate-300 hover:bg-slate-700/60 hover:text-white'
                  )
                }
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                {entry.label}
              </NavLink>
            );
          })}
        </nav>

        {/* User info */}
        {user && (
          <div className="px-4 py-4 border-t border-slate-700/60 flex-shrink-0">
            <div className="flex items-center gap-3">
              <Avatar name={user.name} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white truncate">{user.name}</p>
                <p className="text-xs text-slate-400 truncate">{user.email}</p>
              </div>
              <button onClick={handleLogout} className="text-slate-400 hover:text-red-400 transition-colors p-1" title="Logout">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Top bar */}
        <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-4 lg:px-6 flex-shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-lg hover:bg-slate-100 text-slate-500"
            >
              <Menu className="w-5 h-5" />
            </button>
            {/* Breadcrumb — always starts with Dashboard, so no admin page is
                ever more than one click from home, however deep it is. */}
            <nav className="flex items-center gap-1.5 min-w-0 overflow-x-auto scrollbar-thin">
              {breadcrumb.map((crumb, i) => (
                <div key={`${crumb.label}-${i}`} className="flex items-center gap-1.5 flex-shrink-0">
                  {i > 0 && <ChevronRight className="w-3.5 h-3.5 text-slate-300 flex-shrink-0" />}
                  {crumb.to ? (
                    <button
                      onClick={() => navigate(crumb.to!)}
                      className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-primary-600 transition-colors"
                    >
                      {i === 0 && <Home className="w-3.5 h-3.5" />}
                      {crumb.label}
                    </button>
                  ) : (
                    <span className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
                      {i === 0 && <Home className="w-3.5 h-3.5 text-slate-400" />}
                      {crumb.label}
                    </span>
                  )}
                </div>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-1.5">
            <BookingLookup />
            <GlobalSearch />

            {/* Notifications */}
            <div ref={notifRef} className="relative">
              <button
                onClick={() => setNotifOpen(!notifOpen)}
                className="relative p-2 rounded-xl hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors"
              >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center font-bold">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="fixed inset-x-2 top-[3.75rem] sm:absolute sm:inset-x-auto sm:top-auto sm:right-0 sm:mt-2 sm:w-80 bg-white rounded-xl shadow-xl border border-slate-200 z-50">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                    <p className="font-semibold text-slate-900 text-sm">Notifications</p>
                    {unreadCount > 0 && (
                      <button onClick={() => markAllRead.mutate()} className="text-xs text-primary-600 hover:text-primary-700 font-medium">
                        Mark all read
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-1 px-4 py-2 border-b border-slate-100 overflow-x-auto scrollbar-thin">
                    {['', ...CATEGORIES].map((c) => (
                      <button
                        key={c || 'all'}
                        onClick={() => setNotifCategory(c)}
                        className={cn(
                          'px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap border transition-colors',
                          notifCategory === c ? 'bg-primary-600 text-white border-primary-600' : 'border-slate-200 text-slate-500 hover:border-slate-300'
                        )}
                      >
                        {c || 'All'}
                      </button>
                    ))}
                  </div>
                  <div className="max-h-[60vh] sm:max-h-80 overflow-y-auto scrollbar-thin">
                    {filteredNotifications.length === 0 ? (
                      <div className="px-4 py-8 text-center text-slate-400 text-sm">No notifications</div>
                    ) : (
                      filteredNotifications.map((n) => (
                        <div
                          key={n.id}
                          onClick={() => {
                            if (!n.isRead) markOneRead.mutate(n.id);
                            setNotifOpen(false);
                            if (n.leadId) navigate(`/admin/leads?id=${n.leadId}`);
                            else if (n.departureId) navigate(`/admin/operations/departures/${n.departureId}`);
                          }}
                          className={cn(
                            'px-4 py-3 border-b border-slate-100 last:border-0 transition-colors',
                            (n.leadId || n.departureId) && 'cursor-pointer',
                            !n.isRead ? 'bg-primary-50 hover:bg-primary-100' : 'hover:bg-slate-50'
                          )}
                        >
                          <div className="flex items-start gap-2">
                            <span className={cn('mt-1.5 w-2 h-2 rounded-full flex-shrink-0', SEVERITY_DOT[n.severity])} />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-slate-800">{n.title}</p>
                              <p className="text-xs text-slate-500 mt-0.5">{n.message}</p>
                              <p className="text-xs text-slate-400 mt-1">{formatRelativeTime(n.createdAt)}</p>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* User menu */}
            {user && (
              <div ref={userMenuRef} className="relative">
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-xl hover:bg-slate-100 transition-colors"
                >
                  <Avatar name={user.name} size="sm" />
                  <span className="hidden sm:block text-sm font-medium text-slate-700 max-w-[120px] truncate">{user.name}</span>
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                </button>

                {userMenuOpen && (
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-xl border border-slate-200 z-50 overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-100">
                      <p className="text-sm font-semibold text-slate-800">{user.name}</p>
                      <p className="text-xs text-slate-400">{user.email}</p>
                    </div>
                    <button
                      onClick={() => { setUserMenuOpen(false); navigate('/admin/settings'); }}
                      className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                      <UserCircle className="w-4 h-4" />
                      Profile & Settings
                    </button>
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      Logout
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto scrollbar-thin p-4 lg:p-6">
          <Outlet />
        </main>
      </div>

      <FeedbackButton />
    </div>
  );
}
