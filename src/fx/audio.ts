/**
 * Short synthesized sounds (WebAudio). Real audio files can replace these later:
 * keep the same method names.
 */
export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  muted = false;

  /** Must be called from a user gesture (browsers block audio before that). */
  unlock() {
    if (!this.ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private ok() {
    return !this.muted && this.ctx && this.master && this.ctx.state === 'running';
  }

  private tone(
    type: OscillatorType,
    f0: number,
    f1: number,
    dur: number,
    vol = 0.4,
    delay = 0,
    attack = 0.005,
  ) {
    if (!this.ok()) return;
    const c = this.ctx!;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master!);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(dur: number, vol: number, freq: number, delay = 0) {
    if (!this.ok()) return;
    const c = this.ctx!;
    const t = c.currentTime + delay;
    const len = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource();
    src.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = freq;
    const g = c.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(this.master!);
    src.start(t);
  }

  tap() {
    this.tone('sine', 900, 1200, 0.05, 0.15);
  }
  /** Jump towards a platform; heavier Tottlers sound lower. */
  jump(weight: number) {
    const base = [0, 620, 470, 360][weight];
    this.tone('sine', base, base * 1.9, 0.18, 0.3);
  }
  land(weight: number) {
    this.noise(0.08, 0.5, 900);
    this.tone('sine', 180 - weight * 25, 70, 0.14, 0.45);
    this.tone('triangle', 520, 700, 0.09, 0.12, 0.03);
  }
  whoa() {
    this.tone('triangle', 700, 900, 0.12, 0.2);
    this.tone('triangle', 900, 520, 0.22, 0.2, 0.12);
  }
  fall() {
    this.tone('sine', 1100, 180, 0.7, 0.25);
  }
  thud() {
    this.noise(0.12, 0.5, 400);
    this.tone('sine', 110, 50, 0.18, 0.4);
  }
  /** Something falls into the lava. */
  sizzle() {
    this.noise(0.45, 0.35, 3200);
    this.tone('sine', 220, 90, 0.25, 0.25);
  }
  /** Ropes snapping. */
  snap() {
    this.noise(0.06, 0.6, 5000);
    this.tone('square', 900, 200, 0.12, 0.15);
    this.noise(0.06, 0.6, 5000, 0.1);
  }
  poof() {
    this.noise(0.18, 0.25, 2500);
  }
  star(i: number) {
    const f = [880, 1108, 1318][i] ?? 1318;
    this.tone('triangle', f, f, 0.35, 0.25);
    this.tone('sine', f * 2, f * 2, 0.25, 0.08, 0.02);
  }
  perfect() {
    [784, 988, 1175, 1568, 1976].forEach((f, i) =>
      this.tone('triangle', f, f, 0.3, 0.22, i * 0.07),
    );
  }
  win() {
    [523, 659, 784, 1046].forEach((f, i) => this.tone('square', f, f, 0.16, 0.08, i * 0.09));
  }
  fail() {
    [392, 370, 349, 294].forEach((f, i) => this.tone('sawtooth', f, f * 0.97, 0.3, 0.08, i * 0.28));
  }
  button() {
    this.tone('sine', 660, 990, 0.08, 0.2);
  }
}

/** Short vibrations; silently ignored where unsupported (iOS Safari). */
export function vibrate(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // ignore
  }
}
