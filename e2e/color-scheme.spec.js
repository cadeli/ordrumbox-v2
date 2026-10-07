// e2e/color-scheme.spec.js
//
// The color scheme is stored in settings.json (written by the MCP
// setColorScheme tool), normalized on load and applied to <html data-scheme>
// by applyColorScheme() at boot. The service worker is blocked here so
// page.route can answer the settings fetch deterministically.

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

test('applies scheme 1 from the shipped settings.json', async ({ page }) => {
    await bootApp(page)

    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.scheme)).toBe('1')
})
