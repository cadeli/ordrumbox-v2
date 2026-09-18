// e2e/panels.spec.js
//
// Remplace about_panel.test.js et sub_panel_toggles.test.js.
// Différence clé vs les anciens tests : on clique vraiment sur les boutons et on
// vérifie l'état CSS calculé (getComputedStyle) plutôt que la présence de classes
// dans un DOM simulé — c'est justement le type de désynchro déjà rencontré
// entre ui/theme.js et styles.css.

import { test, expect } from '@playwright/test';

test.describe('Panneau About', () => {
  test("s'ouvre et se ferme sans erreur console", async ({ page }) => {
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto('/');
    await page.waitForSelector('#loading-overlay', { state: 'hidden' });

    await page.locator('[data-testid="open-about"]').click(); // (?) TODO: confirmer sélecteur
    await expect(page.locator('#about-panel')).toBeVisible(); // (?)

    await page.locator('[data-testid="close-about"]').click(); // (?)
    await expect(page.locator('#about-panel')).toBeHidden();

    expect(consoleErrors).toHaveLength(0);
  });
});

test.describe('Toggles des sous-panneaux', () => {
  test('chaque toggle affiche/masque réellement son panneau (display calculé)', async ({
    page,
  }) => {
    await page.goto('/');
    await page.waitForSelector('#loading-overlay', { state: 'hidden' });

    const toggles = page.locator('[data-testid^="toggle-sub-panel-"]'); // (?) TODO: confirmer sélecteur
    const count = await toggles.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const toggle = toggles.nth(i);
      const targetId = await toggle.getAttribute('data-target'); // (?) convention à confirmer
      const panel = page.locator(`#${targetId}`);

      const before = await panel.evaluate((el) => getComputedStyle(el).display);
      await toggle.click();
      const after = await panel.evaluate((el) => getComputedStyle(el).display);

      expect(after).not.toBe(before);
    }
  });
});
