// e2e/song-arrangement.spec.js
//
// The arrangement grid in the Song view: song.json carries a `songs` array of
// clips, and the grid draws them the way a DAW arrangement view does — time
// left to right on X (a ruler, one cell per measure), one row per pattern named
// in a frozen first column, one rectangle per clip whose width is its duration.
//
// Playback of an arrangement is NOT implemented yet — nothing here asserts it
// drives the transport.

import { test, expect } from '@playwright/test'
import { bootApp } from './fixtures.js'

async function openSongView(page) {
    await bootApp(page)
    await page.locator('.tb-view-btn[data-view="song"]').click()
    await page.waitForSelector('#sa-root.sa-has-song', { timeout: 10_000 })
}

test.describe('Song arrangement grid', () => {
    test('loads the demo arrangement from song.json', async ({ page }) => {
        await openSongView(page)

        const song = await page.evaluate(() => {
            const s = window.__e2e.appState.songs[0]
            return { id: s.id, bpm: s.bpm, clips: s.clips.length }
        })
        expect(song.id).toBe('demo')
        expect(song.bpm).toBe(120)
        expect(song.clips).toBeGreaterThan(0)
    })

    test('draws one rectangle per clip', async ({ page }) => {
        await openSongView(page)
        const clips = await page.evaluate(() => window.__e2e.appState.songs[0].clips.length)
        await expect(page.locator('.sa-clip')).toHaveCount(clips)
    })

    test('a row per used pattern, not the whole library', async ({ page }) => {
        await openSongView(page)
        const { rows, usedPatterns, library } = await page.evaluate(() => {
            const song = window.__e2e.appState.songs[0]
            return {
                rows: document.querySelectorAll('.sa-row-name').length,
                usedPatterns: new Set(song.clips.map((c) => c.pattern)).size,
                library: window.__e2e.appState.patterns.length,
            }
        })
        expect(rows).toBe(usedPatterns)
        expect(rows).toBeLessThan(library)
    })

    test('time is on X, numbered by measure, after the name column', async ({ page }) => {
        await openSongView(page)
        const geom = await page.evaluate(() => {
            const list = document.getElementById('sa-list')
            const body = document.querySelector('.sa-body')
            const firstBar = document.querySelector('.sa-bar-head')
            const name = document.querySelector('.sa-row-name')
            return {
                totalBars: Number(list.dataset.totalBars),
                cells: document.querySelectorAll('.sa-bar-head').length,
                firstBarLabel: firstBar.textContent,
                firstBarLeft: Math.round(firstBar.getBoundingClientRect().left),
                bodyLeft: Math.round(body.getBoundingClientRect().left),
                nameRight: Math.round(name.getBoundingClientRect().right),
                listLeft: Math.round(list.getBoundingClientRect().left),
            }
        })
        expect(geom.cells).toBe(geom.totalBars)
        expect(geom.firstBarLabel).toBe('1')
        // the ruler starts where the body starts, i.e. after the frozen names
        expect(geom.firstBarLeft).toBe(geom.bodyLeft)
        expect(geom.nameRight).toBeLessThanOrEqual(geom.bodyLeft + 1)
    })

    test('a rectangle sits on its pattern row, at its start bar along X', async ({ page }) => {
        await openSongView(page)
        const geom = await page.evaluate(() => {
            const song = window.__e2e.appState.songs[0]
            // Rows follow the pattern library order, not the order the clips
            // happen to mention the patterns in.
            const used = [...new Set(song.clips.map((c) => c.pattern))]
            const rows = window.__e2e.appState.patterns.filter((p) => used.includes(p.id)).map((p) => p.id)
            const clip = song.clips.find((c) => c.startBar > 0)
            const el = document.querySelector(
                `.sa-clip[data-pattern="${clip.pattern}"][data-start-bar="${clip.startBar}"]`,
            )
            const body = document.querySelector('.sa-body').getBoundingClientRect()
            const box = el.getBoundingClientRect()
            return {
                startBar: clip.startBar,
                row: rows.indexOf(clip.pattern),
                leftInBody: Math.round(box.left - body.left),
                topInBody: Math.round(box.top - body.top),
            }
        })
        // X = time (24px per measure), Y = pattern row (22px per pattern)
        expect(geom.leftInBody).toBe(geom.startBar * 24)
        expect(geom.topInBody).toBe(geom.row * 22 + 2)
    })

    // Overlapping clips is the whole point of the feature: two patterns starting
    // on the same bar must sit on two rows at the same X position.
    test('shows overlapping clips on separate rows', async ({ page }) => {
        await openSongView(page)
        const overlap = await page.evaluate(() => {
            const song = window.__e2e.appState.songs[0]
            const at0 = song.clips.filter((c) => c.startBar === 0)
            const body = document.querySelector('.sa-body').getBoundingClientRect()
            const els = [...document.querySelectorAll('.sa-clip[data-start-bar="0"]')]
            return {
                count: at0.length,
                rendered: els.length,
                tops: els.map((e) => Math.round(e.getBoundingClientRect().top - body.top)),
                lefts: els.map((e) => Math.round(e.getBoundingClientRect().left - body.left)),
            }
        })
        expect(overlap.count).toBeGreaterThan(1)
        expect(overlap.rendered).toBe(overlap.count)
        expect(new Set(overlap.tops).size).toBe(overlap.count)
        expect(new Set(overlap.lefts).size).toBe(1)
    })

    test('the rectangle width encodes the clip duration', async ({ page }) => {
        await openSongView(page)
        const widths = await page.evaluate(() => {
            const song = window.__e2e.appState.songs[0]
            const clip = song.clips.find((c) => c.bars === 4)
            const el = document.querySelector(`.sa-clip[data-start-bar="${clip.startBar}"][data-bars="4"]`)
            return { w: Math.round(el.getBoundingClientRect().width), bar: 24 }
        })
        // 4 bars minus the 2px inset that separates neighbouring clips
        expect(widths.w).toBe(4 * widths.bar - 2)
    })

    test('names the patterns in the first column', async ({ page }) => {
        await openSongView(page)
        const names = await page.locator('.sa-row-name span').allTextContents()
        const expected = await page.evaluate(() => {
            const song = window.__e2e.appState.songs[0]
            const used = new Set(song.clips.map((c) => c.pattern))
            return window.__e2e.appState.patterns.filter((p) => used.has(p.id)).map((p) => p.name)
        })
        expect(names).toEqual(expected)
    })

    test('shows the empty state when the song has no arrangement', async ({ page }) => {
        await bootApp(page)
        await page.evaluate(() => {
            window.__e2e.appState.songs = []
            window.__e2e.playbackEvents.emit('patternStructureChange')
        })
        await page.locator('.tb-view-btn[data-view="song"]').click()
        await expect(page.locator('.sa-empty')).toBeVisible()
        await expect(page.locator('.sa-clip')).toHaveCount(0)
    })
})

