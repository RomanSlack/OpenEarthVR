import * as Cesium from 'cesium';

export class GlobeView {
  public viewer: Cesium.Viewer;
  private container: HTMLElement;
  private onEnterPano: (lat: number, lng: number) => void;
  private handler: Cesium.ScreenSpaceEventHandler;
  private lastPanoLat = 0;
  private lastPanoLng = 0;
  private tileset: Cesium.Cesium3DTileset | null = null;
  private svOverlayLayer: Cesium.ImageryLayer | null = null;

  constructor(container: HTMLElement, onEnterPano: (lat: number, lng: number) => void) {
    this.container = container;
    this.onEnterPano = onEnterPano;

    Cesium.Ion.defaultAccessToken = '';

    // Allow more concurrent tile requests to Google servers
    (Cesium.RequestScheduler as any).requestsByServer['tile.googleapis.com:443'] = 18;

    this.viewer = new Cesium.Viewer(container, {
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      animation: false,
      timeline: false,
      requestRenderMode: false,
      msaaSamples: 4,
    });

    this.viewer.imageryLayers.removeAll();

    // --- Rendering quality ---
    const scene = this.viewer.scene;

    // Enable depth picking so we can click on 3D tiles surface
    scene.globe.depthTestAgainstTerrain = true;

    // HDR + tone mapping
    scene.highDynamicRange = true;
    scene.postProcessStages.tonemapper = Cesium.Tonemapper.PBR_NEUTRAL;

    // Freeze clock to midday for consistent lighting
    this.viewer.clock.shouldAnimate = false;
    this.viewer.clock.currentTime = Cesium.JulianDate.fromDate(new Date('2024-06-21T12:00:00Z'));

    // Sun light
    scene.light = new Cesium.SunLight();

    // Atmosphere
    if (scene.skyAtmosphere) {
      scene.skyAtmosphere.show = true;
    }

    // Fog
    scene.fog.enabled = true;

    // Ambient occlusion (gentle — Google tiles have baked lighting)
    if (scene.postProcessStages.ambientOcclusion) {
      scene.postProcessStages.ambientOcclusion.enabled = true;
      const ao = scene.postProcessStages.ambientOcclusion;
      (ao as any).uniforms.intensity = 1.5;
    }

    this.handler = new Cesium.ScreenSpaceEventHandler(this.viewer.scene.canvas);
    this.setupClickHandler();

    // loadTileset is async — SV overlay is added inside after tileset loads
    this.loadTileset();

    // Start at a useful altitude over Salt Lake City
    this.viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(-111.8910, 40.7608, 8000),
      orientation: {
        heading: 0,
        pitch: Cesium.Math.toRadians(-60),
        roll: 0,
      },
    });
  }

  private async loadTileset(): Promise<void> {
    try {
      this.tileset = await Cesium.Cesium3DTileset.fromUrl('/api/3dtiles/root.json', {
        maximumScreenSpaceError: 8,
        preloadFlightDestinations: true,
        cacheBytes: 1024 * 1024 * 1024,
        maximumCacheOverflowBytes: 512 * 1024 * 1024,
      });
      this.viewer.scene.primitives.add(this.tileset);

      // Now that tileset is loaded, drape SV overlay on it
      this.addSvOverlay();
    } catch (e) {
      console.error('[globe] Failed to load 3D tiles:', e);
    }
  }

  private addSvOverlay(): void {
    if (!this.tileset) return;
    try {
      const provider = new Cesium.UrlTemplateImageryProvider({
        url: '/api/sv-overlay/{z}/{x}/{y}',
        minimumLevel: 0,
        maximumLevel: 18,
        credit: '',
      });

      // Drape on the 3D tileset so it's visible on top of 3D tiles
      const tilesetLayers = (this.tileset as any).imageryLayers;
      if (tilesetLayers && typeof tilesetLayers.addImageryProvider === 'function') {
        this.svOverlayLayer = tilesetLayers.addImageryProvider(provider);
      } else {
        console.warn('[globe] tileset.imageryLayers not available, falling back to globe imagery');
        this.svOverlayLayer = this.viewer.imageryLayers.addImageryProvider(provider);
      }

      if (this.svOverlayLayer) {
        this.svOverlayLayer.alpha = 0.8;
      }

      // Hide overlay above 20km for perf
      this.viewer.scene.preRender.addEventListener(() => {
        if (!this.svOverlayLayer) return;
        const height = this.viewer.camera.positionCartographic.height;
        this.svOverlayLayer.show = height < 20_000;
      });
    } catch (e) {
      console.error('[globe] Failed to add SV overlay:', e);
    }
  }

  private setupClickHandler(): void {
    this.handler.setInputAction((click: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
      // Pick position on 3D tileset surface
      const cartesian = this.viewer.scene.pickPosition(click.position);
      if (!cartesian) {
        // Fallback: pick on globe ellipsoid
        const ray = this.viewer.camera.getPickRay(click.position);
        if (!ray) return;
        const globePos = this.viewer.scene.globe.pick(ray, this.viewer.scene);
        if (!globePos) return;
        const carto = Cesium.Cartographic.fromCartesian(globePos);
        this.onEnterPano(
          Cesium.Math.toDegrees(carto.latitude),
          Cesium.Math.toDegrees(carto.longitude),
        );
        return;
      }

      const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
      this.onEnterPano(
        Cesium.Math.toDegrees(cartographic.latitude),
        Cesium.Math.toDegrees(cartographic.longitude),
      );
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  }

  // --- Fly-to support ---

  flyToLocation(lat: number, lng: number, height: number, duration: number): Promise<void> {
    return new Promise<void>((resolve) => {
      this.viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(lng, lat, height),
        orientation: {
          heading: 0,
          pitch: Cesium.Math.toRadians(-60),
          roll: 0,
        },
        duration,
        complete: () => resolve(),
        cancel: () => resolve(),
      });
    });
  }

  setViewAboveLocation(lat: number, lng: number, height: number): void {
    this.viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(lng, lat, height),
      orientation: {
        heading: 0,
        pitch: Cesium.Math.toRadians(-60),
        roll: 0,
      },
    });
  }

  setLastPanoLocation(lat: number, lng: number): void {
    this.lastPanoLat = lat;
    this.lastPanoLng = lng;
  }

  getLastPanoLocation(): { lat: number; lng: number } {
    return { lat: this.lastPanoLat, lng: this.lastPanoLng };
  }

  show(): void {
    this.container.style.display = 'block';
  }

  hide(): void {
    this.container.style.display = 'none';
  }

  destroy(): void {
    this.handler.destroy();
    this.viewer.destroy();
  }
}
