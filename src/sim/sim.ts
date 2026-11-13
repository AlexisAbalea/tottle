import type RAPIER_NS from '@dimforge/rapier3d-compat';
import type { BeamNode, LevelDef, PlatformNode, StructureNode, Weight } from '../core/types';
import {
  MAX_TILT,
  PLATFORM_THICK,
  ROPE,
  SUBBEAM_DROP,
  WIDTH_UNIT,
  computeLayout,
  lavaLevel,
  platformWorldWidth,
  type NodeLayout,
} from '../core/geometry';
import { listPlatforms } from '../core/structure';

type Rapier = typeof RAPIER_NS;
type Body = RAPIER_NS.RigidBody;

/**
 * Physics version of Tottle (branch feature/physics): the mobile and the Tottlers are real
 * Rapier bodies; gravity and collisions decide everything. No Three.js here, so it also runs
 * in Node for tests (see bot.ts).
 *
 * Conventions: 2D game in the x/y plane (z locked). 1 unit ≈ a medium Tottler's height.
 *  - beam bodies have their origin at their pivot (root: fixed pivot; sub-beams hang from the
 *    parent's arm end by a rigid rope, pivot SUBBEAM_DROP below the hook);
 *  - platform bodies have their origin at the centre of their top surface and swing freely
 *    from their hook ROPE above (so an off-centre load tilts them);
 *  - Tottler bodies have their origin at their feet; they stay upright until they fall.
 */
export const GRAVITY = 18;
/**
 * Friction. Rapier averages the two colliders' values: Tottler↔Tottler = TOTTLER_FRICTION
 * (slippery, so a newcomer wedges between two and pushes them apart), Tottler↔tray =
 * (TOTTLER_FRICTION + TRAY_FRICTION) / 2 (grips, slides off only when tilted a lot).
 */
export const TOTTLER_FRICTION = 0.05;
export const TRAY_FRICTION = 0.75;
/** Beam spring damping, as a fraction of its stiffness (higher = less swing on impact). */
export const DAMPING = 0.7;
/**
 * Platforms swing from their hook, but a spring keeps them fairly level: a big Tottler
 * (weight 3) right at the edge of a 1.3-wide half tilts it about 15°.
 */
export const TRAY_STIFFNESS = (3 * GRAVITY * 1.3) / 0.26;
export const BEAM_LIMIT = (32 * Math.PI) / 180;
const DT = 1 / 60;

// Collision groups (membership << 16 | filter): Tottlers hit trays and each other;
// trays only hit Tottlers; beams are structure only and hit nothing.
const G_TOTTLER = 0x1;
const G_TRAY = 0x2;
const G_BEAM = 0x4;
const groups = (member: number, filter: number) => (member << 16) | filter;

export interface TottlerSpec {
  id: number;
  weight: Weight;
}

/** Collision shape of a Tottler (capsule), matching its drawing. */
export function tottlerShape(weight: Weight) {
  const radius = ((weight + 1) * WIDTH_UNIT) / 2;
  const height = [0, 0.92, 1.28, 1.7][weight];
  return { radius, halfHeight: Math.max(0.05, (height - 2 * radius) / 2), height };
}

export interface BeamState {
  x: number;
  y: number;
  angle: number;
  hookX: number;
  hookY: number;
}
export interface PlatformState {
  x: number;
  y: number;
  angle: number;
  hookX: number;
  hookY: number;
  width: number;
  /** lowest point of the tray */
  bottom: number;
}
export interface TottlerState {
  id: number;
  weight: Weight;
  x: number;
  y: number;
  angle: number;
  vx: number;
  vy: number;
}

interface BeamRec {
  node: BeamNode;
  body: Body;
  joint: RAPIER_NS.RevoluteImpulseJoint;
  stiffness: number;
  target: number;
  parent: BeamRec | null;
  side: -1 | 1;
}
interface PlatformRec {
  node: PlatformNode;
  body: Body;
  parent: BeamRec;
  side: -1 | 1;
  width: number;
}
interface TottlerRec {
  spec: TottlerSpec;
  body: Body;
  falling: boolean;
}

