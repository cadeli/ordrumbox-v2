// e2e/pattern-grid-drag.spec.js
//
// Editing a note in the pattern grid by pointer: drag up/down for the velocity
// (the slice opacity follows it), drag left/right for the pitch — which the grid
// cannot draw, so the gauge bubble is the only feedback and must be visible on
// screen. Real mouse events: jsdom cannot tell whether the press actually hit
// the cell.

import { test, expect } from '@playwright/test'
import { bootApp } from './fixtures.js'

/** First empty step of track 0 for the current pattern. */
async function firstEmptyCell(page) {
    return page.evaluate(() => {
        const { appState } = window.__e2e
        const track = appState.patterns[appState.selectedPatternIdx].tracks[0]
        const filled = new Set((track.notes ?? []).map((n) => `${n.beat}/${n.beatStep}`))
        const beatCount = track.beatCount ?? 4
        const spb = track.stepsPerBeat ?? 4
        for (let beat = 0; beat < beatCount; beat++) {
            for (let step = 0; step < spb; step++) {
                if (!filled.has(`${beat}/${step}`)) return { beat, step }
            }
        }
        return null
    })
}

/** Note fields of track 0 at one step, straight from the model. */
const noteState = (page, beat, step) =>
    page.evaluate(
        ({ beat, step }) => {
            const { appState } = window.__e2e
            const track = appState.patterns[appState.selectedPatternIdx].tracks[0]
            const note = (track.notes ?? []).find((n) => n.beat === beat && n.beatStep === step)
            return note ? { velocity: note.velocity ?? null, pitch: note.pitch ?? null } : null
        },
        { beat, step },
    )

/** Counts the note previews the UI asks the player for. */
async function spyOnPreviews(page) {
    await page.evaluate(() => {
        const seq = window.__e2e.serviceRegistry.seq
        window.__previews = []
        const orig = seq.simpleBeep.bind(seq)
        seq.simpleBeep = (trackIdx, note) => {
            window.__previews.push({
                trackIdx,
                velocity: note?.velocity ?? null,
                pitch: note?.pitch ?? null,
                at: Date.now(),
            })
            return orig(trackIdx, note)
        }
    })
}

const previews = (page) => page.evaluate(() => window.__previews)

/** Drags the note slice of a filled cell by (dx, dy) pixels. */
async function dragNote(page, cell, dx, dy) {
    const box = await cell.boundingBox()
    expect(box, 'the cell must have a box to drag').not.toBeNull()
    const x = box.x + box.width / 2
    const y = box.y + box.height / 2
    await page.mouse.move(x, y)
    await page.mouse.down()
    for (let i = 1; i <= 6; i++) await page.mouse.move(x + (dx * i) / 6, y + (dy * i) / 6)
}

/**
 * Drags a filled cell through several offsets, one throttled preview per move.
 *
 * The preview is throttled (90ms) and synchronous with the move: waiting for the
 * throttle window to be open before each move guarantees it is not dropped.
 */
async function dragNoteSlow(page, cell, offsets) {
    const box = await cell.boundingBox()
    const x = box.x + box.width / 2
    const y = box.y + box.height / 2
    await page.mouse.move(x, y)
    await page.mouse.down()
    for (const dy of offsets) {
        // delta computed in the browser: the Node clock is a different context
        await expect
            .poll(() =>
                page.evaluate(() => {
                    const last = window.__previews.at(-1)?.at ?? 0
                    return Date.now() - last
                }),
            )
            .toBeGreaterThanOrEqual(90)
        await page.mouse.move(x, y + dy)
    }
    await page.mouse.up()
    // the beep is synchronous with the move: every effective (unclamped) move
    // has already recorded one — clamped no-ops correctly stay silent, which
    // is why the test asserts "more than one", not "one per move"
}

