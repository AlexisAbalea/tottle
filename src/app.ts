import * as THREE from 'three';
import type { LevelDef } from './core/types';
import {
  loadProgress,
  recordLevel,
  saveProgress,
  storageKeyFor,
  type Progress,
} from './core/progress';
import { HANDMADE_COUNT, levelDef } from './levels/catalog';
import { Stage } from './render/stage';
import { CLOUD_TOP, MobileView } from './render/mobile';
import { TottlerView } from './render/tottler';
import { toon } from './render/materials';
import { Sim, type TottlerSpec } from './sim/sim';
import { DROP_GAP, HOLD_SECONDS, bestDrop, physicsLavaGap } from './sim/bot';
import type { Rapier } from './sim/rapier';
import { Particles } from './fx/particles';
import { Sound, vibrate } from './fx/audio';
import { Hud } from './ui/hud';

/** Save slot: the main site, or a separate one per branch preview. */
const SAVE_KEY = storageKeyFor(location.pathname);

type Phase = 'ready' | 'playing' | 'holding' | 'countdown' | 'result';

const SKIES = [
  ['#8fd0ff', '#c9e8ff', '#ffd9b8'],
  ['#ffb7d5', '#ffd9c2', '#ffcf9e'],
  ['#9ee6d0', '#c8f3e6', '#ffdcae'],
  ['#b9a8ff', '#dcd2ff', '#ffd0b5'],
  ['#ffd27a', '#ffe7b8', '#ffc99a'],
];
const LAVA_COLORS = [0xffd23a, 0xff8a1f, 0xff5a1f];
/** Waiting Tottlers stand aside, smaller; the next one to grab is big, on a lit pad. */
const CURRENT_X = -1.0;
const WAITING_X = 0.85;
const WAITING_GAP = 0.75;
const WAITING_SCALE = 0.7;
/** Pause after a drop before the next Tottler can be grabbed. */
const COOLDOWN = 0.35;

/** Simple game-time timers so animations can be awaited. */
class Timers {
  private list: { t: number; fn: () => void }[] = [];
  now = 0;
  wait(sec: number): Promise<void> {
    return new Promise((res) => this.list.push({ t: this.now + sec, fn: res }));
  }
  update(dt: number) {
    this.now += dt;
    const due = this.list.filter((x) => x.t <= this.now);
    if (!due.length) return;
    this.list = this.list.filter((x) => x.t > this.now);
    due.forEach((x) => x.fn());
  }
}

interface Placed {
  view: TottlerView;
  spec: TottlerSpec;
  prevVy: number;
  falling: boolean;
  sunk: number;
}

interface Held {
  spec: TottlerSpec;
  view: TottlerView;
  x: number;
  y: number;
  /** height of what is below (null: only lava) */
  target: number | null;
}

/**
 * Physics version (branch feature/physics): grab the next Tottler, drag it over the mobile,
 * let go. Rapier decides everything. Win = everyone placed and nothing in the lava for
 * HOLD_SECONDS after the last drop.
 */
export class App {
  readonly stage: Stage;
  private sound = new Sound();
  private particles = new Particles();
  private hud: Hud;
  private timers = new Timers();
  private progress: Progress;
  private lastTime = performance.now();

  private levelIndex = 0;
  private level!: LevelDef;
  private sim: Sim | null = null;
  private phase: Phase = 'ready';
  private mobile: MobileView | null = null;
  private world = new THREE.Group();
  /** Waiting Tottlers (index 0 = next to grab). */
  private queue: { spec: TottlerSpec; view: TottlerView }[] = [];
  private placed = new Map<number, Placed>();
  private held: Held | null = null;
  private readyAt = 0;
  private countdownStart = 0;
  private pad: THREE.Mesh;
  private padRing: THREE.Mesh;
  private arrow: THREE.Mesh;
  private guide: THREE.Mesh;
  private target: THREE.Mesh;
  private queueOrigin = new THREE.Vector3(CURRENT_X, CLOUD_TOP, 0.4);
  private hintCache: { key: string; x: number; y: number } | null = null;
  private prepared = new Map<number, LevelDef>();
  /** Bumped on every level load, so stale async sequences stop. */
  private generation = 0;
  timeScale = 1;

