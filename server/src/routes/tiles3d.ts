import { Router, type Request, type Response } from 'express';
import { googleApiKey, GOOGLE_TILE_BASE } from '../config.js';

const router = Router();

router.get('*', async (req: Request, res: Response) => {
  try {
    const rest = req.path; // e.g. '/root.json' or '/tiles/abc/def'

    // Forward all query params from the request, ensuring our key is used
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(req.query)) {
      if (typeof v === 'string') qs.set(k, v);
    }
    qs.set('key', googleApiKey as string);

    const googleUrl = `${GOOGLE_TILE_BASE}/3dtiles${rest}?${qs}`;
    const upstream = await fetch(googleUrl);

    if (!upstream.ok) {
      const text = await upstream.text();
      console.error(`[3dtiles] Google error ${upstream.status} for ${rest}: ${text}`);
      res.status(upstream.status).json({ error: text });
      return;
    }

    const contentType = upstream.headers.get('content-type') ?? 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600');

    if (contentType.includes('json')) {
      let body = await upstream.text();
      // Rewrite Google URLs so CesiumJS always fetches through our proxy
      body = body.replaceAll('https://tile.googleapis.com/v1/3dtiles/', '/api/3dtiles/');
      body = body.replaceAll('/v1/3dtiles/', '/api/3dtiles/');
      res.send(body);
    } else {
      const buffer = await upstream.arrayBuffer();
      res.send(Buffer.from(buffer));
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[3dtiles] unexpected error:', err);
    res.status(500).json({ error: message });
  }
});

export default router;
