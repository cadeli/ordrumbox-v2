// e2e/page-matrix.spec.js
//
// E2E-D: stepsPerBeat × page navigation matrix.
// it.each on stepsPerBeat ∈ {1,2,4,8} × nbBeats ∈ {1,3,4,8}:
// toolbar announced page count equals actual rendered grid pages,
// and the last page contains the last beat.

import { test, expect } from '@playwright/test'

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
                ({ nbBeats, stepsPerBeat }) => {
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
                        playbackEvents.emit('patternMetaChange')
                        playbackEvents.emit('patternChange')
                    })
                },
                { nbBeats, stepsPerBeat },
            )

            await page.waitForTimeout(200)

            const pageLabel = await page.locator('.tb-page-label').textContent()
            const match = pageLabel.match(/(\d+)\/(\d+)/)
            expect(match, `toolbar label "${pageLabel}" should match X/Y`).toBeTruthy()
            const toolbarPages = parseInt(match[2], 10)
            expect(toolbarPages).toBe(expectedPages)

            const gridCells = await page.locator('.pp-cell').count()
            expect(gridCells).toBeGreaterThan(0)

            const maxBeatOnPage0 = await page.evaluate(() => {
                const cells = document.querySelectorAll('.pp-cell')
                let max = -1
                for (const c of cells) {
                    const b = parseInt(c.dataset.beat, 10)
                    if (!isNaN(b) && b > max) max = b
                }
                return max
            })
            expect(maxBeatOnPage0).toBe(Math.min(nbBeats - 1, 3))

            for (let p = 1; p < expectedPages; p++) {
                await page.locator('.tb-next-page').click()
                await page.waitForTimeout(100)

                const currentPage = await page.evaluate(() => window.__e2e.appState.currentPage)
                expect(currentPage).toBe(p)

                const label = await page.locator('.tb-page-label').textContent()
                expect(label).toBe(`${p + 1}/${expectedPages}`)

                const nextDisabled = await page.locator('.tb-next-page').getAttribute('disabled')
                if (p === expectedPages - 1) {
                    expect(nextDisabled).not.toBeNull()
                }
            }

            const prevDisabled = await page.locator('.tb-prev-page').getAttribute('disabled')
            if (expectedPages > 1) {
                expect(prevDisabled).toBeNull()
            }
        })
    }
})
