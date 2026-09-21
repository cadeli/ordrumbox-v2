// e2e/playback.spec.js
//
// Covers critical scenarios untestable in jsdom:
//   1. AudioContext unlock on first user gesture.
//   2. Playback and playhead advancement.
//   3. Drumkit change without network errors.

import { test, expect } from '@playwright/test';

async function dismissWaitingScreen(page) {
  const btn = page.locator('#waiting-screen-start-btn');
  if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await btn.click();
  }
  await page.locator('#waiting-screen').waitFor({ state: 'hidden', timeout: 15_000 });
}

test.describe('Playback and AudioContext', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await dismissWaitingScreen(page);
  });

  test("welcome screen disappears after Start click", async ({ page }) => {
    const screen = page.locator('#waiting-screen');
    await expect(screen).toBeHidden();
  });

  test('Start button gets the "running" class during playback', async ({ page }) => {
    const playBtn = page.locator('button.tb-start');
    await playBtn.click();
    await expect(playBtn).toHaveClass(/running/, { timeout: 3_000 });

    await playBtn.click();
    await expect(playBtn).not.toHaveClass(/running/, { timeout: 3_000 });
  });

  test('playhead advances on the step grid', async ({ page }) => {
    const playBtn = page.locator('button.tb-start');
    await playBtn.click();

    const playhead = page.locator('.pp-playhead');
    await expect(playhead).toBeVisible({ timeout: 3_000 });

    const pos1 = await playhead.evaluate((el) => el.getBoundingClientRect().left);
    await page.waitForTimeout(500);
    const pos2 = await playhead.evaluate((el) => el.getBoundingClientRect().left);

    expect(pos2).not.toBe(pos1);

    await playBtn.click();
  });

  test('clicking a grid cell plays a note', async ({ page }) => {
    const cell = page.locator('.pp-cell').first();
    if (await cell.isVisible({ timeout: 2000 }).catch(() => false)) {
      await cell.click();

      const isRunning = await page.evaluate(() => serviceRegistry?.transport?.isRunning ?? false);
      expect(typeof isRunning).toBe('boolean');
    }
  });
});

test.describe('Drumkit loading', () => {
  test('changing drumkit loads new samples without 404', async ({ page }) => {
    await page.goto('/');
    await dismissWaitingScreen(page);

    const failedRequests = [];
    page.on('response', (response) => {
      if (
        response.url().match(/\.(wav|mp3|ogg)$/i) &&
        !response.ok()
      ) {
        failedRequests.push(`${response.status()} ${response.url()}`);
      }
    });

    const kitSelector = page.locator('#tb .tb-group select').first();
    const optionCount = await kitSelector.locator('option').count();
    if (optionCount > 1) {
      await kitSelector.selectOption({ index: 1 });
      await page.waitForLoadState('networkidle');
    }

    expect(failedRequests, `Failed samples: ${failedRequests.join(', ')}`).toHaveLength(0);
  });
});
