import type { BeamNode, StructureNode } from '../core/types';

/** World-space sizes (1 unit ≈ the height of a medium Tottler). */
export const SLOT_W = 0.64;
export const PLATFORM_PAD = 0.14;
export const PLATFORM_DROP = 2.1; // hook → platform top
export const SUBBEAM_DROP = 1.25; // hook → sub-beam pivot
export const GAP = 0.22; // min horizontal gap between neighbour sub-trees
export const MIN_ARM_SCALE = 0.85;

export function platformWidth(capacity: number) {
  return capacity * SLOT_W + PLATFORM_PAD * 2;
}

export interface NodeLayout {
  /** Extent to the left / right of the node's hang point (positive numbers). */
  left: number;
  right: number;
  /** For beams: visual arm lengths. */
  armL?: number;
  armR?: number;
  /** For beams: world units per "arm unit" (used to draw notches). */
  unit?: number;
  /** How far down the node reaches below its hang point. */
  depth: number;
}

/**
 * Computes visual arm lengths so that sub-trees never overlap, keeping the ratio
 * between the left and right arms of a beam equal to the ratio of their lengths in the rules.
 */
export function computeLayout(root: BeamNode): Map<string, NodeLayout> {
  const out = new Map<string, NodeLayout>();
  const rec = (n: StructureNode): NodeLayout => {
    if (n.kind === 'platform') {
      const half = platformWidth(n.capacity) / 2;
      const l: NodeLayout = { left: half, right: half, depth: PLATFORM_DROP + 0.3 };
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
