// e2e/canvas-rendering.spec.js
//
// Aucun des 3 tests fragiles ne couvrait le rendu <canvas> réel — impossible à
// mocker de façon utile (jsdom ne rasterise rien). On vérifie ici que le canvas
// n'est pas juste "présent dans le DOM" mais produit réellement des pixels.

import { test, expect } from '@playwright/test';

test('oscilloscope/FFT dessine des pixels non vides pendant la lecture', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('#loading-overlay', { state: 'hidden' });
  await page.locator('#play-button').click(); // (?) TODO: confirmer sélecteur

  const canvas = page.locator('canvas.oscilloscope, canvas#fft'); // (?) TODO: confirmer sélecteur
  await expect(canvas).toBeVisible();

  await page.waitForTimeout(300); // laisser quelques frames de rendu s'écouler

  const hasNonBlankPixels = await canvas.evaluate((el) => {
    const ctx = el.getContext('2d');
    const { data } = ctx.getImageData(0, 0, el.width, el.height);
    // true si au moins un pixel diffère du fond (évite un canvas resté noir/vide)
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] !== 0 || data[i + 1] !== 0 || data[i + 2] !== 0) return true;
    }
    return false;
  });

  expect(hasNonBlankPixels).toBe(true);
});
