import * as THREE from 'three';
import type { LevelDef, Tottler } from './core/types';
import { createGame, canPlace, place, type GameEvent, type GameState } from './core/game';
import { starsRemaining } from './core/score';
import { hint } from './core/solver';
import {
  loadProgress,
  recordEndless,
  recordLevel,
  saveProgress,
  type Progress,
} from './core/progress';
import { LEVELS } from './levels/levels';
import { endlessLevel } from './levels/endless';
import { Stage } from './render/stage';
import { MobileView } from './render/mobile';
import { TottlerView, TOTTLER_HEIGHT } from './render/tottler';
import { PALETTE, toon } from './render/materials';
import { FallPhysics } from './fx/physics';
import { Particles } from './fx/particles';
import { Sound, vibrate } from './fx/audio';
import { Hud } from './ui/hud';

type Phase = 'ready' | 'playing' | 'busy' | 'result';
type Mode = 'level' | 'endless';

const SKIES = [
  ['#8fd0ff', '#c9e8ff', '#ffe9f3'],
  ['#ffb7d5', '#ffd9c2', '#fff4d6'],
  ['#9ee6d0', '#c8f3e6', '#fff6dc'],
  ['#b9a8ff', '#dcd2ff', '#ffe3f0'],
  ['#ffd27a', '#ffe7b8', '#fff7ec'],
];
const ENDLESS_LIVES = 3;
const QUEUE_SPACING = 1.05;

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

interface Jump {
  view: TottlerView;
  from: THREE.Vector3;
  platformId: string;
  slot: number;
  t: number;
  dur: number;
  height: number;
  done: () => void;
}

export class App {
  readonly stage: Stage;
  private sound = new Sound();
  private physics = new FallPhysics();
  private particles = new Particles();
  private hud: Hud;
  private timers = new Timers();
  private progress: Progress;
  private lastTime = performance.now();

  private mode: Mode = 'level';
  private levelIndex = 0;
  private level!: LevelDef;
  private game!: GameState;
  private phase: Phase = 'ready';
  private mobile: MobileView | null = null;
  private world = new THREE.Group();
  private views = new Map<number, TottlerView>();
  /** Which platform each placed Tottler view stands on. */
  private onPlatform = new Map<number, string>();
  private queueViews: TottlerView[] = [];
  private pad: THREE.Mesh;
  private jumps: Jump[] = [];
  private queueOrigin = new THREE.Vector3();
  private pressed: string | null = null;
  private endless = { seed: 1, round: 0, lives: ENDLESS_LIVES, score: 0 };
  /** Bumped on every level load, so stale async sequences stop. */
  private generation = 0;
  timeScale = 1;

  constructor(canvas: HTMLCanvasElement, hudRoot: HTMLElement) {
    this.stage = new Stage(canvas);
    this.progress = loadProgress(safeStorage());
    this.sound.muted = this.progress.muted;
    this.stage.scene.add(this.world, this.particles.mesh);
    const padGeo = new THREE.CylinderGeometry(0.62, 0.7, 0.16, 28);
    this.pad = new THREE.Mesh(padGeo, toon(PALETTE.pad));
    this.pad.receiveShadow = true;
    this.stage.scene.add(this.pad);

    this.hud = new Hud(
      hudRoot,
      {
        onPlay: () => this.onPlay(),
        onEndless: () => {
          this.sound.unlock();
          this.sound.button();
          this.startEndless();
        },
        onRetry: () => {
          this.sound.unlock();
          this.sound.button();
          if (this.mode === 'endless') this.startEndless();
          else this.loadLevel(this.levelIndex, true);
        },
        onNext: () => {
          this.sound.button();
          this.loadLevel(Math.min(this.levelIndex + 1, LEVELS.length - 1), true);
        },
        onHome: () => {
          this.sound.button();
          this.showHome();
        },
        onToggleSound: () => {
          this.sound.unlock();
          this.sound.muted = !this.sound.muted;
          this.progress = { ...this.progress, muted: this.sound.muted };
          saveProgress(safeStorage(), this.progress);
          this.sound.button();
          return this.sound.muted;
        },
      },
      this.progress.muted,
    );

    canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    canvas.addEventListener('pointerup', (e) => this.onPointerUp(e));
    window.addEventListener('resize', () => this.reframe());

    void this.physics.init(-8);
    this.showHome();
    this.loop();
  }

  // ───────────────────────── flow ─────────────────────────