  constructor(
    canvas: HTMLCanvasElement,
    hudRoot: HTMLElement,
    private R: Rapier,
  ) {
    this.stage = new Stage(canvas);
    this.progress = loadProgress(safeStorage(), SAVE_KEY);
    this.sound.muted = this.progress.muted;
    this.stage.scene.add(this.world, this.particles.mesh);

    this.pad = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.7, 0.12, 28), toon(0xffe27a));
    this.padRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.72, 0.05, 8, 40).rotateX(Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffc93c, transparent: true }),
    );
    this.pad.add(this.padRing);
    this.pad.position.copy(this.queueOrigin).add(new THREE.Vector3(0, 0.02, 0));
    this.arrow = new THREE.Mesh(
      new THREE.ConeGeometry(0.28, 0.46, 4).rotateX(Math.PI),
      toon(0xffc93c),
    );
    // drop guide: a thin line from the held Tottler down to where it will land, and a ring there
    const gGeo = new THREE.CylinderGeometry(0.03, 0.03, 1, 6).translate(0, -0.5, 0);
    this.guide = new THREE.Mesh(
      gGeo,
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 }),
    );
    this.target = new THREE.Mesh(
      new THREE.TorusGeometry(0.3, 0.04, 6, 28).rotateX(Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
    );
    this.guide.visible = this.target.visible = false;
    this.stage.scene.add(this.pad, this.arrow, this.guide, this.target);

    this.hud = new Hud(
      hudRoot,
      {
        onPlay: () => this.onPlay(),
        onRetry: () => {
          this.sound.unlock();
          this.sound.button();
          this.loadLevel(this.levelIndex, true);
        },
        onNext: () => {
          this.sound.button();
          this.loadLevel(this.levelIndex + 1, true);
        },
        onToggleSound: () => {
          this.sound.unlock();
          this.sound.muted = !this.sound.muted;
          this.progress = { ...this.progress, muted: this.sound.muted };
          saveProgress(safeStorage(), this.progress, SAVE_KEY);
          this.sound.button();
          return this.sound.muted;
        },
      },
      this.progress.muted,
    );

    canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    window.addEventListener('pointermove', (e) => this.onPointerMove(e));
    window.addEventListener('pointerup', (e) => this.onPointerUp(e));
    window.addEventListener('pointercancel', () => this.cancelHold());
    window.addEventListener('resize', () => this.reframe());

    this.showHome();
    this.loop();
  }

  // ───────────────────────── flow ─────────────────────────

  /** The app always opens on the player's current level, ready to play. */
  private showHome() {
    this.levelIndex = this.progress.level;
    this.setup(this.levelFor(this.levelIndex), this.levelIndex);
    this.hud.showStart(this.levelIndex + 1);
    this.phase = 'ready';
  }

  /** Level definition for a 0-based index; generated levels get a physics-safe lava distance. */
  private levelFor(index: number): LevelDef {
    const def = levelDef(index + 1);
    if (index < HANDMADE_COUNT) return def;
    let ready = this.prepared.get(index);
    if (!ready) {
      ready = { ...def, lavaGap: physicsLavaGap(this.R, def) };
      this.prepared.set(index, ready);
    }
    return ready;
  }

  /** Generated levels need a short physics check: do it ahead of time (e.g. on the win card). */
  private prepare(index: number) {
    setTimeout(() => this.levelFor(index), 300);
  }

  private onPlay() {
    this.sound.unlock();
    this.sound.button();
    if (this.phase === 'ready') this.beginPlaying();
  }

  private beginPlaying() {
    this.phase = 'playing';
    this.hud.showPlaying(this.levelIndex + 1);
  }

  loadLevel(index: number, play: boolean) {
    this.levelIndex = index;
    this.setup(this.levelFor(index), index);
    if (play) this.beginPlaying();
    else this.phase = 'ready';
  }

  /** Build the scene and the physics world for a level. */
  private setup(level: LevelDef, skyIndex: number) {
    this.generation++;
    this.level = level;
    this.held = null;
    this.hintCache = null;
    this.hud.hideHand();
    this.hud.setCountdown(null);
    this.guide.visible = this.target.visible = false;
    for (const q of this.queue) q.view.dispose();
    for (const p of this.placed.values()) p.view.dispose();
    this.queue = [];
    this.placed.clear();
    this.sim?.free();
    if (this.mobile) this.world.remove(this.mobile.group);

    this.sim = new Sim(this.R, level);
    this.mobile = new MobileView(level.root);
    this.mobile.lava = this.sim.lava;
    this.world.add(this.mobile.group);
    this.stage.setLava(this.sim.lava);
    this.queue = level.queue.map((weight, i) => {
      const spec = { id: i + 1, weight };
      return { spec, view: new TottlerView(spec.id, weight) };
    });
    this.layoutQueue(true);
    this.syncMobile();
    const sky = SKIES[skyIndex % SKIES.length];
    const app = document.getElementById('app');
    app?.style.setProperty('--sky-top', sky[0]);
    app?.style.setProperty('--sky-mid', sky[1]);
    app?.style.setProperty('--sky-bottom', sky[2]);
    this.readyAt = this.timers.now;
    this.reframe();
  }

  private reframe() {
    if (!this.mobile || !this.sim) return;
    const b = this.mobile.bounds();
    this.stage.frame(Math.min(b.minX, -2.8), Math.max(b.maxX, 2.8), this.sim.lava - 0.9, b.maxY);
  }

  /**
   * Queue on the cloud: the next one to grab is big, on a lit pad under a bouncing arrow;
   * the two after it wait aside, smaller and further back.
   */
  private layoutQueue(instant = false) {
    this.queue.forEach(({ view: v }, i) => {
      if (i > 2) {
        v.root.visible = false;
        return;
      }
      if (!v.root.parent) this.world.add(v.root);
      v.root.visible = true;
      v.showBadge(true);
      const target =
        i === 0
          ? new THREE.Vector3(this.queueOrigin.x, this.queueOrigin.y + 0.08, this.queueOrigin.z)
          : new THREE.Vector3(
              WAITING_X + (i - 1) * WAITING_GAP,
              this.queueOrigin.y,
              this.queueOrigin.z - 0.45,
            );
      v.root.userData.queueTarget = target;
      v.root.userData.queueScale = i === 0 ? 1 : WAITING_SCALE;
      v.mood = i === 0 ? 'ready' : 'idle';
      if (instant) {
        v.root.position.copy(target);
        v.root.scale.setScalar(v.scale * v.root.userData.queueScale);
      }
    });
  }

  // ───────────────────────── input: grab, drag, drop ─────────────────────────

  /** Pointer → world point on the z = 0 plane. */
  private toWorld(clientX: number, clientY: number): THREE.Vector3 {
    const rect = this.stage.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.stage.camera);
    const out = new THREE.Vector3();
    ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), out);
    return out;
  }

  /** Can the player grab the next Tottler now? */
  canGrab() {
    return this.phase === 'playing' && this.queue.length > 0 && this.timers.now >= this.readyAt;
  }

  private onPointerDown(e: PointerEvent) {
    this.sound.unlock();
    if (!this.canGrab()) return;
    this.grab(this.toWorld(e.clientX, e.clientY).x);
  }

  private onPointerMove(e: PointerEvent) {
    if (this.phase !== 'holding' || !this.held) return;
    this.moveHeld(this.toWorld(e.clientX, e.clientY).x);
  }

  private onPointerUp(e: PointerEvent) {
    if (this.phase !== 'holding' || !this.held) return;
    const p = this.toWorld(e.clientX, e.clientY);
    // let go back over the cloud: cancel
    if (p.y > CLOUD_TOP - 0.3) this.cancelHold();
    else this.release();
  }

  /** Public for tests: grab the next Tottler and hold it above world x. */
  grab(x: number) {
    if (!this.canGrab()) return false;
    const { spec, view } = this.queue[0];
    this.held = { spec, view, x, y: view.root.position.y, target: null };
    view.mood = 'jump';
    view.root.scale.setScalar(view.scale);
    this.phase = 'holding';
    this.hud.hideHand();
    this.sound.tap();
    vibrate(8);
    this.moveHeld(x);
    return true;
  }

  /** Move the held Tottler: it hovers just above whatever is under x. */
  moveHeld(x: number) {
    if (!this.held || !this.sim || !this.mobile) return;
    const b = this.mobile.bounds();
    x = THREE.MathUtils.clamp(x, b.minX - 0.5, b.maxX + 0.5);
    const surface = this.sim.surfaceBelow(x);
    this.held.x = x;
    this.held.target = surface;
    // over nothing: hover at mid height (letting go there means falling into the lava)
    this.held.y = surface === null ? this.sim.lava + 2.4 : surface + DROP_GAP;
  }

  private cancelHold() {
    if (!this.held) return;
    this.held = null;
    this.phase = 'playing';
    this.guide.visible = this.target.visible = false;
    this.layoutQueue();
  }

  /** Public for tests: let go of the held Tottler. */
  release() {
    if (!this.held || !this.sim) return false;
    const { spec, view, x, y } = this.held;
    this.held = null;
    this.guide.visible = this.target.visible = false;
    this.queue.shift();
    this.sim.drop(spec, x, y);
    this.placed.set(spec.id, { view, spec, prevVy: 0, falling: false, sunk: -1 });
    view.mood = 'idle';
    this.sound.jump(spec.weight);
    vibrate(10);
    this.layoutQueue();
    this.readyAt = this.timers.now + COOLDOWN;
    this.hintCache = null;
    if (this.queue.length === 0) {
      this.phase = 'countdown';
      this.countdownStart = this.timers.now + 0.4;
    } else {
      this.phase = 'playing';
    }
    return true;
  }

  // ───────────────────────── outcome ─────────────────────────

  private lose(reason: 'fall' | 'lava') {
    if (this.phase === 'result') return;
    this.phase = 'result';
    this.held = null;
    this.guide.visible = this.target.visible = false;
    this.hud.setCountdown(null);
    this.hud.hideHand();
    const gen = this.generation;
    this.sound.fail();
    vibrate([60, 60, 60]);
    void this.timers.wait(1.2).then(() => {
      if (gen !== this.generation) return;
      this.hud.showResult(
        { won: false, level: this.levelIndex + 1, reason, perfect: false },
        () => {},
      );
    });
  }

  private win() {
    this.phase = 'result';
    this.hud.setCountdown(null);
    const gen = this.generation;
    const rootAngle = this.sim!.beamStates()[this.level.root.id].angle;
    const perfect = Math.abs(rootAngle) < (2 * Math.PI) / 180;
    for (const p of this.placed.values()) p.view.mood = 'cheer';
    this.sound.win();
    vibrate([20, 40, 20]);
    this.particles.confetti(
      new THREE.Vector3(0, this.mobile!.ceilingY - 1.5, 1),
      perfect ? 160 : 70,
      perfect ? 1.4 : 0.9,
    );
    if (perfect) setTimeout(() => this.sound.perfect(), 350);
    this.progress = recordLevel(this.progress, this.levelIndex, perfect, Infinity);
    this.prepare(this.levelIndex + 1);
    saveProgress(safeStorage(), this.progress, SAVE_KEY);
    void this.timers.wait(0.9).then(() => {
      if (gen !== this.generation) return;
      this.hud.showResult(
        {
          won: true,
          level: this.levelIndex + 1,
          perfect,
        },
        () => this.sound.star(2),
      );
    });
  }

  // ───────────────────────── frame loop ─────────────────────────

  private syncMobile() {
    if (!this.sim || !this.mobile) return;
    this.mobile.sync(this.sim.beamStates(), this.sim.platformStates());
  }

  private step(dt: number) {
    this.timers.update(dt);
    this.stage.update(dt);
    if (this.sim && this.phase !== 'ready') this.sim.step(dt);
    this.syncMobile();
    const sim = this.sim;
    if (!sim) return;

    // placed Tottlers follow their bodies; sounds, arm waving, splashes
    const plats = Object.entries(sim.platformStates());
    for (const st of sim.tottlerStates()) {
      const p = this.placed.get(st.id);
      if (!p) continue;
      p.view.root.position.set(st.x, st.y, 0);
      p.view.root.rotation.set(0, 0, st.angle);
      if (p.prevVy < -1.5 && Math.abs(st.vy) < 0.4 && !p.falling) {
        this.sound.land(p.spec.weight);
        p.view.land(0.5 + p.spec.weight * 0.2);
      }
      if (!p.falling && st.vy < -5) {
        p.falling = true;
        p.view.mood = 'fall';
        p.view.showBadge(false);
        this.sound.whoa();
      }
      p.prevVy = st.vy;
      const under = plats.find(
        ([, q]) => Math.abs(st.x - q.x) < q.width / 2 + 0.1 && st.y > q.y - 0.3 && st.y < q.y + 2.5,
      );
      if (under && !p.falling && p.view.mood !== 'cheer')
        p.view.agitation = Math.max(
          Math.abs(under[1].angle) * 4,
          this.mobile!.heat(under[0]) * 1.2,
        );
      if (st.y < sim.lava && p.sunk < 0) {
        p.sunk = 0;
        this.splash(new THREE.Vector3(st.x, sim.lava, 0.3), 16);
      }
      if (p.sunk >= 0) {
        p.sunk += dt;
        p.view.root.scale.setScalar(Math.max(0.001, p.view.scale * (1 - p.sunk / 0.6)));
      }
    }

    // lose: anything in the lava
    if (this.phase !== 'result' && this.phase !== 'ready') {
      const hit = sim.lavaHit();
      if (hit) this.lose(hit.platformId ? 'lava' : 'fall');
    }

    // countdown after the last drop
    if (this.phase === 'countdown') {
      const left = HOLD_SECONDS - Math.max(0, this.timers.now - this.countdownStart);
      this.hud.setCountdown(left, HOLD_SECONDS);
      if (left <= 0) this.win();
    }

    // queue Tottlers walk to their spot and grow / shrink
    for (const { view: v } of this.queue) {
      if (this.held?.view === v) continue;
      const target = v.root.userData.queueTarget as THREE.Vector3 | undefined;
      if (!target) continue;
      v.root.position.lerp(target, Math.min(1, dt * 8));
      const k = (v.root.userData.queueScale as number) ?? 1;
      v.root.scale.setScalar(
        THREE.MathUtils.lerp(v.root.scale.x, v.scale * k, Math.min(1, dt * 8)),
      );
    }

    // the held Tottler hovers over its landing point, with a guide line
    if (this.held) {
      const v = this.held.view;
      v.root.position.lerp(new THREE.Vector3(this.held.x, this.held.y, 0), Math.min(1, dt * 18));
      v.root.rotation.set(0, 0, 0);
      const bottom = this.held.target ?? sim.lava;
      const len = Math.max(0.01, v.root.position.y - bottom);
      this.guide.position.set(v.root.position.x, v.root.position.y, 0);
      this.guide.scale.set(1, len, 1);
      this.target.position.set(v.root.position.x, bottom + 0.02, 0);
      const color = this.held.target === null ? 0xff3b3b : 0xffffff;
      (this.guide.material as THREE.MeshBasicMaterial).color.setHex(color);
      (this.target.material as THREE.MeshBasicMaterial).color.setHex(color);
      this.guide.visible = this.target.visible = true;
    }

    // arrow + pad pulse over the next Tottler
    const cur = this.queue[0]?.view;
    this.arrow.visible = !!cur && this.phase === 'playing';
    this.padRing.visible = this.arrow.visible;
    if (cur && this.arrow.visible) {
      const t = this.timers.now;
      this.arrow.position.set(
        cur.root.position.x,
        cur.root.position.y + cur.scale * 2.0 + 0.25 + Math.abs(Math.sin(t * 4)) * 0.18,
        cur.root.position.z,
      );
      this.arrow.rotation.y = t * 2;
      const pulse = 1 + 0.12 * Math.sin(t * 5);
      this.padRing.scale.set(pulse, 1, pulse);
      (this.padRing.material as THREE.MeshBasicMaterial).opacity = 0.55 + 0.35 * Math.sin(t * 5);
    }

    for (const { view } of this.queue) view.update(dt);
    for (const p of this.placed.values()) p.view.update(dt);
    this.particles.update(dt);
  }

  private splash(at: THREE.Vector3, n: number) {
    this.particles.puff(at, LAVA_COLORS[Math.floor(Math.random() * 3)], n);
    this.particles.puff(at.clone().add(new THREE.Vector3(0, 0.3, 0)), 0x6b5a7a, Math.ceil(n / 2));
    this.sound.sizzle();
    vibrate(15);
  }

  /** Tutorial: the hand shows dragging the next Tottler to a good spot. */
  private updateHand() {
    if (!this.level.tutorial || !this.canGrab() || !this.sim) {
      if (this.phase !== 'holding') this.hud.hideHand();
      return;
    }
    const key = `${this.queue.length}`;
    if (this.hintCache?.key !== key) {
      const best = bestDrop(this.sim, this.queue[0].spec);
      if (!best) return;
      this.hintCache = { key, x: best.x, y: best.y };
    }
    const from = this.stage.toScreen(
      this.queue[0].view.root.position.clone().add(new THREE.Vector3(0, 0.5, 0)),
    );
    const to = this.stage.toScreen(new THREE.Vector3(this.hintCache.x, this.hintCache.y + 0.4, 0));
    this.hud.showDragHint(from, to);
  }

  private loop = () => {
    requestAnimationFrame(this.loop);
    const now = performance.now();
    const frameDt = Math.min(0.05, (now - this.lastTime) / 1000) * this.timeScale;
    this.lastTime = now;
    const steps = Math.max(1, Math.ceil(frameDt / (1 / 60)));
    for (let i = 0; i < steps; i++) this.step(frameDt / steps);
    this.updateHand();
    this.updateQueueCount();
    this.stage.render();
  };

  private updateQueueCount() {
    if (this.phase === 'result' || this.phase === 'ready') return;
    const extra = this.queue.length - 3;
    const p = new THREE.Vector3(
      WAITING_X + WAITING_GAP + 0.75,
      this.queueOrigin.y + 0.4,
      this.queueOrigin.z - 0.45,
    );
    const s = this.stage.toScreen(p);
    this.hud.setQueueCount(Math.max(0, extra), s.x, s.y);
  }

  // ───────────────────────── test hooks ─────────────────────────

  /** Tests: drop the next Tottler on a platform, offset −1…1 across its width. */
  dropOn(platformId: string, offset = 0): boolean {
    if (!this.sim) return false;
    const p = this.sim.platformStates()[platformId];
    if (!p || !this.grab(p.x + (offset * p.width) / 2)) return false;
    return this.release();
  }

  /** Tests: the drop the tutorial hand would suggest. */
  suggestion() {
    if (!this.sim || !this.queue.length) return null;
    return bestDrop(this.sim, this.queue[0].spec);
  }

  debugState() {
    const platforms: Record<string, { x: number; y: number; width: number }> = {};
    if (this.sim) {
      for (const [id, p] of Object.entries(this.sim.platformStates())) {
        const c = this.stage.toScreen(new THREE.Vector3(p.x, p.y + 0.55, 0));
        const e = this.stage.toScreen(new THREE.Vector3(p.x + p.width / 2, p.y + 0.55, 0));
        platforms[id] = { x: c.x, y: c.y, width: Math.abs(e.x - c.x) * 2 };
      }
    }
    const next = this.queue[0]?.view.root.position;
    return {
      phase: this.phase,
      level: this.levelIndex + 1,
      queue: this.queue.map((q) => q.spec.weight),
      canGrab: this.canGrab(),
      next: next ? this.stage.toScreen(next.clone().add(new THREE.Vector3(0, 0.5, 0))) : null,
      platforms,
      progress: this.progress,
    };
  }

  /** Tests: screen position of a world point (e.g. a suggested drop). */
  screenOf(x: number, y: number) {
    return this.stage.toScreen(new THREE.Vector3(x, y, 0));
  }
}

function safeStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
