// e2e/undo_redo.spec.js
// P0 regression: redo used to be a no-op (Commander recorded
// `execute: () => {}`), so Ctrl+Y never re-applied anything and a second
// Ctrl+Z could corrupt notes. This spec proves the real UI loop:
// click cells → Ctrl+Z → Ctrl+Y → notes come back exactly.

import { test, expect } from '@playwright/test'
import { bootApp } from './fixtures.js'

test.describe('Undo / Redo', () => {
    const historyState = (page) =>
        page.evaluate(() => {
            const { appState, serviceRegistry } = window.__e2e
            const h = serviceRegistry.history
            const pat = appState.patterns[appState.selectedPatternIdx]
            const notes = (pat?.tracks ?? []).flatMap((t) => t.notes ?? [])
            return {
                pastLength: h.pastLength,
                futureLength: h.futureLength,
                canUndo: h.canUndo,
                canRedo: h.canRedo,
                noteCount: notes.length,
                filled: notes.map((n) => `${n.beat}/${n.beatStep}`),
            }
        })

    /** Two empty grid positions on track 0 for the current pattern. */
    const findTwoEmptyCells = (page) =>
        page.evaluate(() => {
            const { appState } = window.__e2e
            const track = appState.patterns[appState.selectedPatternIdx].tracks[0]
            const filled = new Set((track.notes ?? []).map((n) => `${n.beat}/${n.beatStep}`))
            const out = []
            const beatCount = track.beatCount ?? 4
            const spb = track.stepsPerBeat ?? 4
            for (let beat = 0; beat < beatCount && out.length < 2; beat++) {
                for (let step = 0; step < spb && out.length < 2; step++) {
                    if (!filled.has(`${beat}/${step}`)) out.push({ beat, step })
                }
            }
            return out
        })

    const cell = (page, beat, step) =>
        page.locator(`.pp-cell[data-track="0"][data-beat="${beat}"][data-step="${step}"]`)

    test('boot leaves the undo stack empty (no per-note load entries)', async ({ page }) => {
        await bootApp(page)

        const state = await historyState(page)
        expect(state.pastLength).toBe(0)
        expect(state.canUndo).toBe(false)
        expect(state.canRedo).toBe(false)
    })

    test('Ctrl+Z / Ctrl+Y undo and redo grid notes losslessly', async ({ page }) => {
        await bootApp(page)

        const [{ beat: b1, step: s1 }, { beat: b2, step: s2 }] = await findTwoEmptyCells(page)
        const base = await historyState(page)

        // Add two notes
        await cell(page, b1, s1).click()
        await expect(cell(page, b1, s1)).toHaveClass(/filled/)
        await cell(page, b2, s2).click()
        await expect(cell(page, b2, s2)).toHaveClass(/filled/)

        let state = await historyState(page)
        expect(state.noteCount).toBe(base.noteCount + 2)
        expect(state.pastLength).toBe(base.pastLength + 2)
        expect(state.canRedo).toBe(false)

        // Undo both
        await page.keyboard.press('Control+z')
        await expect(cell(page, b2, s2)).not.toHaveClass(/filled/)
        state = await historyState(page)
        expect(state.noteCount).toBe(base.noteCount + 1)
        expect(state.canRedo).toBe(true)

        await page.keyboard.press('Control+z')
        await expect(cell(page, b1, s1)).not.toHaveClass(/filled/)
        state = await historyState(page)
        expect(state.noteCount).toBe(base.noteCount)
        expect(state.pastLength).toBe(base.pastLength)

        // Redo both — the actual P0 fix
        await page.keyboard.press('Control+y')
        await expect(cell(page, b1, s1)).toHaveClass(/filled/)
        state = await historyState(page)
        expect(state.noteCount).toBe(base.noteCount + 1)

        await page.keyboard.press('Control+y')
        await expect(cell(page, b2, s2)).toHaveClass(/filled/)
        state = await historyState(page)
        expect(state.noteCount).toBe(base.noteCount + 2)
        expect(state.canRedo).toBe(false)
        expect(state.filled).toEqual(expect.arrayContaining([`${b1}/${s1}`, `${b2}/${s2}`]))

        // Another full cycle stays lossless (double undo → double redo)
        await page.keyboard.press('Control+z')
        await page.keyboard.press('Control+z')
        state = await historyState(page)
        expect(state.noteCount).toBe(base.noteCount)

        await page.keyboard.press('Control+y')
        await page.keyboard.press('Control+y')
        state = await historyState(page)
        expect(state.noteCount).toBe(base.noteCount + 2)
        expect(state.filled).toEqual(expect.arrayContaining([`${b1}/${s1}`, `${b2}/${s2}`]))
    })

    test('redo button state follows the history stacks', async ({ page }) => {
        await bootApp(page)

        const [{ beat, step }] = await findTwoEmptyCells(page)

        const redoBtn = page.locator('.tb-redo, button:has-text("Redo")').first()

        await cell(page, beat, step).click()
        await expect(cell(page, beat, step)).toHaveClass(/filled/)

        // After a fresh action there is nothing to redo
        await page.keyboard.press('Control+z')
        await expect(cell(page, beat, step)).not.toHaveClass(/filled/)

        // After undo the redo entry exists → button enabled (if rendered)
        if ((await redoBtn.count()) > 0) {
            await expect(redoBtn).toBeEnabled()
        }
        const state = await historyState(page)
        expect(state.canRedo).toBe(true)

        await page.keyboard.press('Control+y')
        await expect(cell(page, beat, step)).toHaveClass(/filled/)
        const afterRedo = await historyState(page)
        expect(afterRedo.canRedo).toBe(false)
        expect(afterRedo.noteCount).toBeGreaterThan(0)
    })
})
