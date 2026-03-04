import * as THREE from 'three';
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js';
import type { PanoMetadata, PanoLink } from '../api/client.js';

const ORB_RADIUS = 80;
const ORB_Y = -50;

interface OrbData {
  panoId: string;
  phase: number;
  disc: THREE.Mesh;
  glow: THREE.Mesh;
}

export class PanoView {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private sphere: THREE.Mesh;
  private material: THREE.MeshBasicMaterial;
  private container: HTMLElement;
  private _maxTextureSize: number;
  private _maxAnisotropy: number;

  // Look state (degrees)
  private lon = 0;
  private lat = 0;
  private lonVel = 0;
  private latVel = 0;

  private isDragging = false;
  private lastMouseX = 0;
  private lastMouseY = 0;
  private lastDx = 0;
  private lastDy = 0;
  private dragDist = 0;

  // Nav orbs
  private orbData: OrbData[] = [];
  private onNavigate: ((panoId: string) => void) | null = null;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2(-9999, -9999);
  private hoveredDisc: THREE.Mesh | null = null;

  constructor(container: HTMLElement) {
    this.container = container;

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.xr.enabled = true;
    this.renderer.xr.setReferenceSpaceType('local');
    container.appendChild(this.renderer.domElement);
    container.appendChild(VRButton.createButton(this.renderer));

    // Query GPU capabilities for texture size and anisotropy
    const gl = this.renderer.getContext();
    this._maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    this._maxAnisotropy = this.renderer.capabilities.getMaxAnisotropy();

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(
      75,
      container.clientWidth / container.clientHeight,
      0.1,
      1000,
    );
    this.camera.position.set(0, 0, 0);

    const geometry = new THREE.SphereGeometry(500, 80, 60);
    geometry.scale(-1, 1, 1);
    this.material = new THREE.MeshBasicMaterial({
      side: THREE.FrontSide,
      transparent: true,
      opacity: 0,
    });
    this.sphere = new THREE.Mesh(geometry, this.material);
    this.scene.add(this.sphere);

    this.setupControls();
    this.setupVRController();
    window.addEventListener('resize', () => this.onResize());
    this.renderer.setAnimationLoop(() => this.render());
  }

  applyTexture(texture: THREE.CanvasTexture, metadata: PanoMetadata): void {
    const wasVisible = this.material.opacity >= 0.9;
    const oldTexture = this.material.map;
    this.material.map = texture;
    this.material.transparent = true;
    this.material.needsUpdate = true;
    this.sphere.rotation.y = THREE.MathUtils.degToRad(metadata.heading);
    if (oldTexture) oldTexture.dispose();

    if (wasVisible) {
      // Already showing coarse — snap to fine without fade flicker
      this.material.opacity = 1;
      this.material.transparent = false;
      return;
    }

    // Fade in from black
    this.material.opacity = 0;
    const fadeIn = (): void => {
      this.material.opacity = Math.min(this.material.opacity + 0.04, 1);
      if (this.material.opacity < 1) requestAnimationFrame(fadeIn);
      else this.material.transparent = false;
    };
    requestAnimationFrame(fadeIn);
  }

  reset(): void {
    if (this.material.map) {
      this.material.map.dispose();
      this.material.map = null;
    }
    this.material.opacity = 0;
    this.material.transparent = true;
    this.material.needsUpdate = true;
    this.clearNavLinks();
  }

  resize(): void {
    this.onResize();
  }

