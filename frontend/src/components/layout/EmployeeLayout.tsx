import { useState, useRef, useEffect } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  Mountain, LayoutDashboard, Users, Calendar, Bell,
  LogOut, ChevronDown, Menu, X, Settings, UserCircle,
  Package, UserCheck, CheckSquare, Target, MessageCircle, BookOpen,
} from 'lucide-react';
import BookingLookup from './BookingLookup';
import { useAuthStore } from '../../store/authStore';
import { useNotifications, useMarkAllAsRead, useMarkAsRead } from '../../hooks/useNotifications';
import { useFollowUpNotifications } from '../../hooks/useFollowUpNotifications';
import Avatar from '../ui/Avatar';
import FeedbackButton from '../feedback/FeedbackButton';
import { formatRelativeTime, cn } from '../../utils/helpers';
import { SEVERITY_DOT, CATEGORIES } from '../../utils/notificationMeta';

const navLinks = [
  { to: '/employee/dashboard',  label: 'Dashboard',    icon: LayoutDashboard },
  { to: '/employee/leads',      label: 'My Leads',     icon: Users },
  { to: '/employee/follow-ups', label: 'Follow-ups',   icon: Calendar },
  { to: '/employee/tasks',      label: 'My Tasks',     icon: CheckSquare },
  { to: '/employee/packages',   label: 'Packages',     icon: Package },
  { to: '/employee/customers',  label: 'My Customers', icon: UserCheck },
  { to: '/employee/bookings',   label: 'My Bookings',  icon: BookOpen },
  { to: '/employee/targets',    label: 'My Targets',   icon: Target },
  { to: '/employee/settings',   label: 'Settings',     icon: Settings },
];

export default function EmployeeLayout() {
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
  useFollowUpNotifications();

  const notifications = notifData?.data ?? [];
  const filteredNotifications = notifCategory ? notifications.filter((n) => n.category === notifCategory) : notifications;
  const unreadCount = notifData?.meta?.unreadCount ?? 0;

  const pageTitle = navLinks.find((l) => location.pathname.startsWith(l.to))?.label ?? 'Employee';

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
          'fixed inset-y-0 left-0 z-30 w-64 bg-gradient-to-b from-mountain-900 to-mountain-800 flex flex-col transition-transform duration-300 lg:static lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex items-center gap-3 px-6 py-5 border-b border-mountain-700">
          <div className="w-9 h-9 bg-gradient-to-br from-mountain-400 to-primary-500 rounded-xl flex items-center justify-center flex-shrink-0">
            <Mountain className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="font-bold text-white text-sm">Travel CRM</p>
            <p className="text-mountain-300 text-xs">Trek & Pilgrimage</p>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="ml-auto lg:hidden text-mountain-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {navLinks.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all',
                  isActive
                    ? 'bg-mountain-600 text-white shadow-lg shadow-mountain-900/40'
                    : 'text-mountain-200 hover:bg-mountain-700 hover:text-white'
                )
              }
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>

        {user && (
          <div className="px-4 py-4 border-t border-mountain-700">
            <div className="flex items-center gap-3">
              <Avatar name={user.name} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-white truncate">{user.name}</p>
                <p className="text-xs text-mountain-400 truncate">{user.email}</p>
              </div>
              <button onClick={handleLogout} className="text-mountain-400 hover:text-red-400 transition-colors" title="Logout">
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
                          onClick={() => {
                            if (!n.isRead) markOneRead.mutate(n.id);
                            setNotifOpen(false);
                            if (n.leadId) navigate(`/employee/leads?id=${n.leadId}`);
                          }}
                          className={cn(
                            'px-4 py-3 border-b border-slate-100 last:border-0 transition-colors',
                            n.leadId && 'cursor-pointer',
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
                      <p className="text-xs text-mountain-600 font-medium mt-0.5">Employee</p>
                    </div>
                    <button
                      onClick={() => { setUserMenuOpen(false); navigate('/employee/settings'); }}
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
