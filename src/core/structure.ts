import type { BeamNode, PlatformNode, Side, StructureNode } from './types';

export function listPlatforms(root: StructureNode): PlatformNode[] {
  const out: PlatformNode[] = [];
  walk(root, (n) => {
    if (n.kind === 'platform') out.push(n);
  });
  return out;
}

export function listBeams(root: StructureNode): BeamNode[] {
  const out: BeamNode[] = [];
  walk(root, (n) => {
    if (n.kind === 'beam') out.push(n);
  });
  return out;
}

/** Pre-order walk, left before right. This order is part of the (deterministic) rules. */
export function walk(
  node: StructureNode,
  fn: (n: StructureNode, depth: number) => void,
  depth = 0,
) {
  fn(node, depth);
  if (node.kind === 'beam') {
    walk(node.left.child, fn, depth + 1);
    walk(node.right.child, fn, depth + 1);
  }
}

export function depthOf(node: StructureNode): number {
  if (node.kind === 'platform') return 0;
  return 1 + Math.max(depthOf(node.left.child), depthOf(node.right.child));
}

/** Sum of all platform widths (width units). */
export function totalSize(root: StructureNode): number {
  return listPlatforms(root).reduce((s, p) => s + p.size, 0);
}

export function platformIdsUnder(node: StructureNode): string[] {
  return listPlatforms(node).map((p) => p.id);
}

export interface ParentLink {
  beam: BeamNode;
  side: Side;
}

/** For every node id, the beam it hangs from and on which side. */
export function parentMap(root: BeamNode): Map<string, ParentLink> {
  const map = new Map<string, ParentLink>();
  walk(root, (n) => {
    if (n.kind === 'beam') {
      map.set(n.left.child.id, { beam: n, side: 'left' });
      map.set(n.right.child.id, { beam: n, side: 'right' });
    }
  });
  return map;
}

/** Throws if the structure is malformed (duplicate ids, bad numbers, too deep). */
export function validateStructure(root: BeamNode) {
  const ids = new Set<string>();
  walk(root, (n) => {
    if (ids.has(n.id)) throw new Error(`Duplicate node id ${n.id}`);
    ids.add(n.id);
    if (n.kind === 'platform') {
      if (!Number.isInteger(n.size) || n.size < 2) throw new Error(`Bad size ${n.id}`);
    } else {
      if (n.tolerance < 0) throw new Error(`Bad tolerance ${n.id}`);
      if (n.left.length <= 0 || n.right.length <= 0) throw new Error(`Bad arm ${n.id}`);
    }
  });
  if (depthOf(root) > 3) throw new Error('Structure deeper than 3 beam levels');
}

/**
 * Fairness rule for level design: a single Tottler of weight `maxWeight` placed anywhere on an
 * empty mobile never tips a beam (tolerance ≥ weight × longest arm, for every beam).
 */
export function loneTottlerSafe(root: BeamNode, maxWeight: number): boolean {
  let ok = true;
  walk(root, (n) => {
    if (n.kind === 'beam' && n.tolerance < maxWeight * Math.max(n.left.length, n.right.length))
      ok = false;
  });
  return ok;
}
