import type { BeamNode, Loads, Side, StructureNode } from './types';
import { walk } from './structure';

const EPS = 1e-9;

/** Total weight carried by a node (a platform's Tottlers, or everything under a beam). */
export function nodeWeight(node: StructureNode, loads: Loads): number {
  if (node.kind === 'platform') {
    return (loads[node.id] ?? []).reduce((s, t) => s + t.weight, 0);
  }
  return nodeWeight(node.left.child, loads) + nodeWeight(node.right.child, loads);
}

/** Torque of one side of a beam = arm length × weight carried on that side. */
export function sideTorque(beam: BeamNode, side: Side, loads: Loads): number {
  const arm = beam[side];
  return arm.length * nodeWeight(arm.child, loads);
}

/** Imbalance = right torque − left torque. Positive means the beam leans right. */
export function imbalance(beam: BeamNode, loads: Loads): number {
  return sideTorque(beam, 'right', loads) - sideTorque(beam, 'left', loads);
}

export function isOverTolerance(beam: BeamNode, loads: Loads): boolean {
  return Math.abs(imbalance(beam, loads)) > beam.tolerance + EPS;
}

/** Imbalance of every beam, keyed by beam id. */
export function allImbalances(root: BeamNode, loads: Loads): Record<string, number> {
  const out: Record<string, number> = {};
  walk(root, (n) => {
    if (n.kind === 'beam') out[n.id] = imbalance(n, loads);
  });
  return out;
}

/** First beam over tolerance, in pre-order (top to bottom, left to right). */
export function firstOverTolerance(root: BeamNode, loads: Loads): BeamNode | null {
  let found: BeamNode | null = null;
  walk(root, (n) => {
    if (!found && n.kind === 'beam' && isOverTolerance(n, loads)) found = n;
  });
  return found;
}

/**
 * Signed tilt ratio: imbalance / tolerance. |ratio| <= 1 is safe, > 1 means something falls.
 * A beam with tolerance 0 returns ±2 as soon as it is unbalanced.
 */
export function tiltRatio(beam: BeamNode, loads: Loads): number {
  const imb = imbalance(beam, loads);
  if (Math.abs(imb) < EPS) return 0;
  if (beam.tolerance < EPS) return Math.sign(imb) * 2;
  return imb / beam.tolerance;
}

export type BeamStatus = 'green' | 'orange' | 'red' | 'over';

/**
 * Colour code shown on each beam's gauge.
 * green  : at most half the tolerance used
 * orange : more than half used, but there is still room
 * red    : exactly at the limit — one more unit on the heavy side will make someone fall
 * over   : beyond tolerance (only visible for a moment, before the fall)
 */
export function beamStatus(ratio: number): BeamStatus {
  const r = Math.abs(ratio);
  if (r > 1 + EPS) return 'over';
  if (r >= 1 - EPS) return 'red';
  if (r > 0.5 + EPS) return 'orange';
  return 'green';
}
