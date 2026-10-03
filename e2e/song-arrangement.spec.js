// e2e/song-arrangement.spec.js
//
// The arrangement grid in the Song view: song.json carries a `songs` array of
// clips, and the grid draws them the way a DAW arrangement view does — time
// left to right on X (a ruler, one cell per measure), one row per pattern named
// in a frozen first column, one rectangle per clip whose width is its duration.
//
// Playback of an arrangement runs from the transport: clicking a measure in the
// ruler aims the cursor, which is where the next play starts.

import { test, expect } from '@playwright/test'
import { bootApp, stackClipOnBar } from './fixtures.js'
import { BAR_WIDTH, CLIP_INSET, ROW_HEIGHT } from '../src/ui/song_panel/layout.js'
import { BEATS_PER_BAR } from '../src/model/song_schema.js'
import { TICK } from '../src/core/constants.js'

/** ticks in one measure: X is time, one measure per BAR_WIDTH px */
const BAR_TICKS = TICK * BEATS_PER_BAR

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
        // X = time (one measure per BAR_WIDTH px), Y = pattern row
        expect(geom.leftInBody).toBe(geom.startBar * BAR_WIDTH)
        expect(geom.topInBody).toBe(geom.row * ROW_HEIGHT + CLIP_INSET / 2)
    })

    // Overlapping clips is the whole point of the feature: two patterns starting
    // on the same bar must sit on two rows at the same X position. The demo
    // arrangement stacks nothing, so the second clip is placed on the spot.
    test('shows overlapping clips on separate rows', async ({ page }) => {
        await openSongView(page)
        await stackClipOnBar(page, 0)

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
        // the spec's constants live in Node, so they cross the bridge as arguments
        const widths = await page.evaluate((bar) => {
            const song = window.__e2e.appState.songs[0]
            const clip = song.clips.find((c) => c.bars === 4)
            const el = document.querySelector(`.sa-clip[data-start-bar="${clip.startBar}"][data-bars="4"]`)
            return { w: Math.round(el.getBoundingClientRect().width), bar }
        }, BAR_WIDTH)
        // 4 bars minus the inset that separates neighbouring clips
        expect(widths.w).toBe(4 * widths.bar - CLIP_INSET)
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
 *   - on a pattern name → Add at bar N (place that pattern) / Delete row (every clip of it)
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
        // the demo arrangement's smrock clip: one bar long, on measure 4 (index 3)
        await page.locator('.sa-clip[data-pattern="smrock"][data-start-bar="3"]').click({ button: 'right' })
        await expect(page.locator('.cm-menu')).toBeVisible()
        await page.locator('.cm-menu-item', { hasText: 'Next' }).click()

        await expect.poll(() => clips(page)).toBe(before + 1)
        // so Next lands right after it, on measure 5
        expect(await clipsWhere(page, "c.pattern === 'smrock' && c.startBar === 4")).toBe(1)
    })

    test('on a clip: Delete removes just that clip', async ({ page }) => {
        await openSongView(page)
        const before = await clips(page)
        await page.locator('.sa-clip[data-pattern="funkfill"][data-start-bar="38"]').click({ button: 'right' })
        await page.locator('.cm-menu-item', { hasText: 'Delete' }).click()

        await expect.poll(() => clips(page)).toBe(before - 1)
        expect(await clipsWhere(page, "c.pattern === 'funkfill' && c.startBar === 38")).toBe(0)
    })

    // The loop is both the grid width and what playback loops over, so it
    // follows the clips instead of freezing at the length song.json declares.
    test('deleting the last clip shortens the arrangement', async ({ page }) => {
        await openSongView(page)
        const bars = () => page.evaluate(() => Number(document.getElementById('sa-list').dataset.totalBars))
        const last = await page.evaluate(() => window.__e2e.appState.songs[0].clips.at(-1))
        const before = last.startBar + last.bars
        expect(await bars()).toBe(before)

        await page
            .locator(`.sa-clip[data-pattern="${last.pattern}"][data-start-bar="${last.startBar}"]`)
            .click({ button: 'right' })
        await page.locator('.cm-menu-item', { hasText: 'Delete' }).click()

        await expect.poll(() => bars()).toBeLessThan(before)
        // the playback loop followed, not only the drawing
        expect(await page.evaluate(() => window.__e2e.appState.songs[0].loopBars)).toBe(await bars())
    })

    test('on a pattern name: Add at bar places that pattern in the arrangement', async ({ page }) => {
        await openSongView(page)
        const before = await clips(page)
        // a pattern that already has clips, so this adds a second placement
        // rather than the row's first
        await page.locator('.sa-row-name[data-pattern="cmpbeat"]').click({ button: 'right' })
        await expect(page.locator('.cm-menu-item', { hasText: 'Add at bar 1' })).toBeVisible()
        await page.locator('.cm-menu-item', { hasText: 'Add at bar 1' }).click()

        await expect.poll(() => clips(page)).toBe(before + 1)
        expect(await clipsWhere(page, "c.pattern === 'cmpbeat' && c.startBar === 0")).toBe(1)
    })

    // The name column is frozen: no measure sits under the pointer there, so the
    // item inserts at the cursor, wrapped on the arrangement loop.
    test('on a pattern name: the insert bar follows the transport', async ({ page }) => {
        await openSongView(page)
        await page.evaluate(
            (tick) => {
                window.__e2e.serviceRegistry.transport.tick = tick
            },
            4 * BAR_TICKS + 10,
        )
        await page.locator('.sa-row-name[data-pattern="funk"]').click({ button: 'right' })
        await expect(page.locator('.cm-menu-item', { hasText: 'Add at bar 5' })).toBeVisible()
        await page.locator('.cm-menu-item', { hasText: 'Add at bar 5' }).click()

        expect(await clipsWhere(page, "c.pattern === 'funk' && c.startBar === 4")).toBe(1)
    })

    // Same pattern => same length wherever it is placed, and adding must not
    // take away the removal entry.
    test('on a pattern name: Add reuses the pattern length and keeps Delete row', async ({ page }) => {
        await openSongView(page)
        const before = await clips(page)
        const barsOf = (page2, id) =>
            page2.evaluate((p) => window.__e2e.appState.songs[0].clips.find((c) => c.pattern === p)?.bars ?? null, id)
        const reference = await barsOf(page, 'cmpbeat')

        await page.locator('.sa-row-name[data-pattern="cmpbeat"]').click({ button: 'right' })
        await expect(page.locator('.cm-menu-item', { hasText: 'Add at bar' })).toBeVisible()
        await expect(page.locator('.cm-menu-item', { hasText: 'Delete row' })).toBeVisible()
        await page.locator('.cm-menu-item', { hasText: 'Add at bar 1' }).click()

        await expect.poll(() => clips(page)).toBe(before + 1)
        expect(await barsOf(page, 'cmpbeat')).toBe(reference)

        // and the removal entry still removes every clip of that pattern
        const ofPattern = await clipsWhere(page, "c.pattern === 'cmpbeat'")
        await page.locator('.sa-row-name[data-pattern="cmpbeat"]').click({ button: 'right' })
        await page.locator('.cm-menu-item', { hasText: 'Delete row' }).click()
        await expect.poll(() => clips(page)).toBe(before + 1 - ofPattern)
    })

    test('on a pattern name: Delete row removes every clip of that pattern', async ({ page }) => {
        await openSongView(page)
        const before = await clips(page)
        const ofPattern = await clipsWhere(page, "c.pattern === 'cmpbeat'")

        await page.locator('.sa-row-name[data-pattern="cmpbeat"]').click({ button: 'right' })
        await expect(page.locator('.cm-menu-item', { hasText: 'Delete row' })).toBeVisible()
        await page.locator('.cm-menu-item', { hasText: 'Delete row' }).click()

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
        await page.mouse.click(body.x + 1 * BAR_WIDTH + BAR_WIDTH / 2, body.y + 5 * ROW_HEIGHT + ROW_HEIGHT / 2, {
            button: 'right',
        })
        await expect(page.locator('.cm-menu-item', { hasText: 'Add here' })).toBeVisible()
        await page.locator('.cm-menu-item', { hasText: 'Add here' }).click()

        await expect.poll(() => clips(page)).toBe(before + 1)
        // cell 1 is bar 2 displayed, i.e. index 1
        expect(await clipsWhere(page, "c.pattern === 'funk' && c.startBar === 1")).toBe(1)
    })

    test('clicking a filled cell offers the clip menu, not Add here', async ({ page }) => {
        await openSongView(page)
        await page.locator('.sa-clip[data-pattern="smrock"][data-start-bar="3"]').click({ button: 'right' })
        await expect(page.locator('.cm-menu-item', { hasText: 'Add here' })).toHaveCount(0)
        await expect(page.locator('.cm-menu-item', { hasText: 'Delete' })).toBeVisible()
    })

    test('Escape closes the menu without changing anything', async ({ page }) => {
        await openSongView(page)
        const before = await clips(page)
        await page.locator('.sa-clip[data-pattern="smrock"][data-start-bar="3"]').click({ button: 'right' })
        await expect(page.locator('.cm-menu')).toBeVisible()
        await page.keyboard.press('Escape')
        await expect(page.locator('.cm-menu')).toHaveCount(0)
        expect(await clips(page)).toBe(before)
    })

    test('arrangement edits are undoable', async ({ page }) => {
        await openSongView(page)
        const before = await clips(page)
        await page.locator('.sa-clip[data-pattern="funkfill"][data-start-bar="38"]').click({ button: 'right' })
        await page.locator('.cm-menu-item', { hasText: 'Delete' }).click()
        await expect.poll(() => clips(page)).toBe(before - 1)

        await page.evaluate(() => window.__e2e.serviceRegistry.history.undo())
        await page.evaluate(() => window.__e2e.playbackEvents.emit('patternStructureChange'))
        await page.waitForTimeout(300)

        expect(await clips(page)).toBe(before)
    })
})