  private showHome() {
    const done = this.progress.level >= LEVELS.length;
    if (done) {
      this.mode = 'endless';
      this.endless = { seed: newSeed(), round: 0, lives: ENDLESS_LIVES, score: 0 };
      this.setup(endlessLevel(this.endless.seed, 0), 0);
      this.hud.showStart(`∞ <span style="opacity:.6">★ ${this.progress.endlessBest}</span>`, true);
    } else {
      this.mode = 'level';
      this.levelIndex = this.progress.level;
      this.setup(LEVELS[this.levelIndex], this.levelIndex);
      this.hud.showStart(`LEVEL ${this.levelIndex + 1}`, this.progress.level >= 3);
    }
    this.phase = 'ready';
  }

  private onPlay() {
    this.sound.unlock();
    this.sound.button();
    if (this.phase !== 'ready') return;
    this.beginPlaying();
  }

  private beginPlaying() {
    this.phase = 'playing';
    this.hud.showPlaying(this.label());
    this.refreshStars();
    this.afterSettle();
  }

  private label() {
    return this.mode === 'endless' ? `∞ ${this.endless.round + 1}` : `LEVEL ${this.levelIndex + 1}`;
  }

  loadLevel(index: number, play: boolean) {
    this.mode = 'level';
    this.levelIndex = index;
    this.setup(LEVELS[index], index);
    if (play) this.beginPlaying();
    else this.phase = 'ready';
  }

  private startEndless() {
    this.mode = 'endless';
    this.endless = { seed: newSeed(), round: 0, lives: ENDLESS_LIVES, score: 0 };
    this.setup(endlessLevel(this.endless.seed, 0), 0);
    this.beginPlaying();
  }

  /** Build the scene for a level definition. */
  private setup(level: LevelDef, skyIndex: number) {
    this.generation++;
    this.level = level;
    this.game = createGame(level);
    this.jumps = [];
    this.physics.clear();
    this.hud.hideHand();
    for (const v of this.views.values()) v.dispose();
    for (const v of this.queueViews) v.dispose();
    this.views.clear();
    this.onPlatform.clear();
    this.queueViews = [];
    if (this.mobile) this.world.remove(this.mobile.group);

    this.mobile = new MobileView(level.root, 0);
    this.world.add(this.mobile.group);
    const groundY = this.mobile.bottomY - 2.3;
    const b = this.mobile.bounds();
    const hw = Math.max(4.2, Math.max(-b.minX, b.maxX) * 0.8);
    this.stage.setGround(groundY, hw, 2.6);
    this.physics.setGround(groundY, hw, 2.6);
    this.queueOrigin.set(0, groundY, 0.9);
    this.pad.position.set(0, groundY + 0.02, 0.9);

    for (const t of this.game.queue) {
      const v = new TottlerView(t.id, t.weight);
      this.views.set(t.id, v);
    }
    this.layoutQueue(true);
    this.mobile.setLoads(this.game.loads);
    const sky = SKIES[skyIndex % SKIES.length];
    const app = document.getElementById('app');
    app?.style.setProperty('--sky-top', sky[0]);
    app?.style.setProperty('--sky-mid', sky[1]);
    app?.style.setProperty('--sky-bottom', sky[2]);
    this.reframe();
  }

  private reframe() {
    if (!this.mobile) return;
    const b = this.mobile.bounds();
    const qRight = this.queueOrigin.x + QUEUE_SPACING * 2 + 0.8;
    this.stage.frame(
      Math.min(b.minX, -qRight),
      Math.max(b.maxX, qRight),
      this.stage.groundY - 0.35,
      b.maxY,
    );
  }

  /** Put waiting Tottlers in line on the ground: current on the pad, then the next two. */
  private layoutQueue(instant = false) {
    const waiting = this.game.queue;
    waiting.forEach((t, i) => {
      const v = this.views.get(t.id)!;
      if (i > 2) {
        v.root.visible = false;
        return;
      }
      if (!v.root.parent) this.world.add(v.root);
      v.root.visible = true;
      v.showBadge(true);
      const target = new THREE.Vector3(
        this.queueOrigin.x + i * QUEUE_SPACING + (i > 0 ? 0.25 : 0),
        this.queueOrigin.y + (i === 0 ? 0.1 : 0),
        this.queueOrigin.z - (i > 0 ? 0.4 : 0),
      );
      v.root.userData.queueTarget = target;
      if (instant) v.root.position.copy(target);
    });
  }

  // ───────────────────────── input ─────────────────────────

