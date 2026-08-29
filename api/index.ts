import app from '../backend/src/app.js';

// Wraps the existing Express app (all 32 route groups, unchanged) as one
// Vercel serverless function. vercel.json's "/api/:path*" -> "/api" rewrite
// routes every nested /api/* request here — the request's real path (e.g.
// /api/auth/login) is still what Express sees via req.url, since a rewrite
// only changes which file handles the request, not the URL the handler
// receives. (A [...path].ts catch-all filename looks like the more direct
// way to do this, but that convention is Next.js-specific — on a plain
// Vercel project it silently only matches single-segment paths, so
// anything under a nested route like /api/auth/login 404s at the platform
// level before ever reaching this file. Confirmed by testing directly.)
//
// No serverless-http wrapper: Vercel's Node runtime hands the handler a
// plain (req, res) pair compatible with Node's http.IncomingMessage /
// ServerResponse, which is exactly what an Express app already expects —
// serverless-http's Lambda-style event/callback translation never
// completed the response here (requests were logged as received by
// Express but the client never got a byte back), so it's unnecessary
// indirection for Vercel specifically (unlike AWS Lambda, which really
// does need that translation layer).
export default app;
