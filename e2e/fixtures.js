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
