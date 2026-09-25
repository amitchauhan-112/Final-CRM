import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/authStore';

const IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'wheel'] as const;
// mousemove/scroll fire constantly — only rearm the idle timer at most once
// per second, so a passive mouse-over-the-window doesn't churn timers.
const THROTTLE_MS = 1000;

// Logs the user out after IDLE_TIMEOUT_MS of no keyboard/mouse/touch/scroll
// activity anywhere in the app, across every role (Admin/Employee/
// Operations/Finance/Trip Captain) — mounted once at the App root so it
// covers every route without each Layout needing its own copy.
export function useIdleLogout() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastResetRef = useRef(0);

  useEffect(() => {
    if (!isAuthenticated) return;

    const handleIdle = () => {
      logout().finally(() => {
        toast('Logged out after 15 minutes of inactivity', { icon: '⏱️' });
        navigate('/login', { replace: true });
      });
    };

    const armTimer = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(handleIdle, IDLE_TIMEOUT_MS);
    };

    const resetOnActivity = () => {
      const now = Date.now();
      if (now - lastResetRef.current < THROTTLE_MS) return;
      lastResetRef.current = now;
      armTimer();
    };

    armTimer();
    ACTIVITY_EVENTS.forEach((event) => window.addEventListener(event, resetOnActivity, { passive: true }));

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, resetOnActivity));
    };
  }, [isAuthenticated, logout, navigate]);
}
