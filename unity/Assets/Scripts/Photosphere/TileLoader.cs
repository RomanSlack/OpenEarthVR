using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;

namespace OpenEarthVR.Core
{
    /// <summary>
    /// Port of tileLoader.ts + stitcher.ts — fetches SV tiles and stitches
    /// them into a single equirectangular Texture2D.
    /// </summary>
    public class TileLoader : MonoBehaviour
    {
        [Header("Settings")]
        [SerializeField] private int maxTextureSize = 8192;

        // Computed grid dimensions for a given zoom level
        private struct TileGrid
        {
            public int cols;
            public int rows;
            public int zoom;
        }

        /// <summary>
        /// Compute grid dimensions for a target zoom level given image dimensions.
        /// Matches the JS computeGrid() logic.
        /// </summary>
        private TileGrid ComputeGrid(PanoMetadata meta, int targetZoom)
        {
            int maxZoom = Mathf.CeilToInt(Mathf.Log((float)meta.imageWidth / meta.tileWidth, 2f));
            int cols = Mathf.CeilToInt((float)meta.imageWidth / meta.tileWidth);
            int rows = Mathf.CeilToInt((float)meta.imageHeight / meta.tileHeight);

            // Walk down from maxZoom to targetZoom, halving each time
            for (int z = maxZoom; z > targetZoom; z--)
            {
                cols = Mathf.CeilToInt(cols / 2f);
                rows = Mathf.CeilToInt(rows / 2f);
            }

            return new TileGrid { cols = cols, rows = rows, zoom = targetZoom };
        }

        /// <summary>
        /// Find the best fine zoom level whose stitched size fits within maxTextureSize.
        /// </summary>
        private int BestFineZoom(PanoMetadata meta)
        {
            int maxZoom = Mathf.CeilToInt(Mathf.Log((float)meta.imageWidth / meta.tileWidth, 2f));

            for (int z = maxZoom; z >= 0; z--)
            {
                var grid = ComputeGrid(meta, z);
                int w = grid.cols * meta.tileWidth;
                int h = grid.rows * meta.tileHeight;
                if (w <= maxTextureSize && h <= maxTextureSize)
                    return z;
            }
            return 0;
        }

        /// <summary>
        /// Progressive loading: load coarse tiles first, then fine tiles.
        /// Matches loadTilesProgressive from the web version.
        /// </summary>
        public IEnumerator LoadTilesProgressive(
            PanoMetadata meta,
            Action<Texture2D> onCoarseReady,
            Action<Texture2D> onFineReady)
        {
            int maxZoom = Mathf.CeilToInt(Mathf.Log((float)meta.imageWidth / meta.tileWidth, 2f));
            int coarseZoom = Mathf.Min(2, maxZoom - 1);
            int fineZoom = BestFineZoom(meta);

            // Load coarse pass
            Texture2D coarseTex = null;
            yield return LoadAndStitch(meta, coarseZoom, tex => coarseTex = tex);

            if (coarseTex != null)
                onCoarseReady?.Invoke(coarseTex);

            // Load fine pass if higher quality available
            if (fineZoom > coarseZoom)
            {
                Texture2D fineTex = null;
                yield return LoadAndStitch(meta, fineZoom, tex => fineTex = tex);

                if (fineTex != null)
                    onFineReady?.Invoke(fineTex);
            }
        }

        /// <summary>
        /// Fetch all tiles for a zoom level and stitch them into one Texture2D.
        /// </summary>
        private IEnumerator LoadAndStitch(PanoMetadata meta, int zoom, Action<Texture2D> onDone)
        {
            var grid = ComputeGrid(meta, zoom);
            int totalTiles = grid.cols * grid.rows;
            var tiles = new Texture2D[totalTiles];
            int loaded = 0;

            // Launch all tile fetches in parallel
            for (int y = 0; y < grid.rows; y++)
            {
                for (int x = 0; x < grid.cols; x++)
                {
                    int idx = y * grid.cols + x;
                    int capturedIdx = idx;

                    StartCoroutine(ApiClient.Instance.GetTile(
                        zoom, x, y, meta.panoId,
                        tex =>
                        {
                            tiles[capturedIdx] = tex;
                            loaded++;
                        },
                        () =>
                        {
                            // Failed tile — leave null, will be blank
                            loaded++;
                        }
                    ));
                }
            }

            // Wait for all tiles
            while (loaded < totalTiles)
                yield return null;

            // Stitch into single texture
            Texture2D stitched = StitchTiles(tiles, grid, meta.tileWidth, meta.tileHeight);
            onDone?.Invoke(stitched);

            // Cleanup individual tile textures
            foreach (var t in tiles)
            {
                if (t != null) Destroy(t);
            }
        }

