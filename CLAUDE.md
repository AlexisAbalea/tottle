# Tottle — notes for Claude

Mobile 3D balance puzzle. Hanging mobile of beams carries platforms; little stickmen
(**Tottlers**) arrive one by one; the player taps a platform to place the current one.
Goal: place everyone, drop as few as possible. Audience 18–70, casual, 30–90 s levels,
**no text needed to play** (rare UI text in English). Ads later (rewarded + interstitial).

## Rules (v1)

- Structure: root beam hangs from the ceiling. Each arm end holds a **platform** or a
  **sub-beam** (max 3 beam levels). Platforms have a **capacity** (slots drawn on them).
- Arms may have different lengths (levels 9+). Torque = weight × arm length.
- Tottler weights: 1 (small, green), 2 (medium, orange), 3 (big, pink); number badge on the head.
- Queue shows current + next 2 (and "+N" for the rest).
- Balance is **computed, never simulated**: per beam, `imbalance = Σ right torque − Σ left torque`,
  the weight of a sub-beam is the total weight under it.
- Each beam has a **tolerance**. Gauge under the pivot: green (≤ ½ tolerance used),
  orange (> ½), red (exactly at the limit — one more on that side drops someone).
- Fall rule: while a beam is over tolerance (checked top→bottom, left→right), the **most
  recently placed Tottler on its heavy side** falls; then recompute.
  With the current mechanics this always means _the Tottler you just placed falls_ —
  the simplest thing for a player to predict. The general loop is kept for future mechanics.
- Rapier physics is **only** the falling show. It never decides anything.
- Level ends when the queue is empty. Stars: 0 falls = 3★, 1–2 falls = 2★, 3–10 falls = 1★,
  11+ falls = failed (ends immediately). **Perfect** = root beam exactly level at the end.
- A full platform can't be tapped (soft "nope" tick + tiny vibration).
- Total capacity of a level is always ≥ queue length (checked by tests).

## Decisions taken when the brief was vague

- "2 stars = 2 falls" read as 1–2 falls; 3–10 falls = 1 star.
- Tap = pointer down + up on the same platform (nearest platform within ~85 px, so touch
  zones are large). No time limit anywhere.
- Platforms tilt with the beam they hang from; sub-beams hang freely (own tilt only).
- Visual tilt = clamp(imbalance / tolerance, ±1.4) × 11°, spring-animated.
- Tutorial (levels 1–3): a hand points at the solver's suggested platform every turn.
- Endless mode (unlocked after level 3, default once all 15 are done): generated rounds
  (always solvable), 3 hearts, each fall costs a heart, a Perfect round gives one back.
  Score = Tottlers placed without a fall. Best score saved.
- App opens straight on the current level with a big Play button; Next/Retry start the
  next level immediately on the same screen. No level select.
- Progress in `localStorage` key `tottle.progress.v1`.

## Stack

TypeScript + Vite, Three.js (render), Rapier `@dimforge/rapier3d-compat` (falls only,
lazy-loaded), Vitest (logic), Playwright (browser), ESLint + Prettier.
Later: Capacitor (iOS/Android) + AdMob.

## Layout

- `src/core/` pure logic, **no three/rapier imports** (ESLint enforces it):
  `types`, `structure`, `balance`, `game` (place/resolveFalls), `score`, `solver`
  (3-star solver, hint, solution count), `progress` (save/load).
- `src/levels/` `builder` (tiny DSL `B(tol, left, right, ll, rl)` / `P(cap)`),
  `levels.ts` (15 hand-made levels), `endless.ts` (seeded generator).
- `src/render/` `stage` (renderer, camera framing, lights, island), `layout` (pure geometry),
  `mobile` (beams/platforms/gauges + spring tilt), `tottler` (procedural stickman, shared
  geometries), `materials` (palette, toon ramp, canvas textures).
- `src/fx/` `physics` (Rapier falls), `particles` (instanced confetti/puffs), `audio`
  (WebAudio synth + `vibrate`).
- `src/ui/` DOM HUD (top bar, start, results, tutorial hand) + CSS.
- `src/app.ts` controller (flow, placement sequence, input). `src/main.ts` boot + `window.__tottle`
  test hooks (`state()`, `tap(id)`, `load(n)`, `speed(x)`).

## Conventions

- Every level must be 3-star solvable: `src/levels/levels.test.ts` runs the solver on each.
  Use `npx vite-node scripts/analyze-levels.ts` / `scripts/tune-levels.ts` to measure difficulty.
- Test in the browser with Playwright at 390×844 and look at screenshots before calling a UI change done.
- Performance target 60 fps on mid Android: shared geometries/materials, few lights, one shadow map.
- Push to `main` (user's choice); GitHub Pages deploys from `.github/workflows/deploy.yml`.
- Ambiguous rule → pick the simplest, most readable option for a 60-year-old, note it here.
