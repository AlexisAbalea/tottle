import type { BeamNode, Loads, StructureNode, Weight } from './types';
import { walk } from './structure';

const EPS = 1e-9;

/** Total weight on each platform. Most balance functions work on this summary. */
export type Weights = Record<string, number>;

export function platformWeights(loads: Loads): Weights {
  const w: Weights = {};
  for (const k of Object.keys(loads)) w[k] = loads[k].reduce((s, t) => s + t.weight, 0);
  return w;
}

/** Width (in width units) a Tottler takes on a platform. */
export function tottlerWidth(weight: Weight): number {
  return weight + 1;
}

export function usedWidth(loads: Loads, platformId: string): number {
  return (loads[platformId] ?? []).reduce((s, t) => s + tottlerWidth(t.weight), 0);
}

/** Total weight carried by a node (a platform, or everything under a beam). */
export function nodeWeight(node: StructureNode, w: Weights): number {
  if (node.kind === 'platform') return w[node.id] ?? 0;
  return nodeWeight(node.left.child, w) + nodeWeight(node.right.child, w);
}

/** Imbalance = right torque − left torque (torque = weight × arm length). Positive leans right. */
export function imbalance(beam: BeamNode, w: Weights): number {
  return (
    beam.right.length * nodeWeight(beam.right.child, w) -
    beam.left.length * nodeWeight(beam.left.child, w)
  );
}

export function isOverTolerance(beam: BeamNode, w: Weights): boolean {
  return Math.abs(imbalance(beam, w)) > beam.tolerance + EPS;
}

export function allImbalances(root: BeamNode, w: Weights): Record<string, number> {
  const out: Record<string, number> = {};
  walk(root, (n) => {
    if (n.kind === 'beam') out[n.id] = imbalance(n, w);
  });
  return out;
}

/** First beam over tolerance, in pre-order (top to bottom, left to right). */
export function firstOverTolerance(root: BeamNode, w: Weights): BeamNode | null {
  let found: BeamNode | null = null;
  walk(root, (n) => {
    if (!found && n.kind === 'beam' && isOverTolerance(n, w)) found = n;
  });
  return found;
}

/**
 * Signed tilt ratio: imbalance / tolerance. |ratio| ≤ 1 holds, > 1 tips over.
 * A beam with tolerance 0 returns ±2 as soon as it is unbalanced.
 */
export function tiltRatio(beam: BeamNode, w: Weights): number {
  const imb = imbalance(beam, w);
  if (Math.abs(imb) < EPS) return 0;
  if (beam.tolerance < EPS) return Math.sign(imb) * 2;
  return imb / beam.tolerance;
}