        /// <summary>
        /// Stitch tile textures into a single large Texture2D.
        /// Port of stitcher.ts with nadir fill.
        /// </summary>
        private Texture2D StitchTiles(Texture2D[] tiles, TileGrid grid, int tileW, int tileH)
        {
            int canvasW = grid.cols * tileW;
            int canvasH = grid.rows * tileH;

            var stitched = new Texture2D(canvasW, canvasH, TextureFormat.RGB24, true);
            stitched.filterMode = FilterMode.Trilinear;
            stitched.anisoLevel = 16;

            // Fill with black
            var blackPixels = new Color32[canvasW * canvasH];
            for (int i = 0; i < blackPixels.Length; i++)
                blackPixels[i] = new Color32(0, 0, 0, 255);
            stitched.SetPixels32(blackPixels);

            // Draw each tile
            for (int y = 0; y < grid.rows; y++)
            {
                for (int x = 0; x < grid.cols; x++)
                {
                    int idx = y * grid.cols + x;
                    var tile = tiles[idx];
                    if (tile == null) continue;

                    // Unity textures are bottom-up, so flip Y placement
                    int destX = x * tileW;
                    int destY = (grid.rows - 1 - y) * tileH;

                    // Handle tiles that might be smaller than expected
                    int copyW = Mathf.Min(tile.width, tileW);
                    int copyH = Mathf.Min(tile.height, tileH);

                    var pixels = tile.GetPixels(0, 0, copyW, copyH);
                    stitched.SetPixels(destX, destY, copyW, copyH, pixels);
                }
            }

            // Nadir fill — cover the black hole at the bottom of the pano
            FillNadir(stitched, canvasW, canvasH);

            stitched.Apply(updateMipmaps: true);
            return stitched;
        }

        /// <summary>
        /// Sample colors near the bottom of the panorama and paint a gradient
        /// to cover the camera rig hole. Port of stitcher.ts nadir logic.
        /// </summary>
        private void FillNadir(Texture2D tex, int w, int h)
        {
            // Sample at 10% from bottom (90% height in top-down coords = 10% from bottom in Unity)
            int sampleY = (int)(h * 0.10f);

            float rSum = 0, gSum = 0, bSum = 0;
            int count = 0;

            // Sample every 4th pixel across the width
            for (int x = 0; x < w; x += 4)
            {
                var pixel = tex.GetPixel(x, sampleY);
                // Skip near-black pixels
                if (pixel.r + pixel.g + pixel.b > 0.05f)
                {
                    rSum += pixel.r;
                    gSum += pixel.g;
                    bSum += pixel.b;
                    count++;
                }
            }

            if (count == 0) return;

            Color avgColor = new Color(rSum / count, gSum / count, bSum / count);
            Color darkColor = avgColor * 0.6f;
            darkColor.a = 1f;

            // Gradient from 12% height down to bottom
            int gradientStart = (int)(h * 0.12f);

            for (int y = 0; y < gradientStart; y++)
            {
                float t = 1f - (float)y / gradientStart; // 1 at bottom, 0 at gradientStart
                Color rowColor = Color.Lerp(avgColor, darkColor, t);

                // Blend factor: fully opaque at bottom, transparent at top of gradient
                float alpha = t;

                for (int x = 0; x < w; x++)
                {
                    Color existing = tex.GetPixel(x, y);
                    Color blended = Color.Lerp(existing, rowColor, alpha);
                    tex.SetPixel(x, y, blended);
                }
            }
        }
    }
}
