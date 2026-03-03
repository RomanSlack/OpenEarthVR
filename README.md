# VR Earth Explorer

A WebXR photosphere viewer that loads Google Street View panoramas and renders them on an inverted sphere using Three.js. Built for the Meta Quest 2 browser; also works on desktop with mouse-drag navigation.

The server acts as an authenticated proxy so the Google Maps API key is never exposed to the client.

---

## Architecture

```
client (Vite + Three.js)  →  /api/*  →  server (Express proxy)  →  Google Tiles API
```

- **Server** — Node.js/Express, TypeScript, ESM. Manages session tokens and streams panorama tiles.
- **Client** — Vite SPA with HTTPS (required for WebXR). Fetches tiles in parallel, stitches them on a canvas, and maps the texture onto an inverted sphere.

---

## Prerequisites

- Node.js 20+
- pnpm (`npm install -g pnpm`)
- A [Google Maps Platform](https://developers.google.com/maps/documentation/tile/get-api-key) API key with the **Map Tiles API** enabled

---

## Local development

```bash
# 1. Clone and install
git clone https://github.com/your-username/OpenEarthVR.git
cd OpenEarthVR
pnpm install

# 2. Set your API key
echo "GOOGLE_MAPS_API_KEY=your_key_here" > .env
echo "PORT=3001" >> .env

# 3. Start both server and client
pnpm dev
```

The client starts at `https://localhost:5173`. Accept the self-signed certificate in your browser.

---

## Testing on Meta Quest 2

1. Connect the Quest and your PC to the same WiFi network.
2. Run `pnpm dev` on the PC.
3. Find your local IP: `ip addr` (Linux) or `ipconfig` (Windows).
4. On the Quest browser, navigate to `https://<local-ip>:5173`.
5. Accept the self-signed certificate (the browser may warn; proceed anyway).
6. Tap **Enter VR**.

---

## Deployment

### Option A — Railway (recommended, persistent server)

Railway supports Node.js out of the box and auto-deploys from GitHub.

1. Push this repo to GitHub.
2. Create a new Railway project, connect the repo.
3. Set environment variable `GOOGLE_MAPS_API_KEY` in the Railway dashboard.
4. Set the start command to `pnpm --filter server start` and build command to `pnpm install && pnpm --filter server build`.
5. Add a second service (static site) pointed at `client/dist` after running `pnpm --filter client build`.

Or deploy to a single VPS (DigitalOcean, Hetzner, etc.) and run `pnpm --filter server start` behind a reverse proxy with a real TLS certificate from Let's Encrypt. WebXR on Quest requires HTTPS with a valid cert in production.

### Option B — Vercel (serverless)

The Express routes can run as Vercel serverless functions using `@vercel/node`. The in-memory session cache does not persist across cold starts but the app remains functional — the session is simply re-fetched as needed. See Sprint 2 for a proper Vercel adapter.

### HTTPS note

WebXR requires a secure context. For local dev the `@vitejs/plugin-basic-ssl` self-signed cert works. In production you need a real certificate (Let's Encrypt, Cloudflare Tunnel, or your host's managed TLS).

---

## Project structure

```
OpenEarthVR/
├── .env                          # GOOGLE_MAPS_API_KEY, PORT (not committed)
├── pnpm-workspace.yaml
├── server/
│   └── src/
│       ├── main.ts               # Express app
│       ├── config.ts             # Env loading, constants
│       ├── cache.ts              # In-memory session token cache
│       └── routes/
│           ├── session.ts        # POST /api/session
│           ├── metadata.ts       # GET  /api/metadata
│           └── tiles.ts          # GET  /api/tile/:z/:x/:y
└── client/
    ├── index.html
    └── src/
        ├── main.ts               # Startup sequence
        ├── api/client.ts         # Typed fetch wrappers
        └── photosphere/
            ├── PanoView.ts       # Three.js scene, WebXR, inertia controls
            ├── tileLoader.ts     # Parallel tile fetch with progress callback
            └── stitcher.ts       # Canvas stitch to THREE.CanvasTexture
```

---

## API routes

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Health check |
| `POST` | `/api/session` | Warm up Google session token cache |
| `GET` | `/api/metadata?lat=&lng=` | Panorama metadata by coordinates |
| `GET` | `/api/metadata?panoId=` | Panorama metadata by ID |
| `GET` | `/api/tile/:z/:x/:y?panoId=` | Proxy a single panorama tile |

---

## Sprint roadmap

- **Sprint 1** (current) — Photosphere viewer, WebXR, proxy server
- Sprint 2 — Navigation arrows, panoId linking
- Sprint 3 — Globe view with CesiumJS
- Sprint 4 — Location search
- Sprint 5 — Server-side tile caching
