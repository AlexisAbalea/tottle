// Pure data types for Tottle. No rendering here.

export type Weight = 1 | 2 | 3;
export type Side = 'left' | 'right';

export interface PlatformNode {
  kind: 'platform';
  id: string;
  /** Number of slots on the platform. */
  capacity: number;
}

export interface Arm {
  /** Distance from the beam pivot, in "arm units" (1 = standard). Torque = weight × length. */
  length: number;
  child: StructureNode;
}

export interface BeamNode {
  kind: 'beam';
  id: string;
  /** Max |imbalance| (in weight × arm units) the beam can hold. Above it, a Tottler falls. */
  tolerance: number;
  left: Arm;
  right: Arm;
}

export type StructureNode = PlatformNode | BeamNode;

export interface LevelDef {
  id: string;
  /** Root of the structure: always a beam hanging from the ceiling. */
  root: BeamNode;
  /** Tottlers in arrival order. */
  queue: Weight[];
  /** Levels 1-3: show the animated hand hint. */
  tutorial?: boolean;
}

export interface Tottler {
  id: number;
  weight: Weight;
  /** Monotonic placement counter (bigger = placed later). -1 while waiting. */
  placedAt: number;
}

/** Contents of each platform, in placement order. */
export type Loads = Record<string, Tottler[]>;
