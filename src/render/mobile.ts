import * as THREE from 'three';
import type { BeamNode, Loads, PlatformNode, StructureNode } from '../core/types';
import { platformWeights, tiltRatio, tottlerWidth } from '../core/balance';
import {
  PLATFORM_THICK,
  WIDTH_UNIT,
  computeLayout,
  platformPoses,
  platformWorldWidth,
  tiltAngle,
  type NodeLayout,
  type PlatformPose,
} from '../core/geometry';
import { PALETTE, SIZE_COLORS, toon } from './materials';

const ropeGeo = new THREE.CylinderGeometry(0.035, 0.035, 1, 6);
ropeGeo.translate(0, 0.5, 0); // origin at the bottom end
const sphereGeo = new THREE.SphereGeometry(1, 12, 8);
const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const hubGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.34, 16);
hubGeo.rotateX(Math.PI / 2);
const UP = new THREE.Vector3(0, 1, 0);
const CEILING_Y = 1.1;
/** Top of the cloud the queue stands on. */
export const CLOUD_TOP = CEILING_Y + 0.55;
export const CLOUD_HALF_W = 2.5;

function makeCloud(): THREE.Group {
  const g = new THREE.Group();
  const mat = toon(0xffffff);
  const geo = new THREE.IcosahedronGeometry(1, 1);
  const puffs: [number, number, number, number][] = [
    [-2.1, 0.15, 0, 0.55],
    [-1.3, 0.25, 0.1, 0.7],
    [-0.4, 0.3, 0, 0.75],
    [0.5, 0.3, 0.1, 0.75],
    [1.4, 0.25, 0, 0.7],
    [2.2, 0.15, 0.05, 0.55],
  ];
  for (const [x, y, z, r] of puffs) {
    const m = new THREE.Mesh(geo, mat);
    m.scale.set(r, r * 0.75, r * 0.9);
    m.position.set(x, CEILING_Y + y, z);
    g.add(m);
  }
  // flat top so the queue has a floor
  const top = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.2, 24), mat);
  top.scale.set(CLOUD_HALF_W, 1, 0.75);
  top.position.set(0, CLOUD_TOP - 0.1, 0.1);
  top.receiveShadow = true;
  g.add(top);
  return g;
}

/** Stretch a bottom-anchored rope mesh between two world points. */
function setRope(m: THREE.Mesh, from: THREE.Vector3, to: THREE.Vector3) {
  const d = to.clone().sub(from);
  const len = d.length();
  m.position.copy(from);
  m.scale.set(1, Math.max(0.001, len), 1);
  m.quaternion.setFromUnitVectors(UP, d.normalize());
}

interface BeamView {
  node: BeamNode;
  layout: NodeLayout;
  group: THREE.Group; // at pivot, rotated by angle
  rope: THREE.Mesh; // parent hook (or ceiling) → pivot
  angle: number;
  vel: number;
  target: number;
  ratio: number;
}

export interface PlatformView {
  node: PlatformNode;
  /** At the platform top centre, rotated with its beam. Tottlers are children of this. */
  surface: THREE.Group;
  ropes: [THREE.Mesh, THREE.Mesh];
  heatMat: THREE.MeshToonMaterial;
  width: number;
  /** Displayed weight (springs towards the real one: the rope stretches smoothly). */
  weight: number;
  targetWeight: number;
  pose: PlatformPose;
  highlight: number;
  broken: boolean;
}

/**
 * The hanging structure: beams, ropes and platforms. Tilts are spring-animated towards
 * the angles the rules compute; positions come from core/geometry, so lava contact on
 * screen matches the rules.
 */
export class MobileView {
  readonly group = new THREE.Group();
  readonly beams: BeamView[] = [];
  readonly platforms = new Map<string, PlatformView>();
  readonly layout: Map<string, NodeLayout>;
  readonly ceilingY = CEILING_Y;
  private beamById = new Map<string, BeamView>();
  lava = -100;

  constructor(readonly root: BeamNode) {
    this.layout = computeLayout(root);
    this.build(root);
    // The mobile hangs from a fluffy cloud; the waiting Tottlers stand on top of it.
    this.group.add(makeCloud());
    this.update(0);
  }

