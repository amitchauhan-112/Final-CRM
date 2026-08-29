import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cron from 'node-cron';
import jwt from 'jsonwebtoken';
import path from 'path';

import routes from './routes/index.js';
import { setSocketServer, sendFollowUpReminders, sendOperationsReminders, updateDepartureStatuses, sendFinanceReminders } from './services/notification.service.js';
import { runMetaSync } from './services/metaSync.service.js';
import { runTrackedJob } from './services/jobTracker.service.js';
import { processDueAutomationExecutions } from './services/automationEngine.service.js';
import logger from './utils/logger.js';
import { JWTPayload } from './types/index.js';
import prisma from './lib/prisma.js';
import { UPLOAD_DIR_PATH } from './middleware/upload.js';

const app = express();
const httpServer = createServer(app);

// Trust Railway / Vercel reverse proxy so rate limiting and IPs work correctly
app.set('trust proxy', 1);

// FRONTEND_URL can be a comma-separated list (e.g. the production domain
// plus a Vercel deployment) — any *.vercel.app origin (including Vercel's
// per-branch preview URLs) is additionally allowed automatically so preview
// deployments work without an env var update on every push.
const allowedOrigins = [
  ...(process.env.FRONTEND_URL?.split(',').map((s) => s.trim()).filter(Boolean) ?? []),
  'http://localhost:5173',
  'http://localhost:4173',
];

function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return true; // non-browser requests (curl, server-to-server, mobile apps)
  if (allowedOrigins.includes(origin)) return true;
  try {
    return new URL(origin).hostname.endsWith('.vercel.app');
  } catch {
    return false;
  }
}

const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => callback(null, isOriginAllowed(origin)),
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

setSocketServer(io);

app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      connectSrc: ["'self'", ...allowedOrigins],
    },
  },
}));
app.use(cors({
  origin: (origin, callback) => callback(null, isOriginAllowed(origin)),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(cookieParser());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(morgan('combined', { stream: { write: (msg) => logger.info(msg.trim()) } }));

// General API rate limit
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false });
app.use('/api', limiter);

// Strict auth rate limit — prevents brute-force login attacks
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false,
  message: { success: false, error: 'Too many login attempts — try again in 15 minutes' },
});
app.use('/api/auth/login', authLimiter);

// Traveler Portal — the app's only unauthenticated data-bearing surface, so
// it gets a tighter limit than the general API even though the token itself
// is a 192-bit random value (effectively unguessable on its own).
const portalLimiter = rateLimit({ windowMs: 5 * 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false,
  message: { success: false, error: 'Too many requests — please try again in a few minutes' },
});
app.use('/api/portal', portalLimiter);

app.use('/api', routes);
app.use('/api/uploads', express.static(UPLOAD_DIR_PATH));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), service: 'Travel CRM API' });
});

// Global error handler — must be registered after all routes. Only 500-level
// responses get persisted to ErrorLog (powers System Health's Recent Errors
// widget); this never throws itself, so a logging failure can't take down
// the response.
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const statusCode = (err as { statusCode?: number; status?: number }).statusCode ?? (err as { status?: number }).status ?? 500;
  logger.error(`Unhandled error: ${err.message}`, { stack: err.stack, path: req.path, method: req.method });
  if (statusCode >= 500) {
    const userId = (req as unknown as { user?: { id?: string } }).user?.id;
    prisma.errorLog.create({
      data: { message: err.message, stack: err.stack, path: req.path, method: req.method, statusCode, userId },
    }).catch(() => {});
  }
  res.status(statusCode).json({ success: false, error: statusCode >= 500 ? 'Internal server error' : err.message });
});

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('Authentication error'));
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as JWTPayload;
    (socket as Record<string, unknown> & typeof socket).user = decoded;
    next();
  } catch {
    next(new Error('Invalid token'));
  }
});

io.on('connection', (socket) => {
  const user = (socket as Record<string, unknown> & typeof socket).user as JWTPayload;
  logger.info(`Socket connected: ${user.name} (${user.id})`);
  socket.join(`user:${user.id}`);
  if (user.role === 'ADMIN') socket.join('admin');
  if (user.role === 'OPERATIONS') socket.join('operations');
  if (user.role === 'FINANCE') socket.join('finance');

  socket.on('disconnect', () => {
    logger.info(`Socket disconnected: ${user.name}`);
  });
});

cron.schedule('*/30 * * * *', async () => {
  logger.info('Running follow-up reminder check...');
  await runTrackedJob('follow-up-reminders', sendFollowUpReminders);
});

cron.schedule('*/30 * * * *', async () => {
  logger.info('Running operations reminder check...');
  await runTrackedJob('operations-reminders', async () => {
    await updateDepartureStatuses();
    await sendOperationsReminders();
  });
});

cron.schedule('*/30 * * * *', async () => {
  logger.info('Running finance reminder check...');
  await runTrackedJob('finance-reminders', sendFinanceReminders);
});

cron.schedule('* * * * *', async () => {
  logger.info('Running Meta campaign sync...');
  await runTrackedJob('meta-campaign-sync', runMetaSync);
});

cron.schedule('*/5 * * * *', async () => {
  await runTrackedJob('automation-execution-sweep', processDueAutomationExecutions);
});

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  logger.info(`Travel CRM API running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

export { io };
