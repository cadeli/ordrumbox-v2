// e2e/page-matrix.spec.js
//
// E2E-D: stepsPerBeat × page navigation matrix.
// it.each on stepsPerBeat ∈ {1,2,4,8} × nbBeats ∈ {1,3,4,8}:
// toolbar announced page count equals actual rendered grid pages,
// and the last page contains the last beat.

import { test, expect } from '@playwright/test'
import { EVENTS } from '../src/core/events.js'

const COMBOS = [
    { stepsPerBeat: 1, nbBeats: 1 },
    { stepsPerBeat: 1, nbBeats: 3 },
    { stepsPerBeat: 1, nbBeats: 4 },
    { stepsPerBeat: 1, nbBeats: 8 },
    { stepsPerBeat: 2, nbBeats: 1 },
    { stepsPerBeat: 2, nbBeats: 3 },
    { stepsPerBeat: 2, nbBeats: 4 },
    { stepsPerBeat: 2, nbBeats: 8 },
    { stepsPerBeat: 4, nbBeats: 1 },
    { stepsPerBeat: 4, nbBeats: 3 },
    { stepsPerBeat: 4, nbBeats: 4 },
    { stepsPerBeat: 4, nbBeats: 8 },
    { stepsPerBeat: 8, nbBeats: 1 },
    { stepsPerBeat: 8, nbBeats: 3 },
    { stepsPerBeat: 8, nbBeats: 4 },
    { stepsPerBeat: 8, nbBeats: 8 },
]

test.describe('E2E-D : stepsPerBeat × nbBeats page matrix', () => {
    for (const { stepsPerBeat, nbBeats } of COMBOS) {
        test(`spb=${stepsPerBeat} beats=${nbBeats} → toolbar pages = rendered pages`, async ({ page }) => {
            await page.goto('/')
            await page.locator('#waiting-screen-start-btn').click()
            await page.locator('#waiting-screen').waitFor({ state: 'hidden', timeout: 15_000 })
            await page.waitForFunction(() => window.__e2e?.ready === true, { timeout: 10_000 })

            const expectedPages = Math.max(1, Math.ceil((nbBeats * stepsPerBeat) / 16))

            await page.evaluate(
                ({ nbBeats, stepsPerBeat, patternMetaEvent, patternChangeEvent }) => {
                    const { appState, playbackEvents } = window.__e2e
                    const pattern = appState.patterns[appState.selectedPatternNum]
                    if (!pattern) return

                    pattern.nbBeats = nbBeats
                    const tracks = pattern.tracks ?? []
                    for (const track of tracks) {
                        track.nbBeats = nbBeats
                        track.stepsPerBeat = stepsPerBeat
                        track.loopAtStep = nbBeats * stepsPerBeat
                        if (track.loopPointBeat > nbBeats) track.loopPointBeat = nbBeats
                    }
                    appState.currentPage = 0
                    playbackEvents.batch(() => {
                        playbackEvents.emit(patternMetaEvent)
                        playbackEvents.emit(patternChangeEvent)
                    })
                },
                {
                    nbBeats,
                    stepsPerBeat,
                    patternMetaEvent: EVENTS.PATTERN_META_CHANGE,
                    patternChangeEvent: EVENTS.PATTERN_CHANGE,
                },
            )

            // The batch emit is synchronous: poll the toolbar label until it
            // reflects the new page total instead of sleeping first.
            await expect(page.locator('.tb-page-label')).toHaveText(new RegExp(`\\d+/${expectedPages}$`))

            const gridCells = await page.locator('.pp-cell').count()
            expect(gridCells).toBeGreaterThan(0)

            const expectedMaxBeat = Math.min(nbBeats - 1, 3)
            await expect
                .poll(
                    () =>
                        page.evaluate(() => {
                            const cells = document.querySelectorAll('.pp-cell')
                            let max = -1
                            for (const c of cells) {
                                const b = parseInt(c.dataset.beat, 10)
                                if (!isNaN(b) && b > max) max = b
                            }
                            return max
                        }),
                    { timeout: 5_000 },
                )
                .toBe(expectedMaxBeat)

            for (let p = 1; p < expectedPages; p++) {
                await page.locator('.tb-next-page').click()
                await expect.poll(() => page.evaluate(() => window.__e2e.appState.currentPage)).toBe(p)
                await expect(page.locator('.tb-page-label')).toHaveText(`${p + 1}/${expectedPages}`)

                if (p === expectedPages - 1) {
                    await expect(page.locator('.tb-next-page')).toBeDisabled()
                }
            }

            const prevDisabled = await page.locator('.tb-prev-page').getAttribute('disabled')
            if (expectedPages > 1) {
                expect(prevDisabled).toBeNull()
            }
        })
    }
})
