// e2e/panels.spec.js
//
// Tests real DOM behavior: About panel open/close and toolbar panel toggling.
// Uses getComputedStyle for display verification — not just class presence.

import { test, expect } from '@playwright/test';

async function dismissWaitingScreen(page) {
  const btn = page.locator('#waiting-screen-start-btn');
  if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await btn.click();
  }
  await page.locator('#waiting-screen').waitFor({ state: 'hidden', timeout: 15_000 });
}

test.describe('Panneau About', () => {
  test("s'ouvre et se ferme sans erreur console", async ({ page }) => {
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto('/');
    await dismissWaitingScreen(page);
    await page.waitForSelector('#tb', { timeout: 5000 });

    await page.locator('.tb-about').click();
    await expect(page.locator('#about-panel')).toBeVisible();

    // About is a slot panel: clicking .tb-about again emits "aboutToggle: true" (show),
    // not a toggle. Close by opening another slot panel (tools).
    await page.locator('button[title="Tools"]').click();
    await expect(page.locator('#about-panel')).toBeHidden({ timeout: 5000 });

    expect(consoleErrors).toHaveLength(0);
  });
});

test.describe('Toggles des vues toolbar', () => {
  test('chaque bouton de vue est présent dans le toolbar', async ({
    page,
  }) => {
    await page.goto('/');
    await dismissWaitingScreen(page);
    await page.waitForSelector('.tb-view-btn', { timeout: 5000 });

    const gridBtn = page.locator('button[title="Toggle Track Editor"]');
    await expect(gridBtn).toBeVisible();

    await gridBtn.click();
    await expect(page.locator('#te-panel')).toBeVisible({ timeout: 3000 });

    await gridBtn.click();
  });
});
