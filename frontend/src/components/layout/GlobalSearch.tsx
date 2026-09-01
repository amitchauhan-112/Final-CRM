import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X, UserCheck, BookOpen, IndianRupee, Package, Building2, Truck, Contact, Users2, LucideIcon } from 'lucide-react';
import { useGlobalSearch } from '../../hooks/useGlobalSearch';
import { SearchResults } from '../../types/index';

const SECTIONS: { key: keyof SearchResults; label: string; icon: LucideIcon }[] = [
  { key: 'leads', label: 'Customers / Leads', icon: UserCheck },
  { key: 'bookings', label: 'Bookings', icon: BookOpen },
  { key: 'payments', label: 'Payments', icon: IndianRupee },
  { key: 'packages', label: 'Packages', icon: Package },
  { key: 'hotels', label: 'Hotels', icon: Building2 },
  { key: 'vehicles', label: 'Vehicles', icon: Truck },
  { key: 'vendors', label: 'Vendors', icon: Contact },
  { key: 'users', label: 'Employees', icon: Users2 },
  { key: 'travelers', label: 'Traveller Records', icon: UserCheck },
];

export default function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data, isFetching } = useGlobalSearch(query);
  const results = data?.data ?? {};

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const goTo = (path: string) => {
    setOpen(false);
    setQuery('');
    navigate(path);
  };

  const renderRow = (key: string, item: any) => {
    switch (key) {
      case 'leads':
        return <button key={item.id} onClick={() => goTo(`/admin/leads?id=${item.id}`)} className="w-full text-left px-3 py-2 hover:bg-slate-50 rounded-lg"><p className="text-sm font-medium text-slate-800">{item.name}</p><p className="text-xs text-slate-400">{item.phone} · {item.status}</p></button>;
      case 'bookings':
        return <button key={item.id} onClick={() => goTo(`/admin/leads?id=${item.leadId}`)} className="w-full text-left px-3 py-2 hover:bg-slate-50 rounded-lg"><p className="text-sm font-medium text-slate-800">{item.travelerName}</p><p className="text-xs text-slate-400">{item.bookingNumber ?? item.id.slice(0, 8)}</p></button>;
      case 'payments':
        return <button key={item.id} onClick={() => goTo('/admin/finance/verification')} className="w-full text-left px-3 py-2 hover:bg-slate-50 rounded-lg"><p className="text-sm font-medium text-slate-800">₹{item.amount.toLocaleString()}</p><p className="text-xs text-slate-400">{item.reference ?? item.receiptNo ?? 'No reference'}</p></button>;
      case 'packages':
        return <button key={item.id} onClick={() => goTo('/admin/packages')} className="w-full text-left px-3 py-2 hover:bg-slate-50 rounded-lg"><p className="text-sm font-medium text-slate-800">{item.name}</p><p className="text-xs text-slate-400">Package</p></button>;
      case 'hotels':
        return <button key={item.id} onClick={() => goTo(`/admin/operations/departures/${item.departureId}`)} className="w-full text-left px-3 py-2 hover:bg-slate-50 rounded-lg"><p className="text-sm font-medium text-slate-800">{item.name}</p><p className="text-xs text-slate-400">View trip</p></button>;
      case 'vehicles':
        return <button key={item.id} onClick={() => goTo(`/admin/operations/departures/${item.departureId}`)} className="w-full text-left px-3 py-2 hover:bg-slate-50 rounded-lg"><p className="text-sm font-medium text-slate-800">{item.vehicleNumber ?? item.driverName ?? 'Vehicle'}</p><p className="text-xs text-slate-400">View trip</p></button>;
      case 'vendors':
        return <button key={item.id} onClick={() => goTo(`/admin/operations/vendors/${item.id}`)} className="w-full text-left px-3 py-2 hover:bg-slate-50 rounded-lg"><p className="text-sm font-medium text-slate-800">{item.name}</p><p className="text-xs text-slate-400">{item.type}</p></button>;
      case 'users':
        return <button key={item.id} onClick={() => goTo('/admin/organization')} className="w-full text-left px-3 py-2 hover:bg-slate-50 rounded-lg"><p className="text-sm font-medium text-slate-800">{item.name}</p><p className="text-xs text-slate-400">{item.email} · {item.role}</p></button>;
      case 'travelers':
        return <button key={item.id} onClick={() => item.departureId ? goTo(`/admin/operations/departures/${item.departureId}`) : undefined} className="w-full text-left px-3 py-2 hover:bg-slate-50 rounded-lg"><p className="text-sm font-medium text-slate-800">{item.name}</p><p className="text-xs text-slate-400">Traveller</p></button>;
      default:
        return null;
    }
  };

  const hasAnyResults = SECTIONS.some((s) => (results as any)[s.key]?.length > 0);

  return (
    <div ref={ref} className="relative">
      {!open ? (
        <button onClick={() => setOpen(true)} className="p-2 rounded-xl hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors">
          <Search className="w-5 h-5" />
        </button>
      ) : (
        <div className="fixed inset-x-2 top-14 sm:absolute sm:inset-x-auto sm:top-0 sm:right-0 sm:w-96 z-50">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100">
              <Search className="w-4 h-4 text-slate-400 flex-shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search customers, bookings, packages, vendors..."
                className="flex-1 text-sm outline-none"
              />
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto scrollbar-thin p-2">
              {query.trim().length < 2 ? (
                <p className="text-center text-sm text-slate-400 py-6">Type at least 2 characters to search</p>
              ) : isFetching ? (
                <p className="text-center text-sm text-slate-400 py-6">Searching…</p>
              ) : !hasAnyResults ? (
                <p className="text-center text-sm text-slate-400 py-6">No results for "{query}"</p>
              ) : (
                SECTIONS.map((s) => {
                  const items = (results as any)[s.key] as any[] | undefined;
                  if (!items || items.length === 0) return null;
                  const Icon = s.icon;
                  return (
                    <div key={s.key} className="mb-2 last:mb-0">
                      <div className="flex items-center gap-1.5 px-3 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
                        <Icon className="w-3 h-3" />{s.label}
                      </div>
                      {items.map((item) => renderRow(s.key, item))}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
