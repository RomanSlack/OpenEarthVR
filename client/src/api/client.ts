export interface PanoLink {
  panoId: string;
  heading: number;
  text?: string;
}

export interface PanoMetadata {
  panoId: string;
  location: { lat: number; lng: number };
  heading: number;
  tileWidth: number;
  tileHeight: number;
  imageWidth: number;
  imageHeight: number;
  copyright: string;
  links?: PanoLink[];
}

export async function initSession(): Promise<void> {
  const res = await fetch('/api/session', { method: 'POST' });
  if (!res.ok) throw new Error(`Session init failed: ${res.status}`);
}

export async function fetchMetadata(params: { lat: number; lng: number } | { panoId: string }): Promise<PanoMetadata> {
  let qs: string;
  if ('panoId' in params) {
    qs = `panoId=${encodeURIComponent(params.panoId)}`;
  } else {
    qs = `lat=${params.lat}&lng=${params.lng}`;
  }

  const res = await fetch(`/api/metadata?${qs}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Metadata fetch failed: ${res.status} ${text}`);
  }

  const raw = await res.json() as {
    panoId?: string;
    lat?: number;
    lng?: number;
    heading?: number;
    tileWidth?: number;
    tileHeight?: number;
    imageWidth?: number;
    imageHeight?: number;
    copyright?: string;
    links?: Array<{ panoId: string; heading: number; text?: string }>;
  };

  if (!raw.panoId) throw new Error('No panorama found at this location');

  return {
    panoId: raw.panoId,
    location: { lat: raw.lat ?? 0, lng: raw.lng ?? 0 },
    heading: raw.heading ?? 0,
    tileWidth: raw.tileWidth ?? 512,
    tileHeight: raw.tileHeight ?? 512,
    imageWidth: raw.imageWidth ?? 4096,
    imageHeight: raw.imageHeight ?? 2048,
    copyright: raw.copyright ?? '© Google',
    links: raw.links,
  };
}

export function getTileUrl(panoId: string, zoom: number, x: number, y: number): string {
  return `/api/tile/${zoom}/${x}/${y}?panoId=${encodeURIComponent(panoId)}`;
}

export async function fetchPanoIds(
  locations: Array<{ lat: number; lng: number }>,
  radius = 50,
): Promise<string[]> {
  const res = await fetch('/api/panoIds', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ locations, radius }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`panoIds fetch failed: ${res.status} ${text}`);
  }
  const data = await res.json() as { panoIds?: string[] };
  return data.panoIds ?? [];
}

export interface PhotosphereInfo {
  panoId: string;
  lat: number;
  lng: number;
  copyright: string;
  heading: number;
  links?: PanoLink[];
}

export async function fetchPhotospheres(
  bounds: { south: number; north: number; west: number; east: number },
  grid = 5,
  radius = 2000,
  photospheresOnly = true,
): Promise<PhotosphereInfo[]> {
  const res = await fetch('/api/photospheres', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bounds, grid, radius, photospheresOnly }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`photospheres fetch failed: ${res.status} ${text}`);
  }
  const data = await res.json() as { photospheres: PhotosphereInfo[] };
  return data.photospheres;
}
