// e2e/select_dropdown.spec.js
//
// Themed dropdown replaces the OS-drawn list (src/ui/select_dropdown.js):
// clicking a <select> opens an in-page popup that matches the candy shell,
// while the native control stays focused, programmable and event-compatible.

import { test, expect } from '@playwright/test'
import { bootApp } from './fixtures.js'

const visibleSelect = (page) => page.locator('#tb select:visible').first()

test.describe('Custom select dropdown', () => {
    test('click opens the themed popup, keyboard picks an option', async ({ page }) => {
        await bootApp(page)
        const select = visibleSelect(page)
        const before = await select.inputValue()

        await select.click()
        const popup = page.locator('.od-select-popup')
        await expect(popup).toBeVisible()
        expect(await popup.locator('.od-select-option').count()).toBeGreaterThan(1)

        // Popup font matches the closed control (same design, no OS styling).
        const popupFont = await popup.evaluate((el) => getComputedStyle(el).fontFamily)
        const selectFont = await select.evaluate((el) => getComputedStyle(el).fontFamily)
        expect(popupFont).toBe(selectFont)

        await page.keyboard.press('ArrowDown')
        await page.keyboard.press('Enter')
        await expect(popup).toHaveCount(0)
        expect(await select.inputValue()).not.toBe(before)
    })

    test('Escape and outside pointerdown close the popup', async ({ page }) => {
        await bootApp(page)
        const select = visibleSelect(page)
        const popup = page.locator('.od-select-popup')

        await select.click()
        await expect(popup).toBeVisible()
        await page.keyboard.press('Escape')
        await expect(popup).toHaveCount(0)

        await select.click()
        await expect(popup).toBeVisible()
        await page.evaluate(() => document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })))
        await expect(popup).toHaveCount(0)
    })
})