  private pickPlatform(clientX: number, clientY: number): string | null {
    if (!this.mobile) return null;
    const rect = this.stage.canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    let best: string | null = null;
    let bestD = Infinity;
    const tmp = new THREE.Vector3();
    for (const [id, p] of this.mobile.platforms) {
      this.mobile.platformTop(id, tmp);
      // aim a bit above the tray, where the Tottlers stand
      const c = this.stage.toScreen(tmp.clone().add(new THREE.Vector3(0, 0.55, 0)));
      const edge = this.stage.toScreen(tmp.clone().add(new THREE.Vector3(p.width / 2, 0.55, 0)));
      const halfW = Math.abs(edge.x - c.x);
      const dx = Math.max(0, Math.abs(x - c.x) - halfW);
      const dy = Math.abs(y - c.y);
      const d = Math.hypot(dx, dy * 0.8);
      if (d < bestD) {
        bestD = d;
        best = id;
      }
    }
    return bestD < 85 ? best : null;
  }

  private onPointerDown(e: PointerEvent) {
    this.sound.unlock();
    if (this.phase !== 'playing') return;
    this.pressed = this.pickPlatform(e.clientX, e.clientY);
    this.mobile?.setHighlight(this.pressed);
  }

  private onPointerUp(e: PointerEvent) {
    const pid = this.pickPlatform(e.clientX, e.clientY);
    this.mobile?.setHighlight(null);
    const pressed = this.pressed;
    this.pressed = null;
    if (this.phase !== 'playing' || !pid || pid !== pressed) return;
    this.hud.ripple(e.clientX, e.clientY);
    this.tapPlatform(pid);
  }

  /** Public for tests: place the current Tottler on a platform. */
  tapPlatform(pid: string): boolean {
    if (this.phase !== 'playing') return false;
    if (!canPlace(this.game, pid)) {
      this.sound.tap();
      vibrate(8);
      return false;
    }
    void this.doPlace(pid);
    return true;
  }

  // ───────────────────────── placement sequence ─────────────────────────

  private async doPlace(pid: string) {
    const gen = this.generation;
    this.phase = 'busy';
    this.hud.hideHand();
    const before = this.game;
    const { state, events } = place(before, pid);
    this.game = state;
    const placed = events.find((e) => e.type === 'placed') as Extract<
      GameEvent,
      { type: 'placed' }
    >;
    const falls = events.filter((e) => e.type === 'fell') as Extract<GameEvent, { type: 'fell' }>[];
    const end = events.find((e) => e.type === 'end') as
      Extract<GameEvent, { type: 'end' }> | undefined;
    const view = this.views.get(placed.tottler.id)!;

    // 1. jump
    this.sound.jump(placed.tottler.weight);
    vibrate(10);
    await this.jumpTo(view, pid, placed.slot);
    if (gen !== this.generation) return;
    this.onPlatform.set(placed.tottler.id, pid);

    // 2. land: show the loads including the newcomer (may be beyond tolerance for a moment)
    const withNew: Record<string, Tottler[]> = {};
    for (const k of Object.keys(before.loads)) withNew[k] = before.loads[k].slice();
    withNew[pid].push(placed.tottler);
    this.mobile!.setLoads(withNew);
    this.sound.land(placed.tottler.weight);
    view.land(0.6 + placed.tottler.weight * 0.2);
    this.layoutQueue();

    // 3. falls
    if (falls.length) {
      await this.timers.wait(0.3);
      if (gen !== this.generation) return;
      for (const f of falls) {
        const fv = this.views.get(f.tottler.id)!;
        fv.mood = 'whoa';
        fv.root.userData.slide = f.side === 'right' ? 1 : -1;
      }
      this.sound.whoa();
      vibrate([20, 30, 20]);
      await this.timers.wait(0.45);
      if (gen !== this.generation) return;
      for (const f of falls) this.dropTottler(f.tottler.id, f.side === 'right' ? 1 : -1);
      this.mobile!.setLoads(this.game.loads);
      this.sound.fall();
      vibrate(45);
      if (this.mode === 'endless') {
        this.endless.lives = Math.max(0, this.endless.lives - falls.length);
      }
      this.refreshStars();
      await this.timers.wait(0.35);
      if (gen !== this.generation) return;
    } else {
      if (this.mode === 'endless') this.endless.score += 1;
      await this.timers.wait(0.12);
      if (gen !== this.generation) return;
    }

    // 4. end?
    if (this.mode === 'endless') {
      if (this.endless.lives <= 0) return this.endlessOver();
      if (end) return this.endlessRoundDone(end.perfect);
    } else if (end) {
      return this.levelDone(end);
    }
    this.phase = 'playing';
    this.afterSettle();
  }

  private jumpTo(view: TottlerView, pid: string, slot: number): Promise<void> {
    return new Promise((done) => {
      const from = view.root.getWorldPosition(new THREE.Vector3());
      const to = this.slotWorld(pid, slot);
      const height = Math.max(1.2, to.y - from.y + 1.4);
      view.mood = 'jump';
      this.jumps.push({ view, from, platformId: pid, slot, t: 0, dur: 0.62, height, done });
    });
  }

