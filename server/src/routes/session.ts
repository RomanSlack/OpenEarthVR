import { Router, type Request, type Response } from 'express';
import { getCachedSession, setCachedSession } from '../cache.js';
import { googleApiKey, GOOGLE_TILE_BASE } from '../config.js';

export async function getOrCreateSession(): Promise<string> {
  const cached = getCachedSession();
  if (cached) return cached;

  const res = await fetch(`${GOOGLE_TILE_BASE}/createSession?key=${googleApiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mapType: 'streetview',
      language: 'en-US',
      region: 'US',
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google session error ${res.status}: ${text}`);
  }

  const data = (await res.json()) as { session: string; expiry: string };
  const expirySeconds = parseInt(data.expiry, 10);
  setCachedSession(data.session, expirySeconds);
  return data.session;
}

const router = Router();

router.post('/', async (_req: Request, res: Response) => {
  try {
    await getOrCreateSession();
    res.json({ status: 'ok' });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

export default router;
