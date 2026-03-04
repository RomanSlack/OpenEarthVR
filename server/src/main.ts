import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import { port } from './config.js';
import sessionRouter from './routes/session.js';
import metadataRouter from './routes/metadata.js';
import tilesRouter from './routes/tiles.js';
import panoIdsRouter from './routes/panoIds.js';
import tiles3dRouter from './routes/tiles3d.js';
import svOverlayRouter from './routes/svOverlay.js';
import photospheresRouter from './routes/photospheres.js';

const app = express();
app.use(cors());
app.use(express.json());

// Simple per-IP rate limiter — no extra dependency needed.
// Allows burst up to BURST requests, then max RATE requests/second.
const RATE_WINDOW_MS = 60_000;         // 1 minute window
const RATE_MAX = 500;                   // max requests per IP per minute
const ipWindows = new Map<string, number[]>();

function rateLimit(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip ?? 'unknown';
  const now = Date.now();
  const hits = (ipWindows.get(ip) ?? []).filter(t => now - t < RATE_WINDOW_MS);
  if (hits.length >= RATE_MAX) {
    res.status(429).json({ error: 'Too many requests' });
    return;
  }
  hits.push(now);
  ipWindows.set(ip, hits);
  next();
}

// Periodically sweep stale entries so the map doesn't grow forever
setInterval(() => {
  const now = Date.now();
  for (const [ip, hits] of ipWindows) {
    const recent = hits.filter(t => now - t < RATE_WINDOW_MS);
    if (recent.length === 0) ipWindows.delete(ip);
    else ipWindows.set(ip, recent);
  }
}, RATE_WINDOW_MS);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/session', rateLimit, sessionRouter);
app.use('/api/metadata', rateLimit, metadataRouter);
app.use('/api/tile', rateLimit, tilesRouter);
app.use('/api/panoIds', rateLimit, panoIdsRouter);
app.use('/api/3dtiles', tiles3dRouter);  // no rate limit — tiles generate hundreds of requests
app.use('/api/sv-overlay', svOverlayRouter);  // no rate limit — same reasoning as 3D tiles
app.use('/api/photospheres', rateLimit, photospheresRouter);

app.listen(port, '0.0.0.0', () => {
  console.log(`Server listening on http://0.0.0.0:${port}`);
});
