// e2e/kit-change.spec.js
//
// E2E-C : Changement de kit en cours de lecture.
// Lecture en cours → drumkitChange → les pistes useAutoAssignSound se réassignent →
// aucune note orpheline, aucun soundId pointant vers un son absent.

import { test, expect } from '@playwright/test';

test.describe('E2E-C : Changement de kit en cours de lecture', () => {

  test('changer de kit pendant la lecture réassigne les soundIds sans orphelins', async ({ page }) => {
    await page.goto('/');
    await page.locator('#waiting-screen-start-btn').click();
    await page.locator('#waiting-screen').waitFor({ state: 'hidden', timeout: 15_000 });
    await page.waitForFunction(() => window.__e2e?.ready === true, { timeout: 10_000 });

    await page.locator('button.tb-start').click();
    await page.waitForFunction(
      () => window.__e2e.serviceRegistry.transport?.isRunning === true,
      { timeout: 5_000 }
    );

    const initial = await page.evaluate(() => {
      const { appState, soundRegistry } = window.__e2e
      const tracks = appState.patterns[0]?.tracks ?? []
      return tracks.map(t => ({
        name: t.name,
        soundId: t.soundId,
        autoAssign: t.useAutoAssignSound,
        soundExists: !!(t.soundId && soundRegistry.sounds[t.soundId]),
      }))
    });

    const dkCount = await page.evaluate(() => window.__e2e.soundRegistry.drumkitList.length);
    expect(dkCount).toBeGreaterThan(1);

    const dkSelect = page.locator('select.tb-drumkit-select');
    if (await dkSelect.isVisible({ timeout: 2000 }).catch(() => false)) {
      await dkSelect.selectOption({ index: 1 });
    } else {
      await page.evaluate(() => {
        const { serviceRegistry, soundRegistry } = window.__e2e
        serviceRegistry.cmd.setSelectedDrumkitNum(1)
      });
    }

    await page.waitForTimeout(300);

    const afterChange = await page.evaluate(() => {
      const { appState, soundRegistry } = window.__e2e
      const tracks = appState.patterns[0]?.tracks ?? []
      return {
        drumkitName: appState.selectedDrumkit,
        tracks: tracks.map(t => ({
          name: t.name,
          soundId: t.soundId,
          autoAssign: t.useAutoAssignSound,
          soundExists: !!(t.soundId && soundRegistry.sounds[t.soundId]),
        })),
      }
    });

    for (const track of afterChange.tracks) {
      if (track.autoAssign) {
        expect(track.soundId).not.toBe('NOT_DEFINED');
        expect(track.soundId).not.toBe('NOT_FOUND');
        expect(track.soundExists, `track "${track.name}" soundId "${track.soundId}" missing`).toBe(true);
      }
    }

    const isRunning = await page.evaluate(() =>
      window.__e2e.serviceRegistry.transport?.isRunning
    );
    expect(isRunning).toBe(true);
  });

  test('les flatNotes sont reconstruites après le changement de kit', async ({ page }) => {
    await page.goto('/');
    await page.locator('#waiting-screen-start-btn').click();
    await page.locator('#waiting-screen').waitFor({ state: 'hidden', timeout: 15_000 });
    await page.waitForFunction(() => window.__e2e?.ready === true, { timeout: 10_000 });

    const beforeFlatNotes = await page.evaluate(() => {
      const fn = window.__e2e.appState.flatNotes
      if (!(fn instanceof Map)) return { tickCount: 0, noteCount: 0 }
      return {
        tickCount: fn.size,
        noteCount: [...fn.values()].reduce((n, arr) => n + arr.length, 0),
      }
    });

    await page.evaluate(() => {
      window.__e2e.serviceRegistry.cmd.setSelectedDrumkitNum(1)
    });
    await page.waitForTimeout(300);

    const afterFlatNotes = await page.evaluate(() => {
      const fn = window.__e2e.appState.flatNotes
      if (!(fn instanceof Map)) return { tickCount: 0, noteCount: 0 }
      return {
        tickCount: fn.size,
        noteCount: [...fn.values()].reduce((n, arr) => n + arr.length, 0),
      }
    });

    expect(afterFlatNotes.tickCount).toBeGreaterThan(0);
    expect(afterFlatNotes.noteCount).toBeGreaterThan(0);
  });
});
