# Tottle

A bright low-poly 3D balance puzzle for phones. Little **Tottlers** arrive one by one — tap a
platform of the hanging mobile to place each one. Every Tottler tips its beam (and every beam
above it). Tip a beam past its limit and someone falls. Place everyone, drop as few as possible.

**Play:** https://alexisabalea.github.io/tottle/

## Run locally

```bash
npm install
npm run dev        # http://localhost:5173 (also exposed on your LAN for phone testing)
```

## Test

```bash
npm test           # Vitest: rules, solver, all 15 levels 3-star solvable, progress
npm run e2e        # Playwright (390×844 mobile): plays every level in a real browser
npm run lint       # ESLint
npm run typecheck
```

Level design helpers:

```bash
npx vite-node scripts/analyze-levels.ts   # solvable? number of solutions, random-player success
npx vite-node scripts/tune-levels.ts      # search queues for a target difficulty
```

## Deploy

Every push to `main` runs lint + tests, builds, and publishes `dist/` to GitHub Pages
(`.github/workflows/deploy.yml`). One-time setup: in the repo **Settings → Pages → Build and
deployment → Source**, choose **GitHub Actions**.

## Project layout

| Folder        | What                                                                     |
| ------------- | ------------------------------------------------------------------------ |
| `src/core/`   | Pure game logic (no Three.js): balance, falls, scoring, solver, progress |
| `src/levels/` | 15 hand-made levels (small DSL) + endless generator                      |
| `src/render/` | Three.js scene: mobile, Tottlers, camera framing                         |
| `src/fx/`     | Rapier falls (show only), particles, WebAudio sounds, vibration          |
| `src/ui/`     | DOM HUD: start, top bar, results, tutorial hand                          |
| `tests/e2e/`  | Playwright browser tests                                                 |

See `CLAUDE.md` for the rules and design decisions.