/**
 * The cursor: a line on the measure the arrangement is on. The transport keeps
 * counting past the end of the arrangement, so the cursor is also checked for
 * wrapping back inside the grid instead of running off it. While the transport is
 * stopped it marks where the next play starts — clicking a measure in the ruler
 * is what moves it.
 */
test.describe('Song arrangement cursor', () => {
    const head = (page) => page.locator('.sa-cursor')
    const px = (page) =>
        page.evaluate(() => {
            const el = document.querySelector('.sa-cursor')
            const m = /translateX\((-?[\d.]+)px\)/.exec(el?.style.transform ?? '')
            return m ? Number(m[1]) : null
        })
    const start = (page) => page.evaluate(() => window.__e2e.serviceRegistry.seq.toggleStartStop?.())

    const BAR = BAR_WIDTH

    test('rests on the first measure while the transport is stopped', async ({ page }) => {
        await openSongView(page)
        await expect(head(page)).toBeVisible()
        expect(await px(page)).toBe(0)
    })

    test('appears on play and advances with the transport', async ({ page }) => {
        await openSongView(page)
        await start(page)
        await expect(head(page)).toBeVisible()

        const first = await px(page)
        await page.waitForTimeout(900)
        const later = await px(page)
        expect(later).toBeGreaterThan(first)

        // stopping does not lose the cursor: it falls back on the marker, so the
        // next play starts where the user aimed it
        await start(page)
        await expect(head(page)).toBeVisible()
        expect(await px(page)).toBe(0)
    })

    // The ruler click: aim the cursor, then play from there.
    test('clicking a measure in the ruler aims the cursor there', async ({ page }) => {
        await openSongView(page)
        await page.locator('.sa-bar-head[data-bar="3"]').click()

        await expect(head(page)).toBeVisible()
        expect(await px(page)).toBe(3 * BAR)
        expect(await page.evaluate(() => window.__e2e.serviceRegistry.seq.songCursorBar)).toBe(3)
        // and the ruler says which measure that is
        await expect(page.locator('.sa-bar-head.sa-bar-current')).toHaveText('4')
    })

    test('play starts from the measure the cursor was put on', async ({ page }) => {
        await openSongView(page)
        await page.locator('.sa-bar-head[data-bar="3"]').click()
        await start(page)
        await expect(head(page)).toBeVisible()

        const first = await px(page)
        expect(first).toBeGreaterThanOrEqual(3 * BAR)
        expect(first).toBeLessThan(4 * BAR)

        await start(page)
    })

    // The cursor follows a click while playback runs, it is not a start-only
    // marker: the transport is re-anchored on the clicked measure.
    test('clicking the ruler while playing moves the playhead there', async ({ page }) => {
        await openSongView(page)
        await start(page)
        await expect(head(page)).toBeVisible()

        await page.locator('.sa-bar-head[data-bar="20"]').click()
        const jumped = await px(page)
        expect(jumped).toBeGreaterThanOrEqual(20 * BAR)
        expect(jumped).toBeLessThan(21 * BAR)
        expect(await page.evaluate(() => window.__e2e.serviceRegistry.seq.tick)).toBeGreaterThanOrEqual(20 * BAR_TICKS)

        await start(page)
    })

    // A left click on a clip edits nothing: the clips are right-click only, so a
    // stray selection cannot re-aim playback.
    test('a click on a clip leaves the cursor alone', async ({ page }) => {
        await openSongView(page)
        await page.locator('.sa-clip[data-pattern="smrock"][data-start-bar="3"]').click()
        expect(await page.evaluate(() => window.__e2e.serviceRegistry.seq.songCursorBar)).toBe(0)
        expect(await px(page)).toBe(0)
    })

    // The sequencer derives transport.tick from the audio clock and overwrites
    // it, so a fixed tick cannot be forced while playing: the cursor is checked
    // against the tick that is live, instead.
    test('marks the measure the transport is on', async ({ page }) => {
        await openSongView(page)
        await start(page)
        await expect(head(page)).toBeVisible()

        const { px, tick, loopBars } = await page.evaluate(() => ({
            px: Number(/translateX\((-?[\d.]+)px\)/.exec(document.querySelector('.sa-cursor').style.transform)?.[1]),
            tick: window.__e2e.serviceRegistry.seq.tick,
            loopBars: window.__e2e.appState.songs[0].loopBars,
        }))
        // one cell is BAR_WIDTH px, one bar is BAR_TICKS ticks
        expect(px).toBeCloseTo((((tick / BAR_TICKS) % loopBars) * BAR_WIDTH) % BAR_WIDTH, 0)
        // The cursor is painted in a rAF while `tick` is read live, so the two can
        // be a frame apart: tolerate one CELL of lag, not one pixel (1px was ~330ms
        // of drift at 120bpm and only passed on a quiet machine).
        const lagBars = Math.abs(px - (tick / BAR_TICKS) * BAR_WIDTH) / BAR_WIDTH
        expect(lagBars).toBeLessThan(1)
    })

    test('wraps back inside the grid instead of running off the end', async ({ page }) => {
        await openSongView(page)
        // a 2-bar loop makes the wrap observable in a few seconds; the grid keeps
        // the demo arrangement's own width
        await page.evaluate(() => (window.__e2e.appState.songs[0].loopBars = 2))
        await start(page)
        await expect(head(page)).toBeVisible()

        // the cursor is only painted once the loop runs, so the first sample can
        // still be unpainted
        const seen = []
        for (let i = 0; i < 22; i++) {
            const value = await px(page)
            if (value !== null) seen.push(value)
            await page.waitForTimeout(250)
        }
        await start(page)

        // never past the loop, it comes back near its start...
        expect(Math.max(...seen)).toBeLessThanOrEqual(2 * BAR_WIDTH)
        expect(Math.min(...seen)).toBeLessThan(BAR_WIDTH)
        // ...so the cursor went backwards at least once instead of only creeping
        // right for the whole sample window
        expect(seen.some((value, i) => i > 0 && value < seen[i - 1])).toBe(true)
    })

    test('does not run a loop after leaving the view', async ({ page }) => {
        await openSongView(page)
        await start(page)
        await expect(head(page)).toBeVisible()

        await page.locator('.tb-view-btn[data-view="edit"]').click()
        await page.waitForTimeout(600)
        // transport still running, but the hidden panel must not keep painting
        await expect(head(page)).toBeHidden()

        await start(page)
    })
})

