import { Router, type Request, type Response } from 'express';
import { getOrCreateSession, refreshSession } from './session.js';
import { googleApiKey, GOOGLE_TILE_BASE } from '../config.js';

const router = Router();

interface LocationInput {
  lat: number;
  lng: number;
}

async function fetchPanoIds(session: string, locations: LocationInput[], radius: number) {
  const url = `${GOOGLE_TILE_BASE}/streetview/panoIds?session=${session}&key=${googleApiKey}`;
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ locations, radius }),
  });
}

router.post('/', async (req: Request, res: Response) => {
  try {
    const { locations, radius = 50 } = req.body as { locations: LocationInput[]; radius?: number };

    if (!Array.isArray(locations) || locations.length === 0) {
      res.status(400).json({ error: 'locations array required' });
      return;
    }

    let session = await getOrCreateSession();
    let upstream = await fetchPanoIds(session, locations, radius);

    if (upstream.status === 401 || upstream.status === 403) {
      console.warn(`[panoIds] session rejected (${upstream.status}), refreshing…`);
      session = await refreshSession();
      upstream = await fetchPanoIds(session, locations, radius);
    }

    if (!upstream.ok) {
      const text = await upstream.text();
      console.error(`[panoIds] Google error ${upstream.status}: ${text}`);
      res.status(upstream.status).json({ error: text });
      return;
    }

    const data = await upstream.json();
    res.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[panoIds] unexpected error:', err);
    res.status(500).json({ error: message });
  }
});

export default router;
