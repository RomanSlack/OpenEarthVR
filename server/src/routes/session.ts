import { Router, type Request, type Response } from 'express';
import {
  getCachedSession,
  setCachedSession,
  clearCachedSession,
  getInFlight,
  setInFlight,
} from '../cache.js';
import { googleApiKey, GOOGLE_TILE_BASE } from '../config.js';

async function createSession(): Promise<string> {
  const res = await fetch(`${GOOGLE_TILE_BASE}/createSession?key=${googleApiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mapType: 'streetview', language: 'en-US', region: 'US' }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google createSession error ${res.status}: ${text}`);
  }

  const data = (await res.json()) as { session?: string; expiry?: string };

  if (!data.session || !data.expiry) {
    throw new Error(`Unexpected createSession response: ${JSON.stringify(data)}`);
  }

  const expiryUnixSec = parseInt(data.expiry, 10);
  if (isNaN(expiryUnixSec)) {
    throw new Error(`Invalid expiry value: ${data.expiry}`);
  }

  setCachedSession(data.session, expiryUnixSec);
  console.log(`[session] new token cached, expires ${new Date(expiryUnixSec * 1000).toISOString()}`);
  return data.session;
}

/**
 * Returns a valid session token.
 * Deduplicates concurrent calls — only one createSession request is ever in-flight at a time.
 */
export async function getOrCreateSession(): Promise<string> {
  const cached = getCachedSession();
  if (cached) return cached;

  // If another caller is already fetching a session, wait for that one
  const existing = getInFlight();
  if (existing) return existing;

  const promise = createSession().finally(() => setInFlight(null));
  setInFlight(promise);
  return promise;
}

/**
 * Clears the cached session and fetches a fresh one.
 * Used when Google returns 401/403 on an existing session.
 * Deduplicates the same way as getOrCreateSession.
 */
export async function refreshSession(): Promise<string> {
  clearCachedSession();
  return getOrCreateSession();
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
