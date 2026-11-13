import type RAPIER_NS from '@dimforge/rapier3d-compat';

export type Rapier = typeof RAPIER_NS;

let loading: Promise<Rapier> | null = null;

/** Loads and initialises Rapier once (it is a large lazy chunk). */
export function loadRapier(): Promise<Rapier> {
  loading ??= import('@dimforge/rapier3d-compat').then(async (mod) => {
    const R = ((mod as unknown as { default?: Rapier }).default ?? mod) as Rapier;
    await R.init();
    return R;
  });
  return loading;
}
