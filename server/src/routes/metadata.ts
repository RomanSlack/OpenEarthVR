import { Router, type Request, type Response } from 'express';
import { getOrCreateSession } from './session.js';
import { googleApiKey, GOOGLE_TILE_BASE } from '../config.js';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const session = await getOrCreateSession();
    const { panoId, lat, lng, radius = '50' } = req.query as Record<string, string>;

    let url: string;
    if (panoId) {
      url = `${GOOGLE_TILE_BASE}/streetview/metadata?panoId=${encodeURIComponent(panoId)}&session=${session}&key=${googleApiKey}`;
    } else if (lat && lng) {
      url = `${GOOGLE_TILE_BASE}/streetview/metadata?location=${encodeURIComponent(lat)},${encodeURIComponent(lng)}&radius=${encodeURIComponent(radius)}&session=${session}&key=${googleApiKey}`;
    } else {
      res.status(400).json({ error: 'Provide panoId or lat+lng query params' });
      return;
    }

    const upstream = await fetch(url);
    if (!upstream.ok) {
      const text = await upstream.text();
      res.status(upstream.status).json({ error: text });
      return;
    }

    const data = await upstream.json();
    res.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

export default router;
