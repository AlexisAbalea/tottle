import './style.css';

const SVG = {
  star: (fill = '#ffc93c') =>
    `<svg class="star" viewBox="0 0 24 24"><path fill="${fill}" stroke="#e0a100" stroke-width="1.2" stroke-linejoin="round" d="M12 2.6l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z"/></svg>`,
  heart: `<svg class="star" viewBox="0 0 24 24"><path fill="#ff5a7e" stroke="#d63a5e" stroke-width="1.2" d="M12 21s-7.5-4.6-9.5-9.2C1 8.3 3.2 4.5 6.9 4.5c2.1 0 3.6 1.2 5.1 3 1.5-1.8 3-3 5.1-3 3.7 0 5.9 3.8 4.4 7.3C19.5 16.4 12 21 12 21z"/></svg>`,
  play: `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M7 4.5v15c0 .8.9 1.3 1.6.8l11.5-7.5c.6-.4.6-1.2 0-1.6L8.6 3.7C7.9 3.2 7 3.7 7 4.5z"/></svg>`,
  retry: `<svg viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4v4.5H9"/></svg>`,
  soundOn: `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M4 9h3.5L12 5v14l-4.5-4H4z"/><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>`,
  soundOff: `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M4 9h3.5L12 5v14l-4.5-4H4z"/><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" d="M16 9.5l5 5M21 9.5l-5 5"/></svg>`,
  infinity: `<svg viewBox="0 0 24 24"><path fill="none" stroke="#8c6cf2" stroke-width="2.8" stroke-linecap="round" d="M12 12c-2-2.7-3.6-4-5.5-4a4 4 0 0 0 0 8c1.9 0 3.5-1.3 5.5-4zm0 0c2 2.7 3.6 4 5.5 4a4 4 0 0 0 0-8c-1.9 0-3.5 1.3-5.5 4z"/></svg>`,
  home: `<svg viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round" d="M4 11l8-7 8 7v9h-5v-6H9v6H4z"/></svg>`,
  fallen: `<svg viewBox="0 0 24 24"><circle cx="12" cy="6" r="3.2" fill="#ff5a7e"/><path stroke="#ff5a7e" stroke-width="2.6" stroke-linecap="round" d="M12 10v6M8 12l-3-3M16 12l3-3M12 16l-3 4M12 16l3 4"/><path stroke="#2b2340" stroke-width="2" stroke-linecap="round" d="M3 22h18"/></svg>`,
  trophy: `<svg viewBox="0 0 24 24"><path fill="#ffc93c" stroke="#e0a100" stroke-width="1.2" d="M7 3h10v5a5 5 0 0 1-10 0zM10 14h4v3h3v3H7v-3h3z"/><path fill="none" stroke="#e0a100" stroke-width="1.6" d="M7 5H4v2a3 3 0 0 0 3 3M17 5h3v2a3 3 0 0 1-3 3"/></svg>`,
  tottler: `<svg viewBox="0 0 24 24"><circle cx="12" cy="6" r="3.4" fill="#45d39b"/><path stroke="#45d39b" stroke-width="3" stroke-linecap="round" d="M12 10v6M8 11.5l-2 3M16 11.5l2 3M12 16l-2.5 5M12 16l2.5 5"/></svg>`,
  lava: `<svg viewBox="0 0 24 24"><path fill="#ff5a1f" d="M12 2c1 4 5 5.5 5 10a5 5 0 0 1-10 0c0-2.5 1.5-3.8 2.5-5 .3 1.6 1 2.5 2 3 0-3-.5-5.5.5-8z"/><path fill="#ffd23a" d="M12 12c.6 1.5 2 2 2 3.6a2 2 0 0 1-4 0c0-1 .7-1.6 1.2-2 .1.6.4 1 .8 1.2 0-1-.2-1.9 0-2.8z"/></svg>`,
  hand: `<svg viewBox="0 0 64 64"><path fill="#fff" stroke="#2b2340" stroke-width="3" stroke-linejoin="round" d="M22 30V9a5 5 0 0 1 10 0v17l2-.5V22a5 5 0 0 1 9.5-1l.5 4.5a5 5 0 0 1 9 2V44c0 9-6 16-15 16h-4c-6 0-9.5-3-12.5-8L13 41a5 5 0 0 1 8-6z"/></svg>`,
};

export interface HudCallbacks {
  onPlay(): void;
  onEndless(): void;
  onRetry(): void;
  onNext(): void;
  onHome(): void;
  onToggleSound(): boolean;
}

