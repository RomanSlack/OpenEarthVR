import { Router, type Request, type Response } from 'express';
import { getOrCreateSession, refreshSession } from './session.js';
import { googleApiKey, GOOGLE_TILE_BASE } from '../config.js';

const router = Router();

async function fetchTile(session: string, z: string, x: string, y: string, panoId: string) {
  const url = `${GOOGLE_TILE_BASE}/streetview/tiles/${z}/${x}/${y}?panoId=${encodeURIComponent(panoId)}&session=${session}&key=${googleApiKey}`;
  return fetch(url);
}

router.get('/:z/:x/:y', async (req: Request, res: Response) => {
  try {
    const { z, x, y } = req.params as { z: string; x: string; y: string };
    const panoId = req.query['panoId'];
    if (Array.isArray(panoId)) { res.status(400).json({ error: 'panoId must be a single value' }); return; }
    const panoIdStr = panoId as string | undefined;

    if (!panoIdStr) {
      res.status(400).json({ error: 'panoId query param required' });
      return;
    }

    let session = await getOrCreateSession();
    let upstream = await fetchTile(session, z, x, y, panoIdStr);

    // If Google rejects the session token, refresh once and retry
    if (upstream.status === 401 || upstream.status === 403) {
      console.warn(`[tile] session rejected (${upstream.status}), refreshing…`);
      session = await refreshSession();
      upstream = await fetchTile(session, z, x, y, panoIdStr);
    }

    if (!upstream.ok) {
      const errBody = await upstream.text();
      console.error(`[tile] Google error ${upstream.status} for ${z}/${x}/${y}: ${errBody}`);
      res.status(upstream.status).json({ error: errBody });
      return;
    }

    const contentType = upstream.headers.get('content-type') ?? 'image/jpeg';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600');

    const buffer = await upstream.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[tile] unexpected error:`, err);
    res.status(500).json({ error: message });
  }
});

export default router;
