import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { Mountain, Eye, EyeOff, Lock, Mail, ShieldCheck, ArrowRight, Quote } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import api from '../services/api';
import toast from 'react-hot-toast';

// Himalaya (Annapurna region, Nepal) — free to use under the Unsplash License.
// Photo by Iqx Azmi: https://unsplash.com/photos/PbCCnvId660
const HERO_PHOTO_URL = 'https://images.unsplash.com/photo-1640876522637-9432f175581f?w=1200&q=80&auto=format&fit=crop';

// Rotates automatically behind the branding panel — a small, positive touch
// while someone waits to sign in. Public-domain/well-known travel quotes.
const QUOTES: { text: string; author: string }[] = [
  { text: 'The mountains are calling and I must go.', author: 'John Muir' },
  { text: 'Not all those who wander are lost.', author: 'J.R.R. Tolkien' },
  { text: 'A journey of a thousand miles begins with a single step.', author: 'Lao Tzu' },
  { text: 'To travel is to live.', author: 'Hans Christian Andersen' },
  { text: 'Adventure is worthwhile in itself.', author: 'Amelia Earhart' },
  { text: 'The world is a book, and those who do not travel read only one page.', author: 'Saint Augustine' },
];

interface LoginForm {
  email: string;
  password: string;
}

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, isAuthenticated, user } = useAuthStore();
  const [showPassword, setShowPassword] = useState(false);
  const [showForgotHelp, setShowForgotHelp] = useState(false);
  const [quoteIndex, setQuoteIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setQuoteIndex((i) => (i + 1) % QUOTES.length), 6000);
    return () => clearInterval(id);
  }, []);

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
      {/* Left side - hero photo */}
      <div className="hidden lg:flex lg:w-1/2 bg-slate-900 relative overflow-hidden flex-col items-center justify-center p-12">
        {/* Hero photo */}
        <img
          src={HERO_PHOTO_URL}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          loading="eager"
        />
        {/* Dark gradient wash for text legibility over the photo */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900/90 via-primary-900/75 to-mountain-900/85" />

        {/* Ambient drifting gradient orbs */}
        <div className="absolute -top-24 -left-20 w-96 h-96 bg-primary-500/30 rounded-full blur-3xl animate-blob" />
        <div className="absolute top-1/3 -right-24 w-80 h-80 bg-mountain-500/30 rounded-full blur-3xl animate-blob" style={{ animationDelay: '5s' }} />
        <div className="absolute -bottom-24 left-1/4 w-96 h-96 bg-teal-400/20 rounded-full blur-3xl animate-blob" style={{ animationDelay: '10s' }} />

        <div className="relative z-10 text-center">
          <div className="relative w-20 h-20 mx-auto mb-6">
            <div className="absolute inset-0 bg-primary-400/50 rounded-3xl blur-xl animate-pulse" />
            <div className="relative w-20 h-20 bg-white/10 backdrop-blur-sm rounded-3xl flex items-center justify-center border border-white/20 shadow-xl">
              <Mountain className="w-10 h-10 text-white" />
            </div>
          </div>
          <h1 className="text-4xl font-black text-white mb-3 tracking-tight">Travel CRM</h1>
          <p className="text-xl text-primary-200 font-medium mb-2">Trek & Pilgrimage</p>
          <p className="text-slate-300 text-sm max-w-xs mx-auto">
            Manage your leads, campaigns, and team — all in one professional platform built for travel agencies.
          </p>

          {/* Auto-rotating quote */}
          <div className="mt-6 max-w-xs mx-auto min-h-[3.5rem] flex items-start justify-center gap-1.5">
            <Quote className="w-3.5 h-3.5 text-primary-300/70 flex-shrink-0 mt-0.5" />
            <p key={quoteIndex} className="text-slate-200 text-xs italic leading-relaxed animate-fade-in-up">
              "{QUOTES[quoteIndex].text}"
              <span className="block not-italic text-slate-400 text-[11px] mt-1">— {QUOTES[quoteIndex].author}</span>
            </p>
          </div>

          <div className="mt-6 grid grid-cols-3 gap-6 pt-6 border-t border-white/10">
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
      </div>

      {/* Right side - login form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 relative overflow-hidden bg-slate-50">
        {/* Soft ambient color, echoing the left panel without competing with the form */}
        <div className="absolute -top-32 -right-32 w-96 h-96 bg-primary-200/40 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -left-24 w-80 h-80 bg-mountain-200/30 rounded-full blur-3xl pointer-events-none" />

        <div className="w-full max-w-md relative z-10 animate-fade-in-up">
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

          <div className="card p-8 shadow-elevate-lg relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary-500 via-primary-400 to-mountain-500" />

            <div className="mb-6">
              <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-primary-700 bg-primary-50 px-2.5 py-1 rounded-full mb-3">
                <ShieldCheck className="w-3 h-3" /> Secure Sign-in
              </div>
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
                className="btn-primary w-full py-2.5 text-sm font-semibold mt-2 group"
              >
                {isSubmitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Signing in...
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-1.5">
                    Sign In
                    <ArrowRight className="w-4 h-4 transition-transform duration-200 ease-enterprise group-hover:translate-x-1" />
                  </span>
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
