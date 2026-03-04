import { Router, type Request, type Response } from 'express';
import { googleApiKey, GOOGLE_TILE_BASE } from '../config.js';

// Self-contained session management (independent from the streetview session)
let sessionToken: string | null = null;
let sessionExpiry = 0; // Unix ms
let inFlight: Promise<string> | null = null;

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

async function createOverlaySession(): Promise<string> {
  const res = await fetch(`${GOOGLE_TILE_BASE}/createSession?key=${googleApiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mapType: 'satellite',
      language: 'en-US',
      region: 'US',
      layerTypes: ['layerStreetview'],
      overlay: true,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google createSession (overlay) error ${res.status}: ${text}`);
  }

  const data = (await res.json()) as { session?: string; expiry?: string };
  if (!data.session || !data.expiry) {
    throw new Error(`Unexpected overlay session response: ${JSON.stringify(data)}`);
  }

  const expiryMs = parseInt(data.expiry, 10) * 1000;
  sessionToken = data.session;
  sessionExpiry = expiryMs;
  console.log(`[sv-overlay] new session cached, expires ${new Date(expiryMs).toISOString()}`);
  return data.session;
}

async function getSession(): Promise<string> {
  if (sessionToken && Date.now() < sessionExpiry - ONE_DAY_MS) {
    return sessionToken;
  }
  if (inFlight) return inFlight;
  const promise = createOverlaySession().finally(() => { inFlight = null; });
  inFlight = promise;
  return promise;
}

async function refreshSession(): Promise<string> {
  sessionToken = null;
  return getSession();
}

const router = Router();

router.get('/:z/:x/:y', async (req: Request, res: Response) => {
  const { z, x, y } = req.params;

  let token: string;
  try {
    token = await getSession();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: message });
    return;
  }

  const url = `${GOOGLE_TILE_BASE}/2dtiles/${z}/${x}/${y}?session=${token}&key=${googleApiKey}`;

  let upstream = await fetch(url);

  // Auto-refresh session on auth errors
  if (upstream.status === 401 || upstream.status === 403) {
    try {
      token = await refreshSession();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(502).json({ error: message });
      return;
    }
    const retryUrl = `${GOOGLE_TILE_BASE}/2dtiles/${z}/${x}/${y}?session=${token}&key=${googleApiKey}`;
    upstream = await fetch(retryUrl);
  }

  if (!upstream.ok) {
    res.status(upstream.status).send(await upstream.text());
    return;
  }

  const contentType = upstream.headers.get('content-type');
  if (contentType) res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', 'public, max-age=3600');

  const buffer = Buffer.from(await upstream.arrayBuffer());
  res.send(buffer);
});

export default router;
