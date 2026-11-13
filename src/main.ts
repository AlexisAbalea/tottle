import { App } from './app';
import { loadRapier } from './sim/rapier';

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const hud = document.getElementById('hud') as HTMLElement;

// The physics engine is a large lazy chunk: show a small loader until it is ready.
void loadRapier().then((R) => {
  document.getElementById('loading')?.remove();
  const app = new App(canvas, hud, R);
  // Hooks for Playwright tests and debugging (typed in global.d.ts).
  window.__tottle = {
    app,
    state: () => app.debugState(),
    dropOn: (id, offset) => app.dropOn(id, offset),
    suggestion: () => app.suggestion(),
    screenOf: (x, y) => app.screenOf(x, y),
    load: (n) => app.loadLevel(n - 1, true),
    speed: (s) => {
      app.timeScale = s;
    },
  };
});