/**
 * The library list on the left holds every pattern, so it is the only place
 * that can bring in a pattern the arrangement does not use yet.
 */
test.describe('Song pattern list context menu', () => {
    const clips = (page) => page.evaluate(() => window.__e2e.appState.songs[0].clips.length)
    const clipsOf = (page, id) =>
        page.evaluate((p) => window.__e2e.appState.songs[0].clips.filter((c) => c.pattern === p).length, id)

    /** A library pattern the demo arrangement never places. */
    const UNUSED = 'hard'

    test('on a library pattern: Add at bar places it in the arrangement', async ({ page }) => {
        await openSongView(page)
        expect(await clipsOf(page, UNUSED)).toBe(0)
        const before = await clips(page)

        await page.locator(`.sg-item[data-pattern="${UNUSED}"]`).click({ button: 'right' })
        await expect(page.locator('.cm-menu-item', { hasText: 'Add at bar 1' })).toBeVisible()
        await page.locator('.cm-menu-item', { hasText: 'Add at bar 1' }).click()

        await expect.poll(() => clips(page)).toBe(before + 1)
        expect(await clipsOf(page, UNUSED)).toBe(1)
        // and it now has a row in the grid, since the grid follows the clips
        await expect(page.locator(`.sa-row-name[data-pattern="${UNUSED}"]`)).toHaveCount(1)
    })

    // Transport stopped: nothing overwrites the tick, so the bar is exact.
    test('inserts at the measure the transport is on', async ({ page }) => {
        await openSongView(page)
        await page.evaluate((t) => (window.__e2e.serviceRegistry.transport.tick = t), 3 * BAR_TICKS + 5)
        await page.locator(`.sg-item[data-pattern="${UNUSED}"]`).click({ button: 'right' })

        await expect(page.locator('.cm-menu-item', { hasText: 'Add at bar 4' })).toBeVisible()
        await page.locator('.cm-menu-item', { hasText: 'Add at bar 4' }).click()
        expect(
            await page.evaluate(
                () => window.__e2e.appState.songs[0].clips.filter((c) => c.pattern === 'hard')[0]?.startBar,
            ),
        ).toBe(3)
    })

    // A pattern already in the arrangement gets a second placement, not a no-op.
    test('works for a pattern the arrangement already uses', async ({ page }) => {
        await openSongView(page)
        const before = await clipsOf(page, 'funk')
        await page.locator('.sg-item[data-pattern="funk"]').click({ button: 'right' })
        await page.locator('.cm-menu-item', { hasText: 'Add at bar 1' }).click()

        await expect.poll(() => clipsOf(page, 'funk')).toBe(before + 1)
    })

    test('every library entry can be added', async ({ page }) => {
        await openSongView(page)
        const ids = await page.evaluate(() =>
            [...document.querySelectorAll('.sg-item[data-pattern]')].map((el) => el.dataset.pattern),
        )
        expect(ids.length).toBeGreaterThan(8)
        // rows only exist for patterns the arrangement uses, so the list is the
        // only source for the rest
        const unused = await page.evaluate(
            (used) => used.filter((id) => !document.querySelector(`.sa-row-name[data-pattern="${id}"]`)),
            ids,
        )
        expect(unused.length).toBeGreaterThan(0)

        for (const id of unused.slice(0, 3)) {
            await page.locator(`.sg-item[data-pattern="${id}"]`).click({ button: 'right' })
            await expect(page.locator('.cm-menu-item', { hasText: 'Add at bar' })).toBeVisible()
            await page.keyboard.press('Escape')
        }
    })

    test('left-click still selects the pattern', async ({ page }) => {
        await openSongView(page)
        await page.locator(`.sg-item[data-pattern="${UNUSED}"]`).click()
        await expect(page.locator('.sg-item.sg-selected')).toHaveCount(1)
        expect(await page.evaluate(() => window.__e2e.appState.selectedPatternIdx)).toBe(
            await page.evaluate((id) => window.__e2e.appState.patterns.findIndex((p) => p.id === id), UNUSED),
        )
    })
})
