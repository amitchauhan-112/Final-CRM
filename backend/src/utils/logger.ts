import winston from 'winston';
import path from 'path';

const logDir = 'logs';

// A raw Error (Axios errors especially - request/response objects reference
// each other) passed as log metadata can contain circular references, which
// crashes plain JSON.stringify. That crash previously took down the entire
// process from inside the logging call itself - this must never happen, so
// stringifying here is always safe regardless of what gets logged upstream.
function safeStringify(value: unknown): string {
  const seen = new WeakSet();
  try {
    return JSON.stringify(value, (_key, val) => {
      if (typeof val === 'object' && val !== null) {
        if (seen.has(val)) return '[Circular]';
        seen.add(val);
      }
      return val;
    });
  } catch {
    return '[Unserializable log metadata]';
  }
}

// Vercel's filesystem is read-only outside /tmp, so writing log files there
// crashes the whole function at import time. Vercel sets VERCEL=1 in every
// deployment's runtime — file transports only make sense on EC2, where a
// persistent volume exists; the console transport alone is sufficient on
// Vercel since it already captures stdout/stderr as runtime logs.
const transports: winston.transport[] = [
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.printf(({ timestamp, level, message, ...meta }) => {
        return `${timestamp} [${level}]: ${message} ${Object.keys(meta).length ? safeStringify(meta) : ''}`;
      })
    ),
  }),
];

if (!process.env.VERCEL) {
  transports.push(
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
    }),
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
    }),
  );
}

const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports,
});

export default logger;
