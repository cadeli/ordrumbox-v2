// e2e/piano-roll.mobile.spec.js
//
// The bottom tab bar reaches the piano roll: the Piano tab opens it as a
// full-screen workspace view, with the pattern grid and track editor out of
// the way and both chrome bars still clear.

import { test, expect } from '@playwright/test'
import { bootApp } from './fixtures.js'

async function box(page, selector) {
    const b = await page.locator(selector).boundingBox()
    expect(b, selector).not.toBeNull()
    return b
}

test.describe('Piano roll on mobile', () => {
    test.beforeEach(async ({ page }) => {
        await bootApp(page)
    })

    test('the tab bar has a Piano tab', async ({ page }) => {
        const btn = page.locator('.mtb-btn[data-tab="proll"]')
        await expect(btn).toBeVisible()
        await expect(btn).toContainText(/piano/i)
    })

    test('the Piano tab opens the piano roll between toolbar and tab bar', async ({ page }) => {
        await page.locator('.mtb-btn[data-tab="proll"]').tap()
        const pr = page.locator('#piano-roll-panel')
        await expect(pr).toBeVisible()

        const tb = await box(page, '#tb')
        const bar = await box(page, '#mobile-tab-bar')
        const roll = await box(page, '#piano-roll-panel')

        expect(roll.x).toBe(0)
        expect(roll.width).toBe(tb.width)
        expect(roll.y).toBeGreaterThanOrEqual(tb.y + tb.height - 1)
        expect(roll.y + roll.height).toBeLessThanOrEqual(bar.y + 1)

        await expect(page.locator('#pattern-panel')).toBeHidden()
        await expect(page.locator('#te-panel')).toBeHidden()
        await expect(page.locator('.mtb-btn[data-tab="proll"]')).toHaveClass(/active/)
    })

    test('the piano roll draws keys and notes', async ({ page }) => {
        await page.locator('.mtb-btn[data-tab="proll"]').tap()
        await expect(page.locator('#piano-roll-panel')).toBeVisible()

        await expect(page.locator('#pp-piano-keys .pp-pr-key').first()).toBeVisible()
        await expect.poll(() => page.locator('#piano-roll-panel .pp-pr-note').count()).toBeGreaterThan(0)
    })

    test('the Sequencer tab brings the grid back', async ({ page }) => {
        await page.locator('.mtb-btn[data-tab="proll"]').tap()
        await expect(page.locator('#piano-roll-panel')).toBeVisible()

        await page.locator('.mtb-btn[data-tab="seq"]').tap()
        await expect(page.locator('#piano-roll-panel')).toBeHidden()
        await expect(page.locator('#pattern-panel')).toBeVisible()
    })
})
