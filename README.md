# Tottle

A bright low-poly 3D balance puzzle for phones. Little **Tottlers** wait on a cloud — drag each
one over the hanging mobile and let go. Gravity and collisions do the rest: an off-centre
Tottler tilts its platform, a newcomer pushes the others aside, a small one can rest on two big
ones, and the heavier side sinks towards the lava. Place everyone and hold 3 seconds without
anything touching the lava.

**Play:** https://alexisabalea.github.io/tottle/

## Run locally

```bash
npm install
npm run dev        # http://localhost:5173 (also exposed on your LAN for phone testing)
```

## Test

```bash
npm test           # Vitest: physics behaviours, a bot wins all 20 levels with real physics
npm run e2e        # Playwright (390×844 mobile): plays every level in a real browser
npm run lint       # ESLint
npm run typecheck
```

Level design helpers:

```bash
npx vite-node scripts/analyze-levels.ts   # solvable? number of solutions, random-player success
npx vite-node scripts/tune-levels.ts      # search queues for a target difficulty
```

## Deploy & branch previews

Every push runs lint + unit tests + build (`.github/workflows/pages.yml`), then publishes to the
`gh-pages` branch:

| Push to                                    | Published at                                                     |
| ------------------------------------------ | ---------------------------------------------------------------- |
| `main`                                     | https://alexisabalea.github.io/tottle/                           |
| any other branch, e.g. `feature/new-thing` | https://alexisabalea.github.io/tottle/preview/feature-new-thing/ |

Deleting a branch removes its preview. Each preview has its own save, so testing a branch never
touches the progress of the main site. The link is also shown in the run summary on the Actions tab.

One-time setup: **Settings → Pages → Build and deployment → Source: "Deploy from a branch"**,
branch `gh-pages`, folder `/ (root)`.

## Project layout

| Folder        | What                                                                     |
| ------------- | ------------------------------------------------------------------------ |
| `src/core/`   | Pure game logic (no Three.js): balance, falls, scoring, solver, progress |
| `src/levels/` | 20 hand-made levels (small DSL), then generated levels with no end       |
| `src/render/` | Three.js scene: mobile, Tottlers, camera framing                         |
| `src/fx/`     | Rapier falls (show only), particles, WebAudio sounds, vibration          |
| `src/ui/`     | DOM HUD: start, top bar, results, tutorial hand                          |
| `tests/e2e/`  | Playwright browser tests                                                 |

See `CLAUDE.md` for the rules and design decisions.