  private slotWorld(pid: string, slot: number) {
    const p = this.mobile!.platforms.get(pid)!;
    p.surface.updateWorldMatrix(true, false);
    return this.mobile!.slotLocal(pid, slot).applyMatrix4(p.surface.matrixWorld);
  }

  private updateJumps(dt: number) {
    for (const j of this.jumps) {
      j.t += dt;
      const k = Math.min(1, j.t / j.dur);
      const to = this.slotWorld(j.platformId, j.slot);
      const e = k; // linear horizontal, parabolic vertical
      const p = j.from.clone().lerp(to, e);
      p.y = j.from.y + (to.y - j.from.y) * e + j.height * 4 * e * (1 - e);
      j.view.root.position.copy(p);
      j.view.root.rotation.z = Math.sin(Math.PI * e) * (to.x > j.from.x ? -0.5 : 0.5);
      if (k >= 1) {
        const surface = this.mobile!.platforms.get(j.platformId)!.surface;
        surface.add(j.view.root);
        j.view.root.position.copy(this.mobile!.slotLocal(j.platformId, j.slot));
        j.view.root.rotation.set(0, 0, 0);
        j.view.mood = 'idle';
        j.done();
      }
    }
    this.jumps = this.jumps.filter((j) => j.t < j.dur);
  }

  private dropTottler(id: number, dir: number) {
    const v = this.views.get(id);
    if (!v) return;
    this.onPlatform.delete(id);
    this.stage.scene.attach(v.root);
    v.mood = 'fall';
    v.showBadge(false);
    v.root.userData.baseScale = v.scale;
    const vel = new THREE.Vector3(dir * (3 + Math.random()), 4.5, 1.2);
    const spin = new THREE.Vector3(
      Math.random() * 3,
      Math.random() * 2,
      -dir * (5 + Math.random() * 3),
    );
    this.physics.drop(
      v.root,
      0.45 * v.scale,
      vel,
      spin,
      (o) => {
        const p = o.getWorldPosition(new THREE.Vector3());
        this.particles.puff(p.add(new THREE.Vector3(0, 0.4, 0)));
        o.removeFromParent();
        this.views.delete(id);
      },
      () => {
        this.sound.thud();
        vibrate(15);
      },
    );
    setTimeout(() => this.sound.poof(), 1700);
  }

  private refreshStars() {
    if (this.mode === 'endless') this.hud.setStars(this.endless.lives, 'hearts', ENDLESS_LIVES);
    else this.hud.setStars(starsRemaining(this.game.falls), 'stars');
  }

  /** Called whenever the player can play again. */
  private afterSettle() {
    this.updateHand();
  }

  private updateHand() {
    if (this.phase !== 'playing' || !this.level.tutorial || !this.mobile) {
      this.hud.hideHand();
      return;
    }
    const pid = hint(this.game);
    if (!pid) return this.hud.hideHand();
    const top = this.mobile.platformTop(pid).add(new THREE.Vector3(0, 0.25, 0.4));
    const s = this.stage.toScreen(top);
    this.hud.showHand(s.x, s.y);
  }

  private async levelDone(end: Extract<GameEvent, { type: 'end' }>) {
    const gen = this.generation;
    this.phase = 'result';
    const won = end.status === 'won';
    if (won) {
      for (const [id] of this.onPlatform) {
        const v = this.views.get(id);
        if (v) v.mood = 'cheer';
      }
      this.sound.win();
      vibrate([20, 40, 20]);
      const center = new THREE.Vector3(0, this.mobile!.ceilingY - 1.5, 1);
      this.particles.confetti(center, end.perfect ? 160 : 60, end.perfect ? 1.4 : 0.8);
      if (end.perfect) {
        setTimeout(() => this.sound.perfect(), 350);
      }
      this.progress = recordLevel(
        this.progress,
        this.levelIndex,
        end.stars,
        end.perfect,
        LEVELS.length,
      );
      saveProgress(safeStorage(), this.progress);
    } else {
      this.sound.fail();
      vibrate([60, 60, 60]);
    }
    await this.timers.wait(won ? 0.9 : 0.6);
    if (gen !== this.generation) return;
    this.hud.showResult(
      {
        won,
        stars: end.stars,
        falls: end.falls,
        perfect: end.perfect,
        isLast: this.levelIndex >= LEVELS.length - 1,
      },
      (i) => this.sound.star(i),
    );
  }

