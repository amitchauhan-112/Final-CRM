import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { useLeads } from './useLeads';
import type { Lead } from '../types/index';

export interface DueFollowUp {
  lead: Lead;
  timeLabel: string;
}

// Drives the in-app follow-up popup (see components/layout/FollowUpPopup.tsx)
// plus a native OS notification when the browser tab isn't focused/permission
// is granted — the popup is the primary, always-visible channel; the native
// notification is a bonus for when the user has switched away from the tab.
export function useFollowUpNotifications() {
  const { user, isAuthenticated } = useAuthStore();
  const notifiedIds = useRef<Set<string>>(new Set());
  const [dueQueue, setDueQueue] = useState<DueFollowUp[]>([]);

  // Request browser notification permission once
  useEffect(() => {
    if (!isAuthenticated) return;
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, [isAuthenticated]);

  const { data } = useLeads(
    user?.role === 'EMPLOYEE'
      ? { assignedToId: user.id, limit: 200 }
      : { limit: 200 },
  );

  useEffect(() => {
    if (!isAuthenticated) return;

    const leads = (data?.data ?? []).filter(
      (l) => l.followUpDate && !l.followUpDone,
    );

    const check = () => {
      const now = Date.now();
      const canBrowserNotif = 'Notification' in window && Notification.permission === 'granted';

      leads.forEach((lead) => {
        if (!lead.followUpDate) return;
        // Keyed by date, not just lead id — rescheduling (e.g. via the
        // follow-up outcome picker) must be eligible to pop again for its
        // new time, not stay permanently suppressed for the whole session
        // just because the lead already popped once for an earlier date.
        const dedupeKey = `${lead.id}:${lead.followUpDate}`;
        if (notifiedIds.current.has(dedupeKey)) return;
        const due = new Date(lead.followUpDate).getTime();

        // Fires right at the scheduled moment — not early. Still no upper
        // bound on lateness, so an already-overdue follow-up (the tab was
        // closed at the scheduled time) still pops the moment it's checked.
        if (due <= now) {
          notifiedIds.current.add(dedupeKey);
          const overdueMins = Math.round((now - due) / 60_000);
          const timeLabel = overdueMins < 1 ? 'now' : 'overdue';

          // In-app popup — the primary, always-visible channel (works even
          // without notification permission, and can't be missed the way a
          // toast or a background OS notification can).
          setDueQueue((q) => [...q, { lead, timeLabel }]);

          // Native OS notification — a bonus for when the tab isn't focused.
          if (canBrowserNotif) {
            try {
              const n = new Notification(`Follow-up: ${lead.name}`, {
                body: lead.followUpNotes
                  ? `${timeLabel} — ${lead.followUpNotes} · ${lead.phone}`
                  : `Follow up with ${lead.name} ${timeLabel} — ${lead.phone}`,
                icon: '/favicon.ico',
                tag: `followup-${lead.id}`,
                requireInteraction: true,
              });
              n.onclick = () => { window.focus(); n.close(); };
            } catch {
              // popup above already covers this lead — nothing further to do
            }
          }
        }
      });
    };

    check(); // check immediately when data loads
    // Checked every 5s (cheap — no network call, just scanning the already-
    // fetched lead list) so the popup fires within a few seconds of the
    // exact scheduled time instead of up to a full minute late.
    const intervalId = setInterval(check, 5_000);
    return () => clearInterval(intervalId);
  }, [data, isAuthenticated]);

  const dismissCurrent = () => setDueQueue((q) => q.slice(1));

  return { current: dueQueue[0] ?? null, remaining: dueQueue.length - 1, dismissCurrent };
}
