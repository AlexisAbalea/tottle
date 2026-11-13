import * as THREE from 'three';
import type { LevelDef, Loads, Weight } from './core/types';
import {
  cloneLoads,
  createGame,
  canPlace,
  freeWidth,
  place,
  type GameEvent,
  type GameState,
} from './core/game';
import { hint } from './core/solver';
import { tottlerWidth } from './core/balance';
import { WIDTH_UNIT } from './core/geometry';
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
import { CLOUD_TOP, MobileView, packPositions } from './render/mobile';
import { TottlerView } from './render/tottler';
import { toon } from './render/materials';
import { FallPhysics, type Rock } from './fx/physics';
import { Particles } from './fx/particles';
import { Sound, vibrate } from './fx/audio';
import { Hud } from './ui/hud';

type Phase = 'ready' | 'playing' | 'busy' | 'result';
type Mode = 'level' | 'endless';
type Ev<T extends GameEvent['type']> = Extract<GameEvent, { type: T }>;

const SKIES = [
  ['#8fd0ff', '#c9e8ff', '#ffd9b8'],
  ['#ffb7d5', '#ffd9c2', '#ffcf9e'],
  ['#9ee6d0', '#c8f3e6', '#ffdcae'],
  ['#b9a8ff', '#dcd2ff', '#ffd0b5'],
  ['#ffd27a', '#ffe7b8', '#ffc99a'],
];
/** Waiting Tottlers stand aside, smaller; the next one to jump is big, on a lit pad. */
const CURRENT_X = -1.0;
const WAITING_X = 0.85;
const WAITING_GAP = 0.75;
const WAITING_SCALE = 0.7;
const LAVA_COLORS = [0xffd23a, 0xff8a1f, 0xff5a1f];

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
  localX: number;
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
  /** What is currently shown on the platforms (lags behind `game` during animations). */
  private shown: Loads = {};
  private phase: Phase = 'ready';
  private mobile: MobileView | null = null;
  private world = new THREE.Group();
  private views = new Map<number, TottlerView>();
  /** Which platform each placed Tottler view stands on. */
  private onPlatform = new Map<number, string>();
  private pad: THREE.Mesh;
  private padRing: THREE.Mesh;
  private arrow: THREE.Mesh;
  private jumps: Jump[] = [];
  private queueOrigin = new THREE.Vector3();
  private pressed: string | null = null;
  private endless = { seed: 1, round: 0, falls: 0, score: 0 };
  /** Bumped on every level load, so stale async sequences stop. */
  private generation = 0;
  timeScale = 1;

  constructor(canvas: HTMLCanvasElement, hudRoot: HTMLElement) {
    this.stage = new Stage(canvas);
    this.progress = loadProgress(safeStorage());
    this.sound.muted = this.progress.muted;
    this.stage.scene.add(this.world, this.particles.mesh);
    const padGeo = new THREE.CylinderGeometry(0.62, 0.7, 0.12, 28);
    this.pad = new THREE.Mesh(padGeo, toon(0xffe27a));
    this.pad.receiveShadow = true;
    this.padRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.72, 0.05, 8, 40).rotateX(Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffc93c, transparent: true }),
    );
    this.pad.add(this.padRing);
    // bouncing arrow over the Tottler that jumps next
    const arrowGeo = new THREE.ConeGeometry(0.28, 0.46, 4).rotateX(Math.PI);
    this.arrow = new THREE.Mesh(arrowGeo, toon(0xffc93c));
    this.stage.scene.add(this.pad, this.arrow);

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

    void this.physics.init().then(() => this.physics.setScene(this.stage.lavaY, this.rock()));
    this.showHome();
    this.loop();
  }

  // ───────────────────────── flow ─────────────────────────

  private showHome() {
    const done = this.progress.level >= LEVELS.length;
    if (done) {
      this.mode = 'endless';
      this.endless = { seed: newSeed(), round: 0, falls: 0, score: 0 };
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
    this.refreshHud();
    this.updateHand();
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
    this.endless = { seed: newSeed(), round: 0, falls: 0, score: 0 };
    this.setup(endlessLevel(this.endless.seed, 0), 0);
    this.beginPlaying();
  }

  private rock(): Rock {
    // nothing to bounce on: everything that falls ends in the lava
    return { x: 0, y: -999, z: 0, hw: 1, hd: 1 };
  }

  /** Build the scene for a level definition. */
  private setup(level: LevelDef, skyIndex: number) {
    this.generation++;
    this.level = level;
    this.game = createGame(level);
    this.shown = cloneLoads(this.game.loads);
    this.jumps = [];
    this.physics.clear();
    this.hud.hideHand();
    for (const v of this.views.values()) v.dispose();
    this.views.clear();
    this.onPlatform.clear();
    if (this.mobile) this.world.remove(this.mobile.group);

    this.mobile = new MobileView(level.root);
    this.mobile.lava = this.game.lava;
    this.world.add(this.mobile.group);
    // the queue waits on top of the cloud the mobile hangs from
    this.queueOrigin.set(CURRENT_X, CLOUD_TOP, 0.4);
    this.stage.setLava(this.game.lava);
    this.physics.setScene(this.game.lava, this.rock());
    this.pad.position.set(this.queueOrigin.x, this.queueOrigin.y + 0.02, this.queueOrigin.z);

    for (const t of this.game.queue) this.views.set(t.id, new TottlerView(t.id, t.weight));
    this.layoutQueue(true);
    this.mobile.setLoads(this.shown);
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
    this.stage.frame(Math.min(b.minX, -2.8), Math.max(b.maxX, 2.8), this.game.lava - 0.9, b.maxY);
  }

  /**
   * Queue on the cloud: the next one to jump is big, on a lit pad under a bouncing arrow;
   * the two after it wait aside, smaller and further back.
   */
  private layoutQueue(instant = false) {
    this.game.queue.forEach((t, i) => {
      const v = this.views.get(t.id)!;
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
      if (p.broken) continue;
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
    if (this.phase !== 'playing' || !canPlace(this.game, pid)) return false;
    void this.doPlace(pid);
    return true;
  }

  // ───────────────────────── placement sequence ─────────────────────────

  private async doPlace(pid: string) {
    const gen = this.generation;
    const alive = () => gen === this.generation;
    this.phase = 'busy';
    this.hud.hideHand();
    const before = this.game;
    const { state, events } = place(before, pid);
    this.game = state;
    const tottler = before.queue[0];
    const view = this.views.get(tottler.id)!;
    const noRoom = events.find((e) => e.type === 'noRoom') as Ev<'noRoom'> | undefined;
    const tips = events.filter((e) => e.type === 'tip') as Ev<'tip'>[];
    const lava = events.find((e) => e.type === 'lava') as Ev<'lava'> | undefined;
    const end = events.find((e) => e.type === 'end') as Ev<'end'> | undefined;

    this.sound.jump(tottler.weight);
    vibrate(10);

    if (noRoom) {
      // 1a. lands on the edge, wobbles, falls off
      const p = this.mobile!.platforms.get(pid)!;
      const side = this.shown[pid].length % 2 === 0 ? 1 : -1;
      const x = side * (p.width / 2 + (tottlerWidth(tottler.weight) * WIDTH_UNIT) / 2 - 0.12);
      await this.jumpTo(view, pid, x);
      if (!alive()) return;
      this.onPlatform.set(tottler.id, pid);
      this.layoutQueue();
      view.mood = 'whoa';
      this.sound.whoa();
      await this.timers.wait(0.45);
      if (!alive()) return;
      this.dropTottler(tottler.id, side);
      this.sound.fall();
      vibrate(40);
      this.afterFalls(1);
      await this.timers.wait(0.3);
      if (!alive()) return;
    } else {
      // 1b. jump to its spot (Tottlers are packed side by side, centred)
      const next = this.shown[pid].concat({ ...tottler });
      const xs = packPositions(next.map((t) => t.weight as Weight));
      await this.jumpTo(view, pid, xs[xs.length - 1]);
      if (!alive()) return;
      this.onPlatform.set(tottler.id, pid);
      this.shown[pid] = next;
      this.mobile!.setLoads(this.shown);
      this.sound.land(tottler.weight);
      view.land(0.6 + tottler.weight * 0.2);
      this.layoutQueue();
      await this.timers.wait(0.15);
      if (!alive()) return;

      // 2. snowball: each beam that tips dumps its heavy side, then the mobile swings back
      for (const tip of tips) {
        await this.timers.wait(0.3);
        if (!alive()) return;
        for (const d of tip.dropped) {
          const v = this.views.get(d.tottler.id);
          if (v) v.mood = 'whoa';
        }
        this.sound.whoa();
        vibrate([20, 30, 20]);
        await this.timers.wait(0.4);
        if (!alive()) return;
        const dir = tip.side === 'right' ? 1 : -1;
        tip.dropped.forEach((d, i) => this.dropTottler(d.tottler.id, dir, i * 0.06));
        this.shown = cloneLoads(tip.after);
        this.mobile!.setLoads(this.shown);
        this.sound.fall();
        vibrate(45);
        this.afterFalls(tip.dropped.length);
        await this.timers.wait(0.35);
        if (!alive()) return;
      }

      // 3. lava: the platform breaks and falls in
      if (lava) {
        await this.timers.wait(0.35);
        if (!alive()) return;
        this.burnPlatform(lava.platformId);
        await this.timers.wait(1.1);
        if (!alive()) return;
      }
      if (!tips.length && !lava && this.mode === 'endless') {
        this.endless.score += 1;
        this.refreshHud();
      }
    }
    this.shown = cloneLoads(this.game.loads);
    this.mobile!.setLoads(this.shown);

    // 4. end?
    if (this.mode === 'endless') {
      if (lava || this.endless.falls > 0) return this.endlessOver();
      if (end) return this.endlessRoundDone(end.perfect);
    } else if (end) {
      return this.levelDone(end);
    }
    this.phase = 'playing';
    this.updateHand();
  }

  private afterFalls(n: number) {
    if (this.mode === 'endless') this.endless.falls += n;
  }

  private jumpTo(view: TottlerView, pid: string, localX: number): Promise<void> {
    return new Promise((done) => {
      const from = view.root.getWorldPosition(new THREE.Vector3());
      const to = this.spotWorld(pid, localX);
      const height = Math.max(0.9, to.y - from.y + 1.0);
      view.mood = 'jump';
      this.jumps.push({ view, from, platformId: pid, localX, t: 0, dur: 0.62, height, done });
    });
  }

  private spotWorld(pid: string, localX: number) {
    const p = this.mobile!.platforms.get(pid)!;
    p.surface.updateWorldMatrix(true, false);
    return new THREE.Vector3(localX, 0, 0.05).applyMatrix4(p.surface.matrixWorld);
  }

  private updateJumps(dt: number) {
    for (const j of this.jumps) {
      j.t += dt;
      const e = Math.min(1, j.t / j.dur);
      const to = this.spotWorld(j.platformId, j.localX);
      const p = j.from.clone().lerp(to, e);
      p.y = j.from.y + (to.y - j.from.y) * e + j.height * 4 * e * (1 - e);
      j.view.root.position.copy(p);
      j.view.root.rotation.z = Math.sin(Math.PI * e) * (to.x > j.from.x ? -0.5 : 0.5);
      if (e >= 1) {
        const surface = this.mobile!.platforms.get(j.platformId)!.surface;
        surface.add(j.view.root);
        j.view.root.position.set(j.localX, 0, 0.05);
        j.view.root.rotation.set(0, 0, 0);
        j.view.root.userData.packX = j.localX;
        j.view.mood = 'idle';
        j.done();
      }
    }
    this.jumps = this.jumps.filter((j) => j.t < j.dur);
  }

  /** A Tottler slides off and falls (into the lava, maybe bouncing on the rock first). */
  private dropTottler(id: number, dir: number, delay = 0) {
    const v = this.views.get(id);
    if (!v) return;
    this.onPlatform.delete(id);
    this.stage.scene.attach(v.root);
    v.mood = 'fall';
    v.showBadge(false);
    const vel = new THREE.Vector3(
      dir * (2.4 + Math.random() * 1.2),
      3.5 - delay * 10,
      0.6 + Math.random(),
    );
    const spin = new THREE.Vector3(
      Math.random() * 3,
      Math.random() * 2,
      -dir * (5 + Math.random() * 3),
    );
    this.physics.drop(
      v.root,
      0.4 * v.scale,
      vel,
      spin,
      (at) => this.splash(at, 14),
      (o) => {
        o.removeFromParent();
        this.views.delete(id);
      },
    );
  }

  private splash(at: THREE.Vector3, n: number) {
    this.particles.puff(at, LAVA_COLORS[Math.floor(Math.random() * 3)], n);
    this.particles.puff(at.clone().add(new THREE.Vector3(0, 0.3, 0)), 0x6b5a7a, Math.ceil(n / 2));
    this.sound.sizzle();
    vibrate(15);
  }

  /** The platform touched the lava: ropes snap, it drops in with everyone on it. */
  private burnPlatform(pid: string) {
    const surface = this.mobile!.breakPlatform(pid);
    if (!surface) return;
    for (const [id, p] of [...this.onPlatform]) if (p === pid) this.onPlatform.delete(id);
    for (const child of surface.children) {
      const v = [...this.views.values()].find((x) => x.root === child);
      if (v) v.mood = 'fall';
    }
    this.sound.snap();
    vibrate([80, 40, 120]);
    this.physics.drop(
      surface,
      0.3,
      new THREE.Vector3(0, -1, 0.4),
      new THREE.Vector3(0, 0, (Math.random() - 0.5) * 2),
      (at) => {
        this.splash(at, 30);
        this.sound.fail();
      },
      (o) => (o.visible = false),
    );
  }

  private refreshHud() {
    this.hud.setScore(this.mode === 'endless' ? this.endless.score : null);
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

  private async levelDone(end: Ev<'end'>) {
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
      if (end.perfect) setTimeout(() => this.sound.perfect(), 350);
      this.progress = recordLevel(this.progress, this.levelIndex, end.perfect, LEVELS.length);
      saveProgress(safeStorage(), this.progress);
    } else if (end.reason !== 'lava') {
      this.sound.fail();
      vibrate([60, 60, 60]);
    }
    await this.timers.wait(won ? 0.9 : 0.6);
    if (gen !== this.generation) return;
    this.hud.showResult(
      {
        won,
        level: this.levelIndex + 1,
        reason: end.reason,
        perfect: end.perfect,
        isLast: this.levelIndex >= LEVELS.length - 1,
      },
      () => this.sound.star(2),
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
      // a Perfect round forgives one fall
      this.sound.perfect();
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
    const { falls, score } = this.endless;
    this.setup(endlessLevel(this.endless.seed, this.endless.round), this.endless.round);
    this.endless.falls = falls;
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
      const k = (v.root.userData.queueScale as number) ?? 1;
      v.root.scale.setScalar(
        THREE.MathUtils.lerp(v.root.scale.x, v.scale * k, Math.min(1, dt * 8)),
      );
    }
    // arrow + pad pulse over the next Tottler
    const cur = this.game.queue[0] ? this.views.get(this.game.queue[0].id) : undefined;
    const jumping = !!cur && this.jumps.some((j) => j.view === cur);
    this.arrow.visible = !!cur && !jumping && this.phase !== 'result';
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
    // placed Tottlers shuffle to their packed spot and react to the tilt / heat
    for (const [pid, list] of Object.entries(this.shown)) {
      const xs = packPositions(list.map((t) => t.weight as Weight));
      list.forEach((t, i) => {
        const v = this.views.get(t.id);
        if (!v || v.mood === 'fall' || !this.onPlatform.has(t.id)) return;
        if (v.mood !== 'whoa')
          v.root.position.x += (xs[i] - v.root.position.x) * Math.min(1, dt * 6);
        v.agitation = Math.max(
          Math.abs(this.mobile?.platformTilt(pid) ?? 0),
          (this.mobile?.heat(pid) ?? 0) * 1.2,
        );
      });
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
    if (this.phase !== 'playing' && this.phase !== 'busy') return;
    const extra = this.game.queue.length - 3;
    const p = new THREE.Vector3(
      WAITING_X + WAITING_GAP + 0.75,
      this.queueOrigin.y + 0.4,
      this.queueOrigin.z - 0.45,
    );
    const s = this.stage.toScreen(p);
    this.hud.setQueueCount(Math.max(0, extra), s.x, s.y);
  }

  // ───────────────────────── test hooks ─────────────────────────

  debugState() {
    const platforms: Record<string, { x: number; y: number; count: number; free: number }> = {};
    if (this.mobile) {
      for (const [id] of this.mobile.platforms) {
        const top = this.mobile.platformTop(id).add(new THREE.Vector3(0, 0.55, 0));
        const s = this.stage.toScreen(top);
        platforms[id] = {
          x: s.x,
          y: s.y,
          count: this.game.loads[id].length,
          free: freeWidth(this.game, id),
        };
      }
    }
    return {
      phase: this.phase,
      mode: this.mode,
      level: this.mode === 'level' ? this.levelIndex + 1 : this.endless.round + 1,
      queue: this.game.queue.map((t) => t.weight),
      falls: this.mode === 'endless' ? this.endless.falls : this.game.falls,
      status: this.game.status,
      failReason: this.game.failReason ?? null,
      score: this.endless.score,
      hint: hint(this.game),
      platforms,
      progress: this.progress,
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
