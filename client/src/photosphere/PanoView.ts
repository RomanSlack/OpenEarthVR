import * as THREE from 'three';
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js';
import type { PanoMetadata } from '../api/client.js';

export class PanoView {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private sphere: THREE.Mesh;
  private material: THREE.MeshBasicMaterial;
  private container: HTMLElement;

  // Smoothed look state (degrees)
  private lon = 0;
  private lat = 0;
  // Inertia — velocity accumulates while dragging, decays after release
  private lonVel = 0;
  private latVel = 0;

  private isDragging = false;
  private lastMouseX = 0;
  private lastMouseY = 0;
  private lastDx = 0;
  private lastDy = 0;

  constructor(container: HTMLElement) {
    this.container = container;

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.xr.enabled = true;
    this.renderer.xr.setReferenceSpaceType('local');
    container.appendChild(this.renderer.domElement);

    // VR button (styled via CSS in index.html)
    container.appendChild(VRButton.createButton(this.renderer));

    // Scene
    this.scene = new THREE.Scene();

    // Camera
    this.camera = new THREE.PerspectiveCamera(
      75,
      container.clientWidth / container.clientHeight,
      0.1,
      1000,
    );
    this.camera.position.set(0, 0, 0);

    // Inverted sphere — fully transparent until applyTexture is called
    const geometry = new THREE.SphereGeometry(500, 60, 40);
    geometry.scale(-1, 1, 1);
    this.material = new THREE.MeshBasicMaterial({
      side: THREE.FrontSide,
      transparent: true,
      opacity: 0,
    });
    this.sphere = new THREE.Mesh(geometry, this.material);
    this.scene.add(this.sphere);

    this.setupControls();
    window.addEventListener('resize', () => this.onResize());
    this.renderer.setAnimationLoop(() => this.render());
  }

  applyTexture(texture: THREE.CanvasTexture, metadata: PanoMetadata): void {
    const oldTexture = this.material.map;
    this.material.map = texture;
    this.material.needsUpdate = true;
    this.sphere.rotation.y = THREE.MathUtils.degToRad(metadata.heading);
    if (oldTexture) oldTexture.dispose();

    // Fade in
    this.material.opacity = 0;
    const fadeIn = (): void => {
      this.material.opacity = Math.min(this.material.opacity + 0.04, 1);
      if (this.material.opacity < 1) requestAnimationFrame(fadeIn);
      else this.material.transparent = false; // disable transparency once fully opaque (perf)
    };
    requestAnimationFrame(fadeIn);
  }

  private setupControls(): void {
    const { container } = this;

    const onDragStart = (x: number, y: number): void => {
      this.isDragging = true;
      this.lastMouseX = x;
      this.lastMouseY = y;
      this.lastDx = 0;
      this.lastDy = 0;
      this.lonVel = 0;
      this.latVel = 0;
      container.classList.add('grabbing');
    };

    const onDragMove = (x: number, y: number): void => {
      if (!this.isDragging) return;
      const dx = x - this.lastMouseX;
      const dy = y - this.lastMouseY;
      this.lastMouseX = x;
      this.lastMouseY = y;
      this.lastDx = dx;
      this.lastDy = dy;

      this.lon -= dx * 0.2;
      this.lat += dy * 0.2;
      this.lat = Math.max(-85, Math.min(85, this.lat));
    };

    const onDragEnd = (): void => {
      if (!this.isDragging) return;
      this.isDragging = false;
      // Seed inertia from last frame's delta
      this.lonVel = -this.lastDx * 0.2;
      this.latVel =  this.lastDy * 0.2;
      container.classList.remove('grabbing');
    };

    // Mouse
    container.addEventListener('mousedown', (e) => onDragStart(e.clientX, e.clientY));
    window.addEventListener('mouseup', onDragEnd);
    window.addEventListener('mousemove', (e) => onDragMove(e.clientX, e.clientY));

    // Touch
    container.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) onDragStart(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });
    window.addEventListener('touchend', onDragEnd);
    window.addEventListener('touchmove', (e) => {
      if (e.touches.length === 1) onDragMove(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });
  }

  private updateDesktopCamera(): void {
    if (!this.isDragging) {
      // Apply inertia
      const decay = 0.88;
      this.lonVel *= decay;
      this.latVel *= decay;
      if (Math.abs(this.lonVel) > 0.001 || Math.abs(this.latVel) > 0.001) {
        this.lon += this.lonVel;
        this.lat += this.latVel;
        this.lat = Math.max(-85, Math.min(85, this.lat));
      }
    }

    const phi   = THREE.MathUtils.degToRad(90 - this.lat);
    const theta = THREE.MathUtils.degToRad(this.lon);
    const target = new THREE.Vector3(
      Math.sin(phi) * Math.cos(theta),
      Math.cos(phi),
      Math.sin(phi) * Math.sin(theta),
    );
    this.camera.lookAt(target);
  }

  private render(): void {
    if (!this.renderer.xr.isPresenting) {
      this.updateDesktopCamera();
    }
    this.renderer.render(this.scene, this.camera);
  }

  private onResize(): void {
    const { container } = this;
    this.camera.aspect = container.clientWidth / container.clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(container.clientWidth, container.clientHeight);
  }

  dispose(): void {
    this.renderer.setAnimationLoop(null);
    this.renderer.dispose();
    if (this.material.map) this.material.map.dispose();
    this.material.dispose();
    this.sphere.geometry.dispose();
  }
}
