import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { Mountain, Eye, EyeOff, Lock, Mail } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import api from '../services/api';
import toast from 'react-hot-toast';

interface LoginForm {
  email: string;
  password: string;
}

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, isAuthenticated, user } = useAuthStore();
  const [showPassword, setShowPassword] = useState(false);
  const [showForgotHelp, setShowForgotHelp] = useState(false);

  // Redirect if already logged in
  if (isAuthenticated && user) {
    if (user.role === 'ADMIN') navigate('/admin/dashboard', { replace: true });
    else if (user.role === 'OPERATIONS') navigate('/operations/dashboard', { replace: true });
    else if (user.role === 'FINANCE') navigate('/finance/dashboard', { replace: true });
    else navigate('/employee/dashboard', { replace: true });
  }

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>();

  const onSubmit = async (data: LoginForm) => {
    try {
      const res = await api.post('/auth/login', data);
      const { user: userData, token } = res.data.data;
      login(userData, token);
      toast.success(`Welcome back, ${userData.name}!`);
      if (userData.role === 'ADMIN') navigate('/admin/dashboard');
      else if (userData.role === 'OPERATIONS') navigate('/operations/dashboard');
      else if (userData.role === 'FINANCE') navigate('/finance/dashboard');
      else navigate('/employee/dashboard');
    } catch (err: any) {
      // Backend sends the message under `error`, not `message` — this was
      // silently always falling through to the generic fallback text below.
      toast.error(err?.response?.data?.error || 'Incorrect email or password. Please try again.');
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left side - gradient */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-slate-900 via-primary-900 to-mountain-900 relative overflow-hidden flex-col items-center justify-center p-12">
        {/* Background pattern */}
        <div className="absolute inset-0 opacity-10">
          <svg width="100%" height="100%">
            <defs>
              <pattern id="mountains" x="0" y="0" width="120" height="80" patternUnits="userSpaceOnUse">
                <polygon points="0,80 60,20 120,80" fill="white" opacity="0.3" />
                <polygon points="20,80 80,10 140,80" fill="white" opacity="0.2" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#mountains)" />
          </svg>
        </div>

        <div className="relative z-10 text-center">
          <div className="w-20 h-20 bg-white/10 backdrop-blur-sm rounded-3xl flex items-center justify-center mx-auto mb-6 border border-white/20">
            <Mountain className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-4xl font-black text-white mb-3">Travel CRM</h1>
          <p className="text-xl text-primary-200 font-medium mb-2">Trek & Pilgrimage</p>
          <p className="text-slate-300 text-sm max-w-xs">
            Manage your leads, campaigns, and team — all in one professional platform built for travel agencies.
          </p>

          <div className="mt-10 grid grid-cols-3 gap-6">
            {[
              { label: 'Leads Managed', value: '10K+' },
              { label: 'Campaigns', value: '500+' },
              { label: 'Bookings', value: '2K+' },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <p className="text-2xl font-bold text-white">{stat.value}</p>
                <p className="text-xs text-slate-400 mt-1">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Floating cards */}
        <div className="absolute bottom-12 left-8 bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl p-3 max-w-[180px]">
          <p className="text-white text-xs font-medium">New lead from Instagram</p>
          <p className="text-slate-300 text-xs mt-0.5">Kedarnath Yatra - 4 pax</p>
        </div>
        <div className="absolute top-1/4 right-8 bg-green-500/20 backdrop-blur-sm border border-green-400/30 rounded-xl p-3 max-w-[180px]">
          <p className="text-green-200 text-xs font-medium">Booking Confirmed!</p>
          <p className="text-slate-300 text-xs mt-0.5">Manaslu Circuit - 6 pax</p>
        </div>
      </div>

      {/* Right side - login form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 bg-slate-50">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="flex items-center gap-3 mb-8 lg:hidden">
            <div className="w-10 h-10 bg-gradient-to-br from-primary-500 to-mountain-600 rounded-xl flex items-center justify-center">
              <Mountain className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="font-bold text-slate-900">Travel CRM</p>
              <p className="text-xs text-slate-500">Trek & Pilgrimage</p>
            </div>
          </div>

          <div className="card p-8">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-slate-900">Welcome back</h2>
              <p className="text-slate-500 text-sm mt-1">Sign in to your account to continue</p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <label className="label">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    {...register('email', {
                      required: 'Email is required',
                      pattern: {
                        value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                        message: 'Enter a valid email address',
                      },
                    })}
                    type="email"
                    className="input pl-9"
                    placeholder="you@example.com"
                    autoComplete="email"
                  />
                </div>
                {errors.email && (
                  <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>
                )}
              </div>

              <div>
                <label className="label">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    {...register('password', { required: 'Password is required' })}
                    type={showPassword ? 'text' : 'password'}
                    className="input pl-9 pr-10"
                    placeholder="••••••••"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {errors.password && (
                  <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>
                )}
              </div>

              <div className="flex justify-end -mt-1">
                <button
                  type="button"
                  onClick={() => setShowForgotHelp((v) => !v)}
                  className="text-xs font-medium text-primary-600 hover:text-primary-700"
                >
                  Forgot password?
                </button>
              </div>

              {showForgotHelp && (
                <div className="flex items-start gap-2 px-3 py-2.5 bg-primary-50 border border-primary-200 rounded-xl text-xs text-primary-700">
                  <Lock className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                  <span>Passwords can only be reset by your administrator — ask them to reset it for you from Organization &gt; Employees.</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="btn-primary w-full py-2.5 text-sm font-semibold mt-2"
              >
                {isSubmitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Signing in...
                  </span>
                ) : (
                  'Sign In'
                )}
              </button>
            </form>

            <p className="text-center text-xs text-slate-400 mt-6">
              Contact your administrator to create an account
            </p>
          </div>

          <p className="text-center text-xs text-slate-400 mt-4">
            Travel CRM &copy; {new Date().getFullYear()} · Trek & Pilgrimage
          </p>
        </div>
      </div>
    </div>
  );
}
