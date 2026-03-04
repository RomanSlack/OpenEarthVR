import { getTileUrl } from '../api/client.js';

export interface TileGrid {
  images: HTMLImageElement[][];
  cols: number;
  rows: number;
}

export interface PanoDimensions {
  imageWidth: number;
  imageHeight: number;
  tileWidth: number;
  tileHeight: number;
}

/**
 * Compute the actual tile grid dimensions for a given zoom level
 * based on the panorama's real resolution — NOT hardcoded maximums.
 * User-uploaded photospheres are lower res than Google SV and have smaller grids.
 */
function computeGrid(dims: PanoDimensions, zoom: number): { cols: number; rows: number } {
  const maxZoom = Math.ceil(Math.log2(dims.imageWidth / dims.tileWidth));
  let cols = Math.ceil(dims.imageWidth / dims.tileWidth);
  let rows = Math.ceil(dims.imageHeight / dims.tileHeight);

  for (let z = maxZoom; z > zoom; z--) {
    cols = Math.ceil(cols / 2);
    rows = Math.ceil(rows / 2);
  }

  return { cols: Math.max(1, cols), rows: Math.max(1, rows) };
}

/**
 * Pick the highest zoom level whose stitched canvas fits within the GPU's max texture size.
 */
export function bestFineZoom(dims: PanoDimensions, maxTextureSize: number): number {
  const maxZoom = Math.ceil(Math.log2(dims.imageWidth / dims.tileWidth));
  for (let z = maxZoom; z >= 0; z--) {
    const g = computeGrid(dims, z);
    const w = g.cols * dims.tileWidth;
    const h = g.rows * dims.tileHeight;
    if (w <= maxTextureSize && h <= maxTextureSize) return z;
  }
  return 0;
}

function blankTile(tileWidth = 512, tileHeight = 512): Promise<HTMLImageElement> {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.width = tileWidth;
    canvas.height = tileHeight;
    const img = new Image();
    img.onload = () => resolve(img);
    img.src = canvas.toDataURL();
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load: ${src}`));
    img.src = src;
  });
}

export async function loadTilesProgressive(
  panoId: string,
  dims: PanoDimensions,
  onCoarseReady: (grid: TileGrid) => void,
  onFineReady: (grid: TileGrid) => void,
  onProgress?: (loaded: number, total: number) => void,
  maxTextureSize = 4096,
): Promise<void> {
  const maxZoom = Math.ceil(Math.log2(dims.imageWidth / dims.tileWidth));
  const coarseZoom = Math.min(2, Math.max(0, maxZoom - 1));
  const fineZoom = bestFineZoom(dims, maxTextureSize);

  const coarseGrid = computeGrid(dims, coarseZoom);
  const coarse = await loadTiles(panoId, coarseZoom, coarseGrid);
  onCoarseReady(coarse);

  if (fineZoom > coarseZoom) {
    const fineGrid = computeGrid(dims, fineZoom);
    const fine = await loadTiles(panoId, fineZoom, fineGrid, onProgress);
    onFineReady(fine);
  }
}

export async function loadTiles(
  panoId: string,
  zoom: number,
  grid?: { cols: number; rows: number },
  onProgress?: (loaded: number, total: number) => void,
): Promise<TileGrid> {
  // Fallback to standard grids if no explicit grid provided
  const STANDARD_GRIDS: Record<number, { cols: number; rows: number }> = {
    0: { cols: 1, rows: 1 },
    1: { cols: 2, rows: 1 },
    2: { cols: 4, rows: 2 },
    3: { cols: 7, rows: 4 },
    4: { cols: 13, rows: 7 },
    5: { cols: 26, rows: 13 },
  };

  const { cols, rows } = grid ?? STANDARD_GRIDS[zoom] ?? { cols: 1, rows: 1 };
  const total = cols * rows;
  let settled = 0;

  const tasks: Array<Promise<{ x: number; y: number; img: HTMLImageElement }>> = [];

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const url = getTileUrl(panoId, zoom, x, y);
      tasks.push(
        loadImage(url)
          .catch(() => blankTile())
          .then((img) => {
            settled++;
            onProgress?.(settled, total);
            return { x, y, img };
          }),
      );
    }
  }

  const results = await Promise.all(tasks);

  const images: HTMLImageElement[][] = Array.from({ length: rows }, () =>
    new Array<HTMLImageElement>(cols),
  );
  for (const { x, y, img } of results) {
    images[y][x] = img;
  }

  return { images, cols, rows };
}
