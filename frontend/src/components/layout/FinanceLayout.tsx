import { useState, useRef, useEffect } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  Mountain, LayoutDashboard, CheckSquare, BookOpen, Clock, RotateCcw,
  Truck, FileBarChart, Bell, LogOut, ChevronDown, Menu, X, Settings, UserCircle, Receipt, ClipboardList, IndianRupee,
} from 'lucide-react';
import BookingLookup from './BookingLookup';
import { useAuthStore } from '../../store/authStore';
import { useNotifications, useMarkAllAsRead, useMarkAsRead } from '../../hooks/useNotifications';
import Avatar from '../ui/Avatar';
import FeedbackButton from '../feedback/FeedbackButton';
import { formatRelativeTime, cn } from '../../utils/helpers';
import { SEVERITY_DOT, CATEGORIES } from '../../utils/notificationMeta';

const navLinks = [
  { to: '/finance/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/finance/verification', label: 'Payment Verification', icon: CheckSquare },
  { to: '/finance/ledger', label: 'Customer Ledger', icon: BookOpen },
  { to: '/finance/pending', label: 'Pending Tracker', icon: Clock },
  { to: '/finance/refunds', label: 'Refunds', icon: RotateCcw },
  { to: '/finance/vendor-payments', label: 'Vendor Payments', icon: Truck },
  { to: '/finance/vendor-ledger', label: 'Vendor Ledger', icon: ClipboardList },
  { to: '/finance/expenses', label: 'Expenses', icon: Receipt },
  { to: '/finance/reports', label: 'Reports', icon: FileBarChart },
  { to: '/finance/payroll', label: 'Payroll', icon: IndianRupee },
  { to: '/finance/settings', label: 'Settings', icon: Settings },
];

export default function FinanceLayout() {
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

  const pageTitle = navLinks.find((l) => location.pathname.startsWith(l.to))?.label ?? 'Finance';

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

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 z-20 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-30 w-64 bg-gradient-to-b from-slate-900 to-emerald-950 flex flex-col transition-transform duration-300 lg:static lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex items-center gap-3 px-6 py-5 border-b border-emerald-900/60">
          <div className="w-9 h-9 bg-gradient-to-br from-emerald-400 to-primary-500 rounded-xl flex items-center justify-center flex-shrink-0">
            <Mountain className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="font-bold text-white text-sm">Travel CRM</p>
            <p className="text-emerald-300 text-xs">Finance</p>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="ml-auto lg:hidden text-emerald-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto scrollbar-thin">
          {navLinks.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all',
                  isActive
                    ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/40'
                    : 'text-emerald-200 hover:bg-emerald-900/60 hover:text-white'
                )
              }
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>

        {user && (
          <div className="px-4 py-4 border-t border-emerald-900/60">
            <div className="flex items-center gap-3">
              <Avatar name={user.name} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-white truncate">{user.name}</p>
                <p className="text-xs text-emerald-400 truncate">{user.email}</p>
              </div>
              <button onClick={handleLogout} className="text-emerald-400 hover:text-red-400 transition-colors" title="Logout">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 lg:px-6 flex-shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 rounded-lg hover:bg-slate-100 text-slate-500">
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="text-lg font-bold text-slate-900">{pageTitle}</h1>
          </div>

          <div className="flex items-center gap-2">
            <BookingLookup />
            <div ref={notifRef} className="relative">
              <button
                onClick={() => setNotifOpen(!notifOpen)}
                className="relative p-2 rounded-xl hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors"
              >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="fixed inset-x-2 top-[4.5rem] sm:absolute sm:inset-x-auto sm:top-auto sm:right-0 sm:mt-2 sm:w-80 bg-white rounded-xl shadow-xl border border-slate-200 z-50">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
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
                          onClick={() => { if (!n.isRead) markOneRead.mutate(n.id); }}
                          className={cn(
                            'px-4 py-3 border-b border-slate-100 last:border-0 transition-colors',
                            !n.isRead ? 'bg-primary-50 hover:bg-primary-100 cursor-pointer' : 'hover:bg-slate-50'
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
                      <p className="text-xs text-emerald-600 font-medium mt-0.5">Finance</p>
                    </div>
                    <button
                      onClick={() => { setUserMenuOpen(false); navigate('/finance/settings'); }}
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

        <main className="flex-1 overflow-y-auto scrollbar-thin p-4 lg:p-6">
          <Outlet />
        </main>
      </div>

      <FeedbackButton />
    </div>
  );
}
