import * as THREE from 'three';
import type { Weight } from '../core/types';
import { PALETTE, WEIGHT_COLORS, numberBadge, toon } from './materials';

export const WEIGHT_SCALE: Record<Weight, number> = { 1: 0.8, 2: 1.0, 3: 1.22 };
/** Head-top height of a Tottler at scale 1. */
export const TOTTLER_HEIGHT = 1.22;

// Shared geometries for every Tottler (one GPU buffer each).
let geo: {
  limb: THREE.CapsuleGeometry;
  torso: THREE.CapsuleGeometry;
  head: THREE.SphereGeometry;
  eye: THREE.SphereGeometry;
} | null = null;
function geometries() {
  if (!geo) {
    const limb = new THREE.CapsuleGeometry(0.07, 0.24, 3, 8);
    limb.translate(0, -0.19, 0); // pivot at the top (shoulder / hip)
    geo = {
      limb,
      torso: new THREE.CapsuleGeometry(0.17, 0.2, 4, 10),
      head: new THREE.SphereGeometry(0.23, 14, 10),
      eye: new THREE.SphereGeometry(0.045, 8, 6),
    };
  }
  return geo;
}

export type TottlerMood = 'idle' | 'jump' | 'whoa' | 'fall' | 'cheer';

/** A procedurally built stickman. `root` sits at the feet. */
export class TottlerView {
  readonly root = new THREE.Group();
  /** Everything above the feet; squashed / bobbed independently of the root transform. */
  readonly body = new THREE.Group();
  private armL: THREE.Mesh;
  private armR: THREE.Mesh;
  private legL: THREE.Mesh;
  private legR: THREE.Mesh;
  private torso: THREE.Mesh;
  private head: THREE.Mesh;
  private badge: THREE.Sprite;
  mood: TottlerMood = 'idle';
  /** −1…1: how much the ground under it is tilting (drives the arm waving). */
  agitation = 0;
  private t = Math.random() * 10;
  private squash = 0;
  private squashV = 0;
  readonly scale: number;

  constructor(
    readonly id: number,
    readonly weight: Weight,
  ) {
    const g = geometries();
    const mat = toon(WEIGHT_COLORS[weight]);
    const eyeMat = toon(PALETTE.eye);
    this.scale = WEIGHT_SCALE[weight];

    this.legL = new THREE.Mesh(g.limb, mat);
    this.legR = new THREE.Mesh(g.limb, mat);
    this.legL.position.set(-0.08, 0.4, 0);
    this.legR.position.set(0.08, 0.4, 0);
    this.torso = new THREE.Mesh(g.torso, mat);
    this.torso.position.set(0, 0.6, 0);
    this.armL = new THREE.Mesh(g.limb, mat);
    this.armR = new THREE.Mesh(g.limb, mat);
    this.armL.position.set(-0.2, 0.76, 0);
    this.armR.position.set(0.2, 0.76, 0);
    this.head = new THREE.Mesh(g.head, mat);
    this.head.position.set(0, 0.99, 0);
    const eyeL = new THREE.Mesh(g.eye, eyeMat);
    const eyeR = new THREE.Mesh(g.eye, eyeMat);
    eyeL.position.set(-0.085, 0.03, 0.2);
    eyeR.position.set(0.085, 0.03, 0.2);
    this.head.add(eyeL, eyeR);

    this.badge = new THREE.Sprite(numberBadge(weight));
    this.badge.scale.setScalar(0.44 / this.scale);
    this.badge.position.set(0, 1.47, 0);
    this.badge.renderOrder = 2;

    this.body.add(this.legL, this.legR, this.torso, this.armL, this.armR, this.head, this.badge);
    for (const m of [this.legL, this.legR, this.torso, this.armL, this.armR, this.head]) {
      m.castShadow = true;
    }
    this.root.add(this.body);
    this.root.scale.setScalar(this.scale);
    this.root.userData.tottlerId = id;
  }

  /** A little squash when landing. */
  land(strength = 1) {
    this.squashV = -4 * strength;
  }

  showBadge(v: boolean) {
    this.badge.visible = v;
  }

  update(dt: number) {
    this.t += dt;
    const t = this.t;
    // squash spring
    const k = 160;
    const c = 12;
    this.squashV += (-k * this.squash - c * this.squashV) * dt;
    this.squash += this.squashV * dt;
    const s = Math.max(-0.35, Math.min(0.35, this.squash));
    this.body.scale.set(1 - s * 0.6, 1 + s, 1 - s * 0.6);

    let armA = 0.15; // arms slightly out
    let armSwing = Math.sin(t * 2.2) * 0.06;
    let legA = 0;
    let lean = 0;
    let bob = Math.sin(t * 3) * 0.015;
    let headTilt = Math.sin(t * 1.3) * 0.08;

    switch (this.mood) {
      case 'idle': {
        const a = Math.abs(this.agitation);
        if (a > 0.45) {
          // waving arms to keep balance; stronger near the limit
          const amp = Math.min(1, (a - 0.45) * 2);
          armA = 0.5 + amp * 0.9;
          armSwing = Math.sin(t * (8 + amp * 6)) * (0.25 + amp * 0.35);
          lean = -Math.sign(this.agitation) * amp * 0.12;
          headTilt = lean * 0.8;
        }
        break;
      }
      case 'jump':
        armA = 2.5;
        armSwing = Math.sin(t * 20) * 0.2;
        legA = 0.35;
        bob = 0;
        break;
      case 'whoa':
        armA = 2.2;
        armSwing = Math.sin(t * 28) * 0.6;
        lean = Math.sin(t * 18) * 0.15;
        bob = Math.abs(Math.sin(t * 18)) * 0.05;
        headTilt = Math.sin(t * 14) * 0.3;
        break;
      case 'fall':
        armA = 2.8;
        armSwing = Math.sin(t * 30) * 0.4;
        legA = Math.sin(t * 25) * 0.6;
        break;
      case 'cheer':
        armA = 2.6 + Math.sin(t * 10) * 0.3;
        armSwing = 0;
        bob = Math.abs(Math.sin(t * 7)) * 0.12;
        break;
    }
    this.armL.rotation.z = -(armA + armSwing);
    this.armR.rotation.z = armA - armSwing;
    this.legL.rotation.z = -legA * 0.4;
    this.legR.rotation.z = legA * 0.4;
    this.legL.rotation.x = this.mood === 'fall' ? legA : 0;
    this.legR.rotation.x = this.mood === 'fall' ? -legA : 0;
    this.body.position.y = bob;
    this.body.rotation.z = lean;
    this.head.rotation.z = headTilt;
  }

  dispose() {
    this.root.removeFromParent();
  }
}
