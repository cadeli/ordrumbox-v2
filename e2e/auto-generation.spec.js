// e2e/auto-generation.spec.js
//
// Tests for the auto-generation buttons (drum, bass, chords) in the toolbar.

import { test, expect } from '@playwright/test'
import { bootApp } from './fixtures.js'

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
        await page.waitForTimeout(1_000)

        const noteCount = await page.evaluate(() => {
            const tracks = window.__e2e?.appState?.patterns?.[0]?.tracks ?? []
            return tracks.filter((t) => t.auto === true).reduce((n, t) => n + (t.notes ?? []).length, 0)
        })

        expect(noteCount).toBeGreaterThan(0)
    })

    test('drum generation marks tracks as auto', async ({ page }) => {
        const drumBtn = page.locator('.tb-gen-btn[data-gen="drum"]')
        await drumBtn.click()
        await page.waitForTimeout(1_000)

        const autoTracks = await page.evaluate(() => {
            const tracks = window.__e2e?.appState?.patterns?.[0]?.tracks ?? []
            return tracks
                .filter((t) => ['KICK', 'SNARE', 'HI_HAT', 'HAT', 'CLAP', 'COWBELL', 'PERC'].includes(t.name))
                .filter((t) => t.auto === true)
                .map((t) => t.name)
        })

        expect(autoTracks.length).toBeGreaterThan(0)
    })

    test('bass generation creates notes in BASS track', async ({ page }) => {
        const bassBtn = page.locator('.tb-gen-btn[data-gen="bass"]')
        await bassBtn.click()
        await page.waitForTimeout(1_000)

        const noteCount = await page.evaluate(() => {
            const tracks = window.__e2e?.appState?.patterns?.[0]?.tracks ?? []
            const bass = tracks.find((t) => t.name === 'BASS')
            return bass?.notes?.length ?? 0
        })

        expect(noteCount).toBeGreaterThan(0)
    })

    test('chords generation creates notes in PIANO track', async ({ page }) => {
        const chordsBtn = page.locator('.tb-gen-btn[data-gen="chords"]')
        await chordsBtn.click()
        await page.waitForTimeout(1_000)

        const noteCount = await page.evaluate(() => {
            const tracks = window.__e2e?.appState?.patterns?.[0]?.tracks ?? []
            const piano = tracks.find((t) => t.name === 'PIANO')
            return piano?.notes?.length ?? 0
        })

        expect(noteCount).toBeGreaterThan(0)
    })

    test('clicking drum button again toggles generation off', async ({ page }) => {
        const drumBtn = page.locator('.tb-gen-btn[data-gen="drum"]')
        await drumBtn.click()
        await page.waitForTimeout(1_000)

        const autoBefore = await page.evaluate(() => {
            const tracks = window.__e2e?.appState?.patterns?.[0]?.tracks ?? []
            return tracks.filter((t) => t.auto === true).length
        })

        await drumBtn.click()
        await page.waitForTimeout(500)

        const autoAfter = await page.evaluate(() => {
            const tracks = window.__e2e?.appState?.patterns?.[0]?.tracks ?? []
            return tracks.filter((t) => t.auto === true).length
        })

        expect(autoAfter).toBeLessThan(autoBefore)
    })
})
