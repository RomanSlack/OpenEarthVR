# OpenEarthVR Unity — Setup Guide

Native SteamVR photosphere viewer + Cesium globe, built for Linux + Quest 2 via ALVR.

## Prerequisites

- **Unity Hub for Linux**: https://unity.com/download
- **Unity 6.3 LTS** (6000.0.x): install via Unity Hub
- **SteamVR**: installed and running
- **ALVR** or **Air Link**: for Quest 2 streaming

## Step 1: Open Project in Unity

1. Open Unity Hub → "Add" → select the `unity/` directory
2. Unity will import packages from `manifest.json` (takes a few minutes)
3. If prompted to enter Safe Mode due to compile errors, click "Enter Safe Mode" and resolve any package issues first

### Package Resolution Notes

- **Cesium for Unity**: pulled from GitHub. If it fails, manually add via Window > Package Manager > + > Git URL: `https://github.com/CesiumGS/cesium-unity.git`
- **OpenVR XR Plugin**: pulled from Valve's GitHub. If it fails: `https://github.com/ValveSoftware/unity-xr-plugin.git#v2.3.0`
- **Newtonsoft JSON**: `com.unity.nuget.newtonsoft-json` from Unity registry

## Step 2: Configure XR

1. **Edit > Project Settings > XR Plug-in Management**
   - Check **OpenVR Loader** (NOT OpenXR — no Linux support)
   - Under OpenVR Settings:
     - Stereo Rendering Mode: **Single Pass** (NOT Single Pass Instanced — crashes on Linux + Vulkan)

2. **Edit > Project Settings > Player**
   - Graphics APIs (Linux): **Vulkan** only (remove OpenGL if present)
   - Color Space: **Linear**
   - Active Input Handling: **Input System Package (New)**

### Critical Linux VR Constraints

| Combo | Status |
|-------|--------|
| Vulkan + Single Pass | **Works** |
| Vulkan + Multipass | **Crashes** |
| Vulkan + Single Pass Instanced | **Crashes** |
| OpenGL + Multipass | Works (slower) |
| OpenGL + Single Pass Instanced | **Crashes** |

## Step 3: Setup Scene

1. **OpenEarthVR > Setup Scene** (menu bar) — creates the base hierarchy
2. Add **XR Origin (XR Rig)** from XR Interaction Toolkit:
   - Window > Package Manager > XR Interaction Toolkit > Samples > Starter Assets
   - Drag `XR Origin (XR Rig)` prefab into the scene
3. Add **CesiumGeoreference** to `GlobeRoot`:
   - Add Component > CesiumGeoreference
   - Set origin to a default location (e.g., 0, 0, 0)
4. Add **Cesium3DTileset** as child of `GlobeRoot`:
   - Add Component > Cesium3DTileset
   - URL: `http://localhost:3001/api/3dtiles/root.json`
   - (This uses the existing Node.js proxy server)
5. Create **Materials**:
   - PanoMaterial: Shader = `OpenEarthVR/PanoUnlit`, assign to PanoSphere
   - FadeMaterial: Shader = `OpenEarthVR/FadeOverlay`, assign to FadeOverlay
   - NavOrbMaterial: Shader = `OpenEarthVR/NavOrbGlow` (optional, procedural fallback exists)
6. Wire up **SerializeField references**:
   - `GlobeVRInput`: assign XR Origin, right controller, input actions
   - `PanoVRInput`: assign XR Origin, controllers, nav orbs, input actions
   - `CopyrightBadge`: assign VR camera
   - `FadeOverlay`: parent to Main Camera so it follows the head

## Step 4: Input Action Setup

The scripts expect these XR input actions (from XR Interaction Toolkit defaults):
- **Left Joystick**: `XRI LeftHand/Move`
- **Right Joystick**: `XRI RightHand/Turn`
- **Trigger**: `XRI RightHand/Select`
- **Grip**: `XRI RightHand/Activate`
- **Primary Button (A/X)**: `XRI RightHand/UI Press` or custom

## Step 5: Run

1. Start the existing Node.js server: `cd .. && pnpm dev` (server on :3001)
2. Start SteamVR
3. Start ALVR (if streaming to Quest 2)
4. Press Play in Unity

## Architecture

```
AppStateMachine (singleton)
├── Globe mode: CesiumGeoreference + Cesium3DTileset + GlobeVRInput
├── Transitioning: FadeOverlay animations
└── Photosphere mode: PanoSphere + TileLoader + NavOrbs + PanoVRInput
```

All API calls go to the existing Node.js server at `http://localhost:3001`:
- `POST /api/session` — init Google session
- `GET /api/metadata` — panorama metadata
- `GET /api/tile/:z/:x/:y` — tile images
- `GET /api/3dtiles/*` — Google 3D Tiles proxy

## File Reference

| File | Purpose |
|------|---------|
| `Scripts/Core/AppStateMachine.cs` | State machine: GLOBE ↔ TRANSITIONING ↔ PHOTOSPHERE |
| `Scripts/Core/ApiClient.cs` | HTTP calls to Node.js server |
| `Scripts/Core/PanoMetadata.cs` | Data models (metadata, links, etc.) |
| `Scripts/Globe/GlobeManager.cs` | Cesium globe, fly-to, raycast picking |
| `Scripts/Globe/GlobeVRInput.cs` | Joystick orbit/zoom, trigger select |
| `Scripts/Photosphere/PanoSphere.cs` | Inverted sphere mesh + texture |
| `Scripts/Photosphere/TileLoader.cs` | Tile fetching + stitching |
| `Scripts/Photosphere/NavOrbs.cs` | Navigation link orbs |
| `Scripts/Photosphere/PanoVRInput.cs` | Smooth turn, back button, orb select |
| `Scripts/UI/FadeOverlay.cs` | Black fade transitions |
| `Scripts/UI/CopyrightBadge.cs` | Google attribution display |
| `Shaders/PanoUnlit.shader` | URP unlit shader for photosphere |
| `Shaders/FadeOverlay.shader` | URP overlay shader (ZTest Always) |
| `Shaders/NavOrbGlow.shader` | URP additive glow shader |
| `Editor/SceneSetup.cs` | Menu item to create scene hierarchy |
