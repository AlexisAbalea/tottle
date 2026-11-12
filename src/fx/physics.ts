import * as THREE from 'three';
import type RAPIER_NS from '@dimforge/rapier3d-compat';

type Rapier = typeof RAPIER_NS;

interface Body {
  obj: THREE.Object3D;
  /** Rapier body, or null when using the simple fallback integrator. */
  rb: RAPIER_NS.RigidBody | null;
  radius: number;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  age: number;
  /** Time since it touched the lava (−1 = not yet). */
  sunk: number;
  baseScale: number;
  onSplash: (at: THREE.Vector3) => void;
  onDone: (obj: THREE.Object3D) => void;
}

export interface Rock {
  x: number;
  y: number; // top
  z: number;
  hw: number;
  hd: number;
}

/**
 * Rapier is only used for the show: a falling Tottler tumbles, may bounce on the rock, and
 * sinks in the lava. It never decides game results.
 */
export class FallPhysics {
  private R: Rapier | null = null;
  private world: RAPIER_NS.World | null = null;
  private bodies: Body[] = [];
  private acc = 0;
  private lavaY = -8;
  private rock: Rock = { x: 0, y: -9, z: 0, hw: 1, hd: 1 };

  async init() {
    try {
      const mod = await import('@dimforge/rapier3d-compat');
      const R = (mod.default ?? mod) as Rapier;
      await R.init();
      this.R = R;
      this.resetWorld();
    } catch (e) {
      console.warn('Rapier unavailable, using fallback falls', e);
    }
  }

  setScene(lavaY: number, rock: Rock) {
    this.lavaY = lavaY;
    this.rock = rock;
    if (this.R) this.resetWorld();
  }

  private resetWorld() {
    const R = this.R!;
    this.clear();
    this.world?.free();
    this.world = new R.World({ x: 0, y: -22, z: 0 });
    const r = this.rock;
    this.world.createCollider(
      R.ColliderDesc.cuboid(r.hw, 0.5, r.hd)
        .setTranslation(r.x, r.y - 0.5, r.z)
        .setRestitution(0.5)
        .setFriction(0.6),
    );
  }

  /** Launch an object (already in world space). Returns nothing; callbacks report progress. */
  drop(
    obj: THREE.Object3D,
    radius: number,
    vel: THREE.Vector3,
    spin: THREE.Vector3,
    onSplash: (at: THREE.Vector3) => void,
    onDone: (o: THREE.Object3D) => void,
  ) {
    let rb: RAPIER_NS.RigidBody | null = null;
    if (this.world && this.R) {
      const R = this.R;
      const q = obj.quaternion;
      rb = this.world.createRigidBody(
        R.RigidBodyDesc.dynamic()
          .setTranslation(obj.position.x, obj.position.y + radius, obj.position.z)
          .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
          .setLinvel(vel.x, vel.y, vel.z)
          .setAngvel({ x: spin.x, y: spin.y, z: spin.z }),
      );
      this.world.createCollider(
        R.ColliderDesc.ball(radius).setRestitution(0.55).setFriction(0.5),
        rb,
      );
    }
    this.bodies.push({
      obj,
      rb,
      radius,
      vel: vel.clone(),
      spin: spin.clone(),
      age: 0,
      sunk: -1,
      baseScale: obj.scale.x,
      onSplash,
      onDone,
    });
  }

  update(dt: number) {
    if (this.world) {
      this.acc += Math.min(dt, 0.1);
      const step = 1 / 60;
      while (this.acc >= step) {
        this.world.timestep = step;
        this.world.step();
        this.acc -= step;
      }
    }
    for (const b of this.bodies) {
      b.age += dt;
      if (b.sunk >= 0) {
        // sinking: slow, shrinking
        b.sunk += dt;
        b.obj.position.y -= dt * 0.8;
        b.obj.scale.setScalar(Math.max(0.001, b.baseScale * (1 - b.sunk / 0.6)));
        continue;
      }
      if (b.rb) {
        const p = b.rb.translation();
        const q = b.rb.rotation();
        b.obj.position.set(p.x, p.y - b.radius, p.z);
        b.obj.quaternion.set(q.x, q.y, q.z, q.w);
      } else {
        b.vel.y -= 22 * dt;
        b.obj.position.addScaledVector(b.vel, dt);
        b.obj.rotation.x += b.spin.x * dt;
        b.obj.rotation.z += b.spin.z * dt;
        const r = this.rock;
        const onRock =
          Math.abs(b.obj.position.x - r.x) < r.hw && Math.abs(b.obj.position.z - r.z) < r.hd;
        if (onRock && b.obj.position.y < r.y && b.obj.position.y > r.y - 0.5 && b.vel.y < 0) {
          b.obj.position.y = r.y;
          b.vel.y = Math.abs(b.vel.y) * 0.5;
          b.vel.x *= 0.7;
        }
      }
      if (b.obj.position.y + b.radius * 0.5 < this.lavaY) {
        b.sunk = 0;
        if (b.rb && this.world) {
          this.world.removeRigidBody(b.rb);
          b.rb = null;
        }
        b.onSplash(new THREE.Vector3(b.obj.position.x, this.lavaY, b.obj.position.z));
      }
    }
    const done = this.bodies.filter((b) => b.sunk > 0.6 || b.age > 6);
    if (done.length) {
      this.bodies = this.bodies.filter((b) => !done.includes(b));
      for (const b of done) {
        if (b.rb && this.world) this.world.removeRigidBody(b.rb);
        b.onDone(b.obj);
      }
    }
  }

  clear() {
    for (const b of this.bodies) {
      if (b.rb && this.world) this.world.removeRigidBody(b.rb);
      b.onDone(b.obj);
    }
    this.bodies = [];
  }
}
