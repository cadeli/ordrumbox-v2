// e2e/page-matrix.spec.js
//
// E2E-D: stepsPerBeat × page navigation matrix.
// it.each on stepsPerBeat ∈ {1,2,4,8} × beatCount ∈ {1,3,4,8}:
// toolbar announced page count equals actual rendered grid pages,
// and the last page contains the last beat.

import { test, expect } from '@playwright/test'
import { EVENTS } from '../src/core/events.js'
import { BEATS_PER_PAGE } from '../src/core/constants.js'

const COMBOS = [
    { stepsPerBeat: 1, beatCount: 1 },
    { stepsPerBeat: 1, beatCount: 3 },
    { stepsPerBeat: 1, beatCount: 4 },
    { stepsPerBeat: 1, beatCount: 8 },
    { stepsPerBeat: 2, beatCount: 1 },
    { stepsPerBeat: 2, beatCount: 3 },
    { stepsPerBeat: 2, beatCount: 4 },
    { stepsPerBeat: 2, beatCount: 8 },
    { stepsPerBeat: 4, beatCount: 1 },
    { stepsPerBeat: 4, beatCount: 3 },
    { stepsPerBeat: 4, beatCount: 4 },
    { stepsPerBeat: 4, beatCount: 8 },
    { stepsPerBeat: 8, beatCount: 1 },
    { stepsPerBeat: 8, beatCount: 3 },
    { stepsPerBeat: 8, beatCount: 4 },
    { stepsPerBeat: 8, beatCount: 8 },
]

test.describe('E2E-D : stepsPerBeat × beatCount page matrix', () => {
    for (const { stepsPerBeat, beatCount } of COMBOS) {
        test(`spb=${stepsPerBeat} beats=${beatCount} → toolbar pages = rendered pages`, async ({ page }) => {
            await page.goto('/')
            await page.locator('#waiting-screen-start-btn').click()
            await page.locator('#waiting-screen').waitFor({ state: 'hidden', timeout: 15_000 })
            await page.waitForFunction(() => window.__e2e?.ready === true, { timeout: 10_000 })

            // A page is BEATS_PER_PAGE beats — stepsPerBeat subdivides a beat,
            // it does not change how many beats fit on a page. The old formula
            // (ceil(beatCount*spb/16)) counted steps per page, so at spb=8 the
            // toolbar offered pages the grid could not render.
            const expectedPages = Math.max(1, Math.ceil(beatCount / BEATS_PER_PAGE))

            await page.evaluate(
                ({ beatCount, stepsPerBeat, patternMetaEvent, patternChangeEvent }) => {
                    const { appState, playbackEvents } = window.__e2e
                    const pattern = appState.patterns[appState.selectedPatternIdx]
                    if (!pattern) return

                    pattern.beatCount = beatCount
                    const tracks = pattern.tracks ?? []
                    for (const track of tracks) {
                        track.beatCount = beatCount
                        track.stepsPerBeat = stepsPerBeat
                        track.loopAtStep = beatCount * stepsPerBeat
                        if (track.loopPointBeat > beatCount) track.loopPointBeat = beatCount
                    }
                    appState.currentPage = 0
                    playbackEvents.batch(() => {
                        playbackEvents.emit(patternMetaEvent)
                        playbackEvents.emit(patternChangeEvent)
                    })
                },
                {
                    beatCount,
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

            const expectedMaxBeat = Math.min(beatCount - 1, BEATS_PER_PAGE - 1)
            const lastBeatOnPage = () =>
                expect.poll(
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
            await lastBeatOnPage().toBe(expectedMaxBeat)

            for (let p = 1; p < expectedPages; p++) {
                await page.locator('.tb-next-page').click()
                await expect.poll(() => page.evaluate(() => window.__e2e.appState.currentPage)).toBe(p)
                await expect(page.locator('.tb-page-label')).toHaveText(`${p + 1}/${expectedPages}`)

                // Pages are full except the last: only the last page may be
                // short, and it must end on the pattern's last beat.
                const isLast = p === expectedPages - 1
                await lastBeatOnPage().toBe(
                    isLast ? beatCount - 1 : Math.min(beatCount - 1, (p + 1) * BEATS_PER_PAGE - 1),
                )

                if (isLast) {
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
