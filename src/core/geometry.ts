import type { BeamNode, LevelDef, StructureNode } from './types';
import { tiltRatio, type Weights } from './balance';
import { walk } from './structure';

/**
 * Geometry of the mobile, in world units (1 ≈ the height of a medium Tottler).
 * It lives in core/ because the lava rule depends on platform heights: the renderer
 * uses exactly the same numbers, so what the player sees is what the rules compute.
 */
export const WIDTH_UNIT = 0.2; // world size of one width unit
export const PLATFORM_PAD = 0.12; // each side, room for the ropes
export const PLATFORM_THICK = 0.22;
export const ROPE = 2.35; // hook → platform top, empty platform
export const STRETCH = 0.045; // extra rope length per weight unit on the platform
export const SUBBEAM_DROP = 1.3; // hook → sub-beam pivot
export const GAP = 0.3; // min horizontal gap between neighbour sub-trees
export const MIN_ARM_SCALE = 0.85;
/** Tilt of a beam that is exactly at its limit (radians). Beyond, it tips over. */
export const MAX_TILT = (18 * Math.PI) / 180;
export const DEFAULT_LAVA_GAP = 1.2;

export function platformWorldWidth(size: number) {
  return size * WIDTH_UNIT + PLATFORM_PAD * 2;
}

export interface NodeLayout {
  /** Extent to the left / right of the node's hang point (positive numbers). */
  left: number;
  right: number;
  /** Beams: visual arm lengths and world units per "arm unit" (for notches). */
  armL?: number;
  armR?: number;
  unit?: number;
  /** How far down the node reaches below its hang point (empty, at rest). */
  depth: number;
}

/**
 * Visual arm lengths so that sub-trees never overlap; within a beam the left/right ratio
 * equals the ratio of arm lengths in the rules.
 */
export function computeLayout(root: BeamNode): Map<string, NodeLayout> {
  const out = new Map<string, NodeLayout>();
  const rec = (n: StructureNode): NodeLayout => {
    if (n.kind === 'platform') {
      const half = platformWorldWidth(n.size) / 2;
      const l: NodeLayout = { left: half, right: half, depth: ROPE + PLATFORM_THICK };
      out.set(n.id, l);
      return l;
    }
    const L = rec(n.left.child);
    const R = rec(n.right.child);
    const ll = n.left.length;
    const rl = n.right.length;
    const unit = Math.max(MIN_ARM_SCALE, (GAP + R.left + L.right) / (ll + rl));
    const armL = unit * ll;
    const armR = unit * rl;
    const dropL = n.left.child.kind === 'beam' ? SUBBEAM_DROP : 0;
    const dropR = n.right.child.kind === 'beam' ? SUBBEAM_DROP : 0;
    const l: NodeLayout = {
      left: armL + L.left,
      right: armR + R.right,
      armL,
      armR,
      unit,
      depth: Math.max(dropL + L.depth, dropR + R.depth),
    };
    out.set(n.id, l);
    return l;
  };
  rec(root);
  return out;
}

/** Rotation (radians, three.js z convention) of a beam for a tilt ratio. Right-heavy → negative. */
export function tiltAngle(ratio: number, clampTo = 1): number {
  return -Math.max(-clampTo, Math.min(clampTo, ratio)) * MAX_TILT;
}

export interface PlatformPose {
  /** Hook point the platform hangs from. */
  hookX: number;
  hookY: number;
  /** Centre of the platform top surface (straight under the hook). */
  x: number;
  y: number;
  /** Tilt of the platform = tilt of the beam it hangs from. */
  angle: number;
  /** Lowest point of the tray (a corner when tilted). */
  bottom: number;
  width: number;
}

/**
 * Pose of every platform, the root pivot being at (0, 0).
 * `angles` gives each beam's rotation; `w` the weight per platform (rope stretch).
 */
export function platformPoses(
  root: BeamNode,
  layout: Map<string, NodeLayout>,
  angles: Record<string, number>,
  w: Weights,
  /** Optional: receives each beam's pivot and its parent hook. */
  beams?: Record<string, { x: number; y: number; hookX: number; hookY: number }>,
): Record<string, PlatformPose> {
  const out: Record<string, PlatformPose> = {};
  const rec = (n: StructureNode, hx: number, hy: number, parentAngle: number) => {
    if (n.kind === 'platform') {
      const width = platformWorldWidth(n.size);
      const y = hy - ROPE - STRETCH * (w[n.id] ?? 0);
      const a = parentAngle;
      const bottom = y - PLATFORM_THICK * Math.cos(a) - (width / 2) * Math.abs(Math.sin(a));
      out[n.id] = { hookX: hx, hookY: hy, x: hx, y, angle: a, bottom, width };
      return;
    }
    const isRoot = n === root;
    const px = hx;
    const py = isRoot ? hy : hy - SUBBEAM_DROP;
    const a = angles[n.id] ?? 0;
    if (beams) beams[n.id] = { x: px, y: py, hookX: hx, hookY: hy };
    const l = layout.get(n.id)!;
    const c = Math.cos(a);
    const s = Math.sin(a);
    rec(n.left.child, px - l.armL! * c, py - l.armL! * s, a);
    rec(n.right.child, px + l.armR! * c, py + l.armR! * s, a);
  };
  rec(root, 0, 0, 0);
  return out;
}

/** Beam angles from loads, clamped at the tip-over angle. */
export function beamAngles(root: BeamNode, w: Weights): Record<string, number> {
  const out: Record<string, number> = {};
  walk(root, (n) => {
    if (n.kind === 'beam') out[n.id] = tiltAngle(tiltRatio(n, w));
  });
  return out;
}

/** Height of the lava surface for a level (root pivot at 0). */
export function lavaLevel(level: LevelDef, layout = computeLayout(level.root)): number {
  const poses = platformPoses(level.root, layout, {}, {});
  const lowest = Math.min(...Object.values(poses).map((p) => p.bottom));
  return lowest - (level.lavaGap ?? DEFAULT_LAVA_GAP);
}

/** Platforms touching the lava for these weights (beams clamped at their tip-over angle). */
export function platformsInLava(
  level: LevelDef,
  layout: Map<string, NodeLayout>,
  lava: number,
  w: Weights,
): string[] {
  const poses = platformPoses(level.root, layout, beamAngles(level.root, w), w);
  return Object.keys(poses).filter((id) => poses[id].bottom <= lava + 1e-9);
}
