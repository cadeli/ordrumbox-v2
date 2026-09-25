// e2e/tools-import-export.spec.js
//
// Tests for MIDI import and WAV/MIDI export via the Tools panel UI.

import { test, expect } from '@playwright/test'
import { bootApp } from './fixtures.js'
import { buildMidi } from '../tests/helpers/midi_builder.js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function writeMidiTempFile() {
    const midi = buildMidi({
        format: 1,
        division: 96,
        tracks: [
            {
                name: 'KICK',
                channel: 9,
                program: 0,
                notes: [
                    { tick: 0, note: 36, velocity: 100 },
                    { tick: 96, note: 36, velocity: 80 },
                    { tick: 192, note: 36, velocity: 100 },
                    { tick: 288, note: 36, velocity: 80 },
                ],
            },
            { name: 'SNARE', channel: 9, program: 0, notes: [{ tick: 192, note: 38, velocity: 100 }] },
        ],
    })
    const tmpPath = path.join(__dirname, '../test-results', '_test_import.mid')
    fs.mkdirSync(path.dirname(tmpPath), { recursive: true })
    fs.writeFileSync(tmpPath, Buffer.from(midi))
    return tmpPath
}

test.describe('Tools panel — Import / Export', () => {
    test.beforeEach(async ({ page }) => {
        await bootApp(page)
    })

    test('MIDI import button is present in Tools panel', async ({ page }) => {
        const toolsBtn = page.locator('.tb-tools')
        await toolsBtn.click()

        const importTab = page.locator('.ne-tab-btn[data-ne-tab="import"]')
        await importTab.click()

        const importBtn = page.locator('#tp-import-midi')
        await expect(importBtn).toBeVisible()
    })

    test('MIDI import loads tracks from a .mid file', async ({ page }) => {
        const toolsBtn = page.locator('.tb-tools')
        await toolsBtn.click()

        const importTab = page.locator('.ne-tab-btn[data-ne-tab="import"]')
        await importTab.click()

        const tmpFile = writeMidiTempFile()
        const fileInput = page.locator('#tp-import-midi-file')
        await fileInput.setInputFiles(tmpFile)

        await page.waitForFunction(
            () => {
                const p = window.__e2e?.appState?.patterns
                return p && p.length > 0 && p[0].tracks?.length >= 2
            },
            { timeout: 10_000 },
        )

        const state = await page.evaluate(() => ({
            trackCount: window.__e2e.appState.patterns[0]?.tracks?.length ?? 0,
            trackNames: window.__e2e.appState.patterns[0]?.tracks?.map((t) => t.name) ?? [],
        }))
        expect(state.trackCount).toBeGreaterThanOrEqual(2)
        expect(state.trackNames.some((n) => n === 'KICK' || n === 'SNARE')).toBe(true)
    })

    test('MIDI export triggers download with .mid extension', async ({ page }) => {
        const toolsBtn = page.locator('.tb-tools')
        await toolsBtn.click()

        const exportTab = page.locator('.ne-tab-btn[data-ne-tab="export"]')
        await exportTab.click()

        const downloadPromise = page.waitForEvent('download')
        const exportBtn = page.locator('#tp-export-midi')
        await exportBtn.click()

        const download = await downloadPromise
        expect(download.suggestedFilename()).toMatch(/\.mid$/)
    })

    test('WAV export button is visible in Export tab', async ({ page }) => {
        const toolsBtn = page.locator('.tb-tools')
        await toolsBtn.click()

        const exportTab = page.locator('.ne-tab-btn[data-ne-tab="export"]')
        await exportTab.click()

        const exportBtn = page.locator('#tp-export-wav')
        await expect(exportBtn).toBeVisible()
        await expect(exportBtn).toBeEnabled()
    })

    test('WAV export triggers download with .wav extension', async ({ page }) => {
        const toolsBtn = page.locator('.tb-tools')
        await toolsBtn.click()

        const exportTab = page.locator('.ne-tab-btn[data-ne-tab="export"]')
        await exportTab.click()

        const downloadPromise = page.waitForEvent('download')
        const exportBtn = page.locator('#tp-export-wav')
        await exportBtn.click()

        const download = await downloadPromise
        expect(download.suggestedFilename()).toMatch(/\.wav$/)
    })

    test('WAV export shows "Exporting..." while in progress', async ({ page }) => {
        const toolsBtn = page.locator('.tb-tools')
        await toolsBtn.click()

        const exportTab = page.locator('.ne-tab-btn[data-ne-tab="export"]')
        await exportTab.click()

        const downloadPromise = page.waitForEvent('download')
        const exportBtn = page.locator('#tp-export-wav')
        await exportBtn.click()

        await expect(exportBtn).toContainText(/exporting/i, { timeout: 3_000 })
        await downloadPromise
    })

    test('randomize button generates notes', async ({ page }) => {
        const toolsBtn = page.locator('.tb-tools')
        await toolsBtn.click()

        const patternTab = page.locator('.ne-tab-btn[data-ne-tab="pattern"]')
        await patternTab.click()

        const rndBtn = page.locator('#tp-rnd')
        // randomize() is synchronous (pattern_section.js), no wait needed
        await rndBtn.click()

        const noteCount = await page.evaluate(() => {
            const tracks = window.__e2e?.appState?.patterns?.[0]?.tracks ?? []
            return tracks.reduce((n, t) => n + (t.notes ?? []).length, 0)
        })
        expect(noteCount).toBeGreaterThan(0)
    })

    test('compact button reduces or equalizes notes', async ({ page }) => {
        const toolsBtn = page.locator('.tb-tools')
        await toolsBtn.click()

        const patternTab = page.locator('.ne-tab-btn[data-ne-tab="pattern"]')
        await patternTab.click()

        const rndBtn = page.locator('#tp-rnd')
        await rndBtn.click()

        const countBefore = await page.evaluate(() => {
            const tracks = window.__e2e?.appState?.patterns?.[0]?.tracks ?? []
            return tracks.reduce((n, t) => n + (t.notes ?? []).length, 0)
        })

        const compactBtn = page.locator('#tp-compact')
        // compact() is synchronous (pattern_section.js), no wait needed
        await compactBtn.click()

        const countAfter = await page.evaluate(() => {
            const tracks = window.__e2e?.appState?.patterns?.[0]?.tracks ?? []
            return tracks.reduce((n, t) => n + (t.notes ?? []).length, 0)
        })

        expect(countAfter).toBeLessThanOrEqual(countBefore)
    })
})
