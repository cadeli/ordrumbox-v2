// e2e/track-editor.mobile.spec.js
//
// Run only on the "mobile-chromium" project (Pixel 7 viewport).
// Verifies track editor and note editor are accessible on mobile:
// the panel is in the viewport and clickable.
//
// On mobile, the toolbar view-row is hidden (display:none) — use
// the mobile tab bar (.mtb-btn[data-tab="track"]) to open the track editor.

import { test, expect } from '@playwright/test'

async function dismissWaitingScreen(page) {
    const btn = page.locator('#waiting-screen-start-btn')
    if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await btn.click()
    }
    await page.locator('#waiting-screen').waitFor({ state: 'hidden', timeout: 15_000 })
    await page.waitForFunction(() => window.__e2e?.ready === true, { timeout: 10_000 })
}

test('track editor and note editor remain accessible on mobile', async ({ page }) => {
    await page.goto('/')
    await dismissWaitingScreen(page)

    await page.locator('.mtb-btn[data-tab="track"]').click()

    const tePanel = page.locator('#te-panel')
    await expect(tePanel).toBeVisible({ timeout: 8_000 })

    await page.waitForFunction((sel) => document.querySelector(sel)?.getBoundingClientRect().width > 0, '#te-panel', {
        timeout: 5_000,
    })

    const width = await tePanel.evaluate((el) => el.getBoundingClientRect().width)
    const viewportWidth = page.viewportSize().width
    expect(width).toBeGreaterThanOrEqual(viewportWidth * 0.8)

    const neContainer = page.locator('#ne-container')
    if (await neContainer.isVisible({ timeout: 2000 }).catch(() => false)) {
        await neContainer.scrollIntoViewIfNeeded()
        await expect(neContainer).toBeInViewport()
    }
})

test('html.is-compact is set on mobile and rotation toggles the landscape layout', async ({ page }) => {
    await page.goto('/')
    await dismissWaitingScreen(page)

    // UA (Pixel 7) + viewport → compact verdict shared with the CSS
    await expect(page.locator('html')).toHaveClass(/is-compact/)

    await page.locator('.mtb-btn[data-tab="track"]').click()
    const tePanel = page.locator('#te-panel')
    await expect(tePanel).toBeVisible({ timeout: 8_000 })

    // Portrait → landscape: the debounced watcher fires ORIENTATION_CHANGE,
    // the track editor re-applies the 3-column layout live (no sync needed)
    await page.setViewportSize({ width: 915, height: 412 })
    await expect(tePanel).toHaveClass(/te-mobile-landscape/, { timeout: 3_000 })

    // Landscape → portrait: the layout class is removed again
    await page.setViewportSize({ width: 412, height: 915 })
    await expect(tePanel).not.toHaveClass(/te-mobile-landscape/, { timeout: 3_000 })
})

test('a touch drag on a knob changes its value', async ({ page }) => {
    await page.goto('/')
    await dismissWaitingScreen(page)

    await page.locator('.mtb-btn[data-tab="track"]').click()
    await expect(page.locator('#te-panel')).toBeVisible({ timeout: 8_000 })

    const row = page.locator('.te-knob-bar [data-or-control="velocity"]').first()
    const knob = row.locator('.or-knob')
    await knob.scrollIntoViewIfNeeded()
    await expect(knob).toBeVisible()
    const before = (await row.locator('.ne-val').textContent())?.trim()

    const box = await knob.boundingBox()
    const cx = Math.round(box.x + box.width / 2)
    const cy = Math.round(box.y + box.height / 2)
    const maxY = page.viewportSize().height - 4

    // Real touch input through the CDP: the drag has to stay on the knob
    // (touch-action: none) instead of scrolling the panel away.
    const cdp = await page.context().newCDPSession(page)
    const drag = async (dy) => {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy, id: 1 }] })
        for (let i = 1; i <= 8; i++) {
            await cdp.send('Input.dispatchTouchEvent', {
                type: 'touchMove',
                touchPoints: [{ x: cx, y: Math.min(maxY, Math.max(4, cy + (dy * i) / 8)), id: 1 }],
            })
        }
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
        return (await row.locator('.ne-val').textContent())?.trim()
    }

    // Either direction has room from a mid-range value; when the knob sits on
    // a bound the other direction takes over.
    let after = await drag(48)
    if (after === before) after = await drag(-48)
    expect(after).not.toBe(before)
})

test('the track editor scrolls in mobile landscape', async ({ page }) => {
    await page.goto('/')
    await dismissWaitingScreen(page)

    await page.locator('.mtb-btn[data-tab="track"]').click()
    await expect(page.locator('#te-panel')).toBeVisible({ timeout: 8_000 })

    // Tall tab content, so the middle column really overflows.
    await page.locator('#te-panel .ne-tab-btn', { hasText: /^gen$/ }).first().click()
    await page.setViewportSize({ width: 667, height: 375 })
    await expect(page.locator('#te-panel')).toHaveClass(/te-mobile-landscape/, { timeout: 3_000 })

    // The 3-column grid is stylesheet-driven — an inline display shadows it.
    expect(await page.locator('#te-panel').evaluate((el) => getComputedStyle(el).display)).toBe('grid')

    // Knobs keep the left column, the panel sits beside them, not under them.
    const knobs = await page.locator('#te-panel .te-knob-bar').boundingBox()
    const scroller = page.locator('#te-panel .te-scroll')
    const scrollerBox = await scroller.boundingBox()
    expect(knobs.width).toBeLessThanOrEqual(200)
    expect(scrollerBox.x).toBeGreaterThan(knobs.x + knobs.width - 4)

    // The column is a real scroll container with content to reach …
    expect(await scroller.evaluate((el) => el.scrollHeight > el.clientHeight + 1)).toBe(true)

    // … and a touch drag inside it scrolls.
    const start = {
        x: Math.round(scrollerBox.x + scrollerBox.width / 2),
        y: Math.round(scrollerBox.y + scrollerBox.height / 2),
        id: 1,
    }
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] })
    for (let i = 1; i <= 10; i++) {
        await cdp.send('Input.dispatchTouchEvent', {
            type: 'touchMove',
            touchPoints: [{ ...start, y: start.y - i * 8 }],
        })
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })

    await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(0)
})
