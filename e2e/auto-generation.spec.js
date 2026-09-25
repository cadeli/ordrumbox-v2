// e2e/auto-generation.spec.js
//
// Tests for the auto-generation buttons (drum, bass, chords) in the toolbar.

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

const autoTrackCount = (page) =>
    page.evaluate(() => (window.__e2e?.appState?.patterns?.[0]?.tracks ?? []).filter((t) => t.auto === true).length)

const drumAutoCount = (page) =>
    page.evaluate(() => {
        const tracks = window.__e2e?.appState?.patterns?.[0]?.tracks ?? []
        return tracks
            .filter((t) => ['KICK', 'SNARE', 'HI_HAT', 'HAT', 'CLAP', 'COWBELL', 'PERC'].includes(t.name))
            .filter((t) => t.auto === true).length
    })

const trackNoteCount = (page, name) =>
    page.evaluate((trackName) => {
        const tracks = window.__e2e?.appState?.patterns?.[0]?.tracks ?? []
        return tracks.find((t) => t.name === trackName)?.notes?.length ?? 0
    }, name)

test.describe('Auto-generation', () => {
    test.beforeEach(async ({ page }) => {
        await bootApp(page)
    })

    test('drum generate button is visible in toolbar', async ({ page }) => {
        const drumBtn = page.locator('.tb-gen-btn[data-gen="drum"]')
        await expect(drumBtn).toBeVisible()
        await expect(drumBtn).toContainText(/drum/i)
    })

    test('bass generate button is visible in toolbar', async ({ page }) => {
        const bassBtn = page.locator('.tb-gen-btn[data-gen="bass"]')
        await expect(bassBtn).toBeVisible()
        await expect(bassBtn).toContainText(/bass/i)
    })

    test('chords generate button is visible in toolbar', async ({ page }) => {
        const chordsBtn = page.locator('.tb-gen-btn[data-gen="chords"]')
        await expect(chordsBtn).toBeVisible()
        await expect(chordsBtn).toContainText(/chords/i)
    })

    test('drum generation creates notes in drum tracks', async ({ page }) => {
        const drumBtn = page.locator('.tb-gen-btn[data-gen="drum"]')
        await drumBtn.click()

        await expect.poll(() => autoNoteCount(page), GEN).toBeGreaterThan(0)
    })

    test('drum generation marks tracks as auto', async ({ page }) => {
        const drumBtn = page.locator('.tb-gen-btn[data-gen="drum"]')
        await drumBtn.click()

        await expect.poll(() => drumAutoCount(page), GEN).toBeGreaterThan(0)
    })

    test('bass generation creates notes in BASS track', async ({ page }) => {
        const bassBtn = page.locator('.tb-gen-btn[data-gen="bass"]')
        await bassBtn.click()

        await expect.poll(() => trackNoteCount(page, 'BASS'), GEN).toBeGreaterThan(0)
    })

    test('chords generation creates notes in PIANO track', async ({ page }) => {
        const chordsBtn = page.locator('.tb-gen-btn[data-gen="chords"]')
        await chordsBtn.click()

        await expect.poll(() => trackNoteCount(page, 'PIANO'), GEN).toBeGreaterThan(0)
    })

    test('clicking drum button again toggles generation off', async ({ page }) => {
        const drumBtn = page.locator('.tb-gen-btn[data-gen="drum"]')
        await drumBtn.click()
        await expect.poll(() => autoTrackCount(page), GEN).toBeGreaterThan(0)
        const autoBefore = await autoTrackCount(page)

        await drumBtn.click()
        await expect.poll(() => autoTrackCount(page), GEN).toBeLessThan(autoBefore)
    })
})
