// e2e/waiting-screen.spec.js
//
// Dedicated tests for the waiting screen (boot gate).
// Verifies: visibility, button text, click dismiss, Enter key, double-click safety.

import { test, expect } from '@playwright/test';

test.describe('Waiting screen', () => {

  test('button is visible with correct text on page load', async ({ page }) => {
    await page.goto('/');

    const btn = page.locator('#waiting-screen-start-btn');
    await expect(btn).toBeVisible();
    await expect(btn).toHaveText('Start orDrumbox V2');
  });

  test('waiting screen covers the full viewport', async ({ page }) => {
    await page.goto('/');

    const screen = page.locator('#waiting-screen');
    await expect(screen).toBeVisible();
    await expect(screen).toHaveCSS('position', 'fixed');
  });

  test('button has .ready class after page load', async ({ page }) => {
    await page.goto('/');

    const btn = page.locator('#waiting-screen-start-btn');
    await expect(btn).toHaveClass(/ready/);
  });

  test('clicking Start hides the waiting screen', async ({ page }) => {
    await page.goto('/');

    const btn = page.locator('#waiting-screen-start-btn');
    await expect(btn).toBeVisible();
    await btn.click();

    const screen = page.locator('#waiting-screen');
    await expect(screen).toBeHidden({ timeout: 5_000 });
  });

  test('pressing Enter also dismisses the waiting screen', async ({ page }) => {
    await page.goto('/');

    const screen = page.locator('#waiting-screen');
    await expect(screen).toBeVisible();
    await page.keyboard.press('Enter');

    await expect(screen).toBeHidden({ timeout: 5_000 });
  });

  test('rapid double-click does not cause errors (isStarted guard)', async ({ page }) => {
    await page.goto('/');

    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));

    // Simulate two clicks in rapid succession before the first completes
    await page.evaluate(() => {
      const btn = document.getElementById('waiting-screen-start-btn');
      btn.click();
      btn.click();
    });

    await page.waitForFunction(() => window.__e2e?.ready === true, { timeout: 15_000 });
    await page.waitForTimeout(1_000);
    expect(errors).toEqual([]);
  });

  test('waiting screen does not reappear after boot', async ({ page }) => {
    await page.goto('/');

    const btn = page.locator('#waiting-screen-start-btn');
    await btn.click();

    const screen = page.locator('#waiting-screen');
    await expect(screen).toBeHidden({ timeout: 5_000 });
    await page.waitForFunction(() => window.__e2e?.ready === true, { timeout: 10_000 });

    await page.waitForTimeout(1_000);
    await expect(screen).toBeHidden();
  });

  test('app main content is behind the waiting screen initially', async ({ page }) => {
    await page.goto('/');

    const main = page.locator('#app-main');
    await expect(main).toBeAttached();
  });

  test('app loads successfully after waiting screen is dismissed', async ({ page }) => {
    await page.goto('/');

    const btn = page.locator('#waiting-screen-start-btn');
    await btn.click();

    await page.waitForFunction(() => window.__e2e?.ready === true, { timeout: 15_000 });

    const state = await page.evaluate(() => ({
      patternCount: window.__e2e.appState.patterns.length,
      songName: window.__e2e.appState.songInfos.name,
    }));

    expect(state.patternCount).toBeGreaterThan(0);
    expect(state.songName).toBeTruthy();
  });
});