test.describe('Pattern grid note drag', () => {
    /** Creates a note and returns its cell locator. */
    async function noteCell(page) {
        const { beat, step } = await firstEmptyCell(page)
        const cell = page.locator(`.pp-cell[data-track="0"][data-beat="${beat}"][data-step="${step}"]`)
        await cell.click()
        await expect(cell).toHaveClass(/filled/)
        return { cell, beat, step }
    }

    test('dragging a cell up and down changes the note velocity', async ({ page }) => {
        await bootApp(page)
        const { cell, beat, step } = await noteCell(page)
        const before = await noteState(page, beat, step)

        await dragNote(page, cell, 0, -40)
        const slice = cell.locator('.pp-note-slice')
        await expect(slice).toBeVisible()
        await expect
            .poll(() => noteState(page, beat, step).then((n) => n?.velocity))
            .toBeGreaterThan(before.velocity)
        await expect(page.locator('.pp-tooltip-gauge')).toContainText('vel:')
        await expect(page.locator('.pp-tooltip-gauge')).toBeVisible()
        await page.mouse.up()

        const louder = (await noteState(page, beat, step)).velocity
        await dragNote(page, cell, 0, 40)
        await expect.poll(() => noteState(page, beat, step).then((n) => n?.velocity)).toBeLessThan(louder)
        await page.mouse.up()
    })

    test('dragging a cell sideways transposes the note and shows its name', async ({ page }) => {
        await bootApp(page)
        const { cell, beat, step } = await noteCell(page)
        const before = await noteState(page, beat, step)

        await dragNote(page, cell, 48, 0)
        await expect.poll(() => noteState(page, beat, step).then((n) => n?.pitch)).toBe(before.pitch + 4)
        const gauge = page.locator('.pp-tooltip-gauge')
        await expect(gauge).toContainText('pitch:+4')
        await expect(gauge).toBeVisible()
        await page.mouse.up()
    })

    test('the drag axis is locked: a diagonal edits one parameter only', async ({ page }) => {
        await bootApp(page)
        const { cell, beat, step } = await noteCell(page)
        const before = await noteState(page, beat, step)

        await dragNote(page, cell, 30, -60) // vertical dominates
        await page.mouse.up()
        const after = await noteState(page, beat, step)
        expect(after.pitch).toBe(before.pitch)
        expect(after.velocity).toBeGreaterThan(before.velocity)
    })

    test('the drag does not paint a text selection and does not delete the note', async ({ page }) => {
        await bootApp(page)
        const { cell, beat, step } = await noteCell(page)

        await dragNote(page, cell, 0, -30)
        await page.mouse.up()

        expect(await page.evaluate(() => window.getSelection().toString())).toBe('')
        expect(await noteState(page, beat, step)).not.toBeNull()
        await expect(cell).toHaveClass(/filled/)

        // The drag selected the note, so one plain click deletes it (a second
        // one would re-create it on the now empty cell).
        await cell.click()
        await expect.poll(() => noteState(page, beat, step)).toBeNull()
        await expect(cell).not.toHaveClass(/filled/)
    })

    test('the gauge draws a knob-style arc and rings the edited cell', async ({ page }) => {
        await bootApp(page)
        const { cell } = await noteCell(page)

        await dragNote(page, cell, 0, -40)
        const gauge = page.locator('.pp-tooltip-gauge')
        await expect(gauge).toBeVisible()
        await expect(gauge.locator('.pp-gauge-arc')).toBeVisible()
        const deg = parseFloat(
            await gauge.locator('.pp-gauge-arc').evaluate((el) => el.style.getPropertyValue('--arc-deg')),
        )
        expect(deg).toBeGreaterThan(0)
        expect(deg).toBeLessThanOrEqual(270) // a knob sweep, 0..270deg
        await expect(cell).toHaveClass(/pp-gauge-anchor/)
        await page.mouse.up()
    })

    test('the note hover tooltip stays hidden while the gauge is up', async ({ page }) => {
        await bootApp(page)
        const { cell } = await noteCell(page)
        const box = await cell.boundingBox()
        const cx = box.x + box.width / 2
        const cy = box.y + box.height / 2
        const hover = page.locator('.pp-tooltip:not(.pp-tooltip-gauge)')

        await dragNote(page, cell, 0, -40)
        const gauge = page.locator('.pp-tooltip-gauge')
        await expect(gauge).toBeVisible()
        // the hover bubble describes the same note: it must not compete
        await expect(hover).toBeHidden()
        await page.mouse.up()

        // back once the gauge is gone (a mouseover is needed to re-open it):
        // the gauge fades after its lifetime (700ms + 150ms fade), toBeHidden
        // auto-retries until display:none
        await expect(gauge).toBeHidden()
        await page.mouse.move(4, 4)
        await page.mouse.move(cx, cy)
        await expect(hover).toBeVisible()
    })

    test('the drag previews the note, so the edit is audible', async ({ page }) => {
        await bootApp(page)
        const { cell, beat, step } = await noteCell(page)
        await spyOnPreviews(page)
        // the create-click may have armed the module throttle (private state the
        // spy cannot see): reset it so every drag move is guaranteed a beep.
        // Vite resolves this to the same module instance the app uses.
        await page.evaluate(() => import('/src/ui/components/note_preview.js').then((m) => m.resetNotePreviewThrottle()))

        await dragNoteSlow(page, cell, [-20, -40, -60])
        const during = await previews(page)

        // The preview is throttled, so it does not hit every move — but it must
        // follow the edit upwards and never announce a value the note never had.
        const model = await noteState(page, beat, step)
        const velocities = during.map((p) => p.velocity)
        expect(velocities.length).toBeGreaterThan(1)
        expect(during.every((p) => p.trackIdx === 0)).toBe(true)
        expect(velocities.at(-1)).toBeGreaterThan(velocities[0])
        expect(Math.max(...velocities)).toBeLessThanOrEqual(model.velocity)
    })

    test('Shift+Arrow edits the picked note and shows the gauge', async ({ page }) => {
        await bootApp(page)
        const { cell, beat, step } = await noteCell(page)
        const before = await noteState(page, beat, step)

        await page.keyboard.press('Shift+ArrowUp')
        const louder = Number((before.velocity + 0.05).toFixed(2))
        await expect.poll(() => noteState(page, beat, step).then((n) => n?.velocity)).toBe(louder)
        await expect(page.locator('.pp-tooltip-gauge')).toContainText('vel:')
        await expect(page.locator('.pp-tooltip-gauge')).toBeVisible()
        // the cursor stayed on the cell: this is an edit, not a selection move
        await expect(cell).toHaveClass(/selected/)

        await page.keyboard.press('Shift+ArrowDown')
        await expect.poll(() => noteState(page, beat, step).then((n) => n?.velocity)).toBe(before.velocity)

        await page.keyboard.press('Shift+ArrowRight')
        await expect.poll(() => noteState(page, beat, step).then((n) => n?.pitch)).toBe(before.pitch + 1)
        await expect(page.locator('.pp-tooltip-gauge')).toContainText('pitch:+1')
        await expect(cell).toHaveClass(/selected/)
    })

    test('a whole drag undoes as one step', async ({ page }) => {
        await bootApp(page)
        const { cell, beat, step } = await noteCell(page)
        const before = await noteState(page, beat, step)

        await dragNote(page, cell, 0, -60)
        await page.mouse.up()
        await expect.poll(() => noteState(page, beat, step).then((n) => n?.velocity)).toBeGreaterThan(
            before.velocity,
        )

        await page.keyboard.press('Control+z')
        await expect.poll(() => noteState(page, beat, step).then((n) => n?.velocity)).toBe(before.velocity)
    })
})