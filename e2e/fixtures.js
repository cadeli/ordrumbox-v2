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

/**
 * Boots the app past the welcome screen.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} [search] - query string to boot with, e.g. '?log=AutoAssign:info'
 * to watch a logger tag whose messages are silent at the default WARN level.
 * `page.reload()` keeps it, so the tag stays open across a reload.
 */
export async function bootApp(page, search = '') {
    await page.goto(`/${search}`)
    await page.locator('#waiting-screen-start-btn').click()
    await page.waitForFunction(() => window.__e2e?.ready === true, { timeout: 15_000 })
    await page.waitForSelector('#waiting-screen', { state: 'hidden' })
}

/**
 * Places a second clip on a measure of the selected arrangement, so two patterns
 * cover it, then asks the Song view to re-render.
 *
 * The demo arrangement stacks nothing — every one of its clips starts on its own
 * measure — so a test that needs several patterns on the same measure (layered
 * playback, one row per pattern) has to place the extra one itself. Without a
 * song loaded this is a no-op, so the caller asserts what it needs afterwards.
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} [measure] 0-based measure
 * @returns {Promise<string|null>} the pattern id placed, null when nothing was
 */
export async function stackClipOnMeasure(page, measure = 0) {
    return page.evaluate((startMeasure) => {
        const { appState, playbackEvents } = window.__e2e
        const song = appState.songs?.[0]
        if (!song) return null
        // a pattern the arrangement does not place yet: its row appears with the clip
        const free = appState.patterns.find((p) => !song.clips.some((c) => c.pattern === p.id))
        if (!free) return null
        song.clips.push({ pattern: free.id, startMeasure, measureCount: 1 })
        playbackEvents.emit('patternStructureChange')
        return free.id
    }, measure)
}
