import { Router, type Request, type Response } from 'express';
import { getOrCreateSession, refreshSession } from './session.js';
import { googleApiKey, GOOGLE_TILE_BASE } from '../config.js';

const router = Router();

interface PhotosphereResult {
  panoId: string;
  lat: number;
  lng: number;
  copyright: string;
  heading: number;
  links?: Array<{ panoId: string; heading: number }>;
}

async function fetchMetadataForPoint(
  session: string,
  lat: number,
  lng: number,
  radius: number,
): Promise<PhotosphereResult | null> {
  const url = `${GOOGLE_TILE_BASE}/streetview/metadata?lat=${lat}&lng=${lng}&radius=${radius}&session=${session}&key=${googleApiKey}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = (await res.json()) as Record<string, unknown>;
  if (!data.panoId) return null;
  return {
    panoId: data.panoId as string,
    lat: data.lat as number,
    lng: data.lng as number,
    copyright: (data.copyright as string) ?? '',
    heading: (data.heading as number) ?? 0,
    links: data.links as Array<{ panoId: string; heading: number }> | undefined,
  };
}

router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      bounds,
      grid = 5,
      radius = 2000,
      photospheresOnly = false,
    } = req.body as {
      bounds: { south: number; north: number; west: number; east: number };
      grid?: number;
      radius?: number;
      photospheresOnly?: boolean;
    };

    if (!bounds) {
      res.status(400).json({ error: 'bounds required' });
      return;
    }

    let session = await getOrCreateSession();

    // Generate grid sample points
    const locations: Array<{ lat: number; lng: number }> = [];
    for (let i = 0; i < grid; i++) {
      for (let j = 0; j < grid; j++) {
        locations.push({
          lat: bounds.south + (bounds.north - bounds.south) * (i / Math.max(grid - 1, 1)),
          lng: bounds.west + (bounds.east - bounds.west) * (j / Math.max(grid - 1, 1)),
        });
      }
    }

    // Fetch metadata for each sample point in parallel
    let results = await Promise.all(
      locations.map(({ lat, lng }) =>
        fetchMetadataForPoint(session, lat, lng, radius),
      ),
    );

    // If most results are null, session might be stale — refresh and retry
    const nullCount = results.filter((r) => r === null).length;
    if (nullCount > locations.length * 0.8 && nullCount > 0) {
      console.warn('[photospheres] most lookups failed, refreshing session…');
      session = await refreshSession();
      results = await Promise.all(
        locations.map(({ lat, lng }) =>
          fetchMetadataForPoint(session, lat, lng, radius),
        ),
      );
    }

    // De-duplicate by panoId
    const seen = new Set<string>();
    let photospheres: PhotosphereResult[] = [];
    for (const r of results) {
      if (!r || seen.has(r.panoId)) continue;
      seen.add(r.panoId);
      photospheres.push(r);
    }

    // Filter for user-contributed photospheres (exclude Google Street View cars)
    if (photospheresOnly) {
      photospheres = photospheres.filter(
        (p) => !p.copyright.includes('Google'),
      );
    }

    res.json({ photospheres });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[photospheres] unexpected error:', err);
    res.status(500).json({ error: message });
  }
});

export default router;
