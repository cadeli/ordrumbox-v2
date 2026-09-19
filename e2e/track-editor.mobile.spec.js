// e2e/track-editor.mobile.spec.js
//
// Run only on the "mobile-chromium" project (Pixel 7 viewport).
// Verifies track editor and note editor are accessible on mobile:
// the panel is in the viewport and clickable.
//
// On mobile, the toolbar view-row is hidden (display:none) — use
// the mobile tab bar (.mtb-btn[data-tab="track"]) to open the track editor.

import { test, expect } from '@playwright/test';

async function dismissWaitingScreen(page) {
  const btn = page.locator('#waiting-screen-start-btn');
  if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await btn.click();
  }
  await page.locator('#waiting-screen').waitFor({ state: 'hidden', timeout: 15_000 });
  await page.waitForFunction(() => window.__e2e?.ready === true, { timeout: 10_000 });
}

test('track editor and note editor remain accessible on mobile', async ({ page }) => {
  await page.goto('/');
  await dismissWaitingScreen(page);

  await page.locator('.mtb-btn[data-tab="track"]').click();

  const tePanel = page.locator('#te-panel');
  await expect(tePanel).toBeVisible({ timeout: 8_000 });

  await page.waitForFunction(
    (sel) => document.querySelector(sel)?.getBoundingClientRect().width > 0,
    '#te-panel',
    { timeout: 5_000 }
  );

  const width = await tePanel.evaluate((el) => el.getBoundingClientRect().width);
  const viewportWidth = page.viewportSize().width;
  expect(width).toBeGreaterThanOrEqual(viewportWidth * 0.8);

  const neContainer = page.locator('#ne-container');
  if (await neContainer.isVisible({ timeout: 2000 }).catch(() => false)) {
    await neContainer.scrollIntoViewIfNeeded();
    await expect(neContainer).toBeInViewport();
  }
});
