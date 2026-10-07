// e2e/color-scheme.spec.js
//
// The color scheme lives in settings.json (written by the MCP setColorScheme
// tool — the file only overrides the stored value when it carries a NEW
// number, see ResourcesLoader) and in IndexedDB (the 'c' shortcut's cycle,
// persisted by saveSettings). Either way it is normalized on load and applied
// to <html data-scheme> by applyColorScheme(). The service worker is blocked
// here so page.route can answer the settings fetch deterministically.

import { test, expect } from '@playwright/test'
import { bootApp } from './fixtures.js'

test.use({ serviceWorkers: 'block' })

function routeSettings(page, colorScheme) {
    return page.route('**/settings.json', (route) =>
        route.fulfill({
            contentType: 'application/json',
            body: JSON.stringify({ version: 1, sampleDirs: [], maxSampleDirs: 10, colorScheme }),
        }),
    )
}

test('applies the stored color scheme at boot', async ({ page }) => {
    await routeSettings(page, 2)
    await bootApp(page)

    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.scheme)).toBe('2')
    // the override really drives the tokens, not just the attribute
    await expect
        .poll(() =>
            page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()),
        )
        .toBe('#ffb02e')
})

test('falls back to scheme 1 for an unknown stored value', async ({ page }) => {
    await routeSettings(page, 42)
    await bootApp(page)

    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.scheme)).toBe('1')
    await expect
        .poll(() =>
            page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()),
        )
        .toBe('#9bbc0f')
})

test('applies scheme 1 when the shipped settings.json has no override', async ({ page }) => {
    await bootApp(page)

    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.scheme)).toBe('1')
})

test('the "c" key cycles 1 → 2 → 3 and the choice survives a reload', async ({ page }) => {
    await bootApp(page)
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.scheme)).toBe('1')

    await page.keyboard.press('c')
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.scheme)).toBe('2')
    await page.keyboard.press('c')
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.scheme)).toBe('3')
    await page.keyboard.press('c')
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.scheme)).toBe('1')

    await page.keyboard.press('c')
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.scheme)).toBe('2')

    // wait for the 'c' handler's saveSettings() to land before reloading
    await expect
        .poll(async () =>
            page.evaluate(async () => {
                const { idbGet } = await import('/src/core/idb.js')
                const settings = await idbGet('settings', 'ordrumbox_settings')
                return settings?.colorScheme ?? null
            }),
        )
        .toBe(2)

    await page.reload()
    await bootApp(page)
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.scheme)).toBe('2')
})
