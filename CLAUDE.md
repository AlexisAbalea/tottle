# Tottle — notes for Claude

Mobile 3D balance puzzle. Hanging mobile of beams carries platforms; little stickmen
(**Tottlers**) arrive one by one; the player taps a platform to place the current one.
Goal: place everyone, drop as few as possible. Audience 18–70, casual, 30–90 s levels,
**no text needed to play** (rare UI text in English). Ads later (rewarded + interstitial).

## Rules (v2 — after first playtest)

- Structure: root beam hangs from a cloud. Each arm end holds a **platform** or a
  **sub-beam** (max 3 beam levels). Arms may have different lengths (levels 9+);
  torque = weight × arm length.
- Platforms have a **width**: S = 6, M = 9, L = 12 width units, shown by their real width
  (and colour: S yellow, M white, L blue). **No slots drawn**: any number of Tottlers can be
  sent; a Tottler of weight w takes w + 1 units. If it doesn't fit, it falls (1 fall).
- Tottler weights: 1 (small, green), 2 (medium, orange), 3 (big, pink); number badge on the head.
  Their visual width matches the room they take.
- Queue waits on top of the cloud: current + next 2 (and "+N"). They jump down onto platforms.
- Balance is **computed, never simulated**: per beam, `imbalance = Σ right torque − Σ left torque`.
  Tilt = imbalance / tolerance × 18° (spring-animated). **No gauge** (playtest feedback).
- **Tip-over / snowball**: while a beam is over its tolerance (checked top→bottom, left→right),
  **everyone on its heavy side falls** (the whole sub-tree), then it swings back and is
  re-checked — the other side may now tip too.
- **Lava**: the lava lies `lavaGap` below the lowest empty platform. A platform goes down when
  its beam(s) lean its way and when it is loaded (rope stretch 0.045/weight unit). Once the
  mobile has settled (after tip-overs), a platform touching the lava **breaks → level lost**.
  The platform underside glows as the lava gets close; Tottlers wave their arms.
  The geometry is in `core/geometry.ts` and used by both rules and renderer.
  Levels guarantee that no first move can burn a platform (test).
- **Fairness (playtest feedback)**: a lone Tottler on an empty mobile never tips a beam —
  every beam's tolerance ≥ heaviest weight in the queue × its longest arm
  (`loneTottlerSafe`, tested; the tuner and endless generator apply `fair()`).
  Difficulty must come from accumulation and planning, never from a first-move trap.
- Stars: each fall costs a star — 0 falls 3★, 1 fall 2★, 2–9 falls 1★; **10 falls = lost**.
  **Perfect** = root beam exactly level at the end.
- Rapier physics is **only** the show (tumbling falls, sinking in lava, breaking platform).

## Decisions taken when the brief was vague

- "Each fall costs a star" read literally, but finishing always keeps 1★ until the 10-fall loss.
- Tip-over drops the heavy side's whole sub-tree (not just one platform): strongest snowball.
- Lava is checked on the settled mobile, not during the tip swing (otherwise one move could
  instantly lose the level — too harsh).
- Tap = pointer down + up on the same platform (nearest platform within ~85 px).
  No time limit anywhere.
- Platforms hang straight under their hook and tilt with their beam; sub-beams hang freely.
- Tutorial (levels 1–3): a hand points at the solver's suggested platform every turn.
- Endless mode (unlocked after level 3, default once all 20 are done): generated rounds
  (always 3★-solvable, lava set by the solver + slack shrinking over time). Falls add up across
  rounds; 10 falls or lava = game over; a Perfect round forgives one fall.
  Score = Tottlers placed without any fall. Best score saved.
- App opens straight on the current level with a big Play button; Next/Retry start the
  next level immediately on the same screen. No level select.
- Progress in `localStorage` key `tottle.progress.v1`.

## Stack

TypeScript + Vite, Three.js (render), Rapier `@dimforge/rapier3d-compat` (falls only,
lazy-loaded), Vitest (logic), Playwright (browser), ESLint + Prettier.
Later: Capacitor (iOS/Android) + AdMob.

## Layout

- `src/core/` pure logic, **no three/rapier imports** (ESLint enforces it):
  `types`, `structure`, `balance` (torque, widths), `geometry` (layout, platform heights, lava),
  `game` (place/settle), `score`, `solver` (3-star solver, hint, solution count),
  `difficulty` (seeded `myopicRate`: share of short-sighted players who get 3★),
  `progress` (save/load).
- `src/levels/` `builder` (tiny DSL `B(tol, left, right, ll, rl)` / `P(S|M|L)`,
  `level(id, draft, queue, lavaGap, tutorial)`),
  `levels.ts` (20 hand-made levels), `endless.ts` (seeded generator).
- `src/render/` `stage` (renderer, camera framing, lights, lava), `mobile` (cloud, beams,
  platforms + spring tilt, heat glow), `tottler` (procedural stickman, shared
  geometries), `materials` (palette, toon ramp, canvas textures).
- `src/fx/` `physics` (Rapier falls, sinking), `particles` (instanced confetti/puffs), `audio`
  (WebAudio synth + `vibrate`).
- `src/ui/` DOM HUD (top bar, start, results, tutorial hand) + CSS.
- `src/app.ts` controller (flow, placement sequence, input). `src/main.ts` boot + `window.__tottle`
  test hooks (`state()`, `tap(id)`, `load(n)`, `speed(x)`).

## Conventions

- Every level must be 3-star solvable: `src/levels/levels.test.ts` runs the solver on each.
- **Difficulty curve** (user request): levels alternate easy/medium and slowly ramp up;
  every 5th level is HARD, every 10th VERY HARD. Tested with `myopicRate`: level 5k is the
  hardest of its block of 5 and ≤ 20 %; level 10k the hardest of its 10 and < 5 %;
  regular levels > 20 %.
  Use `npx vite-node scripts/analyze-levels.ts` / `scripts/tune-levels.ts` to measure difficulty.
- Test in the browser with Playwright at 390×844 and look at screenshots before calling a UI change done.
- Performance target 60 fps on mid Android: shared geometries/materials, few lights, one shadow map.
- Push to `main` (user's choice); GitHub Pages deploys from `.github/workflows/deploy.yml`.
- Ambiguous rule → pick the simplest, most readable option for a 60-year-old, note it here.
