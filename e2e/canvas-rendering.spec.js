// e2e/canvas-rendering.spec.js
//
// Verifies that the spectrum analyzer canvas actually produces non-empty pixels
// during playback — impossible to mock usefully (jsdom doesn't rasterize).

import { test, expect } from '@playwright/test'

async function dismissWaitingScreen(page) {
    const btn = page.locator('#waiting-screen-start-btn')
    if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await btn.click()
    }
    await page.locator('#waiting-screen').waitFor({ state: 'hidden', timeout: 15_000 })
}

test('spectrum analyzer draws non-empty pixels during playback', async ({ page }) => {
    await page.goto('/')
    await dismissWaitingScreen(page)

    await page.locator('button.tb-start').click()

    const canvas = page.locator('#op-spectrum')
    await expect(canvas).toBeVisible({ timeout: 5_000 })

    await page.waitForTimeout(500)

    const hasNonBlankPixels = await canvas.evaluate((el) => {
        const ctx = el.getContext('2d')
        if (!ctx) return false
        const { data } = ctx.getImageData(0, 0, el.width, el.height)
        for (let i = 0; i < data.length; i += 4) {
            if (data[i] !== 0 || data[i + 1] !== 0 || data[i + 2] !== 0) return true
        }
        return false
    })

    expect(hasNonBlankPixels).toBe(true)

    await page.locator('button.tb-start').click()
})
