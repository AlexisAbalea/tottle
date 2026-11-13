import { expect, test, type Page } from '@playwright/test';

// window.__tottle is typed in src/global.d.ts

const state = (page: Page) => page.evaluate(() => window.__tottle.state());

/** Real gesture: press on the next Tottler, drag to (x, y), let go. */
async function dragTo(page: Page, x: number, y: number) {
  await page.waitForFunction(() => window.__tottle.state().canGrab);
  const s = await state(page);
  await page.mouse.move(s.next!.x, s.next!.y);
  await page.mouse.down();
  await page.mouse.move((s.next!.x + x) / 2, (s.next!.y + y) / 2, { steps: 4 });
  await page.mouse.move(x, y, { steps: 6 });
  await page.waitForTimeout(120);
  await page.mouse.up();
}

/** Drag every Tottler to the spot the tutorial hand would suggest. */
async function playWithSuggestions(page: Page) {
  for (let i = 0; i < 20; i++) {
    const s = await state(page);
    if (s.queue.length === 0 || s.phase === 'result') return;
    const sug = await page.evaluate(() => window.__tottle.suggestion());
    const p = await page.evaluate(
      ([x, y]) => window.__tottle.screenOf(x, y),
      [sug!.x, sug!.y + 0.6],
    );
    await dragTo(page, p.x, p.y);
    await page.waitForTimeout(150);
  }
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__tottle, null, { timeout: 30_000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => !!window.__tottle, null, { timeout: 30_000 });
  await page.evaluate(() => window.__tottle.speed(2));
});

test('level 1: drag and drop everyone, hold 3 seconds, win', async ({ page }) => {
  await expect(page.getByTestId('start-level')).toHaveText('LEVEL 1');
  await page.getByTestId('play').click({ force: true });
  await expect(page.getByTestId('hand')).toHaveClass(/drag/);
  await playWithSuggestions(page);
  await expect(page.getByTestId('countdown')).not.toHaveClass(/hidden/);
  await expect(page.getByTestId('result-won')).toBeVisible({ timeout: 15_000 });
  expect((await state(page)).progress.level).toBe(1);
  await page.getByTestId('next').click({ force: true });
  await expect.poll(async () => (await state(page)).level).toBe(2);
});

test('letting go over nothing drops the Tottler into the lava: Game Over', async ({ page }) => {
  await page.getByTestId('play').click({ force: true });
  const s = await state(page);
  // between the two pans of level 1 there is only lava
  const mid = (s.platforms.p0.x + s.platforms.p1.x) / 2;
  await dragTo(page, mid, s.platforms.p0.y);
  await expect(page.getByTestId('fail-fall')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('result-title')).toHaveText('Game Over');
});

test('letting go over the cloud cancels the grab', async ({ page }) => {
  await page.getByTestId('play').click({ force: true });
  const s = await state(page);
  await dragTo(page, s.next!.x + 30, s.next!.y - 10);
  await page.waitForTimeout(300);
  const after = await state(page);
  expect(after.queue).toEqual(s.queue);
  expect(after.phase).toBe('playing');
});

test('progress survives a reload', async ({ page }) => {
  await page.getByTestId('play').click({ force: true });
  await playWithSuggestions(page);
  await expect(page.getByTestId('result-won')).toBeVisible({ timeout: 15_000 });
  await page.reload();
  await expect(page.getByTestId('start-level')).toHaveText('LEVEL 2');
});

test('endless mode ends when a Tottler falls into the lava', async ({ page }) => {
  await page.evaluate(() => {
    localStorage.setItem(
      'tottle.progress.v1',
      JSON.stringify({
        version: 1,
        level: 3,
        completed: [true, true, true],
        perfect: [],
        endlessBest: 0,
        muted: true,
      }),
    );
  });
  await page.reload();
  await page.waitForFunction(() => !!window.__tottle, null, { timeout: 30_000 });
  await page.locator('[data-act=endless]').click({ force: true });
  await expect.poll(async () => (await state(page)).mode).toBe('endless');
  // far to the side of the mobile: only lava below
  await dragTo(page, 5, 600);
  await expect(page.getByTestId('score')).toBeVisible({ timeout: 10_000 });
});
