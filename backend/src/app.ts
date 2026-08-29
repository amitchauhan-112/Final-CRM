import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

import routes from './routes/index.js';
import uploadsRoutes from './routes/uploads.routes.js';
import logger from './utils/logger.js';
import prisma from './lib/prisma.js';

const app = express();

// Trust Vercel's reverse proxy so rate limiting and IPs work correctly
app.set('trust proxy', 1);

// FRONTEND_URL can be a comma-separated list. Any *.vercel.app origin
// (including per-branch preview URLs) is additionally allowed automatically
// so preview deployments work without an env var update on every push. Once
// the frontend and backend share the same Vercel domain, most requests never
// hit this at all — it only matters for cross-project/preview cases.
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
app.use('/api/uploads', uploadsRoutes);

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

export default app;
