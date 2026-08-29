import serverless from 'serverless-http';
import app from '../backend/src/app.js';

// Wraps the existing Express app (all 32 route groups, unchanged) as one
// Vercel serverless function. See vercel.json's rewrite for how /api/* paths
// reach this file.
export default serverless(app);
