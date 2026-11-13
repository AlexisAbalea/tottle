import { expect, test, type Page } from '@playwright/test';

// window.__tottle is typed in src/global.d.ts

const state = (page: Page) => page.evaluate(() => window.__tottle.state());

async function waitIdle(page: Page) {
  await page.waitForFunction(() => ['playing', 'result'].includes(window.__tottle.state().phase));
}

/** Plays the current level by tapping (real pointer events) on the platform the solver suggests. */
async function playWithHints(page: Page) {
  for (let i = 0; i < 40; i++) {
    const s = await state(page);
    if (s.phase !== 'playing') return;
    const p = s.platforms[s.hint!];
    await page.mouse.click(p.x, p.y);
    await page.waitForFunction((n) => {
      const st = window.__tottle.state();
      return st.phase === 'result' || (st.phase === 'playing' && st.queue.length < n);
    }, s.queue.length);
  }
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.evaluate(() => window.__tottle.speed(3));
});

test('opens directly on level 1 with a play button, tutorial hand, then a win', async ({
  page,
}) => {
  await expect(page.getByTestId('start')).toBeVisible();
  await expect(page.getByTestId('start-level')).toHaveText('LEVEL 1');
  await page.getByTestId('play').click({ force: true });
  await expect(page.getByTestId('hand')).toHaveClass(/show/);
  await playWithHints(page);
  await expect(page.getByTestId('result-won')).toBeVisible();
  await page.screenshot({ path: 'test-results/level1-result.png' });
  const s = await state(page);
  expect(s.progress.level).toBe(1);
  // next level, same page
  await page.getByTestId('next').click({ force: true });
  await waitIdle(page);
  expect((await state(page)).level).toBe(2);
});

test('progress survives a reload', async ({ page }) => {
  await page.getByTestId('play').click({ force: true });
  await playWithHints(page);
  await page.reload();
  await expect(page.getByTestId('start-level')).toHaveText('LEVEL 2');
});

test('one fall is enough to lose: the tipped side drops everyone (snowball)', async ({ page }) => {
  await page.getByTestId('play').click({ force: true });
  // Level 1: tolerance 2. Three on the left → the left side tips and all three fall.
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => window.__tottle.tap('p0'));
    await page.waitForTimeout(100);
    await waitIdle(page);
  }
  const s = await state(page);
  expect(s.falls).toBe(3);
  expect(s.status).toBe('failed');
  expect(s.failReason).toBe('fall');
  await expect(page.getByTestId('fail-fall')).toBeVisible();
  await expect(page.getByTestId('result-title')).toHaveText('Game Over');
});

test('a platform that touches the lava breaks and loses the level', async ({ page }) => {
  // Level 7: two Tottlers in a row on the far-left small platform sink it into the lava.
  await page.evaluate(() => window.__tottle.load(7));
  await waitIdle(page);
  for (let i = 0; i < 2; i++) {
    await page.evaluate(() => window.__tottle.tap('p0'));
    await page.waitForTimeout(100);
    await waitIdle(page);
  }
  const s = await state(page);
  expect(s.status).toBe('failed');
  expect(s.failReason).toBe('lava');
  await expect(page.getByTestId('fail-lava')).toBeVisible();
  await page.screenshot({ path: 'test-results/lava-fail.png' });
});

test('every level can be won (no fall) in the browser', async ({ page }) => {
  test.setTimeout(240_000);
  await page.evaluate(() => window.__tottle.speed(6));
  for (let n = 1; n <= 20; n++) {
    await page.evaluate((k) => window.__tottle.load(k), n);
    await waitIdle(page);
    await playWithHints(page);
    await expect(page.getByTestId('result-won')).toBeVisible();
    if (n === 10 || n === 20) await page.screenshot({ path: `test-results/level${n}-done.png` });
  }
  expect((await state(page)).progress.level).toBe(20);
});

test('endless mode runs rounds and ends at the first fall or lava', async ({ page }) => {
  await page.evaluate(() => {
    localStorage.setItem(
      'tottle.progress.v1',
      JSON.stringify({
        version: 1,
        level: 3,
        stars: [3, 3, 3],
        perfect: [],
        endlessBest: 0,
        muted: true,
      }),
    );
  });
  await page.reload();
  await page.evaluate(() => window.__tottle.speed(6));
  await page.locator('[data-act=endless]').click({ force: true });
  await waitIdle(page);
  expect((await state(page)).mode).toBe('endless');
  // drop Tottlers on purpose: always the same platform
  for (let i = 0; i < 40; i++) {
    const s = await state(page);
    if (s.phase === 'result' && (await page.getByTestId('score').count())) break;
    if (s.phase !== 'playing') {
      await page.waitForTimeout(100);
      continue;
    }
    await page.evaluate((id) => window.__tottle.tap(id), Object.keys(s.platforms)[0]);
    await page.waitForTimeout(50);
    await waitIdle(page);
  }
  await expect(page.getByTestId('score')).toBeVisible();
});
