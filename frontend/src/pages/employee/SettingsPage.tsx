import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Lock } from 'lucide-react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../store/authStore';
import WhatsAppOpenModeCard from '../../components/settings/WhatsAppOpenModeCard';

interface ChangePasswordForm {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export default function EmployeeSettingsPage() {
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordForm>();

  const newPw = watch('newPassword');

  const onSubmit = async (data: ChangePasswordForm) => {
    try {
      await api.put('/auth/change-password', {
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      });
      toast.success('Password changed. Please log in again.');
      reset();
      await logout();
      navigate('/login');
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err?.response?.data?.message || 'Failed to change password');
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Settings</h2>
        <p className="text-sm text-slate-500 mt-0.5">Manage your account settings</p>
      </div>

      <div className="card p-5">
        <h3 className="font-semibold text-slate-900 mb-4">Account Information</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Name</label>
            <input value={user?.name ?? ''} readOnly className="input bg-slate-50 cursor-not-allowed" />
          </div>
          <div>
            <label className="label">Email</label>
            <input value={user?.email ?? ''} readOnly className="input bg-slate-50 cursor-not-allowed" />
          </div>
        </div>
      </div>

      <WhatsAppOpenModeCard />

      <div className="card p-5">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 bg-mountain-100 rounded-xl flex items-center justify-center">
            <Lock className="w-5 h-5 text-mountain-600" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900">Change Password</h3>
            <p className="text-xs text-slate-500">Update your account password</p>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 max-w-md">
          <div>
            <label className="label">Current Password</label>
            <div className="relative">
              <input
                {...register('currentPassword', { required: 'Required' })}
                type={showCurrent ? 'text' : 'password'}
                className="input pr-10"
                placeholder="••••••••"
              />
              <button type="button" onClick={() => setShowCurrent(!showCurrent)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {errors.currentPassword && <p className="text-red-500 text-xs mt-1">{errors.currentPassword.message}</p>}
          </div>

          <div>
            <label className="label">New Password</label>
            <div className="relative">
              <input
                {...register('newPassword', { required: 'Required', minLength: { value: 8, message: 'Minimum 8 characters' } })}
                type={showNew ? 'text' : 'password'}
                className="input pr-10"
                placeholder="Minimum 8 characters"
              />
              <button type="button" onClick={() => setShowNew(!showNew)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {errors.newPassword && <p className="text-red-500 text-xs mt-1">{errors.newPassword.message}</p>}
          </div>

          <div>
            <label className="label">Confirm New Password</label>
            <input
              {...register('confirmPassword', {
                required: 'Required',
                validate: (v) => v === newPw || 'Passwords do not match',
              })}
              type="password"
              className="input"
              placeholder="Repeat new password"
            />
            {errors.confirmPassword && <p className="text-red-500 text-xs mt-1">{errors.confirmPassword.message}</p>}
          </div>

          <button type="submit" disabled={isSubmitting} className="btn-primary">
            {isSubmitting ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </div>
    </div>
  );
}
