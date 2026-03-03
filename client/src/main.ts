import { initSession, fetchMetadata } from './api/client.js';
import { loadTiles } from './photosphere/tileLoader.js';
import { stitchTiles } from './photosphere/stitcher.js';
import { PanoView } from './photosphere/PanoView.js';
import { showCopyright } from './ui/copyright.js';

const DEFAULT_LOCATION = { lat: 48.8584, lng: 2.2945 };
const DEFAULT_ZOOM = 3;

const loadingEl  = document.getElementById('loading')        as HTMLDivElement;
const statusEl   = document.getElementById('loading-status') as HTMLDivElement;
const progressEl = document.getElementById('progress-bar')   as HTMLDivElement;
const hintEl     = document.getElementById('hint')           as HTMLDivElement;

function setStatus(msg: string): void {
  statusEl.textContent = msg;
}

function setProgress(value: number): void {
  // value: 0–1
  progressEl.style.width = `${Math.round(value * 100)}%`;
}

function dismissLoading(): void {
  loadingEl.classList.add('fade-out');
  loadingEl.addEventListener('transitionend', () => {
    loadingEl.style.display = 'none';
  }, { once: true });
}

async function main(): Promise<void> {
  try {
    setStatus('Establishing connection…');
    setProgress(0.05);
    await initSession();

    setStatus('Locating panorama…');
    setProgress(0.15);
    const metadata = await fetchMetadata(DEFAULT_LOCATION);

    const totalTiles = DEFAULT_ZOOM === 3 ? 32 : 1; // approximate for progress denominator
    setStatus(`Loading tiles (0 / ${totalTiles})…`);
    setProgress(0.2);

    const grid = await loadTiles(metadata.panoId, DEFAULT_ZOOM, (loaded, total) => {
      setStatus(`Loading tiles (${loaded} / ${total})…`);
      setProgress(0.2 + 0.7 * (loaded / total));
    });

    setStatus('Stitching panorama…');
    setProgress(0.95);

    // Yield to browser so the progress bar renders before the blocking stitch
    await new Promise((r) => requestAnimationFrame(r));

    const texture = stitchTiles(grid);
    setProgress(1.0);

    const container = document.getElementById('app') as HTMLDivElement;
    const view = new PanoView(container);
    view.applyTexture(texture, metadata);

    dismissLoading();
    showCopyright(metadata.copyright);

    // Show drag hint briefly
    hintEl.style.display = 'block';
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    loadingEl.classList.add('error');
    setStatus(`Something went wrong:\n${message}`);
    setProgress(0);
    console.error(err);
  }
}

main();
