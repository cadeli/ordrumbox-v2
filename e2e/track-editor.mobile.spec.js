// e2e/track-editor.mobile.spec.js
//
// Remplace mobile_css_layout.test.js. Exécuté uniquement sur le projet
// "mobile-chromium" (voir playwright.config.js) avec un vrai viewport + touch.
//
// Couvre précisément le bug déjà corrigé sur styles.css :
// #te-panel non flex en mobile → #ne-container poussé hors écran.
// Un test CSS "en dur" (assertions sur des propriétés) aurait pu passer sans
// détecter le symptôme réel (élément inatteignable) ; ici on vérifie la
// conséquence visible : la note editor est bien dans le viewport et cliquable.

import { test, expect } from '@playwright/test';

test('note editor reste accessible (scroll + tap) sur mobile', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('#loading-overlay', { state: 'hidden' });

  await page.locator('[data-testid="open-track-editor"]').click(); // (?) TODO: confirmer sélecteur

  const tePanel = page.locator('#te-panel');
  await expect(tePanel).toBeVisible();

  // largeur attendue : 100% en mobile (vs 75% desktop — cf. règle .workspace-panel)
  const width = await tePanel.evaluate((el) => el.getBoundingClientRect().width);
  const viewportWidth = page.viewportSize().width;
  expect(width).toBeCloseTo(viewportWidth, -1); // tolérance large (bordures/scrollbar)

  const neContainer = page.locator('#ne-container');
  await neContainer.scrollIntoViewIfNeeded();
  await expect(neContainer).toBeInViewport();

  // Interaction tactile réelle sur un élément de la note editor
  const firstNote = neContainer.locator('.note-cell').first(); // (?) TODO: confirmer sélecteur
  await firstNote.tap();
  await expect(firstNote).toHaveClass(/selected|active/); // (?)
});
