// e2e/fixtures.js
// Shared boot helper used by all specs.
//
// The app has a welcome screen ("Start orDrumbox V2", #waiting-screen-start-btn)
// that gates the main module load behind a real user gesture (see index.html).
// Clicking it triggers the import of src/main.js.
//
// main.js exposes window.__e2e = { ready, appState, serviceRegistry, soundRegistry,
// playbackEvents } once boot completes — that is the hook we use to wait for
// loading to finish and to read the actual AudioContext state.

export async function bootApp(page) {
    await page.goto('/')
    await page.locator('#waiting-screen-start-btn').click()
    await page.waitForFunction(() => window.__e2e?.ready === true, { timeout: 15_000 })
    await page.waitForSelector('#waiting-screen', { state: 'hidden' })
}

export function audioContextState(page) {
    return page.evaluate(() => window.__e2e?.serviceRegistry?.audioCtx?.state ?? null)
}

/**
 * Places a second clip on a measure of the selected arrangement, so two patterns
 * cover it, then asks the Song view to re-render.
 *
 * The demo arrangement stacks nothing — every one of its clips starts on its own
 * measure — so a test that needs several patterns on the same bar (layered
 * playback, one row per pattern) has to place the extra one itself. Without a
 * song loaded this is a no-op, so the caller asserts what it needs afterwards.
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} [bar] 0-based measure
 * @returns {Promise<string|null>} the pattern id placed, null when nothing was
 */
export async function stackClipOnBar(page, bar = 0) {
    return page.evaluate((startBar) => {
        const { appState, playbackEvents } = window.__e2e
        const song = appState.songs?.[0]
        if (!song) return null
        // a pattern the arrangement does not place yet: its row appears with the clip
        const free = appState.patterns.find((p) => !song.clips.some((c) => c.pattern === p.id))
        if (!free) return null
        song.clips.push({ pattern: free.id, startBar, bars: 1 })
        playbackEvents.emit('patternStructureChange')
        return free.id
    }, bar)
}