  private build(n: StructureNode): void {
    if (n.kind === 'platform') {
      const width = platformWorldWidth(n.size);
      const surface = new THREE.Group();
      const color = SIZE_COLORS[n.size >= 12 ? 'L' : n.size >= 9 ? 'M' : 'S'];
      const tray = new THREE.Mesh(boxGeo, toon(color));
      tray.scale.set(width, PLATFORM_THICK * 0.6, 0.95);
      tray.position.set(0, -PLATFORM_THICK * 0.3, 0);
      tray.receiveShadow = true;
      surface.add(tray);
      // underside glows when the lava gets close
      const heatMat = new THREE.MeshToonMaterial({
        color: PALETTE.platformSide,
        gradientMap: toon(0).gradientMap,
        emissive: 0xff3300,
        emissiveIntensity: 0,
      });
      const under = new THREE.Mesh(boxGeo, heatMat);
      under.scale.set(width - 0.04, PLATFORM_THICK * 0.4, 0.9);
      under.position.set(0, -PLATFORM_THICK * 0.8, 0);
      surface.add(under);
      // rims at both ends make the size easy to read
      for (const sx of [-1, 1]) {
        const rim = new THREE.Mesh(boxGeo, toon(PALETTE.beamDark));
        rim.scale.set(0.08, 0.16, 0.97);
        rim.position.set((sx * width) / 2, 0.02, 0);
        surface.add(rim);
      }
      const ropeMat = toon(PALETTE.rope);
      const ropes: [THREE.Mesh, THREE.Mesh] = [
        new THREE.Mesh(ropeGeo, ropeMat),
        new THREE.Mesh(ropeGeo, ropeMat),
      ];
      this.group.add(surface, ...ropes);
      this.platforms.set(n.id, {
        node: n,
        surface,
        ropes,
        heatMat,
        width,
        weight: 0,
        targetWeight: 0,
        pose: { hookX: 0, hookY: 0, x: 0, y: 0, angle: 0, bottom: 0, width },
        highlight: 0,
        broken: false,
      });
      return;
    }

    const layout = this.layout.get(n.id)!;
    const group = new THREE.Group();
    const armL = layout.armL!;
    const armR = layout.armR!;
    const bar = new THREE.Mesh(boxGeo, toon(PALETTE.beam));
    bar.scale.set(armL + armR + 0.3, 0.22, 0.32);
    bar.position.set((armR - armL) / 2, 0, 0);
    group.add(bar);
    // one white dot per "arm unit" so the player can compare arm lengths
    const notchMat = toon(0xffffff);
    for (const [side, len] of [
      [-1, n.left.length],
      [1, n.right.length],
    ] as const) {
      for (let k = 1; k <= len; k++) {
        const d = new THREE.Mesh(sphereGeo, notchMat);
        d.scale.set(0.08, 0.08, 0.03);
        d.position.set(side * layout.unit! * k * (k === len ? 0.999 : 1), 0, 0.165);
        if (k < len) group.add(d);
      }
      const end = new THREE.Mesh(sphereGeo, toon(PALETTE.beamDark));
      end.scale.setScalar(0.15);
      end.position.set(side === -1 ? -armL : armR, 0, 0);
      group.add(end);
    }
    group.add(new THREE.Mesh(hubGeo, toon(PALETTE.beamDark)));
    const rope = new THREE.Mesh(ropeGeo, toon(PALETTE.rope));
    this.group.add(group, rope);
    const view: BeamView = { node: n, layout, group, rope, angle: 0, vel: 0, target: 0, ratio: 0 };
    this.beams.push(view);
    this.beamById.set(n.id, view);
    this.build(n.left.child);
    this.build(n.right.child);
  }

  /** Set the loads to display; beams and ropes spring towards their new pose. */
  setLoads(loads: Loads) {
    const w = platformWeights(loads);
    for (const b of this.beams) {
      b.ratio = tiltRatio(b.node, w);
      b.target = tiltAngle(b.ratio);
    }
    for (const [id, p] of this.platforms) p.targetWeight = w[id] ?? 0;
  }

