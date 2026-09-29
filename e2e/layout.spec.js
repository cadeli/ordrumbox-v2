// e2e/layout.spec.js
//
// Desktop geometry of the fixed layout, asserted relationally: no overlap,
// column containment, token-driven height. Replaces the unit tests that
// re-read src/ui/styles.css and asserted magic pixel values (518 / 754 / 75%).
// Viewport is pinned so the desktop layout is reproducible.

import { test, expect } from '@playwright/test'
import { bootApp } from './fixtures.js'

test.use({ viewport: { width: 1200, height: 800 } })

const box = (page, selector) => page.locator(selector).boundingBox()

const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

async function ensureTrackEditorVisible(page) {
    const te = page.locator('#te-panel')
    if (await te.isVisible().catch(() => false)) return
    await page.locator('button[title="Toggle Track Editor"]').click()
    await expect(te).toBeVisible({ timeout: 3000 })
}

async function panelHeightToken(page) {
    return page.evaluate(() =>
        parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--panel-height')),
    )
}

test.describe('Desktop slot layout', () => {
    test('slot panel sits below the workspace and clears the track editor column', async ({ page }) => {
        await bootApp(page)

        await page.locator('.tb-about').click()
        const slotPanel = page.locator('#about-panel')
        await expect(slotPanel).toBeVisible()

        const pattern = await box(page, '#pattern-panel')
        const slot = await slotPanel.boundingBox()
        const te = await box(page, '#te-panel')
        const viewport = page.viewportSize()

        expect(slot.y).toBeGreaterThanOrEqual(pattern.y + pattern.height)
        expect(slot.y - (pattern.y + pattern.height)).toBeLessThan(24)
        expect(slot.width / viewport.width).toBeCloseTo(0.75, 2)
        expect(slot.x + slot.width).toBeLessThanOrEqual(te.x + 1)

        expect(overlaps(slot, pattern)).toBe(false)
        expect(overlaps(slot, te)).toBe(false)

        const token = await panelHeightToken(page)
        expect(slot.height).toBeCloseTo(token, 1)
    })

    test('note editor is a non-floating child clipped inside the track editor column', async ({ page }) => {
        await bootApp(page)
        await ensureTrackEditorVisible(page)

        const ne = page.locator('#ne-container')
        await expect(ne).toBeVisible({ timeout: 5000 })

        const position = await ne.evaluate((el) => getComputedStyle(el).position)
        expect(['fixed', 'absolute']).not.toContain(position)

        const neBox = await ne.boundingBox()
        const teBox = await box(page, '#te-panel')
        expect(neBox.x).toBeGreaterThanOrEqual(teBox.x - 1)
        expect(neBox.x + neBox.width).toBeLessThanOrEqual(teBox.x + teBox.width + 1)
        expect(neBox.y).toBeGreaterThanOrEqual(teBox.y - 1)
        expect(neBox.y).toBeLessThan(teBox.y + teBox.height)

        // The column clips whatever spills past its bottom edge (the note
        // editor is a fixed-height block, so it can overhang by a few px)
        const overflowY = await page.locator('#te-panel').evaluate((el) => getComputedStyle(el).overflowY)
        expect(overflowY).toBe('hidden')

        const pattern = await box(page, '#pattern-panel')
        expect(neBox.x + neBox.width).toBeGreaterThan(pattern.x + pattern.width - 1)
    })

    test('slot swap keeps the workspace and the track editor column clear', async ({ page }) => {
        const consoleErrors = []
        page.on('console', (msg) => {
            if (msg.type() === 'error') consoleErrors.push(msg.text())
        })

        await bootApp(page)
        await ensureTrackEditorVisible(page)

        const pattern = await box(page, '#pattern-panel')
        const te = await box(page, '#te-panel')

        const slots = [
            ['.tb-about', '#about-panel'],
            ['button[title="Tools"]', '#tools-panel'],
        ]

        for (const [trigger, selector] of slots) {
            await page.locator(trigger).click()
            const panel = page.locator(selector)
            await expect(panel).toBeVisible({ timeout: 3000 })

            const slot = await panel.boundingBox()
            expect(slot.y).toBeGreaterThanOrEqual(pattern.y + pattern.height)
            expect(slot.x + slot.width).toBeLessThanOrEqual(te.x + 1)
            expect(overlaps(slot, pattern)).toBe(false)
            expect(overlaps(slot, te)).toBe(false)
        }

        expect(consoleErrors).toHaveLength(0)
    })
})
