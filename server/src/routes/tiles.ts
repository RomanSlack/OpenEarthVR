import { Router, type Request, type Response } from 'express';
import { getOrCreateSession } from './session.js';
import { googleApiKey, GOOGLE_TILE_BASE } from '../config.js';

const router = Router();

router.get('/:z/:x/:y', async (req: Request, res: Response) => {
  try {
    const session = await getOrCreateSession();
    const { z, x, y } = req.params;
    const { panoId } = req.query as Record<string, string>;

    if (!panoId) {
      res.status(400).json({ error: 'panoId query param required' });
      return;
    }

    const url = `${GOOGLE_TILE_BASE}/streetview/tiles/${z}/${x}/${y}?panoId=${encodeURIComponent(panoId)}&session=${session}&key=${googleApiKey}`;

    const upstream = await fetch(url);
    if (!upstream.ok) {
      res.status(upstream.status).end();
      return;
    }

    const contentType = upstream.headers.get('content-type') ?? 'image/jpeg';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600');

    const buffer = await upstream.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

export default router;