export class Sim {
  readonly world: RAPIER_NS.World;
  readonly layout: Map<string, NodeLayout>;
  readonly lava: number;
  readonly beams = new Map<string, BeamRec>();
  readonly platforms = new Map<string, PlatformRec>();
  readonly tottlers = new Map<number, TottlerRec>();
  private acc = 0;
  time = 0;

  constructor(
    private R: Rapier,
    readonly level: LevelDef,
  ) {
    this.layout = computeLayout(level.root);
    this.lava = lavaLevel(level, this.layout);
    this.world = new R.World({ x: 0, y: -GRAVITY, z: 0 });
    const anchor = this.world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(0, 0, 0));
    this.buildBeam(level.root, null, 0, anchor, 0, 0);
    this.calibrate();
  }

  /**
   * The empty mobile is not perfectly balanced (uneven arms carry different structure
   * weights). Shift each beam's spring target so that, empty, every beam hangs level —
   * as the level geometry (and the lava distance) assumes.
   */
  private calibrate() {
    for (let pass = 0; pass < 4; pass++) {
      for (let i = 0; i < 150; i++) this.physicsStep();
      for (const b of this.beams.values()) b.target -= angleOf(b.body);
    }
    for (let i = 0; i < 150; i++) this.physicsStep();
  }

  /**
   * Structural bodies are NOT axis-locked: locking axes on jointed bodies makes Rapier unstable;
   * the z-axis revolute joints already keep the mobile in the plane.
   */
  private dynamicDesc(x: number, y: number, angle = 0) {
    return this.R.RigidBodyDesc.dynamic()
      .setTranslation(x, y, 0)
      .setRotation({ x: 0, y: 0, z: Math.sin(angle / 2), w: Math.cos(angle / 2) });
  }

  private buildBeam(
    n: BeamNode,
    parent: BeamRec | null,
    side: -1 | 1 | 0,
    holder: Body,
    hookX: number,
    hookY: number,
  ) {
    const R = this.R;
    const l = this.layout.get(n.id)!;
    const armL = l.armL!;
    const armR = l.armR!;
    const px = hookX;
    const py = parent ? hookY - SUBBEAM_DROP : hookY;
    const body = this.world.createRigidBody(this.dynamicDesc(px, py).setAngularDamping(2.5));
    this.world.createCollider(
      R.ColliderDesc.cuboid((armL + armR) / 2 + 0.15, 0.11, 0.16)
        .setTranslation((armR - armL) / 2, 0, 0)
        .setMass(0.6)
        .setCollisionGroups(groups(G_BEAM, 0)),
      body,
    );
    // hinge: root at its pivot, sub-beams at the parent's hook (rigid rope above the pivot)
    const anchorOnHolder = parent ? this.hookLocal(parent, side as -1 | 1) : { x: 0, y: 0, z: 0 };
    const anchorOnBeam = parent ? { x: 0, y: SUBBEAM_DROP, z: 0 } : { x: 0, y: 0, z: 0 };
    const joint = this.world.createImpulseJoint(
      R.JointData.revolute(anchorOnHolder, anchorOnBeam, { x: 0, y: 0, z: 1 }),
      holder,
      body,
      true,
    ) as RAPIER_NS.RevoluteImpulseJoint;
    joint.setContactsEnabled(false);
    // spring: an imbalance equal to the beam's tolerance tilts it by MAX_TILT
    const stiffness = (n.tolerance * l.unit! * GRAVITY) / MAX_TILT;
    // The spring is applied as a torque on the beam's ABSOLUTE angle (see physicsStep):
    // like a real mobile, a sub-beam hangs from gravity, it does not follow its parent's tilt.
    if (!parent) joint.setLimits(-BEAM_LIMIT, BEAM_LIMIT);

    const rec: BeamRec = {
      node: n,
      body,
      joint,
      stiffness,
      target: 0,
      parent,
      side: (side || 1) as -1 | 1,
    };
    this.beams.set(n.id, rec);
    for (const [s, arm] of [
      [-1, n.left],
      [1, n.right],
    ] as const) {
      const hx = px + s * (s < 0 ? armL : armR);
      const hy = py;
      if (arm.child.kind === 'beam') this.buildBeam(arm.child, rec, s, body, hx, hy);
      else this.buildPlatform(arm.child, rec, s, hx, hy);
    }
  }

  private hookLocal(b: BeamRec, side: -1 | 1) {
    const l = this.layout.get(b.node.id)!;
    return { x: side < 0 ? -l.armL! : l.armR!, y: 0, z: 0 };
  }

  private buildPlatform(n: PlatformNode, parent: BeamRec, side: -1 | 1, hx: number, hy: number) {
    const R = this.R;
    const width = platformWorldWidth(n.size);
    const body = this.world.createRigidBody(
      this.dynamicDesc(hx, hy - ROPE)
        .setAngularDamping(1.5)
        .setLinearDamping(0.2),
    );
    this.world.createCollider(
      R.ColliderDesc.cuboid(width / 2, PLATFORM_THICK / 2, 0.45)
        .setTranslation(0, -PLATFORM_THICK / 2, 0)
        .setMass(0.5)
        .setFriction(TRAY_FRICTION)
        .setCollisionGroups(groups(G_TRAY, G_TOTTLER)),
      body,
    );
    const hinge = this.world.createImpulseJoint(
      R.JointData.revolute(
        this.hookLocal(parent, side),
        { x: 0, y: ROPE, z: 0 },
        { x: 0, y: 0, z: 1 },
      ),
      parent.body,
      body,
      true,
    );
    hinge.setContactsEnabled(false);
    this.platforms.set(n.id, { node: n, body, parent, side, width });
  }

  /** Release a Tottler with its feet at (x, y). */
  drop(spec: TottlerSpec, x: number, y: number) {
    const R = this.R;
    const { radius, halfHeight } = tottlerShape(spec.weight);
    const body = this.world.createRigidBody(
      this.dynamicDesc(x, y)
        .lockRotations()
        .enabledTranslations(true, true, false)
        .setCcdEnabled(true),
    );
    this.world.createCollider(
      R.ColliderDesc.capsule(halfHeight, radius)
        .setTranslation(0, halfHeight + radius, 0)
        .setMass(spec.weight)
        .setFriction(TOTTLER_FRICTION)
        .setRestitution(0.05)
        .setCollisionGroups(groups(G_TOTTLER, G_TOTTLER | G_TRAY)),
      body,
    );
    this.tottlers.set(spec.id, { spec, body, falling: false });
  }

  /**
   * Top of whatever is under x (platform, beam or Tottler), or null if only lava is below.
   * Used to hover the held Tottler just above where it would land.
   */
  surfaceBelow(x: number, fromY = 4): number | null {
    const R = this.R;
    let best: number | null = null;
    // a few parallel rays so a Tottler's width is taken into account
    for (const dx of [-0.12, 0, 0.12]) {
      const ray = new R.Ray({ x: x + dx, y: fromY, z: 0 }, { x: 0, y: -1, z: 0 });
      const hit = this.world.castRay(
        ray,
        fromY - this.lava + 2,
        true,
        undefined,
        groups(G_TOTTLER, G_TOTTLER | G_TRAY),
      );
      if (hit) {
        const y = fromY - hit.timeOfImpact;
        if (best === null || y > best) best = y;
      }
    }
    return best;
  }

  step(dt: number) {
    this.acc += Math.min(dt, 0.1);
    while (this.acc >= DT) {
      this.stepFixed();
      this.acc -= DT;
    }
  }

  /** One physics step, with each beam's spring pulling it back to level. */
  private physicsStep() {
    for (const b of this.beams.values()) {
      const tau =
        b.stiffness * (b.target - angleOf(b.body)) - b.stiffness * DAMPING * b.body.angvel().z;
      b.body.resetTorques(false);
      b.body.addTorque({ x: 0, y: 0, z: tau }, true);
    }
    for (const p of this.platforms.values()) {
      const tau = -TRAY_STIFFNESS * (angleOf(p.body) + 0.4 * p.body.angvel().z);
      p.body.resetTorques(false);
      p.body.addTorque({ x: 0, y: 0, z: tau }, true);
    }
    this.world.timestep = DT;
    this.world.step();
  }

  stepFixed() {
    this.physicsStep();
    this.time += DT;
    // a Tottler that is clearly falling may tumble (looks better)
    for (const t of this.tottlers.values()) {
      if (!t.falling && t.body.linvel().y < -5) {
        t.falling = true;
        t.body.setEnabledRotations(false, false, true, true);
        t.body.setAngvel({ x: 0, y: 0, z: (Math.random() - 0.5) * 6 }, true);
      }
    }
  }

  beamStates(): Record<string, BeamState> {
    const out: Record<string, BeamState> = {};
    for (const [id, b] of this.beams) {
      const p = b.body.translation();
      const hook = b.parent
        ? this.worldPoint(b.parent.body, this.hookLocal(b.parent, b.side))
        : { x: 0, y: 0 };
      out[id] = { x: p.x, y: p.y, angle: angleOf(b.body), hookX: hook.x, hookY: hook.y };
    }
    return out;
  }

  platformStates(): Record<string, PlatformState> {
    const out: Record<string, PlatformState> = {};
    for (const [id, p] of this.platforms) {
      const t = p.body.translation();
      const a = angleOf(p.body);
      const hook = this.worldPoint(p.parent.body, this.hookLocal(p.parent, p.side));
      const bottom = t.y - PLATFORM_THICK * Math.cos(a) - (p.width / 2) * Math.abs(Math.sin(a));
      out[id] = { x: t.x, y: t.y, angle: a, hookX: hook.x, hookY: hook.y, width: p.width, bottom };
    }
    return out;
  }

  tottlerStates(): TottlerState[] {
    return [...this.tottlers.values()].map((t) => {
      const p = t.body.translation();
      const v = t.body.linvel();
      return {
        id: t.spec.id,
        weight: t.spec.weight,
        x: p.x,
        y: p.y,
        angle: angleOf(t.body),
        vx: v.x,
        vy: v.y,
      };
    });
  }

  /** What touched the lava, if anything (a Tottler, or a platform that dipped into it). */
  lavaHit(): { tottlerId?: number; platformId?: string } | null {
    for (const t of this.tottlers.values()) {
      if (t.body.translation().y < this.lava) return { tottlerId: t.spec.id };
    }
    for (const [id, p] of Object.entries(this.platformStates())) {
      if (p.bottom < this.lava) return { platformId: id };
    }
    return null;
  }

  /** Everything (almost) at rest. */
  settled(eps = 0.08): boolean {
    let calm = true;
    this.world.forEachRigidBody((b) => {
      if (!b.isDynamic()) return;
      const v = b.linvel();
      const w = b.angvel();
      if (Math.hypot(v.x, v.y) > eps || Math.abs(w.z) > eps) calm = false;
    });
    return calm;
  }

  /** Copy of the whole simulation (used by the bot to try moves). */
  clone(): Sim {
    const copy = Object.create(Sim.prototype) as Sim;
    const world = this.R.World.restoreSnapshot(this.world.takeSnapshot());
    const remap = (b: Body) => world.getRigidBody(b.handle);
    Object.assign(copy, {
      R: this.R,
      level: this.level,
      layout: this.layout,
      lava: this.lava,
      world,
      acc: this.acc,
      time: this.time,
      beams: new Map([...this.beams].map(([k, v]) => [k, { ...v, body: remap(v.body) }])),
      platforms: new Map([...this.platforms].map(([k, v]) => [k, { ...v, body: remap(v.body) }])),
      tottlers: new Map([...this.tottlers].map(([k, v]) => [k, { ...v, body: remap(v.body) }])),
    });
    // parents must point at the copied beam records
    for (const b of copy.beams.values()) if (b.parent) b.parent = copy.beams.get(b.parent.node.id)!;
    for (const p of copy.platforms.values()) p.parent = copy.beams.get(p.parent.node.id)!;
    return copy;
  }

  free() {
    this.world.free();
  }

  private worldPoint(b: Body, local: { x: number; y: number }) {
    const t = b.translation();
    const a = angleOf(b);
    const c = Math.cos(a);
    const s = Math.sin(a);
    return { x: t.x + local.x * c - local.y * s, y: t.y + local.x * s + local.y * c };
  }
}

export function angleOf(b: Body): number {
  const q = b.rotation();
  return 2 * Math.atan2(q.z, q.w);
}

/** Ids of all platforms, in level order. */
export function platformIds(root: StructureNode): string[] {
  return listPlatforms(root).map((p) => p.id);
}
