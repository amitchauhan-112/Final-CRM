import { Response } from 'express';
import fs from 'fs/promises';
import prisma from '../lib/prisma.js';
import { AuthenticatedRequest } from '../types/index.js';
import { UPLOAD_DIR_PATH } from '../middleware/upload.js';

// Uploads now live under per-category subfolders (vendor-documents,
// payment-proofs, ...) rather than one flat folder, so this walks one level
// of subfolders deep rather than just reading UPLOAD_DIR_PATH directly.
async function getUploadsDirSize(): Promise<number> {
  async function dirSize(dir: string): Promise<number> {
    let total = 0;
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      try {
        const full = `${dir}/${entry.name}`;
        if (entry.isDirectory()) total += await dirSize(full);
        else if (entry.isFile()) total += (await fs.stat(full)).size;
      } catch { /* file may have been removed mid-scan — skip */ }
    }
    return total;
  }
  try {
    return await dirSize(UPLOAD_DIR_PATH);
  } catch {
    return 0;
  }
}

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
      getUploadsDirSize(),
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
