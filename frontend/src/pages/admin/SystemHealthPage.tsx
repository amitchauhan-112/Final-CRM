import { Database, Bell, HardDrive, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { useSystemHealth } from '../../hooks/useSystemHealth';
import { Skeleton } from '../../components/ui/Skeleton';
import { formatRelativeTime, cn } from '../../utils/helpers';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default function SystemHealthPage() {
  const { data, isLoading } = useSystemHealth();
  const health = data?.data;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="page-title">System Health</h2>
        <p className="text-sm text-slate-500 mt-0.5">Background jobs, notifications, database, storage, and recent errors</p>
      </div>

      {isLoading || !health ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="card p-4">
              <div className="flex items-center gap-2 mb-1">
                <Database className={cn('w-4 h-4', health.database.connected ? 'text-emerald-600' : 'text-red-600')} />
                <p className="text-xs text-slate-400">Database</p>
              </div>
              <p className={cn('text-lg font-bold', health.database.connected ? 'text-emerald-600' : 'text-red-600')}>
                {health.database.connected ? `Connected (${health.database.pingMs}ms)` : 'Disconnected'}
              </p>
            </div>
            <div className="card p-4">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="w-4 h-4 text-red-500" />
                <p className="text-xs text-slate-400">Failed Jobs (24h)</p>
              </div>
              <p className="text-lg font-bold text-slate-800">{health.failedJobs24h}</p>
            </div>
            <div className="card p-4">
              <div className="flex items-center gap-2 mb-1">
                <Bell className="w-4 h-4 text-amber-500" />
                <p className="text-xs text-slate-400">Notifications Pending</p>
              </div>
              <p className="text-lg font-bold text-slate-800">{health.notificationsPending}</p>
            </div>
            <div className="card p-4">
              <div className="flex items-center gap-2 mb-1">
                <HardDrive className="w-4 h-4 text-slate-400" />
                <p className="text-xs text-slate-400">Storage Used</p>
              </div>
              <p className="text-lg font-bold text-slate-800">{formatBytes(health.storageUsedBytes)}</p>
            </div>
          </div>

          <div className="card p-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Background Jobs (24h)</h3>
            {health.jobs.length === 0 ? (
              <p className="text-sm text-slate-400">No job runs recorded yet</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase">Job</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase">Success</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase">Failed</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase">Last Run</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {health.jobs.map((j) => (
                      <tr key={j.jobName}>
                        <td className="px-3 py-2 font-medium text-slate-700">{j.jobName}</td>
                        <td className="px-3 py-2 text-emerald-600">{j.success}</td>
                        <td className="px-3 py-2">{j.failed > 0 ? <span className="text-red-600 font-semibold">{j.failed}</span> : '0'}</td>
                        <td className="px-3 py-2 text-slate-400">{j.lastRun ? formatRelativeTime(j.lastRun) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card p-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Recent Errors</h3>
            {health.recentErrors.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-emerald-600">
                <CheckCircle2 className="w-4 h-4" />No recent errors
              </div>
            ) : (
              <div className="space-y-2">
                {health.recentErrors.map((e) => (
                  <div key={e.id} className="flex items-start gap-2 text-sm border-b border-slate-100 last:border-0 pb-2 last:pb-0">
                    <XCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-slate-700 truncate">{e.message}</p>
                      <p className="text-xs text-slate-400">
                        {e.method} {e.path} {e.statusCode ? `· ${e.statusCode}` : ''} · {formatRelativeTime(e.createdAt)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
