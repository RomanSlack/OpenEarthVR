# VR Earth Explorer — Technical Specification

> A personal WebXR application that combines a zoomable 3D globe with immersive Street View photosphere browsing, running natively in the Meta Quest 2 browser.

---

## Vision

Build the app that Google never shipped: a seamless experience where you fly around a photorealistic 3D Earth, see photo sphere markers from orbit, click one, and drop into a full 16K immersive Street View panorama — all in VR, no PC streaming required.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────┐
│              Meta Quest 2 Browser                │
│                  (WebXR)                         │
│                                                  │
│  ┌───────────────┐     ┌──────────────────────┐  │
│  │  Globe View   │────▶│  Photosphere View    │  │
│  │  (CesiumJS)   │     │  (Three.js WebXR)    │  │
│  └───────┬───────┘     └──────────┬───────────┘  │
│          │                        │              │
│          ▼                        ▼              │
│  ┌─────────────────────────────────────────────┐ │
│  │          Proxy Server (Node/Rust)           │ │
│  │   - Session token management                │ │
│  │   - API key protection                      │ │
│  │   - Tile caching                            │ │
│  └─────────────────────┬───────────────────────┘ │
└────────────────────────┼─────────────────────────┘
                         │
                         ▼
          ┌──────────────────────────┐
          │   Google Maps Platform   │
          │   - Map Tiles API        │
          │   - Street View Tiles    │
          │   - Photorealistic 3D    │
          └──────────────────────────┘
```

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| VR Runtime | WebXR via Quest Browser | Full immersive VR without sideloading |
| Globe Renderer | CesiumJS (v1.124+) | 3D Earth with Google Photorealistic 3D Tiles |
| Photosphere Renderer | Three.js (r183+) | Equirectangular panorama rendering in WebXR |
| Proxy/Backend | Node.js (Express) or Rust (Axum) | API key protection, session management, tile caching |
| APIs | Google Maps Tile API | Street View tiles, metadata, panoIds, 3D Tiles |
| Hosting | Local network or Cloudflare Tunnel | Serve to Quest browser on same WiFi |

---

## Google Maps Platform Setup

### 1. Create a Google Cloud Project

- Go to https://console.cloud.google.com
- Create a new project (e.g., "vr-earth-explorer")
- Enable the **Map Tiles API**
- Generate an API key
- Restrict the API key to Map Tiles API only

### 2. Pricing (as of March 2025+)

- **Street View Tiles**: 100,000 free tile requests/month per SKU (Essentials tier)
- **Photorealistic 3D Tiles**: Root tileset requests count against daily quota (15,000/day), but renderer-originated tile requests are unlimited
- **Street View Metadata**: Does NOT count against daily quota
- **Session Tokens**: Do NOT count against daily quota
- **Rate limits**: 6,000 Street View tile queries per minute, 12,000 3D tile renderer queries per minute

For personal use, the free tier is more than sufficient.

### 3. API Key Security

**NEVER expose the API key in client-side code.** The Quest browser runs client JS, so all Google API calls must go through your proxy server.

---

## Core API Reference

### Session Tokens (required for Street View Tiles)

```bash
# Create a session token
curl -X POST -d '{
  "mapType": "streetview",
  "language": "en-US",
  "region": "US"
}' \
-H 'Content-Type: application/json' \
"https://tile.googleapis.com/v1/createSession?key=YOUR_API_KEY"
```

**Response:**
```json
{
  "session": "SESSION_TOKEN_STRING",
  "expiry": "1234567890",
  "tileWidth": 512,
  "tileHeight": 512
}
```

- Session tokens are valid for **2 weeks**
- Required for Street View tiles and 2D tiles
- NOT required for Photorealistic 3D Tiles

### PanoId Lookup (find photospheres near a location)

```bash
# Batch lookup — up to 100 locations per request
curl -X POST -d '{
  "locations": [
    {"lat": 48.8584, "lng": 2.2945},
    {"lat": 40.7484, "lng": -73.9857}
  ],
  "radius": 50
}' \
-H 'Content-Type: application/json' \
"https://tile.googleapis.com/v1/streetview/panoIds?session=SESSION&key=API_KEY"
```

**Response:**
```json
{
  "panoIds": [
    "ACfH-n2HcBvRry_3oc9grw",
    "f5DJZatBAAAXHlooS2wKbw"
  ]
}
```

- Returns empty string `""` for locations with no coverage
- Panorama IDs are **transient** — do not cache long-term, treat as session-scoped
- Use to populate photo sphere markers on the globe

### Street View Metadata (get details about a panorama)

```bash
# By panoId
curl "https://tile.googleapis.com/v1/streetview/metadata?session=SESSION&key=API_KEY&panoId=PANO_ID"

