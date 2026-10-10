// e2e/viewport-fit.mobile.spec.js
//
// Run only on the "mobile-chromium" project (Pixel 7 viewport).
//
// The app must occupy exactly the screen the user sees: the full visible
// height — screen minus the browser URL bar — and the full screen width, in
// portrait and in landscape alike. On a phone `100vh` is the LARGE viewport
// (address bar retracted), so a shell sized with it sticks out behind the URL
// bar; the shell therefore reads `--app-vh`, which the @supports block in
// src/ui/styles.css upgrades to `100dvh`.

import { test, expect } from '@playwright/test'
import { bootApp } from './fixtures.js'

const SIZES = {
    portrait: { width: 412, height: 839 },
    landscape: { width: 839, height: 412 },
}

async function measureShell(page) {
    return page.evaluate(() => {
        const box = (el) => {
            const r = el.getBoundingClientRect()
            return {
                x: Math.round(r.x),
                y: Math.round(r.y),
                width: Math.round(r.width),
                height: Math.round(r.height),
                bottom: Math.round(r.bottom),
            }
        }
        const doc = document.documentElement
        return {
            vw: window.innerWidth,
            vh: window.innerHeight,
            app: box(document.getElementById('app-main')),
            tabBar: box(document.getElementById('mobile-tab-bar')),
            scrollWidth: doc.scrollWidth,
            scrollHeight: doc.scrollHeight,
            appVh: getComputedStyle(doc).getPropertyValue('--app-vh').trim(),
        }
    })
}

for (const [orientation, size] of Object.entries(SIZES)) {
    test(`shell fits the visible screen — ${orientation}`, async ({ page }) => {
        await page.setViewportSize(size)
        await bootApp(page)
        await expect(page.locator('html')).toHaveClass(/is-compact/)

        const m = await measureShell(page)

        // Height comes from the dynamic viewport (screen minus URL bar), never
        // from the static 100vh that overshoots it on a phone
        expect(m.appVh).toBe('100dvh')

        // Total app height = visible viewport height, total width = screen width
        expect(m.app).toEqual({ x: 0, y: 0, width: m.vw, height: m.vh, bottom: m.vh })
        expect(m.scrollWidth).toBeLessThanOrEqual(m.vw)
        expect(m.scrollHeight).toBeLessThanOrEqual(m.vh)

        // The bottom tab bar sits exactly on the visible bottom edge, full width
        expect(m.tabBar).toEqual({
            x: 0,
            y: m.vh - 60,
            width: m.vw,
            height: 60,
            bottom: m.vh,
        })
    })
}
