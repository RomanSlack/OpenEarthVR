import { initSession, fetchMetadata } from './api/client.js';
import { loadTilesProgressive } from './photosphere/tileLoader.js';
import { stitchTiles } from './photosphere/stitcher.js';
import { PanoView } from './photosphere/PanoView.js';
import { GlobeView } from './globe/GlobeView.js';
import { showCopyright, hideCopyright } from './ui/copyright.js';
import { showFadeOverlay, hideFadeOverlay, setTransitionStatus } from './ui/overlay.js';

type AppMode = 'globe' | 'transitioning' | 'photosphere';

let mode: AppMode = 'globe';
let globeView: GlobeView | null = null;
let panoView: PanoView | null = null;

const globeContainer  = document.getElementById('globe-container')  as HTMLDivElement;
const panoContainer   = document.getElementById('pano-container')   as HTMLDivElement;
const loadingEl       = document.getElementById('loading')          as HTMLDivElement;
const statusEl        = document.getElementById('loading-status')   as HTMLDivElement;
const progressEl      = document.getElementById('progress-bar')     as HTMLDivElement;
const backBtn         = document.getElementById('back-btn')         as HTMLButtonElement;
const hintEl          = document.getElementById('hint')             as HTMLDivElement;

function setStatus(msg: string): void { statusEl.textContent = msg; }
function setProgress(v: number): void { progressEl.style.width = `${Math.round(v * 100)}%`; }

function dismissLoading(): void {
  loadingEl.classList.add('fade-out');
  loadingEl.addEventListener('transitionend', () => { loadingEl.style.display = 'none'; }, { once: true });
}

/**
 * Enter photosphere by coordinates (click on globe) or by panoId (nav link).
 * When entering by coordinates, we look up the nearest pano first.
 */
async function enterPhotosphere(
  params: { lat: number; lng: number } | { panoId: string; lat: number; lng: number },
): Promise<void> {
  if (mode === 'transitioning') return;
  mode = 'transitioning';

  const lat = params.lat;
  const lng = params.lng;

  // Remember location for return trip
  globeView?.setLastPanoLocation(lat, lng);

  // Fly camera down to street level
  setTransitionStatus('Flying to location…');
  await globeView?.flyToLocation(lat, lng, 150, 2.5);

  // Fade to black
  await showFadeOverlay();
  setTransitionStatus('Loading panorama…');

  globeView?.hide();
  panoContainer.style.display = 'block';
  hideCopyright();

  // Init PanoView once — container must be visible first so renderer gets correct size
  if (!panoView) {
    panoView = new PanoView(panoContainer);
  } else {
    panoView.resize();
  }
  panoView.reset();

  // Fetch metadata — by panoId if we have one, otherwise by coordinates
  let metadata: Awaited<ReturnType<typeof fetchMetadata>>;
  try {
    if ('panoId' in params) {
      metadata = await fetchMetadata({ panoId: params.panoId });
    } else {
      metadata = await fetchMetadata({ lat, lng });
    }
  } catch (err) {
    console.error('[pano] metadata fetch failed:', err);
    setTransitionStatus('No Street View here');
    // Brief delay so user sees the message
    await new Promise((r) => setTimeout(r, 1200));
    setTransitionStatus('');
    await hideFadeOverlay();
    globeView?.show();
    panoContainer.style.display = 'none';
    mode = 'globe';
    return;
  }

  // Update stored location with the actual pano position
  globeView?.setLastPanoLocation(metadata.location.lat, metadata.location.lng);

  if (metadata.links) {
    panoView.setNavLinks(metadata.links, (navPanoId: string) => {
      // Use current pano location as approx coords for the fly-down
      enterPhotosphere({
        panoId: navPanoId,
        lat: metadata.location.lat,
        lng: metadata.location.lng,
      });
    });
  }

  let coarseLoaded = false;
  await loadTilesProgressive(
    metadata.panoId,
    metadata,
    (coarse) => {
      panoView!.applyTexture(stitchTiles(coarse, panoView!.maxAnisotropy), metadata);
      coarseLoaded = true;
      setTransitionStatus('');
      hideFadeOverlay();
      showCopyright(metadata.copyright);
      backBtn.style.display = 'block';
      hintEl.style.display = 'block';
      mode = 'photosphere';
    },
    (fine) => {
      panoView!.applyTexture(stitchTiles(fine, panoView!.maxAnisotropy), metadata);
    },
    (loaded, total) => {
      if (!coarseLoaded) {
        setTransitionStatus(`Loading tiles (${loaded} / ${total})…`);
      }
    },
    panoView.maxTextureSize,
  );
}

async function returnToGlobe(): Promise<void> {
  if (mode === 'transitioning') return;
  mode = 'transitioning';

  await showFadeOverlay();

  panoContainer.style.display = 'none';
  backBtn.style.display = 'none';
  hideCopyright();

  // Position camera above last visited pano location
  const last = globeView?.getLastPanoLocation();
  if (last && (last.lat !== 0 || last.lng !== 0)) {
    globeView!.setViewAboveLocation(last.lat, last.lng, 500);
  }

  globeView?.show();
  await hideFadeOverlay();
  mode = 'globe';
}

async function main(): Promise<void> {
  try {
    setStatus('Establishing connection…');
    setProgress(0.1);
    await initSession();

    setStatus('Loading Earth…');
    setProgress(0.3);

    globeView = new GlobeView(globeContainer, (lat, lng) => {
      enterPhotosphere({ lat, lng });
    });
    setProgress(1.0);

    dismissLoading();
    backBtn.addEventListener('click', returnToGlobe);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    loadingEl.classList.add('error');
    setStatus(`Something went wrong:\n${message}`);
    setProgress(0);
    console.error(err);
  }
}

main();
