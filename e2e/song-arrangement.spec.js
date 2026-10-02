// e2e/song-arrangement.spec.js
//
// The arrangement grid in the Song view: song.json carries a `songs` array of
// clips, and the grid draws them as one column per pattern, one row per
// measure, one rectangle per clip.
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

    test('a column per used pattern, not the whole library', async ({ page }) => {
        await openSongView(page)
        const { columns, usedPatterns, library } = await page.evaluate(() => {
            const song = window.__e2e.appState.songs[0]
            return {
                columns: document.querySelectorAll('.sa-col-head').length,
                usedPatterns: new Set(song.clips.map((c) => c.pattern)).size,
                library: window.__e2e.appState.patterns.length,
            }
        })
        expect(columns).toBe(usedPatterns)
        expect(columns).toBeLessThan(library)
    })

    test('a rectangle sits on the column of its pattern, at its start bar', async ({ page }) => {
        await openSongView(page)
        const geom = await page.evaluate(() => {
            const song = window.__e2e.appState.songs[0]
            const patterns = window.__e2e.appState.patterns
            // Columns follow the pattern library order, not the order the clips
            // happen to mention the patterns in.
            const used = [...new Set(song.clips.map((c) => c.pattern))]
            const columns = patterns.filter((p) => used.includes(p.id)).map((p) => p.id)
            // a clip that is not the first one, so the row offset is exercised
            const clip = song.clips.find((c) => c.startBar > 0)
            const el = document.querySelector(
                `.sa-clip[data-pattern="${clip.pattern}"][data-start-bar="${clip.startBar}"]`,
            )
            return {
                startBar: clip.startBar,
                col: columns.indexOf(clip.pattern),
                left: el.offsetLeft,
                top: el.offsetTop,
            }
        })
        // offsetLeft includes the 2px visual inset that .sa-clip carries in CSS
        // (jsdom reads style.left instead and would not see it).
        expect(geom.left).toBe(40 + geom.col * 74 + 2)
        expect(geom.top).toBe(44 + geom.startBar * 16)
    })

    // Overlapping clips on different patterns is the whole point of the feature.
    test('shows overlapping clips on separate columns', async ({ page }) => {
        await openSongView(page)
        const overlap = await page.evaluate(() => {
            const song = window.__e2e.appState.songs[0]
            const at0 = song.clips.filter((c) => c.startBar === 0)
            const els = [...document.querySelectorAll('.sa-clip[data-start-bar="0"]')]
            return { count: at0.length, rendered: els.length, lefts: els.map((e) => e.offsetLeft) }
        })
        expect(overlap.count).toBeGreaterThan(1)
        expect(overlap.rendered).toBe(overlap.count)
        expect(new Set(overlap.lefts).size).toBe(overlap.count)
    })

    test('the rectangle height encodes the clip duration', async ({ page }) => {
        await openSongView(page)
        const heights = await page.evaluate(() => {
            const song = window.__e2e.appState.songs[0]
            const clip = song.clips.find((c) => c.bars === 4)
            const el = document.querySelector(`.sa-clip[data-start-bar="${clip.startBar}"][data-bars="4"]`)
            return { h: el.offsetHeight, rows: 16 }
        })
        expect(heights.h).toBe(4 * heights.rows)
    })

    test('names the patterns in the column headers', async ({ page }) => {
        await openSongView(page)
        const names = await page.locator('.sa-col-head .sa-col-name').allTextContents()
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