  /** Signed tilt ratio of the beam a platform hangs from (drives the arm waving). */
  platformTilt(platformId: string): number {
    const p = this.platforms.get(platformId);
    if (!p) return 0;
    return -p.pose.angle / ((18 * Math.PI) / 180);
  }

  /** 0 (far) … 1 (touching): how close a platform is to the lava. */
  heat(platformId: string): number {
    const p = this.platforms.get(platformId);
    if (!p) return 0;
    return THREE.MathUtils.clamp(1 - (p.pose.bottom - this.lava) / 1.2, 0, 1);
  }

  setHighlight(platformId: string | null) {
    for (const [id, p] of this.platforms) p.highlight = id === platformId ? 1 : 0;
  }

  update(dt: number) {
    const k = 50;
    const c = 7;
    const angles: Record<string, number> = {};
    for (const b of this.beams) {
      b.vel += (k * (b.target - b.angle) - c * b.vel) * dt;
      b.angle += b.vel * dt;
      angles[b.node.id] = b.angle;
    }
    const weights: Record<string, number> = {};
    for (const [id, p] of this.platforms) {
      p.weight += (p.targetWeight - p.weight) * Math.min(1, dt * 6);
      weights[id] = p.weight;
    }
    const pivots: Record<string, { x: number; y: number; hookX: number; hookY: number }> = {};
    const poses = platformPoses(this.root, this.layout, angles, weights, pivots);
    for (const b of this.beams) {
      const pv = pivots[b.node.id];
      b.group.position.set(pv.x, pv.y, 0);
      b.group.rotation.z = b.angle;
      const top =
        b.node === this.root
          ? new THREE.Vector3(0, CEILING_Y, 0)
          : new THREE.Vector3(pv.hookX, pv.hookY, 0);
      setRope(b.rope, new THREE.Vector3(pv.x, pv.y, 0), top);
    }
    for (const [id, p] of this.platforms) {
      if (p.broken) continue;
      const pose = poses[id];
      p.pose = pose;
      p.surface.position.set(pose.x, pose.y, 0);
      p.surface.rotation.z = pose.angle;
      p.surface.scale.setScalar(1 + p.highlight * 0.04);
      const hook = new THREE.Vector3(pose.hookX, pose.hookY, 0);
      const c0 = Math.cos(pose.angle);
      const s0 = Math.sin(pose.angle);
      const hw = p.width / 2 - 0.06;
      for (const [i, sx] of [
        [0, -1],
        [1, 1],
      ] as const) {
        const corner = new THREE.Vector3(pose.x + sx * hw * c0, pose.y + sx * hw * s0, 0);
        setRope(p.ropes[i], corner, hook);
      }
      p.heatMat.emissiveIntensity = this.heat(id) * 1.4;
    }
  }

  /** The platform touched the lava: ropes snap, it falls. Returns the falling surface. */
  breakPlatform(id: string): THREE.Group | null {
    const p = this.platforms.get(id);
    if (!p) return null;
    p.broken = true;
    p.ropes.forEach((r) => (r.visible = false));
    return p.surface;
  }

  /** World position of the top centre of a platform. */
  platformTop(id: string, out = new THREE.Vector3()): THREE.Vector3 {
    const p = this.platforms.get(id)!;
    p.surface.updateWorldMatrix(true, false);
    return out.setFromMatrixPosition(p.surface.matrixWorld);
  }

  /** Bounding box of the structure (at rest), for camera framing. */
  bounds() {
    const l = this.layout.get(this.root.id)!;
    return { minX: -l.left - 0.55, maxX: l.right + 0.55, maxY: CLOUD_TOP + 2.2 };
  }
}

/**
 * Local x of each Tottler on a platform: packed side by side, centred, each taking its
 * real width (weight + 1 width units).
 */
export function packPositions(weights: (1 | 2 | 3)[]): number[] {
  const widths = weights.map((w) => tottlerWidth(w) * WIDTH_UNIT);
  const total = widths.reduce((s, x) => s + x, 0);
  let x = -total / 2;
  return widths.map((wd) => {
    const c = x + wd / 2;
    x += wd;
    return c;
  });
}
