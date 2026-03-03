import * as THREE from 'three';
import type { TileGrid } from './tileLoader.js';

export function stitchTiles(grid: TileGrid): THREE.CanvasTexture {
  const { images, cols, rows } = grid;

  const tileW = images[0][0].naturalWidth;
  const tileH = images[0][0].naturalHeight;

  const canvas = document.createElement('canvas');
  canvas.width = cols * tileW;
  canvas.height = rows * tileH;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2D context');

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      ctx.drawImage(images[y][x], x * tileW, y * tileH);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;

  return texture;
}
