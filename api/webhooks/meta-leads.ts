// Transparent HTTPS relay for Meta's Lead Ads / Instagram webhook.
//
// Meta requires an HTTPS callback URL for webhooks. The actual CRM backend
// (EC2) doesn't have HTTPS yet, but this Vercel deployment does — so Meta
// calls this function over HTTPS, and it simply forwards the request as-is
// (verification GET, or the real leadgen/messaging POST payload) to the
// backend's existing, already-working handler at /api/webhooks/instagram.
// No logic lives here — the backend does all the real work, exactly as it
// already does for every other webhook source.
//
// Set BACKEND_URL as a Vercel environment variable if the backend's address
// ever changes; defaults to the current EC2 address.

export default async function handler(req: any, res: any) {
  const backendUrl = process.env.BACKEND_URL || 'http://15.252.150.49';
  const query = req.url?.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  const targetUrl = `${backendUrl}/api/webhooks/instagram${query}`;

  try {
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: { 'Content-Type': 'application/json' },
      body: req.method === 'POST' ? JSON.stringify(req.body ?? {}) : undefined,
    });
    const text = await response.text();
    res.status(response.status).send(text);
  } catch (err) {
    console.error('[meta-leads relay] failed to reach backend:', err);
    res.status(502).json({ success: false, error: 'Relay to backend failed' });
  }
}
