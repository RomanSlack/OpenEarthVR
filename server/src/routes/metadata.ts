import { Router, type Request, type Response } from 'express';
import { getOrCreateSession, refreshSession } from './session.js';
import { googleApiKey, GOOGLE_TILE_BASE } from '../config.js';

const router = Router();

function buildUrl(session: string, params: { panoId?: string; lat?: string; lng?: string; radius?: string }): string {
  const { panoId, lat, lng, radius = '50' } = params;
  const base = `${GOOGLE_TILE_BASE}/streetview/metadata`;
  if (panoId) {
    return `${base}?panoId=${encodeURIComponent(panoId)}&session=${session}&key=${googleApiKey}`;
  }
  return `${base}?lat=${encodeURIComponent(lat!)}&lng=${encodeURIComponent(lng!)}&radius=${encodeURIComponent(radius)}&session=${session}&key=${googleApiKey}`;
}

router.get('/', async (req: Request, res: Response) => {
  try {
    const { panoId, lat, lng, radius } = req.query as Record<string, string>;

    if (!panoId && !(lat && lng)) {
      res.status(400).json({ error: 'Provide panoId or lat+lng query params' });
      return;
    }

    let session = await getOrCreateSession();
    let upstream = await fetch(buildUrl(session, { panoId, lat, lng, radius }));

    // Refresh session once on auth failure
    if (upstream.status === 401 || upstream.status === 403) {
      console.warn(`[metadata] session rejected (${upstream.status}), refreshing…`);
      session = await refreshSession();
      upstream = await fetch(buildUrl(session, { panoId, lat, lng, radius }));
    }

    if (!upstream.ok) {
      const text = await upstream.text();
      console.error(`[metadata] Google error ${upstream.status}: ${text}`);
      res.status(upstream.status).json({ error: text });
      return;
    }

    const data = await upstream.json();
    res.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[metadata] unexpected error:`, err);
    res.status(500).json({ error: message });
  }
});

export default router;
