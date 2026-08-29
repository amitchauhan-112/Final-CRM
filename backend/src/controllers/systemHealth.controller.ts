import { Response } from 'express';
import prisma from '../lib/prisma.js';
import { AuthenticatedRequest } from '../types/index.js';
import { getStorageUsageBytes } from '../middleware/upload.js';

// ─── GET /system/health ───────────────────────────────────────────────────────
// Job history (ScheduledJobRun, tracked since the Business Rules phase),
// pending notifications, a DB round-trip ping, best-effort uploads storage
// size, and recent 500-level errors (ErrorLog, populated by the global
// Express error handler). Not full APM/tracing — a lightweight, honest view.
export const getSystemHealth = async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const dbPingStart = Date.now();
    let dbConnected = true;
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      dbConnected = false;
    }
    const dbPingMs = Date.now() - dbPingStart;

    const [jobRuns, notificationsPending, recentErrors, uploadsSizeBytes] = await Promise.all([
      prisma.scheduledJobRun.findMany({ where: { createdAt: { gte: since24h } }, select: { jobName: true, status: true, startedAt: true } }),
      prisma.notification.count({ where: { isRead: false } }),
      prisma.errorLog.findMany({ orderBy: { createdAt: 'desc' }, take: 20 }),
      getStorageUsageBytes().catch(() => 0),
    ]);

    const jobSummary: Record<string, { success: number; failed: number; running: number; lastRun: Date | null }> = {};
    for (const run of jobRuns) {
      if (!jobSummary[run.jobName]) jobSummary[run.jobName] = { success: 0, failed: 0, running: 0, lastRun: null };
      const s = jobSummary[run.jobName];
      if (run.status === 'SUCCESS') s.success += 1;
      else if (run.status === 'FAILED') s.failed += 1;
      else s.running += 1;
      if (!s.lastRun || run.startedAt > s.lastRun) s.lastRun = run.startedAt;
    }

    res.json({
      success: true,
      data: {
        database: { connected: dbConnected, pingMs: dbPingMs },
        jobs: Object.entries(jobSummary).map(([jobName, s]) => ({ jobName, ...s })),
        failedJobs24h: jobRuns.filter((r) => r.status === 'FAILED').length,
        notificationsPending,
        storageUsedBytes: uploadsSizeBytes,
        recentErrors,
      },
    });
  } catch (e) {
    console.error('[system] getSystemHealth error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};
