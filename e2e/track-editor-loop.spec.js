// e2e/track-editor-loop.spec.js
//
// Real Track Editor "loop" tab: Steps/Beat and Loop Point sliders.
// Moving a range input must update immediately:
//   1. the slider value + .ne-val display,
//   2. the track model in appState,
//   3. the pattern grid (cells per beat / .pp-loop marker).

import { test, expect } from '@playwright/test'
import { bootApp } from './fixtures.js'

function fmtLoopPoint(step, stepsPerBeat) {
    const b = Math.floor((step - 1) / stepsPerBeat) + 1
    const s = ((step - 1) % stepsPerBeat) + 1
    return `${b}.${s}`
}

async function openLoopTab(page) {
    await page.locator('button[title="Toggle Track Editor"]').click()
    await expect(page.locator('#te-panel')).toBeVisible({ timeout: 3_000 })

    // Bind a concrete track (TRACK_SELECT while TE is visible).
    const trackName = page.locator('.pp-track:not(.pp-master-track) .pp-track-name').first()
    await trackName.click()
    await expect(page.locator('#te-panel .track-editor .ne-header .ne-track')).toBeVisible()

    await page.locator('#te-panel button[data-ne-tab="loop"]').click()
    await expect(page.locator('#te-panel [data-tab-panel="loop"]')).not.toHaveClass(/ne-tab-panel-hidden/)
    await expect(page.locator('#te-panel input[data-loop="stepsPerBeat"]')).toBeVisible()
    await expect(page.locator('#te-panel input[data-loop="loopAtStep"]')).toBeVisible()
}

function readTrack(page) {
    return page.evaluate(() => {
        const { appState } = window.__e2e
        const pattern = appState.patterns[appState.selectedPatternNum]
        const tracks = Array.isArray(pattern?.tracks) ? pattern.tracks : Object.values(pattern?.tracks ?? {})
        const idx = appState.selectedTrackNum ?? 0
        const t = tracks[idx] ?? tracks[0]
        return {
            idx: tracks.indexOf(t) >= 0 ? tracks.indexOf(t) : idx,
            stepsPerBeat: t?.stepsPerBeat ?? 4,
            loopAtStep: t?.loopAtStep ?? (t?.nbBeats ?? 4) * (t?.stepsPerBeat ?? 4),
            nbBeats: t?.nbBeats ?? 4,
            patternNbBeats: pattern?.nbBeats ?? 4,
        }
    })
}

test.describe('Track Editor loop tab — Steps/Beat & Loop Point', () => {
    test.beforeEach(async ({ page }) => {
        await bootApp(page)
    })

    test('stepsPerBeat slider updates value, display, model and grid immediately', async ({ page }) => {
        await openLoopTab(page)

        const before = await readTrack(page)
        const input = page.locator('#te-panel input[data-loop="stepsPerBeat"]')
        const display = page.locator('#te-panel .ne-val[data-loop="stepsPerBeat"]')

        await expect(input).toHaveValue(String(before.stepsPerBeat))
        await expect(display).toHaveText(String(before.stepsPerBeat))

        const after = before.stepsPerBeat === 8 ? 4 : 8
        await input.fill(String(after))

        // Slider + display update synchronously on input
        await expect(input).toHaveValue(String(after))
        await expect(display).toHaveText(String(after))

        // Model updated
        await expect.poll(async () => (await readTrack(page)).stepsPerBeat, { timeout: 3_000 }).toBe(after)

        // Grid rebuilt: first beat has `after` cells
        const firstBeatCells = page.locator('.pp-track:not(.pp-master-track) .pp-beat').first().locator('.pp-cell')
        await expect(firstBeatCells).toHaveCount(after, { timeout: 3_000 })
    })

    test('loop point slider updates value, display, model and .pp-loop marker immediately', async ({ page }) => {
        await openLoopTab(page)

        const before = await readTrack(page)
        const input = page.locator('#te-panel input[data-loop="loopAtStep"]')
        const display = page.locator('#te-panel .ne-val[data-loop="loopAtStep"]')

        const maxSteps = before.nbBeats * before.stepsPerBeat
        // Pick a loop point strictly inside the track (1..maxSteps), different from current.
        const after = before.loopAtStep === Math.min(8, maxSteps) ? Math.min(4, maxSteps) : Math.min(8, maxSteps)
        expect(after).toBeGreaterThanOrEqual(1)
        expect(after).toBeLessThanOrEqual(maxSteps)
        expect(after).not.toBe(before.loopAtStep)

        await input.fill(String(after))

        // Slider + formatted display (e.g. "2.1") update on input
        await expect(input).toHaveValue(String(after))
        await expect(display).toHaveText(fmtLoopPoint(after, before.stepsPerBeat))

        // Model updated
        await expect.poll(async () => (await readTrack(page)).loopAtStep, { timeout: 3_000 }).toBe(after)

        // Pattern grid marker moved to absolute step (after - 1)
        const loopCell = page.locator(`.pp-cell[data-pos="${after - 1}"]`).first()
        await expect(loopCell).toHaveClass(/pp-loop/, { timeout: 3_000 })
    })

    test('changing stepsPerBeat clamps loop point and refreshes its display', async ({ page }) => {
        await openLoopTab(page)

        const before = await readTrack(page)
        // Force a high loop point, then drop stepsPerBeat so maxSteps shrinks.
        const maxBefore = before.nbBeats * before.stepsPerBeat
        if (before.loopAtStep !== maxBefore) {
            await page.locator('#te-panel input[data-loop="loopAtStep"]').fill(String(maxBefore))
            await expect.poll(async () => (await readTrack(page)).loopAtStep, { timeout: 3_000 }).toBe(maxBefore)
        }

        const newSpb = before.stepsPerBeat === 1 ? 2 : 1
        await page.locator('#te-panel input[data-loop="stepsPerBeat"]').fill(String(newSpb))

        const maxAfter = before.nbBeats * newSpb
        await expect.poll(async () => (await readTrack(page)).stepsPerBeat, { timeout: 3_000 }).toBe(newSpb)
        await expect
            .poll(async () => (await readTrack(page)).loopAtStep, { timeout: 3_000 })
            .toBe(Math.min(maxBefore, maxAfter))

        const display = page.locator('#te-panel .ne-val[data-loop="loopAtStep"]')
        const clamped = Math.min(maxBefore, maxAfter)
        await expect(display).toHaveText(fmtLoopPoint(clamped, newSpb))
        await expect(page.locator('#te-panel input[data-loop="loopAtStep"]')).toHaveValue(String(clamped))
    })
})
