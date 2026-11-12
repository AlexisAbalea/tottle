import * as THREE from 'three';

const CONFETTI_COLORS = [0xff5a7e, 0xffb02e, 0x45d39b, 0x5ab8ff, 0x8c6cf2, 0xffe14d];
const MAX = 220;

/** Confetti and puffs, drawn with one InstancedMesh. */
export class Particles {
  readonly mesh: THREE.InstancedMesh;
  private pos: THREE.Vector3[] = [];
  private vel: THREE.Vector3[] = [];
  private rot: THREE.Euler[] = [];
  private spin: THREE.Vector3[] = [];
  private life: number[] = [];
  private size: number[] = [];
  private gravity: number[] = [];
  private next = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3();

  constructor() {
    const geo = new THREE.PlaneGeometry(1, 0.6);
    const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false });
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX);
    this.mesh.frustumCulled = false;
    const c = new THREE.Color();
    for (let i = 0; i < MAX; i++) {
      this.pos.push(new THREE.Vector3());
      this.vel.push(new THREE.Vector3());
      this.rot.push(new THREE.Euler());
      this.spin.push(new THREE.Vector3());
      this.life.push(0);
      this.size.push(0);
      this.gravity.push(0);
      this.mesh.setColorAt(i, c.setHex(0xffffff));
      this.mesh.setMatrixAt(i, this.m.makeScale(0, 0, 0));
    }
  }

  private spawn(
    p: THREE.Vector3,
    v: THREE.Vector3,
    color: number,
    size: number,
    life: number,
    g: number,
  ) {
    const i = this.next;
    this.next = (this.next + 1) % MAX;
    this.pos[i].copy(p);
    this.vel[i].copy(v);
    this.rot[i].set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    this.spin[i].set(Math.random() * 10 - 5, Math.random() * 10 - 5, Math.random() * 10 - 5);
    this.life[i] = life;
    this.size[i] = size;
    this.gravity[i] = g;
    this.mesh.setColorAt(i, new THREE.Color(color));
    this.mesh.instanceColor!.needsUpdate = true;
  }

  confetti(at: THREE.Vector3, count = 90, spread = 1) {
    for (let k = 0; k < count; k++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (3 + Math.random() * 7) * spread;
      const v = new THREE.Vector3(
        Math.cos(a) * sp * 0.7,
        6 + Math.random() * 8,
        Math.sin(a) * sp * 0.3,
      );
      this.spawn(
        at,
        v,
        CONFETTI_COLORS[k % CONFETTI_COLORS.length],
        0.2 + Math.random() * 0.12,
        2 + Math.random(),
        9,
      );
    }
  }

  puff(at: THREE.Vector3, color = 0xffffff, count = 12) {
    for (let k = 0; k < count; k++) {
      const a = (k / count) * Math.PI * 2;
      const v = new THREE.Vector3(Math.cos(a) * 2.2, 1 + Math.random() * 1.5, Math.sin(a) * 0.6);
      this.spawn(at, v, color, 0.28, 0.5, 2);
    }
  }

  update(dt: number) {
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      this.vel[i].y -= this.gravity[i] * dt;
      this.vel[i].multiplyScalar(1 - Math.min(1, dt * 1.5));
      this.pos[i].addScaledVector(this.vel[i], dt);
      this.rot[i].x += this.spin[i].x * dt;
      this.rot[i].y += this.spin[i].y * dt;
      this.rot[i].z += this.spin[i].z * dt;
      const sc = this.life[i] > 0 ? this.size[i] * Math.min(1, this.life[i] * 3) : 0;
      this.q.setFromEuler(this.rot[i]);
      this.s.setScalar(sc);
      this.m.compose(this.pos[i], this.q, this.s);
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
