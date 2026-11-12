import * as THREE from 'three';
import { PALETTE, toon } from './materials';

/** Renderer, camera, lights, ground and background decoration. */
export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(36, 9 / 16, 0.1, 200);
  readonly sun: THREE.DirectionalLight;
  readonly ground: THREE.Mesh;
  private clouds: THREE.Object3D[] = [];
  groundY = -8;
  /** Screen pixels reserved at the top (HUD) and bottom. */
  insetTop = 70;
  insetBottom = 10;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    const hemi = new THREE.HemisphereLight(0xffffff, 0xcfc4ff, 1.6);
    this.scene.add(hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 1.9);
    this.sun.position.set(2.5, 18, 5);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.radius = 4;
    this.sun.shadow.bias = -0.0008;
    this.scene.add(this.sun, this.sun.target);

    // Ground: a soft grassy island (an ellipse) under the mobile, where the queue waits.
    const g = new THREE.CylinderGeometry(1, 1, 1, 48);
    g.translate(0, -0.5, 0);
    this.ground = new THREE.Mesh(g, toon(PALETTE.ground));
    this.ground.receiveShadow = true;
    const rim = new THREE.Mesh(g, toon(PALETTE.groundDark));
    rim.scale.set(1.0, 0.6, 1.0);
    rim.position.y = -0.95;
    this.ground.add(rim);
    this.scene.add(this.ground);

    // Low-poly clouds in the background (one shared geometry).
    const cg = new THREE.IcosahedronGeometry(1, 0);
    const cm = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: toon(0).gradientMap });
    for (let i = 0; i < 6; i++) {
      const c = new THREE.Group();
      for (let j = 0; j < 3; j++) {
        const m = new THREE.Mesh(cg, cm);
        m.scale.setScalar(0.9 + j * 0.25 - (j === 2 ? 0.5 : 0));
        m.position.set(j * 1.1 - 1.1, j === 1 ? 0.35 : 0, 0);
        c.add(m);
      }
      c.position.set((i % 2 ? 1 : -1) * (5 + ((i * 1.7) % 4)), 6 - i * 3.2, -10 - (i % 3) * 3);
      c.userData.speed = 0.15 + (i % 3) * 0.08;
      this.scene.add(c);
      this.clouds.push(c);
    }
  }

  /** Island top at height y, half-width hw (x) and half-depth hd (z). */
  setGround(y: number, hw: number, hd: number) {
    this.groundY = y;
    this.ground.position.set(0, y, 0);
    this.ground.scale.set(hw, 0.7, hd);
  }

  /** Frame a world box so that it fits the portrait screen (minus the HUD inset). */
  frame(minX: number, maxX: number, minY: number, maxY: number) {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    const aspect = w / h;
    this.camera.aspect = aspect;
    const usableH = h - this.insetTop - this.insetBottom;
    const vfov = THREE.MathUtils.degToRad(this.camera.fov);
    const tanV = Math.tan(vfov / 2);
    const boxW = maxX - minX;
    const boxH = maxY - minY;
    // distance so that the box height fits in the usable part, and its width fits the screen
    const dH = boxH / 2 / (tanV * (usableH / h));
    const dW = boxW / 2 / (tanV * aspect);
    const d = Math.max(dH, dW) * 1.03 + 0.6;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    // shift so the box centre lands in the centre of the usable area
    const worldPerPx = (2 * tanV * d) / h;
    const shiftY = ((this.insetTop - this.insetBottom) / 2) * worldPerPx;
    const tilt = THREE.MathUtils.degToRad(9); // slight top-down view
    this.camera.position.set(cx, cy + shiftY + Math.sin(tilt) * d, Math.cos(tilt) * d);
    this.camera.lookAt(cx, cy + shiftY, 0);
    this.camera.updateProjectionMatrix();
    // shadow camera covering the play area
    const sc = this.sun.shadow.camera;
    const r = Math.max(boxW, boxH) * 0.65;
    sc.left = -r;
    sc.right = r;
    sc.top = r;
    sc.bottom = -r;
    sc.near = 1;
    sc.far = 60;
    this.sun.position.set(cx + 2.5, cy + 18, 5);
    this.sun.target.position.set(cx, cy, 0);
    sc.updateProjectionMatrix();
  }

  update(dt: number) {
    for (const c of this.clouds) {
      c.position.x += c.userData.speed * dt;
      if (c.position.x > 14) c.position.x = -14;
    }
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  /** Project a world point to CSS pixels. */
  toScreen(v: THREE.Vector3): { x: number; y: number } {
    const p = v.clone().project(this.camera);
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    return { x: ((p.x + 1) / 2) * w, y: ((1 - p.y) / 2) * h };
  }
}
