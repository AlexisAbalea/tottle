import { App } from './app';

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const hud = document.getElementById('hud') as HTMLElement;
const app = new App(canvas, hud);

// Hooks for Playwright tests and debugging (typed in global.d.ts).
window.__tottle = {
  app,
  state: () => app.debugState(),
  tap: (id) => app.tapPlatform(id),
  load: (n) => app.loadLevel(n - 1, true),
  speed: (s) => {
    app.timeScale = s;
  },
};
