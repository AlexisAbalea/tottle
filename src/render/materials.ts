import * as THREE from 'three';
import type { Weight } from '../core/types';
import type { BeamStatus } from '../core/balance';

/** Pastel, high-contrast palette. Each weight has its own colour (plus size and number). */
export const WEIGHT_COLORS: Record<Weight, number> = {
  1: 0x45d39b, // mint green
  2: 0xffb02e, // sunny orange
  3: 0xff5a7e, // coral pink
};

export const STATUS_COLORS: Record<BeamStatus, number> = {
  green: 0x3ccf7a,
  orange: 0xffa62b,
  red: 0xff4757,
  over: 0xff2448,
};

export const PALETTE = {
  beam: 0x8c6cf2,
  beamDark: 0x6a4bd6,
  rope: 0x5b4a8a,
  platform: 0xffffff,
  platformSide: 0xd9d2ff,
  slot: 0xe7e2ff,
  ceiling: 0xffffff,
  ground: 0xb8f0c8,
  groundDark: 0x8fdcaa,
  eye: 0x2b2340,
  pad: 0xffffff,
};

let gradient: THREE.DataTexture | null = null;
/** 3-step toon ramp, shared by all toon materials. */
export function toonGradient(): THREE.DataTexture {
  if (gradient) return gradient;
  const data = new Uint8Array([150, 150, 150, 255, 215, 215, 215, 255, 255, 255, 255, 255]);
  gradient = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  gradient.minFilter = THREE.NearestFilter;
  gradient.magFilter = THREE.NearestFilter;
  gradient.needsUpdate = true;
  return gradient;
}

const cache = new Map<string, THREE.Material>();
export function toon(color: number): THREE.MeshToonMaterial {
  const key = 'toon' + color;
  let m = cache.get(key) as THREE.MeshToonMaterial | undefined;
  if (!m) {
    m = new THREE.MeshToonMaterial({ color, gradientMap: toonGradient() });
    cache.set(key, m);
  }
  return m;
}

export function basic(color: number): THREE.MeshBasicMaterial {
  const key = 'basic' + color;
  let m = cache.get(key) as THREE.MeshBasicMaterial | undefined;
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color });
    cache.set(key, m);
  }
  return m;
}

function hex(c: number) {
  return '#' + c.toString(16).padStart(6, '0');
}

const numberMats = new Map<Weight, THREE.SpriteMaterial>();
/** Small round badge with the weight number, shown above each Tottler's head. */
export function numberBadge(weight: Weight): THREE.SpriteMaterial {
  let m = numberMats.get(weight);
  if (m) return m;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.arc(64, 64, 56, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = 10;
  g.strokeStyle = hex(WEIGHT_COLORS[weight]);
  g.stroke();
  g.fillStyle = '#2b2340';
  g.font = 'bold 84px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(String(weight), 64, 70);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  m = new THREE.SpriteMaterial({ map: tex, depthWrite: false });
  numberMats.set(weight, m);
  return m;
}

let dialMat: THREE.MeshBasicMaterial | null = null;
/** The balance gauge: a half dial under each pivot, green in the middle, orange, then red. */
export function dialMaterial(): THREE.MeshBasicMaterial {
  if (dialMat) return dialMat;
  const W = 256;
  const H = 140;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const cx = W / 2;
  const cy = 8;
  const R = 120;
  const r = 62;
  // Angles measured from straight down; canvas angle 90° = down.
  const zone = (from: number, to: number, color: number) => {
    g.beginPath();
    const a0 = ((90 + from) * Math.PI) / 180;
    const a1 = ((90 + to) * Math.PI) / 180;
    g.arc(cx, cy, R, a0, a1);
    g.arc(cx, cy, r, a1, a0, true);
    g.closePath();
    g.fillStyle = hex(color);
    g.fill();
  };
  // white backing
  g.beginPath();
  g.arc(cx, cy, R + 8, 0, Math.PI);
  g.closePath();
  g.fillStyle = '#ffffff';
  g.fill();
  zone(-30, 30, STATUS_COLORS.green);
  zone(30, 57, STATUS_COLORS.orange);
  zone(-57, -30, STATUS_COLORS.orange);
  zone(57, 90, STATUS_COLORS.red);
  zone(-90, -57, STATUS_COLORS.red);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  dialMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
  return dialMat;
}
