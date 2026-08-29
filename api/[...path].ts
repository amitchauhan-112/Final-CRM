import serverless from 'serverless-http';
import app from '../backend/src/app.js';

// Wraps the existing Express app (all 32 route groups, unchanged) as one
// Vercel serverless function. The [...path] catch-all filename is what
// makes this handle every nested /api/* route — a plain api/index.ts only
// ever matches the exact path /api, and a vercel.json rewrite to it strips
// the rest of the path before Express ever sees it (confirmed: every
// request landed on Express as "/", regardless of the real URL).
export default serverless(app);
