// e2e/playback_tempo.spec.js
//
// The tempo belongs to the visible view: a pattern view (grid, synth, piano
// roll) loops the selected pattern at the pattern's own bpm, the song view runs
// the whole arrangement at its own bpm. Switching between two pattern views is
// not a mode change, so it must leave the transport alone — it used to snap
// playback back to the arrangement's bpm (and restart the loop) mid-play.
//
// Live audio is not observable in headless Chromium, so tempo is asserted on the
// transport, which is what schedules the ticks.

import { test, expect } from '@playwright/test'
import { bootApp } from './fixtures.js'

const transportState = (page) =>
    page.evaluate(() => {
        const { serviceRegistry, appState } = window.__e2e
        return {
            bpm: serviceRegistry.transport?.bpm,
            patternBpm: appState.selectedPattern?.bpm,
            view: appState.currentView,
            tick: serviceRegistry.transport?.tick,
        }
    })

const stop = (page) => page.locator('button.tb-start').click()

test.describe('Playback tempo follows the visible view', () => {
    test('a pattern view starts on the pattern bpm, not the arrangement bpm', async ({ page }) => {
        await bootApp(page)
        await page.evaluate(() => window.__e2e.serviceRegistry.seq.setBpm(140))

        await page.locator('button.tb-start').click()
        // the transport resets tick to 0 on start and advances on every schedule
        // pass: tick > 0 means the player is actually running and applied the view
        await expect.poll(async () => (await transportState(page)).tick).toBeGreaterThan(0)

        const s = await transportState(page)
        expect(s.view).toBe('edit')
        expect(s.patternBpm).toBe(140)
        expect(s.bpm, 'the pattern owns the tempo in a pattern view').toBe(140)

        await stop(page)
    })

    test('grid -> synth keeps the tempo and the playhead', async ({ page }) => {
        await bootApp(page)
        await page.locator('button.tb-start').click()
        // same path as the BPM slider while playing
        await page.evaluate(() => window.__e2e.serviceRegistry.seq.setBpm(140))
        await expect.poll(async () => (await transportState(page)).tick).toBeGreaterThan(0)
        const before = await transportState(page)
        expect(before.bpm).toBe(140)

        await page.locator('.tb-view-btn[data-view="synth"]').click()
        await expect.poll(async () => (await transportState(page)).view).toBe('synth')

        const after = await transportState(page)
        expect(after.view).toBe('synth')
        expect(after.bpm, 'a pattern view switch must not change the tempo').toBe(140)
        expect(after.tick, 'and must not restart the loop').toBeGreaterThanOrEqual(before.tick)

        await stop(page)
    })

    test('the song view runs at the arrangement bpm, leaving it restores the pattern bpm', async ({ page }) => {
        await bootApp(page)
        await page.evaluate(() => window.__e2e.serviceRegistry.seq.setBpm(140))

        await page.locator('.tb-view-btn[data-view="song"]').click()
        await page.locator('button.tb-start').click()
        // start keeps the current bpm; the arrangement's bpm is applied on the
        // player's first pass in song mode — poll on the value under test
        await expect.poll(async () => (await transportState(page)).bpm).toBe(120)
        const song = await transportState(page)
        expect(song.view).toBe('song')
        expect(song.bpm, "the arrangement's bpm wins in the song view").toBe(120)

        await page.locator('.tb-view-btn[data-view="edit"]').click()
        // same: the pattern bpm is restored on the player's next pass
        await expect.poll(async () => (await transportState(page)).bpm).toBe(140)
        const pattern = await transportState(page)
        expect(pattern.view).toBe('edit')
        expect(pattern.bpm, 'back to the pattern bpm').toBe(140)

        await stop(page)
    })
})
