// e2e/track-editor.mobile.spec.js
//
// Exécuté uniquement sur le projet "mobile-chromium" (viewport Pixel 7).
// Vérifie que le track editor et la note editor sont accessibles en mobile :
// le panel est bien dans le viewport et cliquable.
//
// Sur mobile, la toolbar view-row est cachée (display:none) — on utilise
// la mobile tab bar (.mtb-btn[data-tab="track"]) pour ouvrir le track editor.

import { test, expect } from '@playwright/test';

async function dismissWaitingScreen(page) {
  const btn = page.locator('#waiting-screen-start-btn');
  if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await btn.click();
  }
  await page.locator('#waiting-screen').waitFor({ state: 'hidden', timeout: 15_000 });
}

test('track editor et note editor restent accessibles sur mobile', async ({ page }) => {
  await page.goto('/');
  await dismissWaitingScreen(page);

  await page.locator('.mtb-btn[data-tab="track"]').click();

  const tePanel = page.locator('#te-panel');
  await expect(tePanel).toBeVisible({ timeout: 5_000 });

  const width = await tePanel.evaluate((el) => el.getBoundingClientRect().width);
  const viewportWidth = page.viewportSize().width;
  expect(width).toBeGreaterThanOrEqual(viewportWidth * 0.8);

  const neContainer = page.locator('#ne-container');
  if (await neContainer.isVisible({ timeout: 2000 }).catch(() => false)) {
    await neContainer.scrollIntoViewIfNeeded();
    await expect(neContainer).toBeInViewport();
  }
});
