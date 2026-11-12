import * as THREE from 'three';
import type RAPIER_NS from '@dimforge/rapier3d-compat';

type Rapier = typeof RAPIER_NS;

interface Body {
  obj: THREE.Object3D;
  /** Rapier body, or null when using the simple fallback integrator. */
  rb: RAPIER_NS.RigidBody | null;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  age: number;
  life: number;
  bounced: boolean;
  onDone: (obj: THREE.Object3D) => void;
  onBounce?: () => void;
}

/**
 * Rapier is only used for the show: a falling Tottler tumbles, bounces on the ground and
 * disappears. It never decides game results.
 */
export class FallPhysics {
  private R: Rapier | null = null;
  private world: RAPIER_NS.World | null = null;
  private bodies: Body[] = [];
  private acc = 0;
  private groundY = -8;
  private groundHW = 6;
  private groundHD = 2;

  async init(groundY: number) {
    this.groundY = groundY;
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

  setGround(y: number, hw: number, hd: number) {
    this.groundY = y;
    this.groundHW = hw;
    this.groundHD = hd;
    if (this.R) this.resetWorld();
  }

  private resetWorld() {
    const R = this.R!;
    for (const b of this.bodies) b.onDone(b.obj);
    this.bodies = [];
    this.world?.free();
    this.world = new R.World({ x: 0, y: -22, z: 0 });
    // The island: Tottlers that miss it keep falling off-screen.
    const ground = R.ColliderDesc.cuboid(this.groundHW * 0.92, 0.5, this.groundHD * 0.85)
      .setTranslation(0, this.groundY - 0.5, 0)
      .setRestitution(0.55)
      .setFriction(0.6);
    this.world.createCollider(ground);
  }

  get ready() {
    return !!this.world;
  }

  /** Launch a Tottler (already re-parented to the scene, at its world transform). */
  drop(
    obj: THREE.Object3D,
    radius: number,
    vel: THREE.Vector3,
    spin: THREE.Vector3,
    onDone: (o: THREE.Object3D) => void,
    onBounce?: () => void,
  ) {
    let rb: RAPIER_NS.RigidBody | null = null;
    if (this.world && this.R) {
      const R = this.R;
      const q = obj.quaternion;
      const desc = R.RigidBodyDesc.dynamic()
        .setTranslation(obj.position.x, obj.position.y + radius, obj.position.z)
        .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
        .setLinvel(vel.x, vel.y, vel.z)
        .setAngvel({ x: spin.x, y: spin.y, z: spin.z });
      rb = this.world.createRigidBody(desc);
      this.world.createCollider(
        R.ColliderDesc.ball(radius).setRestitution(0.6).setDensity(1).setFriction(0.5),
        rb,
      );
    }
    this.bodies.push({
      obj,
      rb,
      vel: vel.clone(),
      spin: spin.clone(),
      age: 0,
      life: 2.0,
      bounced: false,
      onDone,
      onBounce,
    });
    (obj.userData as { radius: number }).radius = radius;
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
      const r = (b.obj.userData as { radius: number }).radius;
      if (b.rb) {
        const p = b.rb.translation();
        const q = b.rb.rotation();
        b.obj.position.set(p.x, p.y - r, p.z);
        b.obj.quaternion.set(q.x, q.y, q.z, q.w);
        if (!b.bounced && Math.abs(p.y - r - this.groundY) < 0.2 && b.age > 0.2) {
          b.bounced = true;
          b.onBounce?.();
        }
      } else {
        // fallback: simple ballistic with one bounce
        b.vel.y -= 22 * dt;
        b.obj.position.addScaledVector(b.vel, dt);
        b.obj.rotation.x += b.spin.x * dt;
        b.obj.rotation.z += b.spin.z * dt;
        const onIsland =
          Math.abs(b.obj.position.x) < this.groundHW * 0.92 &&
          Math.abs(b.obj.position.z) < this.groundHD;
        if (onIsland && b.obj.position.y < this.groundY && b.obj.position.y > this.groundY - 0.6) {
          b.obj.position.y = this.groundY;
          b.vel.y = Math.abs(b.vel.y) * 0.5;
          b.vel.x *= 0.7;
          if (!b.bounced) {
            b.bounced = true;
            b.onBounce?.();
          }
        }
      }
      // shrink away at the end of its life
      const fade = b.age - (b.life - 0.35);
      if (fade > 0)
        b.obj.scale.setScalar(Math.max(0.001, (b.obj.userData.baseScale ?? 1) * (1 - fade / 0.35)));
    }
    const done = this.bodies.filter((b) => b.age >= b.life);
    if (done.length) {
      this.bodies = this.bodies.filter((b) => b.age < b.life);
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
