import { getTileUrl } from '../api/client.js';

// Maximum tile grid per zoom level for Street View.
// Edge tiles may not exist for a given panorama — handled gracefully below.
const ZOOM_GRIDS: Record<number, { cols: number; rows: number }> = {
  0: { cols: 1, rows: 1 },
  1: { cols: 2, rows: 1 },
  2: { cols: 4, rows: 2 },
  3: { cols: 8, rows: 4 },
  4: { cols: 16, rows: 8 },
};

export interface TileGrid {
  images: HTMLImageElement[][];
  cols: number;
  rows: number;
}

// Returns a transparent 512×512 image used when a tile doesn't exist.
function blankTile(tileWidth = 512, tileHeight = 512): Promise<HTMLImageElement> {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.width = tileWidth;
    canvas.height = tileHeight;
    // Canvas default is transparent black — no fill needed
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
    img.onerror = () => reject(new Error(`404: ${src}`));
    img.src = src;
  });
}

export async function loadTiles(
  panoId: string,
  zoom: number,
  onProgress?: (loaded: number, total: number) => void,
): Promise<TileGrid> {
  const grid = ZOOM_GRIDS[zoom];
  if (!grid) throw new Error(`Unsupported zoom level: ${zoom}`);

  const { cols, rows } = grid;
  const total = cols * rows;
  let settled = 0;

  const tasks: Array<Promise<{ x: number; y: number; img: HTMLImageElement }>> = [];

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const url = getTileUrl(panoId, zoom, x, y);
      tasks.push(
        loadImage(url)
          .catch(() => blankTile()) // missing edge tiles are normal — use black placeholder
          .then((img) => {
            settled++;
            onProgress?.(settled, total);
            return { x, y, img };
          }),
      );
    }
  }

  const results = await Promise.all(tasks);

  // Build 2D array [y][x]
  const images: HTMLImageElement[][] = Array.from({ length: rows }, () =>
    new Array<HTMLImageElement>(cols),
  );
  for (const { x, y, img } of results) {
    images[y][x] = img;
  }

  return { images, cols, rows };
}