  private async endlessRoundDone(perfect: boolean) {
    const gen = this.generation;
    this.phase = 'result';
    for (const [id] of this.onPlatform) {
      const v = this.views.get(id);
      if (v) v.mood = 'cheer';
    }
    this.sound.win();
    if (perfect) {
      this.sound.perfect();
      this.endless.lives = Math.min(ENDLESS_LIVES, this.endless.lives + 1);
      this.refreshStars();
    }
    this.particles.confetti(
      new THREE.Vector3(0, this.mobile!.ceilingY - 1.5, 1),
      perfect ? 120 : 50,
      1,
    );
    this.hud.toast(perfect ? 'PERFECT!' : `∞ ${this.endless.round + 2}`);
    await this.timers.wait(1.3);
    if (gen !== this.generation) return;
    this.endless.round += 1;
    const lives = this.endless.lives;
    const score = this.endless.score;
    this.setup(endlessLevel(this.endless.seed, this.endless.round), this.endless.round);
    this.endless.lives = lives;
    this.endless.score = score;
    this.beginPlaying();
  }

  private async endlessOver() {
    const gen = this.generation;
    this.phase = 'result';
    this.sound.fail();
    const score = this.endless.score;
    const isBest = score > this.progress.endlessBest;
    this.progress = recordEndless(this.progress, score);
    saveProgress(safeStorage(), this.progress);
    await this.timers.wait(0.8);
    if (gen !== this.generation) return;
    this.hud.showEndlessOver(score, this.progress.endlessBest, isBest);
  }

  // ───────────────────────── frame loop ─────────────────────────

  private step(dt: number) {
    this.timers.update(dt);
    this.stage.update(dt);
    this.updateJumps(dt);
    this.mobile?.update(dt);

    // queue Tottlers walk to their spot
    for (const t of this.game.queue) {
      const v = this.views.get(t.id);
      const target = v?.root.userData.queueTarget as THREE.Vector3 | undefined;
      if (!v || !target || this.jumps.some((j) => j.view === v)) continue;
      v.root.position.lerp(target, Math.min(1, dt * 8));
    }
    // placed Tottlers react to the tilt; falling ones slide first
    for (const [id, pid] of this.onPlatform) {
      const v = this.views.get(id);
      if (!v) continue;
      v.agitation = this.mobile?.platformTilt(pid) ?? 0;
      if (v.mood === 'whoa' && v.root.userData.slide)
        v.root.position.x += v.root.userData.slide * dt * 0.9;
    }
    for (const v of this.views.values()) v.update(dt);
    this.physics.update(dt);
    this.particles.update(dt);
  }

  private loop = () => {
    requestAnimationFrame(this.loop);
    const now = performance.now();
    const frameDt = Math.min(0.05, (now - this.lastTime) / 1000) * this.timeScale;
    this.lastTime = now;
    // Fixed sub-steps keep the springs stable (also when tests speed time up).
    const steps = Math.max(1, Math.ceil(frameDt / (1 / 60)));
    for (let i = 0; i < steps; i++) this.step(frameDt / steps);
    if (this.phase === 'playing' && this.level.tutorial) this.updateHand();
    this.updateQueueCount();
    this.stage.render();
  };

  private updateQueueCount() {
    const extra = this.game.queue.length - 3;
    if (this.phase !== 'playing' && this.phase !== 'busy') return;
    const p = this.queueOrigin.clone().add(new THREE.Vector3(QUEUE_SPACING * 2 + 1.15, 0.6, -0.4));
    const s = this.stage.toScreen(p);
    this.hud.setQueueCount(Math.max(0, extra), s.x, s.y);
  }

  // ───────────────────────── test hooks ─────────────────────────

  debugState() {
    const platforms: Record<string, { x: number; y: number; count: number; capacity: number }> = {};
    if (this.mobile) {
      for (const [id, p] of this.mobile.platforms) {
        const top = this.mobile.platformTop(id).add(new THREE.Vector3(0, 0.55, 0));
        const s = this.stage.toScreen(top);
        platforms[id] = {
          x: s.x,
          y: s.y,
          count: this.game.loads[id].length,
          capacity: p.node.capacity,
        };
      }
    }
    return {
      phase: this.phase,
      mode: this.mode,
      level: this.mode === 'level' ? this.levelIndex + 1 : this.endless.round + 1,
      queue: this.game.queue.map((t) => t.weight),
      falls: this.game.falls,
      status: this.game.status,
      lives: this.endless.lives,
      score: this.endless.score,
      hint: hint(this.game),
      platforms,
      progress: this.progress,
      tottlerHeight: TOTTLER_HEIGHT,
    };
  }
}

function newSeed() {
  return Math.floor(Math.random() * 1e9);
}

function safeStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
