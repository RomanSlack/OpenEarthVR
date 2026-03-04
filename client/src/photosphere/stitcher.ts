import * as THREE from 'three';
import type { TileGrid } from './tileLoader.js';

/**
 * Fill the nadir (bottom) black hole with a gradient sampled from surrounding pixels.
 * Google SV panos have a black region at the very bottom where the camera rig was.
 */
function fillNadir(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  // Sample a row at ~90% height to get ground colors above the black hole
  const sampleY = Math.floor(height * 0.90);
  const sampleData = ctx.getImageData(0, sampleY, width, 1).data;

  let r = 0, g = 0, b = 0, count = 0;
  for (let i = 0; i < sampleData.length; i += 4) {
    const brightness = sampleData[i] + sampleData[i + 1] + sampleData[i + 2];
    // Skip very dark pixels (already part of the hole)
    if (brightness > 30) {
      r += sampleData[i];
      g += sampleData[i + 1];
      b += sampleData[i + 2];
      count++;
    }
  }

  if (count === 0) return; // entire row is black, nothing useful to sample

  r = Math.round(r / count);
  g = Math.round(g / count);
  b = Math.round(b / count);

  // Paint a gradient from transparent → sampled color → darker, covering the bottom ~12%
  const fillStart = Math.floor(height * 0.88);
  const gradient = ctx.createLinearGradient(0, fillStart, 0, height);
  gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0)`);
  gradient.addColorStop(0.3, `rgba(${r}, ${g}, ${b}, 0.8)`);
  gradient.addColorStop(1, `rgba(${Math.round(r * 0.4)}, ${Math.round(g * 0.4)}, ${Math.round(b * 0.4)}, 1)`);

  ctx.fillStyle = gradient;
  ctx.fillRect(0, fillStart, width, height - fillStart);
}

export function stitchTiles(grid: TileGrid, maxAnisotropy = 1): THREE.CanvasTexture {
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

  // Fill the nadir black hole
  fillNadir(ctx, canvas.width, canvas.height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  // Enable mipmaps + anisotropic filtering for sharper viewing at oblique angles
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = maxAnisotropy;

  return texture;
}
