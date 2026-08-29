// Shared helper for the api/cron/* routes. Not itself a route — Vercel
// excludes files whose name starts with "_" from routing.
//
// These routes replace the node-cron jobs that used to run inside the
// backend's long-running process (see backend/src/index.ts, pre-migration) —
// serverless functions can't host a persistent scheduler, so an external
// scheduler (cron-job.org / GitHub Actions) hits each of these on the
// original cadence instead, authenticated by a shared secret.
export function isAuthorizedCronRequest(req: any): boolean {
  const provided = req.headers?.['x-cron-secret'] ?? req.query?.secret;
  const expected = process.env.CRON_SECRET;
  return !!expected && provided === expected;
}
