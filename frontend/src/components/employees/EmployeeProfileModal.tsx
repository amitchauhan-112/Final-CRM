import { X, Phone, Mail, Calendar, TrendingUp, Target, CheckCircle, XCircle, AlertCircle, Clock } from 'lucide-react';
import { useEmployeeProfile, useUpdateAvailability } from '../../hooks/useEmployeeProfile';
import { useAuthStore } from '../../store/authStore';
import { AvailabilityStatus } from '../../types/index';
import AvailabilityBadge from '../ui/AvailabilityBadge';
import Avatar from '../ui/Avatar';
import { formatDate, formatRelativeTime } from '../../utils/helpers';
import { SkeletonCard } from '../ui/Skeleton';
import toast from 'react-hot-toast';

const AVAILABILITY_OPTIONS: { value: AvailabilityStatus; label: string }[] = [
  { value: 'AVAILABLE', label: 'Available' },
  { value: 'BUSY', label: 'Busy' },
  { value: 'OFFLINE', label: 'Offline' },
];

interface Props {
  employeeId: string | null;
  onClose: () => void;
}

function StatBox({ icon: Icon, label, value, color }: { icon: any; label: string; value: number | string; color: string }) {
  return (
    <div className={`rounded-xl p-3 border ${color}`}>
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-4 h-4 opacity-70" />
        <span className="text-xs font-medium opacity-70">{label}</span>
      </div>
      <p className="text-xl font-bold">{value}</p>
    </div>
  );
}

export default function EmployeeProfileModal({ employeeId, onClose }: Props) {
  const { user: currentUser } = useAuthStore();
  const { data: profile, isLoading } = useEmployeeProfile(employeeId);
  const updateAvailability = useUpdateAvailability();
  const isAdmin = currentUser?.role === 'ADMIN';
  const isSelf = currentUser?.id === employeeId;

  if (!employeeId) return null;

  const handleAvailabilityChange = async (avail: AvailabilityStatus) => {
    try {
      await updateAvailability.mutateAsync({ id: employeeId, availability: avail });
      toast.success('Availability updated');
    } catch {
      toast.error('Failed to update availability');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full sm:max-w-2xl bg-white sm:rounded-2xl shadow-2xl flex flex-col max-h-[95vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
          <h3 className="font-bold text-slate-900">Employee Profile</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {isLoading ? (
            <div className="space-y-3">
              <SkeletonCard />
              <SkeletonCard />
            </div>
          ) : !profile ? (
            <p className="text-center text-slate-400 py-8">Employee not found</p>
          ) : (
            <>
              {/* Profile info */}
              <div className="flex items-start gap-4">
                <Avatar name={profile.name} size="lg" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="font-bold text-slate-900 text-lg">{profile.name}</h4>
                      <p className="text-sm text-slate-500 capitalize">{profile.role.toLowerCase()}</p>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${profile.isActive ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                      {profile.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  <div className="mt-2 space-y-1">
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <Mail className="w-3.5 h-3.5 text-slate-400" />
                      {profile.email}
                    </div>
                    {profile.phone && (
                      <div className="flex items-center gap-2 text-sm text-slate-600">
                        <Phone className="w-3.5 h-3.5 text-slate-400" />
                        {profile.phone}
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      Joined {formatDate(profile.createdAt)}
                    </div>
                    {profile.lastLogin && (
                      <div className="flex items-center gap-2 text-sm text-slate-500">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        Last active {formatRelativeTime(profile.lastLogin)}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Availability */}
              <div className="card p-4">
                <p className="text-sm font-semibold text-slate-700 mb-3">Availability</p>
                {(isAdmin || isSelf) ? (
                  <div className="flex flex-wrap gap-2">
                    {AVAILABILITY_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => handleAvailabilityChange(opt.value)}
                        disabled={updateAvailability.isPending}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-sm font-medium transition-all ${
                          profile.availability === opt.value
                            ? 'bg-primary-50 border-primary-300 text-primary-700'
                            : 'border-slate-200 text-slate-600 hover:border-slate-300'
                        }`}
                      >
                        <AvailabilityBadge status={opt.value} showLabel={false} size="xs" />
                        {opt.label}
                      </button>
                    ))}
                  </div>
                ) : (
                  <AvailabilityBadge status={profile.availability} />
                )}
              </div>

              {/* Stats grid */}
              <div>
                <p className="text-sm font-semibold text-slate-700 mb-3">Performance</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <StatBox icon={Target} label="Total Leads" value={profile.stats.total} color="bg-slate-50 border-slate-200 text-slate-700" />
                  <StatBox icon={CheckCircle} label="Confirmed" value={profile.stats.confirmed} color="bg-green-50 border-green-200 text-green-700" />
                  <StatBox icon={XCircle} label="Lost" value={profile.stats.lost} color="bg-red-50 border-red-200 text-red-700" />
                  <StatBox icon={Clock} label="Pending" value={profile.stats.pending} color="bg-primary-50 border-primary-200 text-primary-700" />
                  <StatBox icon={AlertCircle} label="Overdue" value={profile.stats.overdue} color="bg-orange-50 border-orange-200 text-orange-700" />
                  <StatBox icon={TrendingUp} label="Conv. Rate" value={`${profile.stats.conversionRate}%`} color="bg-primary-50 border-primary-200 text-primary-700" />
                </div>
              </div>

              {/* Assigned campaigns */}
              {profile.campaignAssignments.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-slate-700 mb-3">Campaigns ({profile.campaignAssignments.length})</p>
                  <div className="space-y-2">
                    {profile.campaignAssignments.map((ca) => (
                      <div key={ca.id} className="flex items-center justify-between px-3 py-2 bg-slate-50 rounded-xl border border-slate-100">
                        <div>
                          <p className="text-sm font-medium text-slate-800">{ca.campaign.name}</p>
                          <p className="text-xs text-slate-500">{ca.campaign.destination}</p>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          ca.campaign.status === 'ACTIVE' ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-500'
                        }`}>
                          {ca.campaign.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recent activity */}
              {profile.activityLogs.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-slate-700 mb-3">Recent Activity</p>
                  <div className="space-y-1.5">
                    {profile.activityLogs.slice(0, 8).map((log) => (
                      <div key={log.id} className="flex items-start gap-2.5 py-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary-400 mt-2 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-slate-700">
                            <span className="font-medium">{log.action}</span>
                            {log.lead && <span className="text-slate-500"> — {log.lead.name}</span>}
                          </p>
                          <p className="text-xs text-slate-400">{formatRelativeTime(log.createdAt)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
