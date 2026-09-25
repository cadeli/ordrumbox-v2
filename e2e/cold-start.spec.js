// e2e/cold-start.spec.js
//
// E2E-A: Cold start → first sound.
// The complete path every user executes:
//   waiting screen → init → loadSong → first tick → flatNotes computed → audio playing.
// Verified via the window.__e2e hook exposed during init, and via the play button.

import { test, expect } from '@playwright/test'

test.describe('E2E-A : Cold start → first sound', () => {
    test('loadSong + init + first tick triggers at least one flatNote', async ({ page }) => {
        await page.goto('/')

        const startBtn = page.locator('#waiting-screen-start-btn')
        await expect(startBtn).toBeVisible()
        await startBtn.click()
        await page.locator('#waiting-screen').waitFor({ state: 'hidden', timeout: 15_000 })

        await page.waitForFunction(() => window.__e2e?.ready === true, { timeout: 10_000 })

        const state = await page.evaluate(() => ({
            patternCount: window.__e2e.appState.patterns.length,
            songName: window.__e2e.appState.songInfos.name,
            flatNotesReady: window.__e2e.appState.flatNotes !== null,
            flatNoteCount:
                window.__e2e.appState.flatNotes instanceof Map
                    ? [...window.__e2e.appState.flatNotes.values()].reduce((n, arr) => n + arr.length, 0)
                    : 0,
        }))

        expect(state.patternCount).toBeGreaterThan(0)
        expect(state.songName).toBeTruthy()
        expect(state.flatNotesReady).toBe(true)
        expect(state.flatNoteCount).toBeGreaterThan(0)
    })

    test('audio context transitions to "running" after Start click', async ({ page }) => {
        await page.goto('/')

        const startBtn = page.locator('#waiting-screen-start-btn')
        await startBtn.click()
        await page.locator('#waiting-screen').waitFor({ state: 'hidden', timeout: 15_000 })

        await page.waitForFunction(() => window.__e2e?.ready === true, { timeout: 10_000 })

        const stateBefore = await page.evaluate(() => {
            const ctx = window.__e2e.serviceRegistry.audioEngine?.audioCtx
            return ctx?.state ?? 'unknown'
        })
        expect(['suspended', 'running', 'unknown']).toContain(stateBefore)

        await page.locator('button.tb-start').click()

        await expect
            .poll(
                async () => {
                    return await page.evaluate(() => {
                        const ctx = window.__e2e.serviceRegistry.audioEngine?.audioCtx
                        return ctx?.state ?? 'unknown'
                    })
                },
                { timeout: 5_000 },
            )
            .toBe('running')
    })

    test('tracks have soundIds assigned (auto-assign on first start)', async ({ page }) => {
        await page.goto('/')

        await page.locator('#waiting-screen-start-btn').click()
        await page.locator('#waiting-screen').waitFor({ state: 'hidden', timeout: 15_000 })
        await page.waitForFunction(() => window.__e2e?.ready === true, { timeout: 10_000 })

        await page.locator('button.tb-start').click()
        await page.waitForFunction(() => window.__e2e.serviceRegistry.transport?.isRunning === true, { timeout: 5_000 })

        // the auto-assign runs asynchronously after the first start
        await expect
            .poll(
                () =>
                    page.evaluate(() => {
                        const tracks = window.__e2e.appState.patterns[0]?.tracks ?? []
                        return tracks.filter(
                            (t) => t.soundId && t.soundId !== 'NOT_DEFINED' && t.soundId !== 'NOT_FOUND',
                        ).length
                    }),
                { timeout: 15_000 },
            )
            .toBeGreaterThan(0)

        const trackCount = await page.evaluate(() => (window.__e2e.appState.patterns[0]?.tracks ?? []).length)
        expect(trackCount).toBeGreaterThan(0)
    })
})
