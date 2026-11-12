import type { App } from './app';

declare global {
  interface Window {
    /** Debug / test hooks, see src/main.ts. */
    __tottle: {
      app: App;
      state: () => ReturnType<App['debugState']>;
      tap: (platformId: string) => boolean;
      load: (levelNumber: number) => void;
      speed: (s: number) => void;
    };
  }
}

export {};
