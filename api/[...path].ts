import app from '../backend/src/app.js';

// Wraps the existing Express app (all 32 route groups, unchanged) as one
// Vercel serverless function. The [...path] catch-all filename is what
// makes this handle every nested /api/* route — a plain api/index.ts only
// ever matches the exact path /api, and a vercel.json rewrite to it strips
// the rest of the path before Express ever sees it (confirmed: every
// request landed on Express as "/", regardless of the real URL).
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
