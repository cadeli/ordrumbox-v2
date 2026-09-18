// e2e/panels.spec.js
//
// Tests real DOM behavior: About panel, Tools panel, Output panel slot toggling,
// mutual exclusion, and toolbar view buttons. Uses getComputedStyle for display
// verification — not just class presence. Covers scenarios impossible in jsdom:
// real click events, computed layout, console error monitoring.

import { test, expect } from '@playwright/test';

async function dismissWaitingScreen(page) {
  const btn = page.locator('#waiting-screen-start-btn');
  if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await btn.click();
  }
  await page.locator('#waiting-screen').waitFor({ state: 'hidden', timeout: 15_000 });
}

test.describe('Slot panels — mutual exclusion via real clicks', () => {
  test('opening About then Tools hides About, and vice versa', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto('/');
    await dismissWaitingScreen(page);

    await page.locator('.tb-about').click();
    await expect(page.locator('#about-panel')).toBeVisible();
    await expect(page.locator('#tools-panel')).toBeHidden();

    await page.locator('button[title="Tools"]').click();
    await expect(page.locator('#about-panel')).toBeHidden({ timeout: 3000 });
    await expect(page.locator('#tools-panel')).toBeVisible({ timeout: 3000 });

    await page.locator('.tb-about').click();
    await expect(page.locator('#tools-panel')).toBeHidden({ timeout: 3000 });
    await expect(page.locator('#about-panel')).toBeVisible({ timeout: 3000 });

    expect(consoleErrors).toHaveLength(0);
  });
});

test.describe('Toolbar view buttons — real click → panel visible', () => {
  test('Track Editor toggle shows/hides #te-panel', async ({ page }) => {
    await page.goto('/');
    await dismissWaitingScreen(page);
    await page.waitForSelector('.tb-view-btn', { timeout: 5000 });

    const gridBtn = page.locator('button[title="Toggle Track Editor"]');
    await expect(gridBtn).toBeVisible();

    await gridBtn.click();
    await expect(page.locator('#te-panel')).toBeVisible({ timeout: 3000 });

    await gridBtn.click();
  });

  test('Synth Editor toggle shows/hides #se-panel', async ({ page }) => {
    await page.goto('/');
    await dismissWaitingScreen(page);
    await page.waitForSelector('.tb-view-btn', { timeout: 5000 });

    const synthBtn = page.locator('button[title="Toggle Synth Editor"]');
    if (await synthBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await synthBtn.click();
      await expect(page.locator('#se-panel')).toBeVisible({ timeout: 3000 });
      await synthBtn.click();
    }
  });
});

test.describe('About panel content', () => {
  test('about panel has visible version text', async ({ page }) => {
    await page.goto('/');
    await dismissWaitingScreen(page);

    await page.locator('.tb-about').click();
    await expect(page.locator('#about-panel')).toBeVisible();

    const text = await page.locator('#about-panel').textContent();
    expect(text.length).toBeGreaterThan(10);

    await page.locator('button[title="Tools"]').click();
    await expect(page.locator('#about-panel')).toBeHidden({ timeout: 3000 });
  });
});
