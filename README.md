# OpenEarthVR

A WebXR Google Earth clone — explore a photorealistic 3D globe and drop into full-resolution Street View photospheres in VR.

Built for Meta Quest 2 (and desktop browsers).

## Features

- **Photorealistic 3D Globe** — Google 3D Tiles via CesiumJS with HDR, PBR tone mapping, atmosphere, fog, and ambient occlusion
- **Street View Coverage Overlay** — Blue coverage layer draped on 3D tiles shows where you can enter Street View
- **Click-to-Enter** — Click anywhere on the globe with coverage to drop into the nearest photosphere
- **Full-Resolution Photospheres** — Adaptive zoom (up to 13312x6656 on desktop, auto-scaled for Quest 2) with progressive loading, anisotropic filtering, mipmaps, and nadir fill
- **Fly-Down Transitions** — Smooth camera animation from globe to street level, then fade to photosphere
- **WebXR / VR Mode** — Immersive photosphere viewing with controller-based navigation
- **Nav Orbs** — Click floating orbs to move between connected Street View locations

## Prerequisites

- Node.js 18+
- pnpm (`npm install -g pnpm`)
- A [Google Maps Platform](https://developers.google.com/maps/documentation/tile/get-api-key) API key with **Map Tiles API** and **Street View Static API** enabled

## Setup

```bash
git clone https://github.com/your-username/OpenEarthVR.git
cd OpenEarthVR
pnpm install

# Configure API key
echo "GOOGLE_MAPS_API_KEY=your_key_here" > .env
echo "PORT=3001" >> .env

# Start dev server (server on :3001, client on https://localhost:5173)
pnpm dev
```

Open https://localhost:5173 and accept the self-signed certificate.

## Testing on Quest 2

Your Quest and dev machine must be on the same Wi-Fi network.

1. Find your machine's local IP:
   ```bash
   hostname -I | awk '{print $1}'   # Linux
   ipconfig getifaddr en0            # macOS
   ```

2. Make sure `client/vite.config.ts` has `server.host: '0.0.0.0'` so Vite binds to all interfaces.

3. On your Quest 2, open **Meta Browser** and go to:
   ```
   https://192.168.x.x:5173
   ```
   Accept the self-signed certificate warning.

4. The globe loads. Click a blue-highlighted area, wait for the photosphere, then tap **Enter VR**.

> **Tip:** If the Quest browser blocks the cert, visit `https://192.168.x.x:3001/api/health` first and accept there, then navigate to port 5173.

## Architecture

```
OpenEarthVR/
├── server/            Express API proxy (hides Google API key from client)
│   └── src/
│       ├── main.ts             Express app + rate limiter
│       ├── config.ts           Env loading
│       ├── cache.ts            In-memory session cache
│       └── routes/
│           ├── session.ts      POST /api/session
│           ├── metadata.ts     GET  /api/metadata?lat=&lng= or ?panoId=
│           ├── tiles.ts        GET  /api/tile/:z/:x/:y
│           ├── svOverlay.ts    GET  /api/sv-overlay/:z/:x/:y
│           ├── tiles3d.ts      GET  /api/3dtiles/*
│           ├── panoIds.ts      POST /api/panoIds
│           └── photospheres.ts POST /api/photospheres
├── client/            Vite + Three.js + CesiumJS
│   └── src/
│       ├── main.ts                   State machine (GLOBE ↔ PHOTOSPHERE)
│       ├── api/client.ts             Typed fetch wrappers
│       ├── globe/GlobeView.ts        CesiumJS globe + 3D tiles + SV overlay
│       ├── photosphere/
│       │   ├── PanoView.ts           Three.js sphere + WebXR + nav orbs
│       │   ├── tileLoader.ts         Adaptive tile fetching (zoom 2→5)
│       │   └── stitcher.ts           Canvas stitching + nadir fill
│       └── ui/
│           ├── overlay.ts            Fade transitions
│           └── copyright.ts          Copyright badge
└── .env               GOOGLE_MAPS_API_KEY, PORT
```

## API Routes

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/api/health` | Health check |
| `POST` | `/api/session` | Initialize Google tile session |
| `GET`  | `/api/metadata?lat=&lng=` | Pano metadata by coordinates |
| `GET`  | `/api/metadata?panoId=` | Pano metadata by ID |
| `GET`  | `/api/tile/:z/:x/:y?panoId=` | Street View tile proxy |
| `GET`  | `/api/sv-overlay/:z/:x/:y` | Street View coverage overlay tile |
| `GET`  | `/api/3dtiles/*` | Google 3D Tiles proxy |
| `POST` | `/api/panoIds` | Batch pano ID lookup |
| `POST` | `/api/photospheres` | Photosphere search by bounds |

## Deployment

WebXR requires HTTPS with a valid certificate in production. Options:

- **Railway** — Set `GOOGLE_MAPS_API_KEY` env var, deploy from GitHub
- **VPS** — Run behind a reverse proxy with Let's Encrypt TLS
- **Cloudflare Tunnel** — Expose local dev to the internet with a real cert

## License

MIT
