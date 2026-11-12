import * as THREE from 'three';
import type { BeamNode, Loads, PlatformNode, StructureNode } from '../core/types';
import { beamStatus, tiltRatio } from '../core/balance';
import {
  PLATFORM_DROP,
  SLOT_W,
  SUBBEAM_DROP,
  computeLayout,
  platformWidth,
  type NodeLayout,
} from './layout';
import { PALETTE, STATUS_COLORS, basic, dialMaterial, toon } from './materials';

/** Max visual tilt (radians) when a beam is exactly at its tolerance. */
export const MAX_TILT = THREE.MathUtils.degToRad(11);
const TILT_CLAMP = 1.4;

const ropeGeo = new THREE.CylinderGeometry(0.035, 0.035, 1, 6);
ropeGeo.translate(0, 0.5, 0); // origin at the bottom end
const sphereGeo = new THREE.SphereGeometry(1, 12, 8);
const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const hubGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.32, 16);
hubGeo.rotateX(Math.PI / 2);
const slotGeo = new THREE.CircleGeometry(0.24, 20);
slotGeo.rotateX(-Math.PI / 2);
const dialGeo = new THREE.PlaneGeometry(0.9, 0.49);
dialGeo.translate(0, -0.245 + 0.015, 0);
const needleGeo = new THREE.BoxGeometry(0.05, 0.4, 0.02);
needleGeo.translate(0, -0.2, 0);

function rope(mat: THREE.Material) {
  const m = new THREE.Mesh(ropeGeo, mat);
  return m;
}

/** Stretch a bottom-anchored rope mesh between two points (in its parent's space). */
function setRope(m: THREE.Mesh, from: THREE.Vector3, to: THREE.Vector3) {
  const d = to.clone().sub(from);
  const len = d.length();
  m.position.copy(from);
  m.scale.set(1, Math.max(0.001, len), 1);
  m.quaternion.setFromUnitVectors(UP, d.normalize());
}
const UP = new THREE.Vector3(0, 1, 0);

interface BeamView {
  node: BeamNode;
  layout: NodeLayout;
  group: THREE.Group; // at pivot, rotated by angle
  gauge: THREE.Group; // at pivot, not rotated
  needle: THREE.Mesh;
  hub: THREE.Mesh;
  hubMat: THREE.MeshToonMaterial;
  rope: THREE.Mesh; // from parent hook to pivot (in world)
  angle: number;
  vel: number;
  target: number;
  ratio: number;
  shownRatio: number;
}

export interface PlatformView {
  node: PlatformNode;
  /** At the hook, rotated with the parent beam. */
  group: THREE.Group;
  /** At the platform top centre; Tottlers are children of this. */
  surface: THREE.Group;
  tray: THREE.Mesh;
  width: number;
  parentBeam: BeamView;
  highlight: number;
}

/**
 * The hanging structure: beams, ropes, platforms and gauges. Reads loads, animates tilts
 * with a spring and exposes platform transforms for Tottlers and touch picking.
 */
export class MobileView {
  readonly group = new THREE.Group();
  readonly beams: BeamView[] = [];
  readonly platforms = new Map<string, PlatformView>();
  readonly layout: Map<string, NodeLayout>;
  readonly rootPivot: THREE.Vector3;
  readonly ceilingY: number;
  readonly bottomY: number;
  private beamById = new Map<string, BeamView>();

  constructor(
    readonly root: BeamNode,
    pivotY: number,
  ) {
    this.layout = computeLayout(root);
    this.rootPivot = new THREE.Vector3(0, pivotY, 0);
    this.ceilingY = pivotY + 1.1;
    this.bottomY = pivotY - this.layout.get(root.id)!.depth;
    this.build(root, null);
    // ceiling bar
    const ceiling = new THREE.Mesh(boxGeo, toon(PALETTE.beamDark));
    const cw = 1.6;
    ceiling.scale.set(cw, 0.22, 0.6);
    ceiling.position.set(0, this.ceilingY + 0.11, 0);
    this.group.add(ceiling);
    this.update(0);
  }

