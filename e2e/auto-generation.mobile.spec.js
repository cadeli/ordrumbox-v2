// e2e/auto-generation.mobile.spec.js
//
// Mobile toolbar keeps the two auto-composition buttons (drum + bass) within
// reach; chords stay desktop-only so the bar keeps its two tight rows.

import { test, expect } from '@playwright/test'
import { bootApp } from './fixtures.js'

// Generation runs through async generators (view_switch.js), so every
// assertion below polls the model instead of trusting a fixed delay.
const GEN = { timeout: 15_000 }

const autoNoteCount = (page) =>
    page.evaluate(() => {
        const tracks = window.__e2e?.appState?.patterns?.[0]?.tracks ?? []
        return tracks.filter((t) => t.auto === true).reduce((n, t) => n + (t.notes ?? []).length, 0)
    })

const trackNoteCount = (page, name) =>
    page.evaluate((trackName) => {
        const tracks = window.__e2e?.appState?.patterns?.[0]?.tracks ?? []
        return tracks.find((t) => t.name === trackName)?.notes?.length ?? 0
    }, name)

test.describe('Auto-generation on mobile', () => {
    test.beforeEach(async ({ page }) => {
        await bootApp(page)
    })

    test('drum and bass buttons are in the toolbar, chords are not', async ({ page }) => {
        const drumBtn = page.locator('#tb .tb-gen-btn[data-gen="drum"]')
        const bassBtn = page.locator('#tb .tb-gen-btn[data-gen="bass"]')
        const chordsBtn = page.locator('#tb .tb-gen-btn[data-gen="chords"]')

        await expect(drumBtn).toBeVisible()
        await expect(bassBtn).toBeVisible()
        await expect(drumBtn).toContainText(/drum/i)
        await expect(bassBtn).toContainText(/bass/i)
        await expect(chordsBtn).toBeHidden()
    })

    test('toolbar keeps two compact rows with the generation buttons', async ({ page }) => {
        const tb = await page.locator('#tb').boundingBox()
        expect(tb.height).toBeLessThanOrEqual(72)
        expect(tb.height).toBeGreaterThan(0)
    })

    test('tapping drum generates notes in drum tracks', async ({ page }) => {
        await page.locator('#tb .tb-gen-btn[data-gen="drum"]').tap()

        await expect.poll(() => autoNoteCount(page), GEN).toBeGreaterThan(0)
    })

    test('tapping bass generates notes in the BASS track', async ({ page }) => {
        await page.locator('#tb .tb-gen-btn[data-gen="bass"]').tap()

        await expect.poll(() => trackNoteCount(page, 'BASS'), GEN).toBeGreaterThan(0)
    })
})
