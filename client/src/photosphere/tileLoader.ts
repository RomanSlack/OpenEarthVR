import { getTileUrl } from '../api/client.js';

// Grid dimensions per zoom level for Street View tiles
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

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load tile: ${src}`));
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
  let loaded = 0;

  const tasks: Array<Promise<{ x: number; y: number; img: HTMLImageElement }>> = [];

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const url = getTileUrl(panoId, zoom, x, y);
      tasks.push(
        loadImage(url).then((img) => {
          loaded++;
          onProgress?.(loaded, total);
          return { x, y, img };
        }),
      );
    }
  }

  const results = await Promise.all(tasks);

  // Build 2D array [y][x]
  const images: HTMLImageElement[][] = Array.from({ length: rows }, () =>
    new Array<HTMLImageElement>(cols)
  );
  for (const { x, y, img } of results) {
    images[y][x] = img;
  }

  return { images, cols, rows };
}