  private build(n: StructureNode, parent: BeamView | null): void {
    if (n.kind === 'platform') {
      const width = platformWidth(n.capacity);
      const group = new THREE.Group();
      const surface = new THREE.Group();
      surface.position.set(0, -PLATFORM_DROP, 0);
      group.add(surface);
      const tray = new THREE.Mesh(boxGeo, toon(PALETTE.platform));
      tray.scale.set(width, 0.18, 0.95);
      tray.position.set(0, -0.09, 0);
      tray.receiveShadow = true;
      surface.add(tray);
      const lip = new THREE.Mesh(boxGeo, toon(PALETTE.platformSide));
      lip.scale.set(width + 0.02, 0.08, 0.97);
      lip.position.set(0, -0.2, 0);
      surface.add(lip);
      for (let i = 0; i < n.capacity; i++) {
        const s = new THREE.Mesh(slotGeo, basic(PALETTE.slot));
        s.position.set(slotX(n.capacity, i), 0.005, 0.05);
        s.receiveShadow = true;
        surface.add(s);
      }
      const ropeMat = toon(PALETTE.rope);
      const top = new THREE.Vector3(0, 0, 0);
      for (const sx of [-1, 1]) {
        const r = rope(ropeMat);
        setRope(r, new THREE.Vector3((sx * width) / 2 - sx * 0.08, -PLATFORM_DROP, 0), top);
        group.add(r);
      }
      const knot = new THREE.Mesh(sphereGeo, toon(PALETTE.beamDark));
      knot.scale.setScalar(0.09);
      group.add(knot);
      this.group.add(group);
      this.platforms.set(n.id, {
        node: n,
        group,
        surface,
        tray,
        width,
        parentBeam: parent!,
        highlight: 0,
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
    // notches: one dot per "arm unit" so the player can compare arm lengths
    const notchMat = toon(0xffffff);
    for (const [side, len] of [
      [-1, n.left.length],
      [1, n.right.length],
    ] as const) {
      for (let k = 1; k <= len; k++) {
        const d = new THREE.Mesh(sphereGeo, notchMat);
        d.scale.set(0.07, 0.07, 0.03);
        d.position.set(side * layout.unit! * k, 0, 0.165);
        group.add(d);
      }
      const end = new THREE.Mesh(sphereGeo, toon(PALETTE.beamDark));
      end.scale.setScalar(0.15);
      end.position.set(side === -1 ? -armL : armR, 0, 0);
      group.add(end);
    }
    const hubMat = new THREE.MeshToonMaterial({
      color: STATUS_COLORS.green,
      gradientMap: toon(0).gradientMap,
    });
    const hub = new THREE.Mesh(hubGeo, hubMat);
    group.add(hub);

    const gauge = new THREE.Group();
    const dial = new THREE.Mesh(dialGeo, dialMaterial());
    dial.position.set(0, -0.2, 0.17);
    gauge.add(dial);
    const needle = new THREE.Mesh(needleGeo, basic(PALETTE.eye));
    needle.position.set(0, -0.2, 0.19);
    gauge.add(needle);

    const ropeM = rope(toon(PALETTE.rope));
    this.group.add(group, gauge, ropeM);
    const view: BeamView = {
      node: n,
      layout,
      group,
      gauge,
      needle,
      hub,
      hubMat,
      rope: ropeM,
      angle: 0,
      vel: 0,
      target: 0,
      ratio: 0,
      shownRatio: 0,
    };
    this.beams.push(view);
    this.beamById.set(n.id, view);
    this.build(n.left.child, view);
    this.build(n.right.child, view);
  }

  /** Set the loads to display; beams spring towards their new tilt. */
  setLoads(loads: Loads) {
    for (const b of this.beams) {
      b.ratio = tiltRatio(b.node, loads);
      b.target = -THREE.MathUtils.clamp(b.ratio, -TILT_CLAMP, TILT_CLAMP) * MAX_TILT;
    }
  }

  /** Signed ratio of the beam a platform hangs from (for Tottler arm waving). */
  platformTilt(platformId: string): number {
    const p = this.platforms.get(platformId);
    return p ? p.parentBeam.shownRatio : 0;
  }

  beamOf(id: string) {
    return this.beamById.get(id);
  }

  setHighlight(platformId: string | null) {
    for (const [id, p] of this.platforms) p.highlight = id === platformId ? 1 : 0;
  }

  update(dt: number) {
    const k = 55;
    const c = 7.5;
    for (const b of this.beams) {
      b.vel += (k * (b.target - b.angle) - c * b.vel) * dt;
      b.angle += b.vel * dt;
      b.shownRatio += (b.ratio - b.shownRatio) * Math.min(1, dt * 8);
      const status = beamStatus(b.shownRatio);
      b.hubMat.color.setHex(STATUS_COLORS[status]);
      const needleA =
        THREE.MathUtils.clamp(b.shownRatio, -1.45, 1.45) * THREE.MathUtils.degToRad(60);
      b.needle.rotation.z = needleA;
    }
    this.place(this.root, null, null);
    for (const p of this.platforms.values()) {
      const s = 1 + p.highlight * 0.04;
      p.tray.scale.y = 0.18 * s;
    }
  }

  private place(n: StructureNode, hook: THREE.Vector3 | null, parent: BeamView | null) {
    if (n.kind === 'platform') {
      const p = this.platforms.get(n.id)!;
      p.group.position.copy(hook!);
      p.group.rotation.z = parent!.angle;
      return;
    }
    const b = this.beamById.get(n.id)!;
    const pivot = hook
      ? hook.clone().add(new THREE.Vector3(0, -SUBBEAM_DROP, 0))
      : this.rootPivot.clone();
    b.group.position.copy(pivot);
    b.group.rotation.z = b.angle;
    b.gauge.position.copy(pivot);
    setRope(b.rope, pivot, hook ?? new THREE.Vector3(0, this.ceilingY, 0));
    const cos = Math.cos(b.angle);
    const sin = Math.sin(b.angle);
    const armL = b.layout.armL!;
    const armR = b.layout.armR!;
    const left = new THREE.Vector3(pivot.x - armL * cos, pivot.y - armL * sin, 0);
    const right = new THREE.Vector3(pivot.x + armR * cos, pivot.y + armR * sin, 0);
    this.place(n.left.child, left, b);
    this.place(n.right.child, right, b);
  }

  /** World position of the top centre of a platform. */
  platformTop(id: string, out = new THREE.Vector3()): THREE.Vector3 {
    const p = this.platforms.get(id)!;
    p.surface.updateWorldMatrix(true, false);
    return out.setFromMatrixPosition(p.surface.matrixWorld);
  }

  /** Local (surface space) position of a slot on a platform. */
  slotLocal(id: string, slot: number): THREE.Vector3 {
    const p = this.platforms.get(id)!;
    return new THREE.Vector3(slotX(p.node.capacity, slot), 0, 0.05);
  }

  /** Bounding box of the structure (at rest), for camera framing. */
  bounds() {
    const l = this.layout.get(this.root.id)!;
    return {
      minX: -l.left - 0.55,
      maxX: l.right + 0.55,
      minY: this.bottomY,
      maxY: this.ceilingY + 0.3,
    };
  }
}

export function slotX(capacity: number, slot: number) {
  return (slot - (capacity - 1) / 2) * SLOT_W;
}
