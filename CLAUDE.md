# Tottle — notes for Claude

Mobile 3D balance puzzle. Hanging mobile of beams carries platforms; little stickmen
(**Tottlers**) arrive one by one; the player taps a platform to place the current one.
Goal: place everyone, drop as few as possible. Audience 18–70, casual, 30–90 s levels,
**no text needed to play** (rare UI text in English). Ads later (rewarded + interstitial).

## Branch `feature/physics` — gameplay v3 (experiment, user request)

On this branch the Tottlers are **real physics** (Rapier), not computed rules:

- **Drag & drop**: press anywhere → the next Tottler is picked up and hovers just above
  whatever is under the finger (x follows the finger), with a guide line and a landing ring
  (red = only lava below). Let go → it drops. Letting go back over the cloud cancels.
- Mobile = Rapier bodies (`src/sim/sim.ts`): beams with a torsion spring on their **absolute**
  angle (an imbalance equal to the beam's tolerance tilts it 18°; sub-beams hang from gravity,
  they don't follow their parent); platforms swing from their hook with a softer spring (a big
  Tottler at the edge tilts it ~15°); Tottlers are upright capsules (mass = weight), slippery
  on each other (0.05) and grippy on trays (0.75): a newcomer between two same-size Tottlers
  pushes them aside, a small one can rest on two big ones' heads.
- Locked axes on jointed bodies made Rapier explode → only Tottlers are axis-locked.
- Platforms are 1.4× wider than the rule model (`PLATFORM_ROOM`): real packing needs slack.
- **Win**: everyone placed + nothing touches the lava for **3 s** (countdown ring).
  **Lose**: any Tottler or platform touches the lava.
- Level lava distances re-derived with physics (`scripts/physics-lava.ts`); tests
  (`src/sim/sim.test.ts`) check behaviours and that a **bot** (beam search with real physics,
  `src/sim/bot.ts`) wins every level and that no single first drop reaches the lava.
- Old rule engine (`core/game`, `solver`, `difficulty`) is unused by the app here; the difficulty
  curve is not re-measured for physics yet. Endless rounds are generated with the old solver
  (not physics-verified).
- Preview: https://alexisabalea.github.io/tottle/preview/feature-physics/

## Rules (v2 — after first playtest)

- Structure: root beam hangs from a cloud. Each arm end holds a **platform** or a
  **sub-beam** (max 3 beam levels). Arms may have different lengths (levels 9+);
  torque = weight × arm length.
- Platforms have a **width**: S = 6, M = 9, L = 12 width units, shown by their real width
  (and colour: S yellow, M white, L blue). **No slots drawn**: any number of Tottlers can be
  sent; a Tottler of weight w takes w + 1 units. If it doesn't fit, it falls (1 fall).
- Tottler weights: 1 (small, green), 2 (medium, orange), 3 (big, pink); number badge on the head.
  Their visual width matches the room they take.
- Queue waits on top of the cloud. The **next one to jump** stands big on a lit yellow pad,
  under a bouncing arrow, waving; the next 2 wait **aside, smaller** (×0.7) and further back,
  then "+N" (playtest: players couldn't tell who would jump). They jump down onto platforms.
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
- **No stars** (playtest): the level is won only if everyone is placed with **zero falls**.
  The first fall (no room, or a beam tipping) = **Game Over** ("Oops!"); lava = Game Over
  ("Lava!"). The tip-over cascade still plays out before the Game Over card.
  **Perfect** = root beam exactly level at the end (bonus badge + confetti).
- Rapier physics is **only** the show (tumbling falls, sinking in lava, breaking platform).

## Decisions taken when the brief was vague

- Tip-over drops the heavy side's whole sub-tree (not just one platform): strongest snowball.
- Lava is checked on the settled mobile, not during the tip swing (otherwise one move could
  instantly lose the level — too harsh).
- Tap = pointer down + up on the same platform (nearest platform within ~85 px).
  No time limit anywhere.
- Platforms hang straight under their hook and tilt with their beam; sub-beams hang freely.
- Tutorial (levels 1–3): a hand points at the solver's suggested platform every turn.
- Endless mode (unlocked after level 3, default once all 20 are done): generated rounds
  (always solvable, lava set by the solver + slack shrinking over time). The first fall or
  lava = game over. Score = Tottlers placed (shown in the top bar). Best score saved.
- App opens straight on the current level with a big Play button; Next/Retry start the
  next level immediately on the same screen. No level select.
- Progress in `localStorage` key `tottle.progress.v1` (`completed[]`; older saves with `stars[]`
  are migrated on load).

## Stack

TypeScript + Vite, Three.js (render), Rapier `@dimforge/rapier3d-compat` (falls only,
lazy-loaded), Vitest (logic), Playwright (browser), ESLint + Prettier.
Later: Capacitor (iOS/Android) + AdMob.

## Layout

- `src/core/` pure logic, **no three/rapier imports** (ESLint enforces it):
  `types`, `structure`, `balance` (torque, widths), `geometry` (layout, platform heights, lava),
  `game` (place/settle, win/lose), `solver` (zero-fall solver, hint, solution count),
  `difficulty` (seeded `myopicRate`: share of short-sighted players who win),
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

- Every level must be winnable (zero falls): `src/levels/levels.test.ts` runs the solver on each.
- **Difficulty curve** (user request): levels alternate easy/medium and slowly ramp up;
  every 5th level is HARD, every 10th VERY HARD. Tested with `myopicRate`: level 5k is the
  hardest of its block of 5 and ≤ 20 %; level 10k the hardest of its 10 and < 5 %;
  regular levels > 20 %.
  Use `npx vite-node scripts/analyze-levels.ts` / `scripts/tune-levels.ts` to measure difficulty.
- Test in the browser with Playwright at 390×844 and look at screenshots before calling a UI change done.
- Performance target 60 fps on mid Android: shared geometries/materials, few lights, one shadow map.
- Push to `main` (user's choice) → live site. Risky features go on a branch
  (`feature/<name>`) → preview at `https://alexisabalea.github.io/tottle/preview/feature-<name>/`
  (`/` becomes `-`); give the user that link. `.github/workflows/pages.yml` publishes to the
  `gh-pages` branch (Pages source = gh-pages / root); deleting a branch removes its preview.
  `claude/*` branches are mirrors of main and get no preview. Previews use their own save key
  (`storageKeyFor`).
- Ambiguous rule → pick the simplest, most readable option for a 60-year-old, note it here.
