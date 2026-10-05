// e2e/piano_roll.spec.js
//
// Note editing by pointer and by keyboard in the piano roll, through a real
// browser: the jsdom tests dispatch synthetic events on nodes, so only this
// spec proves the geometry (a drag that starts on the note element the mouse
// actually hits), the click-after-drag suppression, and the gauge that has to
// be painted on screen.

import { test, expect } from '@playwright/test'
import { bootApp } from './fixtures.js'

/** First empty step of track 0 for the current pattern, in absolute steps. */
async function firstEmptyStep(page) {
    return page.evaluate(() => {
        const { appState } = window.__e2e
        const track = appState.patterns[appState.selectedPatternIdx].tracks[0]
        const filled = new Set((track.notes ?? []).map((n) => `${n.beat}/${n.beatStep}`))
        const beatCount = track.beatCount ?? 4
        const spb = track.stepsPerBeat ?? 4
        for (let beat = 0; beat < beatCount; beat++) {
            for (let step = 0; step < spb; step++) {
                if (!filled.has(`${beat}/${step}`)) return { beat, step, spb }
            }
        }
        return null
    })
}

/** Switches to the piano roll and creates one note at an empty step. */
async function openPianoRollWithNote(page) {
    const cell = await firstEmptyStep(page)
    await page.locator(`.pp-cell[data-track="0"][data-beat="${cell.beat}"][data-step="${cell.step}"]`).click()
    await page.locator('.tb-view-btn[data-view="proll"]').click()
    await expect(page.locator('#piano-roll-panel')).toBeVisible()

    const step = cell.beat * cell.spb + cell.step
    const note = page.locator(`.pp-pr-note[data-step="${step}"]`).first()
    await expect(note).toBeVisible()
    return note
}

/** Note fields of the piano roll's track, straight from the model. */
const noteState = (page, step) =>
    page.evaluate((absStep) => {
        const { appState } = window.__e2e
        const track = appState.patterns[appState.selectedPatternIdx].tracks[appState.selectedTrackIdx]
        const note = (track.notes ?? []).find((n) => n.beat * (track.stepsPerBeat ?? 4) + (n.beatStep ?? 0) === absStep)
        return note ? { velocity: note.velocity ?? null, pitch: note.pitch ?? null } : null
    }, step)

/** Centre of a locator, after scrolling it into the piano roll viewport. */
async function centreOf(locator) {
    await locator.scrollIntoViewIfNeeded()
    const box = await locator.boundingBox()
    expect(box, 'element must have a box to drag').not.toBeNull()
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

/** Presses a note and drags by (dx, dy) pixels, one move, then releases. */
async function dragNote(page, locator, dx, dy) {
    const from = await centreOf(locator)
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(from.x + dx, from.y + dy, { steps: 4 })
    await page.mouse.up()
}

test.describe('Piano roll note editing', () => {
    test('dragging a note up and down changes its velocity', async ({ page }) => {
        await bootApp(page)
        const note = await openPianoRollWithNote(page)
        const step = Number(await note.getAttribute('data-step'))

        await dragNote(page, note, 0, -40)
        await expect.poll(() => noteState(page, step).then((n) => n?.velocity)).toBeGreaterThan(0.8)

        const louder = await noteState(page, step)
        expect(louder.velocity).toBeLessThanOrEqual(1)

        await dragNote(page, note, 0, 40)
        await expect
            .poll(() => noteState(page, step).then((n) => n?.velocity))
            .toBeLessThan(louder.velocity)
    })

    test('dragging a note sideways transposes it and shows the gauge', async ({ page }) => {
        await bootApp(page)
        const note = await openPianoRollWithNote(page)
        const step = Number(await note.getAttribute('data-step'))
        const before = await noteState(page, step)

        await dragNote(page, note, 48, 0)

        await expect.poll(() => noteState(page, step).then((n) => n?.pitch)).toBe(before.pitch + 4)
        await expect(page.locator('.pp-tooltip-gauge')).toContainText('pitch:+4')
        await expect(page.locator('.pp-tooltip-gauge')).toBeVisible()
        await expect(page.locator('.pp-gauge-arc')).toBeVisible()
        // the ring must land on the note element currently in the DOM: the
        // piano roll replaces every note element on each repaint
        await expect(note).toHaveClass(/pp-gauge-anchor/)
        // its native title is taken down while the gauge speaks for the note
        await expect(note).not.toHaveAttribute('title', /.+/)
    })

    test('the drag axis is locked: a diagonal drag edits one parameter only', async ({ page }) => {
        await bootApp(page)
        const note = await openPianoRollWithNote(page)
        const step = Number(await note.getAttribute('data-step'))
        const before = await noteState(page, step)

        await dragNote(page, note, 30, -60) // vertical dominates

        const after = await noteState(page, step)
        expect(after.pitch).toBe(before.pitch)
        expect(after.velocity).toBeGreaterThan(before.velocity)
    })

    test('dragging a note does not delete it', async ({ page }) => {
        await bootApp(page)
        const note = await openPianoRollWithNote(page)
        const step = Number(await note.getAttribute('data-step'))

        // The gesture ends on the note it started on, so the browser sends a
        // click: it must not reach the click handler, which deletes a selected
        // note.
        await dragNote(page, note, 0, -30)
        expect(await noteState(page, step)).not.toBeNull()
        await expect(note).toBeVisible()
    })

    test('a plain click still selects the note, and deletes it when clicked again', async ({ page }) => {
        await bootApp(page)
        const note = await openPianoRollWithNote(page)
        const step = Number(await note.getAttribute('data-step'))

        await note.click()
        await expect(note).toHaveClass(/selected/)
        expect(await noteState(page, step)).not.toBeNull()

        await note.click()
        await expect.poll(() => noteState(page, step)).toBeNull()
    })

    test('a whole drag undoes as one step', async ({ page }) => {
        await bootApp(page)
        const note = await openPianoRollWithNote(page)
        const step = Number(await note.getAttribute('data-step'))
        const before = await noteState(page, step)

        await dragNote(page, note, 0, -60)
        await expect.poll(() => noteState(page, step).then((n) => n?.velocity)).toBeGreaterThan(before.velocity)

        await page.keyboard.press('Control+z')
        await expect.poll(() => noteState(page, step).then((n) => n?.velocity)).toBe(before.velocity)
    })

    test('Shift+Arrow edits the selected note and shows the gauge', async ({ page }) => {
        await bootApp(page)
        const note = await openPianoRollWithNote(page)
        const step = Number(await note.getAttribute('data-step'))
        await note.click()
        const before = await noteState(page, step)

        await page.keyboard.press('Shift+ArrowUp')
        const nudged = Number((before.velocity + 0.05).toFixed(2))
        await expect.poll(() => noteState(page, step).then((n) => n?.velocity)).toBe(nudged)
        await expect(page.locator('.pp-tooltip-gauge')).toContainText('vel:')

        await page.keyboard.press('Shift+ArrowRight')
        await expect.poll(() => noteState(page, step).then((n) => n?.pitch)).toBe(before.pitch + 1)
        await expect(page.locator('.pp-tooltip-gauge')).toContainText('pitch:+1')
    })
})