# By coordinates (snaps to nearest panorama)
curl "https://tile.googleapis.com/v1/streetview/metadata?session=SESSION&key=API_KEY&lat=48.8584&lng=2.2945&radius=50"
```

**Response (key fields):**
```json
{
  "panoId": "rZ9KeTyhA11i0VppYNzsSg",
  "lat": 37.420864,
  "lng": -122.084465,
  "imageHeight": 6656,
  "imageWidth": 13312,
  "tileHeight": 512,
  "tileWidth": 512,
  "heading": 94.35,
  "tilt": 88.39,
  "roll": 1.72,
  "imageryType": "outdoor",
  "date": "2023-01",
  "copyright": "© 2023 Google",
  "reportProblemLink": "https://cbks0.googleapis.com/cbk?...",
  "addressComponents": [...],
  "links": [
    {
      "panoId": "Yw4pqzA4FEq1qs-BwZSvSQ",
      "heading": 274.48,
      "text": "Charleston Rd"
    },
    {
      "panoId": "1cODYwFRw1aZ45IignDIMw",
      "heading": 94.48,
      "text": "Charleston Rd"
    }
  ]
}
```

**Critical fields for VR rendering:**
- `imageWidth` / `imageHeight` — full stitched panorama dimensions (typically 13312×6656)
- `tileWidth` / `tileHeight` — individual tile size (typically 512×512)
- `heading`, `tilt`, `roll` — camera orientation for correct initial view direction
- `links` — adjacent panoramas with heading directions (for navigation arrows)
- `copyright` — **MUST be displayed** per Google TOS

### Street View Image Tiles (the actual panorama imagery)

```bash
curl "https://tile.googleapis.com/v1/streetview/tiles/{z}/{x}/{y}?session=SESSION&key=API_KEY&panoId=PANO_ID"
```

**Zoom levels:**

| Zoom | Field of View | Tile Grid (for 13312×6656 pano) | Total Tiles |
|------|--------------|-------------------------------|-------------|
| 0 | 360° | 1×1 | 1 |
| 1 | 180° | 2×1 | 2 |
| 2 | 90° | 4×2 | 8 |
| 3 | 45° | 8×4 | 32 |
| 4 | 22.5° | 16×8 | 128 |
| 5 | 11.25° | 26×13 | 338 |

- At **zoom level 5**: full resolution (16384×8192 typical), this is 16K — extremely crisp in VR
- Calculate max x: `imageWidth / tileWidth`, max y: `imageHeight / tileHeight`
- Response is a JPEG/PNG image tile (format set during session creation)

### Photorealistic 3D Tiles (the globe)

```javascript
// No session token needed — just the API key
const tileset = new Cesium.Cesium3DTileset({
  url: "https://tile.googleapis.com/v1/3dtiles/root.json?key=YOUR_API_KEY",
  showCreditsOnScreen: true
});
viewer.scene.primitives.add(tileset);
```

- Root tileset request starts a 3-hour streaming session
- Renderer-originated tile requests are **unlimited per day**
- Available for 2,500+ cities worldwide
- CesiumJS v1.91+ required (v1.124+ recommended)

---

## Implementation Plan

### Phase 1: Proxy Server

Build a lightweight server that protects your API key and manages sessions.

**Endpoints to implement:**

```
POST   /api/session          → Creates/returns cached streetview session token
POST   /api/panoIds           → Proxies panoId batch lookup
GET    /api/metadata          → Proxies metadata request (?lat=&lng= or ?panoId=)
GET    /api/tile/:z/:x/:y    → Proxies Street View tile request (?panoId=)
GET    /api/3dtiles/*         → Proxies 3D Tiles requests
```

**Key behaviors:**
- Cache session tokens (valid 2 weeks, refresh proactively)
- Cache tile responses in memory or disk (respect Google cache headers)
- Add CORS headers for Quest browser access
- Rate limit client requests to stay within quotas
- Strip API key from all client-facing responses

**Recommended:** Node.js + Express for speed of development, or Rust + Axum if you want performance and low memory (runs great on a Raspberry Pi or your dev machine).

### Phase 2: Globe View (CesiumJS)

The starting experience — a 3D photorealistic globe you can fly around.

**Implementation:**

```javascript
import * as Cesium from 'cesium';

// Initialize viewer
const viewer = new Cesium.Viewer('cesiumContainer', {
  imageryProvider: false,
  baseLayerPicker: false,
  requestRenderMode: true,
  useBrowserRecommendedResolution: false // better VR perf
});

// Load Google 3D Tiles
const tileset = await Cesium.createGooglePhotorealistic3DTileset();
viewer.scene.primitives.add(tileset);

// Performance: increase concurrent requests
Cesium.RequestScheduler.requestsByServer["tile.googleapis.com:443"] = 18;
```

**Photo sphere markers overlay:**
- When camera altitude drops below a threshold (e.g., 2000m), query your proxy for panoIds in the visible area
- Render markers as Cesium billboard entities or point primitives
- Use a grid-based query strategy: divide the viewport into cells, query each
- Color-code markers: blue for Google Street View, orange for user-contributed photospheres

**Transition trigger:**
- User clicks/selects a marker → fetch metadata → transition to Phase 3

### Phase 3: Photosphere View (Three.js + WebXR)

The immersive 360° Street View experience.

**Core pattern (from Three.js webxr_vr_panorama example):**

```javascript
import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';

// Setup renderer with WebXR
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local');
document.body.appendChild(renderer.domElement);
document.body.appendChild(VRButton.createButton(renderer));

// Create inverted sphere for panorama
const geometry = new THREE.SphereGeometry(500, 60, 40);
geometry.scale(-1, 1, 1); // Invert so texture renders on inside

const material = new THREE.MeshBasicMaterial({ map: panoramaTexture });
const sphere = new THREE.Mesh(geometry, material);
scene.add(sphere);

// Animation loop
renderer.setAnimationLoop(() => {
  renderer.render(scene, camera);
});
```

**Tile loading strategy (critical for performance):**

Instead of stitching all tiles into one massive texture (which will OOM on Quest), use a **tiled LOD approach**:

1. **Initial load**: Fetch zoom level 2 (8 tiles, ~90° FOV) — loads fast, covers the whole sphere
2. **Progressive refinement**: As user looks in a direction, fetch higher zoom tiles for that region
3. **Texture atlas**: Pack tiles into a 4096×4096 or 8192×4096 atlas texture
4. **Custom shader**: Map UV coordinates to correct tile positions based on zoom level

Alternative simpler approach for v1:
1. Fetch all tiles at zoom level 3 (32 tiles, manageable)
2. Stitch into a single equirectangular texture (8×4 grid of 512px tiles = 4096×2048)
3. Map onto inverted sphere
4. This gives good quality for VR without overloading Quest GPU

**Navigation between panoramas:**
- Parse `links` array from metadata
- Render arrow indicators on the ground at the heading of each link
- Use Quest controller raycasting to detect selection
- On selection: fetch new panoId tiles, crossfade transition

**Copyright display:**
- Render copyright text as a Three.js sprite or HTML overlay
- Must be visible at all times per Google TOS
- Include "Report a problem" link

### Phase 4: Seamless Transition

The magic moment — going from globe to street level smoothly.

**Approach:**
1. User selects a photosphere marker on the globe
2. Camera zooms toward the marker location
3. At close range, fade to black (or blur)
4. Switch renderer from CesiumJS to Three.js WebXR panorama
5. Load tiles progressively (low-res first, then sharp)
6. Fade in the panorama

**State management:**
```javascript
const AppState = {
  GLOBE: 'globe',
  TRANSITIONING: 'transitioning',
  PHOTOSPHERE: 'photosphere'
};

let currentState = AppState.GLOBE;
let currentPanoId = null;
let currentMetadata = null;
```

**Return to globe:**
- Controller button press (e.g., B button) → fade out → return to globe view at same position

---

## Quest Browser Considerations

### WebXR on Quest
- Quest browser supports WebXR natively
- `navigator.xr.requestSession('immersive-vr')` goes full VR — no browser window visible
- Both controllers tracked, hand tracking available
- `'local'` reference space is recommended for seated/standing photosphere viewing

### Performance Targets
- Quest 2 has Snapdragon XR2, Adreno 650 GPU
- Target 72 FPS (Quest 2 default refresh rate)
- Max texture size: 4096×4096 is safe, 8192×8192 possible but risky
- Keep draw calls under 100 for photosphere view
- For globe view: CesiumJS handles LOD automatically, but may need to reduce `maximumScreenSpaceError`

### Memory Constraints
- Quest 2 has 6GB RAM, ~3GB available for browser
- Don't load zoom-5 full resolution (338 tiles × ~50KB = ~17MB per panorama) all at once
- Use zoom 3-4 as primary, zoom 5 only for area user is looking at
- Aggressively dispose of textures when transitioning between panoramas

### Networking
- Quest browser handles fetch/XHR normally
- CORS must be set on your proxy server
- For local development: serve on your PC's local IP, connect Quest to same WiFi
- For remote: use Cloudflare Tunnel or similar to expose localhost

---

## File Structure

```
vr-earth-explorer/
├── server/                    # Proxy server
│   ├── src/
│   │   ├── main.ts            # Entry point
│   │   ├── routes/
│   │   │   ├── session.ts     # Session token management
│   │   │   ├── panoIds.ts     # PanoId batch lookup
│   │   │   ├── metadata.ts    # Street View metadata proxy
│   │   │   ├── tiles.ts       # Tile proxy with caching
│   │   │   └── 3dtiles.ts     # 3D Tiles proxy
│   │   ├── cache.ts           # In-memory/disk tile cache
│   │   └── config.ts          # API key, settings
│   ├── package.json
│   └── tsconfig.json
│
├── client/                    # WebXR frontend
│   ├── index.html             # Entry point
│   ├── src/
│   │   ├── main.ts            # App bootstrap, state machine
│   │   ├── globe/
│   │   │   ├── GlobeView.ts   # CesiumJS globe setup
│   │   │   ├── markers.ts     # Photosphere marker layer
│   │   │   └── interaction.ts # Globe interaction/selection
│   │   ├── photosphere/
│   │   │   ├── PanoView.ts    # Three.js WebXR panorama renderer
│   │   │   ├── tileLoader.ts  # Progressive tile loading
│   │   │   ├── navigation.ts  # Arrow-based navigation between panos
│   │   │   └── stitcher.ts    # Tile → equirectangular texture
│   │   ├── transition/
│   │   │   └── transition.ts  # Globe ↔ Photosphere transitions
│   │   ├── ui/
│   │   │   ├── vrControls.ts  # Controller input handling
│   │   │   ├── copyright.ts   # Google attribution overlay
│   │   │   └── hud.ts         # Heads-up display (address, etc.)
│   │   └── api/
│   │       └── client.ts      # Proxy API client
│   ├── package.json
│   ├── vite.config.ts         # Vite for dev server + HTTPS
│   └── tsconfig.json
│
├── .env                       # GOOGLE_MAPS_API_KEY=xxx
└── README.md
```

---

## Build Order (Suggested Sprint Plan)

### Sprint 1: Proxy + Basic Photosphere (3-4 days)
- [ ] Set up Google Cloud project, get API key
- [ ] Build proxy server with session management
- [ ] Implement `/api/metadata` and `/api/tile/:z/:x/:y`
- [ ] Build basic Three.js scene: load one hardcoded panorama onto inverted sphere
- [ ] Test in desktop browser first
- [ ] Add WebXR: VRButton, `renderer.xr.enabled = true`
- [ ] Test on Quest browser — confirm full immersion works

### Sprint 2: Navigation Between Panoramas (2-3 days)
- [ ] Parse `links` from metadata
- [ ] Render navigation arrows using controller raycasting
- [ ] Implement tile loading for new panorama on selection
- [ ] Add crossfade transition between panoramas
- [ ] Add copyright/attribution overlay

### Sprint 3: Globe View (3-4 days)
- [ ] Set up CesiumJS with Google Photorealistic 3D Tiles
- [ ] Implement camera controls (fly, zoom, pan)
- [ ] Build photosphere marker layer (query panoIds for visible area)
- [ ] Implement marker selection interaction

### Sprint 4: Seamless Transition (2-3 days)
- [ ] Build state machine (GLOBE → TRANSITIONING → PHOTOSPHERE)
- [ ] Implement zoom-in animation on globe
- [ ] Fade to panorama view
- [ ] "Return to globe" button
- [ ] Polish: loading indicators, error handling

### Sprint 5: Optimization (2-3 days)
- [ ] Progressive tile loading (zoom 2 → 3 → 4 based on gaze)
- [ ] Tile caching on proxy (LRU cache)
- [ ] Memory management: dispose textures on pano switch
- [ ] Performance profiling on Quest 2
- [ ] Reduce CesiumJS overhead for VR rendering

---

## Key Libraries & Versions

```json
{
  "dependencies": {
    "three": "^0.183.0",
    "cesium": "^1.124.0",
    "express": "^4.21.0",
    "node-fetch": "^3.3.0"
  },
  "devDependencies": {
    "vite": "^6.0.0",
    "vite-plugin-cesium": "^1.2.0",
    "typescript": "^5.7.0"
  }
}
```

---

## API Gotchas & Tips

1. **PanoIds are transient.** Never persist them. Re-fetch every session.
2. **Session tokens last 2 weeks** but refresh proactively — don't let them expire mid-use.
3. **Copyright MUST be displayed** on every panorama. Google enforces this in TOS.
4. **Tile coordinates at zoom 5**: max x = `imageWidth/tileWidth - 1`, max y = `imageHeight/tileHeight - 1`. Zoom 0 always has one tile.
5. **3D Tiles root request** starts a 3-hour window. After 3 hours, request a new root tileset.
6. **CORS**: Your proxy must send `Access-Control-Allow-Origin: *` (or your Quest browser's origin).
7. **HTTPS required**: Quest browser may block mixed content. Use self-signed cert for local dev or Cloudflare Tunnel.
8. **Metadata requests are free** — use them liberally for populating markers.
9. **Zoom level 3** (32 tiles, 4096×2048 stitched) is the sweet spot for Quest 2 VR quality vs. performance.
10. **Street View imagery includes both Google-captured and user-contributed (UGC).** There is no way to filter by source via the API.

---

## Reference Links

- [Map Tiles API Overview](https://developers.google.com/maps/documentation/tile/overview)
- [Street View Tiles Documentation](https://developers.google.com/maps/documentation/tile/streetview)
- [Photorealistic 3D Tiles](https://developers.google.com/maps/documentation/tile/3d-tiles)
- [Session Tokens](https://developers.google.com/maps/documentation/tile/session_tokens)
- [CesiumJS + Google 3D Tiles Quickstart](https://cesium.com/learn/cesiumjs-learn/cesiumjs-photorealistic-3d-tiles/)
- [Three.js WebXR VR Panorama Example](https://github.com/mrdoob/three.js/blob/dev/examples/webxr_vr_panorama.html)
- [Three.js WebXR VR Panorama with Depth](https://github.com/mrdoob/three.js/blob/dev/examples/webxr_vr_panorama_depth.html)
- [Map Tiles API Usage & Billing](https://developers.google.com/maps/documentation/tile/usage-and-billing)
- [streetview-dl (reference for tile stitching)](https://github.com/stiles/streetview-dl)
- [WebXR Device API](https://developer.mozilla.org/en-US/docs/Web/API/WebXR_Device_API)
