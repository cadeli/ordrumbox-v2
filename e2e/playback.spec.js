// e2e/playback.spec.js
//
// Couvre le scénario demandé : les 3 classes de bugs les plus critiques
// sur une PWA audio temps réel Vanilla JS ne sont PAS testables en jsdom/mocks :
//   1. Déblocage de l'AudioContext sur le premier geste utilisateur.
//   2. Rendu réel du <canvas> (oscilloscope / FFT / timeline).
//   3. Comportement réseau (chargement des samples).
//
// TODO avant premier run : adapter les sélecteurs marqués (?) à ceux du DOM réel
// (grep rapide dans ui/ pour confirmer id/class exacts — je n'ai pas le repo sous la main).

import { test, expect } from '@playwright/test';

test.describe('Lecture et AudioContext', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test("l'overlay de chargement disparaît après le boot", async ({ page }) => {
    const overlay = page.locator('#waiting-screen-start-btn'); // (?) TODO: confirmer id réel
    await expect(overlay).toBeVisible();
    await expect(overlay).toBeHidden({ timeout: 15_000 });
  });

  test('le clic sur Play débloque l\'AudioContext et démarre la lecture', async ({ page }) => {
    await page.waitForSelector('#loading-overlay', { state: 'hidden' });

    // État initial : AudioContext créé mais suspendu tant qu'aucun geste utilisateur.
    // Nécessite un hook exposé par l'app en dev/test (ex: window.__ordrumbox.audioEngine).
    // Si ce hook n'existe pas encore, c'est la première chose à ajouter — sans lui,
    // aucun test ne peut vérifier l'état réel de l'AudioContext depuis l'extérieur.
    const stateBefore = await page.evaluate(
      () => window.__ordrumbox?.audioEngine?.context?.state
    );
    expect(['suspended', undefined]).toContain(stateBefore);

    const playButton = page.locator('#play-button'); // (?) TODO: confirmer sélecteur
    await playButton.click();

    // Classe .playing posée sur l'élément racine du player
    await expect(page.locator('#player, .player')).toHaveClass(/playing/); // (?)

    // AudioContext réellement débloqué (pas juste la classe CSS)
    await expect
      .poll(() => page.evaluate(() => window.__ordrumbox?.audioEngine?.context?.state), {
        timeout: 5_000,
      })
      .toBe('running');
  });

  test('la tête de lecture avance sur la grille de pas (rAF)', async ({ page }) => {
    await page.waitForSelector('#loading-overlay', { state: 'hidden' });
    await page.locator('#play-button').click(); // (?)

    const playhead = page.locator('.playhead, .step-cursor'); // (?) TODO: confirmer sélecteur

    const pos1 = await playhead.evaluate((el) => el.getBoundingClientRect().left);
    await page.waitForTimeout(500); // ~1-2 steps selon BPM par défaut
    const pos2 = await playhead.evaluate((el) => el.getBoundingClientRect().left);

    // On ne vérifie pas une valeur précise (dépend du BPM/step width) mais un
    // mouvement réel piloté par requestAnimationFrame, ce qu'un mock ne peut pas garantir.
    expect(pos2).not.toBe(pos1);
  });

  test('cliquer sur un pad joue une note et laisse le contexte audio "running"', async ({
    page,
  }) => {
    await page.waitForSelector('#loading-overlay', { state: 'hidden' });

    const pad = page.locator('[data-testid="pad"]').first(); // (?) TODO: confirmer sélecteur
    await pad.click();

    await expect
      .poll(() => page.evaluate(() => window.__ordrumbox?.audioEngine?.context?.state))
      .toBe('running');
  });
});

test.describe('Chargement des drumkits', () => {
  test('changer de drumkit charge les nouveaux samples sans 404', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#loading-overlay', { state: 'hidden' });

    const failedRequests = [];
    page.on('response', (response) => {
      if (
        response.url().match(/\.(wav|mp3|ogg)$/i) &&
        !response.ok()
      ) {
        failedRequests.push(`${response.status()} ${response.url()}`);
      }
    });

    const kitSelector = page.locator('#drumkit-select'); // (?) TODO: confirmer sélecteur
    await kitSelector.selectOption({ index: 1 }); // kit != celui par défaut

    // Attendre la fin du chargement réseau des nouveaux samples plutôt qu'un délai fixe
    await page.waitForLoadState('networkidle');

    expect(failedRequests, `Samples en échec : ${failedRequests.join(', ')}`).toHaveLength(0);
  });
});
