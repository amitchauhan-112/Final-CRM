import { useState } from 'react';
import { Globe, MonitorSmartphone, MessageCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { cn, getWhatsAppOpenMode, setWhatsAppOpenMode, WhatsAppOpenMode } from '../../utils/helpers';

const OPTIONS: { mode: WhatsAppOpenMode; icon: typeof Globe; label: string; desc: string }[] = [
  { mode: 'web', icon: Globe, label: 'WhatsApp Web', desc: 'Opens in the browser — needs its own WhatsApp Web login/QR scan' },
  { mode: 'desktop', icon: MonitorSmartphone, label: 'WhatsApp Desktop App', desc: 'Opens the installed desktop app directly — no login needed, chat opens instantly' },
];

// Personal, per-device preference (saved in this browser, not on the
// server) for what the WhatsApp "Chat" buttons on leads open. See
// buildWhatsAppLink() in utils/helpers.ts for how it's used.
export default function WhatsAppOpenModeCard() {
  const [mode, setMode] = useState<WhatsAppOpenMode>(() => getWhatsAppOpenMode());

  const choose = (next: WhatsAppOpenMode) => {
    setWhatsAppOpenMode(next);
    setMode(next);
    toast.success(
      next === 'desktop'
        ? 'WhatsApp buttons will now open the Desktop app'
        : 'WhatsApp buttons will now open WhatsApp Web'
    );
  };

  return (
    <div className="card p-5">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-9 h-9 bg-green-100 rounded-xl flex items-center justify-center">
          <MessageCircle className="w-5 h-5 text-green-600" />
        </div>
        <div>
          <h3 className="font-semibold text-slate-900">WhatsApp Chat</h3>
          <p className="text-xs text-slate-500">Choose what the WhatsApp button on a lead opens on this device</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
        {OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const active = mode === opt.mode;
          return (
            <button
              key={opt.mode}
              type="button"
              onClick={() => choose(opt.mode)}
              className={cn(
                'text-left p-3.5 rounded-xl border transition-all',
                active ? 'border-primary-400 bg-primary-50 ring-1 ring-primary-300' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
              )}
            >
              <div className="flex items-center gap-2 mb-1">
                <Icon className={cn('w-4 h-4', active ? 'text-primary-600' : 'text-slate-400')} />
                <span className={cn('text-sm font-semibold', active ? 'text-primary-700' : 'text-slate-700')}>{opt.label}</span>
                {active && <span className="ml-auto text-[10px] font-semibold text-primary-600 bg-primary-100 px-1.5 py-0.5 rounded-full">Active</span>}
              </div>
              <p className="text-xs text-slate-500">{opt.desc}</p>
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-slate-400 mt-3">
        This is saved only in this browser on this device — set it again if you use the CRM from another computer.
        Desktop App mode needs WhatsApp Desktop actually installed here first.
      </p>
    </div>
  );
}