  setNavLinks(links: PanoLink[], onNavigate: (panoId: string) => void): void {
    this.clearNavLinks();
    this.onNavigate = onNavigate;

    const discGeo = new THREE.CircleGeometry(6, 32);
    const glowGeo = new THREE.RingGeometry(6, 10, 32);

    links.forEach((link, i) => {
      const heading = THREE.MathUtils.degToRad(link.heading);
      const x = Math.sin(heading) * ORB_RADIUS;
      const z = -Math.cos(heading) * ORB_RADIUS;

      const discMat = new THREE.MeshBasicMaterial({
        color: 0x4fc3f7,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const disc = new THREE.Mesh(discGeo, discMat);
      disc.position.set(x, ORB_Y, z);
      disc.rotation.x = -Math.PI / 2;
      disc.userData = { panoId: link.panoId };

      const glowMat = new THREE.MeshBasicMaterial({
        color: 0x4fc3f7,
        transparent: true,
        opacity: 0.35,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const glow = new THREE.Mesh(glowGeo, glowMat);
      glow.position.set(x, ORB_Y, z);
      glow.rotation.x = -Math.PI / 2;

      this.scene.add(disc);
      this.scene.add(glow);
      this.orbData.push({ panoId: link.panoId, phase: i * 0.8, disc, glow });
    });
  }

  clearNavLinks(): void {
    for (const { disc, glow } of this.orbData) {
      this.scene.remove(disc);
      this.scene.remove(glow);
      disc.geometry.dispose();
      (disc.material as THREE.Material).dispose();
      glow.geometry.dispose();
      (glow.material as THREE.Material).dispose();
    }
    this.orbData = [];
    this.onNavigate = null;
    this.hoveredDisc = null;
  }

  private setupControls(): void {
    const { container } = this;

    const onDragStart = (x: number, y: number): void => {
      this.isDragging = true;
      this.lastMouseX = x;
      this.lastMouseY = y;
      this.lastDx = 0;
      this.lastDy = 0;
      this.dragDist = 0;
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
      this.dragDist += Math.sqrt(dx * dx + dy * dy);
      this.lon -= dx * 0.2;
      this.lat += dy * 0.2;
      this.lat = Math.max(-85, Math.min(85, this.lat));
    };

    const onDragEnd = (): void => {
      if (!this.isDragging) return;
      this.isDragging = false;
      this.lonVel = -this.lastDx * 0.2;
      this.latVel =  this.lastDy * 0.2;
      container.classList.remove('grabbing');
    };

    container.addEventListener('mousedown', (e) => onDragStart(e.clientX, e.clientY));
    window.addEventListener('mouseup', onDragEnd);
    window.addEventListener('mousemove', (e) => {
      onDragMove(e.clientX, e.clientY);
      const rect = container.getBoundingClientRect();
      this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    });

    container.addEventListener('click', () => {
      if (this.dragDist > 5) return; // was a drag, not a click
      this.trySelectOrb();
    });

    container.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) onDragStart(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });
    window.addEventListener('touchend', onDragEnd);
    window.addEventListener('touchmove', (e) => {
      if (e.touches.length === 1) onDragMove(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });
  }

  private setupVRController(): void {
    const controller = this.renderer.xr.getController(0);
    controller.addEventListener('selectstart', () => {
      if (this.orbData.length === 0 || !this.onNavigate) return;
      const tempMatrix = new THREE.Matrix4();
      tempMatrix.extractRotation(controller.matrixWorld);
      this.raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
      this.raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);
      const discs = this.orbData.map((o) => o.disc);
      const hits = this.raycaster.intersectObjects(discs);
      if (hits.length > 0) {
        const panoId = (hits[0].object as THREE.Mesh).userData.panoId as string;
        this.onNavigate(panoId);
      }
    });
    this.scene.add(controller);
  }

  private trySelectOrb(): void {
    if (this.orbData.length === 0 || !this.onNavigate) return;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const discs = this.orbData.map((o) => o.disc);
    const hits = this.raycaster.intersectObjects(discs);
    if (hits.length > 0) {
      const panoId = (hits[0].object as THREE.Mesh).userData.panoId as string;
      this.onNavigate(panoId);
    }
  }

  private updateHover(): void {
    if (this.orbData.length === 0) return;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const discs = this.orbData.map((o) => o.disc);
    const hits = this.raycaster.intersectObjects(discs);

    const newHovered = hits.length > 0 ? (hits[0].object as THREE.Mesh) : null;
    if (newHovered !== this.hoveredDisc) {
      this.hoveredDisc = newHovered;
      this.container.style.cursor = newHovered ? 'pointer' : '';
    }
  }

  private animateOrbs(): void {
    if (this.orbData.length === 0) return;
    const t = Date.now() * 0.002;
    for (const { disc, glow, phase } of this.orbData) {
      const pulse = 0.65 + 0.2 * Math.sin(t + phase);
      (disc.material as THREE.MeshBasicMaterial).opacity = pulse;
      if (disc !== this.hoveredDisc) {
        disc.scale.setScalar(1 + 0.08 * Math.sin(t + phase));
      } else {
        disc.scale.setScalar(1.3);
      }
      (glow.material as THREE.MeshBasicMaterial).opacity = pulse * 0.4;
    }
  }

  private updateDesktopCamera(): void {
    if (!this.isDragging) {
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
      this.updateHover();
    }
    this.animateOrbs();
    this.renderer.render(this.scene, this.camera);
  }

  private onResize(): void {
    const { container } = this;
    this.camera.aspect = container.clientWidth / container.clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(container.clientWidth, container.clientHeight);
  }

  get maxTextureSize(): number {
    return this._maxTextureSize;
  }

  get maxAnisotropy(): number {
    return this._maxAnisotropy;
  }

  dispose(): void {
    this.clearNavLinks();
    this.renderer.setAnimationLoop(null);
    this.renderer.dispose();
    if (this.material.map) this.material.map.dispose();
    this.material.dispose();
    this.sphere.geometry.dispose();
  }
}
