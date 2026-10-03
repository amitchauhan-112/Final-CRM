import axios from 'axios';
import toast from 'react-hot-toast';

const baseURL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api';

const api = axios.create({
  baseURL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true, // send httpOnly refresh cookie on /api/auth/* calls
});

// ─── Request: attach access token ────────────────────────────────────────────

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('crm_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ─── Response: silent token refresh on 401 ───────────────────────────────────

let isRefreshing = false;
let pendingQueue: Array<{ resolve: (token: string) => void; reject: (err: unknown) => void }> = [];

function flushQueue(token: string | null, error: unknown = null) {
  pendingQueue.forEach((p) => (token ? p.resolve(token) : p.reject(error)));
  pendingQueue = [];
}

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;

    // Not a 401, or already retried, or this IS the refresh call itself, or
    // this is a login attempt (a wrong-password 401 means "bad credentials",
    // not "expired token" — silently retrying it via refresh just swallows
    // the real error and leaves the login button spinning forever) — bail out
    if (
      err.response?.status !== 401 ||
      original._retry ||
      original.url?.includes('/auth/refresh') ||
      original.url?.includes('/auth/login')
    ) {
      if (err.response?.status >= 500) {
        toast.error('Server error. Please try again.');
      }
      return Promise.reject(err);
    }

    original._retry = true;

    if (isRefreshing) {
      // Another request is already refreshing — queue this one
      return new Promise((resolve, reject) => {
        pendingQueue.push({
          resolve: (token) => {
            original.headers.Authorization = `Bearer ${token}`;
            resolve(api(original));
          },
          reject,
        });
      });
    }

    isRefreshing = true;

    try {
      // Use plain axios (not the intercepted `api`) to avoid infinite loops
      const { data } = await axios.post(
        `${baseURL}/auth/refresh`,
        {},
        { withCredentials: true },
      );

      const newToken: string = data.data.token;
      localStorage.setItem('crm_token', newToken);
      api.defaults.headers.common.Authorization = `Bearer ${newToken}`;
      original.headers.Authorization = `Bearer ${newToken}`;

      flushQueue(newToken);
      return api(original);
    } catch (refreshErr) {
      flushQueue(null, refreshErr);
      localStorage.removeItem('crm_token');
      localStorage.removeItem('crm_user');
      window.location.href = '/login';
      return Promise.reject(refreshErr);
    } finally {
      isRefreshing = false;
    }
  },
);

export default api;