export interface ResultInfo {
  won: boolean;
  reason?: 'falls' | 'lava';
  stars: number;
  falls: number;
  perfect: boolean;
  isLast: boolean;
}

/** All DOM UI: top bar, start screen, result card, tutorial hand. */
export class Hud {
  private top: HTMLElement;
  private levelPill: HTMLElement;
  private starsEl: HTMLElement;
  private soundBtn: HTMLButtonElement;
  private start: HTMLElement;
  private result: HTMLElement;
  private hand: HTMLElement;
  private queueCount: HTMLElement;

  constructor(
    private root: HTMLElement,
    cb: HudCallbacks,
    muted: boolean,
  ) {
    root.innerHTML = `
      <div class="topbar hidden" data-testid="topbar">
        <div class="pill" data-testid="level-pill"></div>
        <div class="mid-pills">
          <div class="pill stars" data-testid="stars"></div>
          <div class="pill falls-pill" data-testid="falls-pill"></div>
        </div>
        <div class="right-btns">
          <button class="icon-btn" data-act="retry" aria-label="Restart">${SVG.retry}</button>
          <button class="icon-btn" data-act="sound" aria-label="Sound"></button>
        </div>
      </div>
      <div class="queue-count" data-testid="queue-count" style="opacity:0"></div>
      <div class="overlay hidden" data-testid="start">
        <div class="logo">Tottle</div>
        <div class="start-bottom">
          <div class="level-tag" data-testid="start-level"></div>
          <div class="play-row">
            <button class="side-btn" data-act="endless" aria-label="Endless mode">${SVG.infinity}</button>
            <button class="play-btn" data-act="play" data-testid="play" aria-label="Play">${SVG.play}</button>
            <button class="side-btn" data-act="sound2" aria-label="Sound"></button>
          </div>
        </div>
      </div>
      <div class="overlay dim hidden" data-testid="result"><div class="card"></div></div>
      <div class="hand" data-testid="hand">${SVG.hand}</div>
    `;
    this.top = root.querySelector('.topbar')!;
    this.levelPill = root.querySelector('[data-testid=level-pill]')!;
    this.starsEl = root.querySelector('[data-testid=stars]')!;
    this.soundBtn = root.querySelector('[data-act=sound]')!;
    this.start = root.querySelector('[data-testid=start]')!;
    this.result = root.querySelector('[data-testid=result]')!;
    this.hand = root.querySelector('.hand')!;
    this.queueCount = root.querySelector('.queue-count')!;
    this.setMuted(muted);

    root.addEventListener('pointerup', (e) => {
      const btn = (e.target as HTMLElement).closest('button');
      if (!btn) return;
      e.stopPropagation();
      const act = btn.dataset.act;
      if (act === 'play') cb.onPlay();
      else if (act === 'endless') cb.onEndless();
      else if (act === 'retry') cb.onRetry();
      else if (act === 'next') cb.onNext();
      else if (act === 'home') cb.onHome();
      else if (act === 'sound' || act === 'sound2') this.setMuted(cb.onToggleSound());
    });
    // Buttons must not leak taps to the 3D scene.
    root.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('button')) e.stopPropagation();
    });
  }

  setMuted(muted: boolean) {
    const icon = muted ? SVG.soundOff : SVG.soundOn;
    this.soundBtn.innerHTML = icon;
    const b2 = this.root.querySelector('[data-act=sound2]');
    if (b2) b2.innerHTML = icon;
  }

  showStart(label: string, endlessUnlocked: boolean) {
    this.start.querySelector('[data-testid=start-level]')!.innerHTML = label;
    (this.start.querySelector('[data-act=endless]') as HTMLElement).style.visibility =
      endlessUnlocked ? 'visible' : 'hidden';
    this.start.classList.remove('hidden');
    this.result.classList.add('hidden');
    this.top.classList.add('hidden');
  }

  showPlaying(label: string) {
    this.start.classList.add('hidden');
    this.result.classList.add('hidden');
    this.top.classList.remove('hidden');
    this.levelPill.innerHTML = label;
  }

  /** Remaining stars (levels) or hearts (endless). */
  setStars(n: number, kind: 'stars' | 'hearts' = 'stars', max = 3) {
    let html = '';
    for (let i = 0; i < max; i++) {
      const icon = kind === 'stars' ? SVG.star() : SVG.heart;
      html += i < n ? icon : icon.replace('class="star"', 'class="star off"');
    }
    this.starsEl.innerHTML = html;
    this.starsEl.style.display = max > 0 ? 'flex' : 'none';
  }

  /** Fallen counter, e.g. "3/10". */
  setFalls(n: number, max: number, visible: boolean) {
    const el = this.root.querySelector('[data-testid=falls-pill]') as HTMLElement;
    el.style.display = visible ? 'flex' : 'none';
    el.innerHTML = `${SVG.fallen}<span>${n}/${max}</span>`;
  }

  setQueueCount(n: number, x: number, y: number) {
    this.queueCount.style.opacity = n > 0 ? '1' : '0';
    this.queueCount.textContent = `+${n}`;
    this.queueCount.style.left = `${x}px`;
    this.queueCount.style.top = `${y}px`;
  }

  showResult(r: ResultInfo, onStar: (i: number) => void) {
    const card = this.result.querySelector('.card')!;
    if (r.won) {
      let stars = '';
      for (let i = 0; i < 3; i++) stars += SVG.star(i < r.stars ? '#ffc93c' : '#e8e4f3');
      card.innerHTML = `
        <div class="big-stars" data-testid="result-stars" data-stars="${r.stars}">${stars}</div>
        ${r.perfect ? '<div class="perfect" data-testid="perfect">PERFECT!</div>' : ''}
        <div class="stat">${SVG.fallen}<span data-testid="falls">${r.falls}</span></div>
        <div class="card-btns">
          <button class="side-btn" data-act="retry" aria-label="Retry">${SVG.retry}</button>
          ${
            r.isLast
              ? `<button class="play-btn" data-act="home" data-testid="next" aria-label="Continue">${SVG.play}</button>`
              : `<button class="play-btn" data-act="next" data-testid="next" aria-label="Next level">${SVG.play}</button>`
          }
        </div>`;
      const els = card.querySelectorAll('.big-stars .star');
      els.forEach((el, i) => {
        el.classList.remove('pop');
        if (i < r.stars) {
          (el as HTMLElement).style.animationDelay = `${0.15 + i * 0.25}s`;
          el.classList.add('pop');
          setTimeout(() => onStar(i), 150 + i * 250);
        }
      });
    } else {
      const icon = r.reason === 'lava' ? SVG.lava : SVG.fallen;
      card.innerHTML = `
        <div class="stat big-icon" data-testid="fail-${r.reason ?? 'falls'}" style="font-size:40px">${icon}<span data-testid="falls">${r.reason === 'lava' ? '' : r.falls}</span></div>
        <div class="card-btns">
          <button class="play-btn" data-act="retry" data-testid="retry" aria-label="Retry" style="background:var(--orange)!important;box-shadow:0 7px 0 #d68a10">${SVG.retry}</button>
        </div>`;
    }
    this.result.classList.remove('hidden');
    this.top.classList.add('hidden');
    this.setQueueCount(0, 0, 0);
  }

  showEndlessOver(score: number, best: number, isBest: boolean) {
    const card = this.result.querySelector('.card')!;
    card.innerHTML = `
      <div class="stat" style="font-size:44px">${SVG.tottler}<span data-testid="score">${score}</span></div>
      ${isBest ? '<div class="perfect">BEST!</div>' : ''}
      <div class="stat">${SVG.trophy}<span>${best}</span></div>
      <div class="card-btns">
        <button class="side-btn" data-act="home" aria-label="Home">${SVG.home}</button>
        <button class="play-btn" data-act="retry" data-testid="retry" aria-label="Play again">${SVG.retry}</button>
      </div>`;
    this.result.classList.remove('hidden');
    this.top.classList.add('hidden');
    this.setQueueCount(0, 0, 0);
  }

  hideResult() {
    this.result.classList.add('hidden');
  }

  showHand(x: number, y: number) {
    this.hand.style.left = `${x}px`;
    this.hand.style.top = `${y}px`;
    this.hand.classList.add('show');
  }

  hideHand() {
    this.hand.classList.remove('show');
  }

  ripple(x: number, y: number) {
    const r = document.createElement('div');
    r.className = 'ripple';
    r.style.left = `${x}px`;
    r.style.top = `${y}px`;
    this.root.appendChild(r);
    setTimeout(() => r.remove(), 600);
  }

  toast(text: string) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = text;
    this.root.appendChild(t);
    setTimeout(() => t.remove(), 1500);
  }
}
