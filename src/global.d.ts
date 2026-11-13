import type { App } from './app';

declare global {
  interface Window {
    /** Debug / test hooks, see src/main.ts. */
    __tottle: {
      app: App;
      state: () => ReturnType<App['debugState']>;
      /** drop the next Tottler on a platform, offset −1…1 across it */
      dropOn: (platformId: string, offset?: number) => boolean;
      suggestion: () => ReturnType<App['suggestion']>;
      screenOf: (x: number, y: number) => { x: number; y: number };
      load: (levelNumber: number) => void;
      speed: (s: number) => void;
    };
  }
}

export {};
