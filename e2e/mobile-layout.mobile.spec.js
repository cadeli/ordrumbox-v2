// e2e/mobile-layout.mobile.spec.js
//
// Run only on the "mobile-chromium" project (Pixel 7 viewport).
// Real-Chromium checks for the compact layout: panels clear the bottom tab
// bar, and the landscape overrides form a working scroll chain. Replaces the
// unit tests that re-read src/ui/styles.css for the compact/landscape rules.
//
// On mobile, the toolbar view-row is hidden (display:none) — use the mobile
// tab bar (.mtb-btn[data-tab="…"]) to open panels.

import { test, expect } from '@playwright/test'
import { bootApp } from './fixtures.js'

const TAB_BAR = '#mobile-tab-bar'

async function openTab(page, tab) {
    await page.locator(`.mtb-btn[data-tab="${tab}"]`).click()
}

async function clearsTabBar(page, selector) {
    const panel = await page.locator(selector).boundingBox()
    const tabBar = await page.locator(TAB_BAR).boundingBox()
    return panel.y + panel.height <= tabBar.y + 1
}

// Forces the content to overflow so scrollability is proven, not assumed:
// the element must accept a scrollTop once its content no longer fits.
// Height is set with inline !important because the compact rules pin it.
function isScrollable(el) {
    const prevValue = el.style.getPropertyValue('height')
    const prevPriority = el.style.getPropertyPriority('height')
    el.style.setProperty('height', '40px', 'important')
    el.scrollTop = 40
    const ok = el.scrollHeight > el.clientHeight && el.scrollTop > 0
    el.scrollTop = 0
    el.style.setProperty('height', prevValue, prevPriority)
    return ok
}

test.describe('Compact layout — tab bar clearance', () => {
    test('sequencer panel clears the bottom tab bar and keeps its grid reachable', async ({ page }) => {
        await bootApp(page)

        await expect(page.locator('html')).toHaveClass(/is-compact/)

        await openTab(page, 'seq')
        const patternPanel = page.locator('#pattern-panel')
        await expect(patternPanel).toBeVisible({ timeout: 5000 })

        expect(await clearsTabBar(page, '#pattern-panel')).toBe(true)

        // The grid must fit vertically: #pattern-panel clips (overflow-y is
        // hidden by its own id rule), so anything taller would be unreachable
        const fits = await patternPanel.evaluate((el) => el.scrollHeight <= el.clientHeight + 1)
        expect(fits).toBe(true)
    })

    test('track editor clears the bottom tab bar and scrolls', async ({ page }) => {
        await bootApp(page)

        await openTab(page, 'track')
        const tePanel = page.locator('#te-panel')
        await expect(tePanel).toBeVisible({ timeout: 8000 })

        expect(await clearsTabBar(page, '#te-panel')).toBe(true)
        await expect(tePanel).toHaveCSS('overflow-y', 'auto')
        expect(await tePanel.evaluate(isScrollable)).toBe(true)
    })

    test('master tab output panel clears the bottom tab bar and scrolls', async ({ page }) => {
        await bootApp(page)

        await openTab(page, 'master')
        const outputPanel = page.locator('#output-panel')
        await expect(outputPanel).toBeVisible({ timeout: 5000 })

        expect(await clearsTabBar(page, '#output-panel')).toBe(true)
        await expect(outputPanel).toHaveCSS('overflow-y', 'auto')
        expect(await outputPanel.evaluate(isScrollable)).toBe(true)
    })
})

test.describe('Landscape overrides — scroll chain', () => {
    test('rotation promotes the track editor to a grid with scrollable cells', async ({ page }) => {
        await bootApp(page)

        await openTab(page, 'track')
        const tePanel = page.locator('#te-panel')
        await expect(tePanel).toBeVisible({ timeout: 8000 })

        await page.setViewportSize({ width: 915, height: 412 })
        await expect(tePanel).toHaveClass(/te-mobile-landscape/, { timeout: 3000 })

        const landscape = '#te-panel.te-mobile-landscape'

        // .track-editor stops being a box: its children become grid items
        await expect(page.locator(`${landscape} .track-editor`)).toHaveCSS('display', 'contents')
        // Grid container does not clip: each cell scrolls on its own
        await expect(page.locator(landscape)).toHaveCSS('overflow', 'visible')
        await expect(page.locator(`${landscape} .te-scroll`)).toHaveCSS('overflow', 'visible')
        await expect(page.locator(`${landscape} #ne-container`)).toHaveCSS('overflow-y', 'auto')
        // #ne-container is the only scroll container of the notes area:
        // the tab panels must not add a nested one
        const tabPanels = page.locator(`${landscape} .ne-tab-panel:not(.ne-tab-panel-hidden)`)
        for (let i = 0; i < (await tabPanels.count()); i++) {
            await expect(tabPanels.nth(i)).toHaveCSS('overflow-y', 'visible')
        }

        // The note editor cell must actually scroll in landscape
        const neContainer = page.locator(`${landscape} #ne-container`)
        await expect(neContainer).toBeVisible({ timeout: 3000 })
        expect(await neContainer.evaluate(isScrollable)).toBe(true)
    })
})