/**
 * Right-click menus on the arrangement grid:
 *   - on a clip        → Next (repeat just after) / Delete
 *   - on a pattern name → Delete row (every clip of that pattern)
 *   - on an empty cell  → Add here (the row's pattern at that measure)
 */
test.describe('Song arrangement context menus', () => {
    const clips = (page) => page.evaluate(() => window.__e2e.appState.songs[0].clips.length)
    const clipsWhere = (page, pred) =>
        page.evaluate((src) => {
            const test = new Function('c', `return ${src}`)
            return window.__e2e.appState.songs[0].clips.filter(test).length
        }, pred)

    test('on a clip: Next repeats the pattern right after it', async ({ page }) => {
        await openSongView(page)
        const before = await clips(page)
        await page.locator('.sa-clip[data-pattern="smrock"][data-start-bar="2"]').click({ button: 'right' })
        await expect(page.locator('.pp-context-menu')).toBeVisible()
        await page.locator('.pp-context-menu-item', { hasText: 'Next' }).click()

        await expect.poll(() => clips(page)).toBe(before + 1)
        expect(await clipsWhere(page, "c.pattern === 'smrock' && c.startBar === 3")).toBe(1)
    })

    test('on a clip: Delete removes just that clip', async ({ page }) => {
        await openSongView(page)
        const before = await clips(page)
        await page.locator('.sa-clip[data-pattern="funkfill"][data-start-bar="11"]').click({ button: 'right' })
        await page.locator('.pp-context-menu-item', { hasText: 'Delete' }).click()

        await expect.poll(() => clips(page)).toBe(before - 1)
        expect(await clipsWhere(page, "c.pattern === 'funkfill' && c.startBar === 11")).toBe(0)
    })

    test('on a pattern name: Delete row removes every clip of that pattern', async ({ page }) => {
        await openSongView(page)
        const before = await clips(page)
        const ofPattern = await clipsWhere(page, "c.pattern === 'cmpbeat'")

        await page.locator('.sa-row-name[data-pattern="cmpbeat"]').click({ button: 'right' })
        await expect(page.locator('.pp-context-menu-item', { hasText: 'Delete row' })).toBeVisible()
        await page.locator('.pp-context-menu-item', { hasText: 'Delete row' }).click()

        await expect.poll(() => clips(page)).toBe(before - ofPattern)
        expect(await clipsWhere(page, "c.pattern === 'cmpbeat'")).toBe(0)
        // the row itself disappears once it holds no clip
        await expect(page.locator('.sa-row-name[data-pattern="cmpbeat"]')).toHaveCount(0)
    })

    test('on an empty cell: Add here places the row pattern at that measure', async ({ page }) => {
        await openSongView(page)
        const before = await clips(page)
        const body = await page.locator('.sa-body').boundingBox()

        // row of `funk` (index 5), bar cell 1 — empty, funk starts at bar 3
        await page.mouse.click(body.x + 1 * 24 + 12, body.y + 5 * 22 + 8, { button: 'right' })
        await expect(page.locator('.pp-context-menu-item', { hasText: 'Add here' })).toBeVisible()
        await page.locator('.pp-context-menu-item', { hasText: 'Add here' }).click()

        await expect.poll(() => clips(page)).toBe(before + 1)
        // cell 1 is bar 2 displayed, i.e. index 1
        expect(await clipsWhere(page, "c.pattern === 'funk' && c.startBar === 1")).toBe(1)
    })

    test('clicking a filled cell offers the clip menu, not Add here', async ({ page }) => {
        await openSongView(page)
        await page.locator('.sa-clip[data-pattern="smrock"][data-start-bar="2"]').click({ button: 'right' })
        await expect(page.locator('.pp-context-menu-item', { hasText: 'Add here' })).toHaveCount(0)
        await expect(page.locator('.pp-context-menu-item', { hasText: 'Delete' })).toBeVisible()
    })

    test('Escape closes the menu without changing anything', async ({ page }) => {
        await openSongView(page)
        const before = await clips(page)
        await page.locator('.sa-clip[data-pattern="smrock"][data-start-bar="2"]').click({ button: 'right' })
        await expect(page.locator('.pp-context-menu')).toBeVisible()
        await page.keyboard.press('Escape')
        await expect(page.locator('.pp-context-menu')).toHaveCount(0)
        expect(await clips(page)).toBe(before)
    })

    test('arrangement edits are undoable', async ({ page }) => {
        await openSongView(page)
        const before = await clips(page)
        await page.locator('.sa-clip[data-pattern="funkfill"][data-start-bar="11"]').click({ button: 'right' })
        await page.locator('.pp-context-menu-item', { hasText: 'Delete' }).click()
        await expect.poll(() => clips(page)).toBe(before - 1)

        await page.evaluate(() => window.__e2e.serviceRegistry.history.undo())
        await page.evaluate(() => window.__e2e.playbackEvents.emit('patternStructureChange'))
        await page.waitForTimeout(300)

        expect(await clips(page)).toBe(before)
    })
})
