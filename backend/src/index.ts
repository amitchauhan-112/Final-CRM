// Local-dev entry point only. In production (Vercel), app.ts's Express app
// is wrapped by api/index.ts via serverless-http instead of listening on a
// port here — scheduled jobs also move to api/cron/*.ts, triggered by an
// external scheduler, since nothing can run a persistent process/cron loop
// on serverless.
import app from './app.js';
import logger from './utils/logger.js';

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  logger.info(`Travel CRM API running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
