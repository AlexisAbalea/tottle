import type { BeamNode, LevelDef, PlatformNode, StructureNode, Weight } from '../core/types';

/**
 * Tiny DSL to write levels by hand.
 *   P(size)                        a platform, size S / M / L (width units)
 *   B(tol, left, right, ll?, rl?)  a beam with tolerance and optional arm lengths
 * Ids are assigned automatically (b0, b1…, p0, p1…) in pre-order when the level is built.
 */
type Draft =
  { t: 'p'; cap: number } | { t: 'b'; tol: number; l: Draft; r: Draft; ll: number; rl: number };

/** Platform sizes (width units). A Tottler of weight w takes w + 1. */
export const S = 6;
export const M = 9;
export const L = 12;
export const P = (cap: number): Draft => ({ t: 'p', cap });
export const B = (tol: number, l: Draft, r: Draft, ll = 1, rl = 1): Draft => ({
  t: 'b',
  tol,
  l,
  r,
  ll,
  rl,
});

export function build(draft: Draft): BeamNode {
  let pb = 0;
  let pp = 0;
  const rec = (d: Draft): StructureNode => {
    if (d.t === 'p') {
      const p: PlatformNode = { kind: 'platform', id: `p${pp++}`, size: d.cap };
      return p;
    }
    const id = `b${pb++}`;
    const left = rec(d.l);
    const right = rec(d.r);
    return {
      kind: 'beam',
      id,
      tolerance: d.tol,
      left: { length: d.ll, child: left },
      right: { length: d.rl, child: right },
    };
  };
  const root = rec(draft);
  if (root.kind !== 'beam') throw new Error('Root must be a beam');
  return root;
}

/** Parse a queue written as a string, e.g. "1 2 1 3". */
export function q(s: string): Weight[] {
  return s
    .trim()
    .split(/\s+/)
    .map((x) => {
      const n = Number(x);
      if (n !== 1 && n !== 2 && n !== 3) throw new Error(`Bad weight ${x}`);
      return n as Weight;
    });
}

export function level(
  id: string,
  draft: Draft,
  queue: string,
  lavaGap = 1.2,
  tutorial = false,
): LevelDef {
  return { id, root: build(draft), queue: q(queue), lavaGap, tutorial };
}
