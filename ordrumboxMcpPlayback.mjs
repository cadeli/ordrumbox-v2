// Headless playback driver for the MCP server.
//
// The MCP process is plain Node: no Web Audio, no AudioWorklet, so it cannot
// sound a pattern by itself. "Playing" therefore means driving the real app in
// headless Chromium against the Vite dev server (http://localhost:3000) and
// reporting what the transport actually does — including how many notes were
// triggered, which is the proof that the pattern really plays.

import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '.')
const DEFAULT_APP_URL = 'http://localhost:3000'
const BOOT_TIMEOUT_MS = 20_000
const SERVER_START_TIMEOUT_MS = 40_000

export class PlaybackController {
    #playwright = null
    #appUrl
    #repoRoot
    #startServer
    #browser = null
    #page = null
    #server = null

    /**
     * @param {{ playwright?: any, appUrl?: string, repoRoot?: string, startServer?: boolean }} [options]
     * `playwright` is injectable so tests can drive the controller without a browser;
     * `startServer: false` skips the dev-server probe (tests).
     */
    constructor({ playwright = null, appUrl = DEFAULT_APP_URL, repoRoot = REPO_ROOT, startServer = true } = {}) {
        this.#playwright = playwright
        this.#appUrl = appUrl
        this.#repoRoot = repoRoot
        this.#startServer = startServer
        this.#browser = null
        this.#page = null
        this.#server = null
    }

    /** True once a browser page is booted on the app. */
    get isReady() {
        return this.#page !== null
    }

    async #loadPlaywright() {
        if (!this.#playwright) {
            const mod = await import('playwright')
            this.#playwright = mod.default ?? mod
        }
        return this.#playwright
    }

    async #probe(url) {
        try {
            return (await fetch(url, { signal: AbortSignal.timeout(1500) })).ok
        } catch {
            return false
        }
    }

    /** Start the Vite dev server when nothing answers on the app URL. */
    async #ensureServer() {
        if (!this.#startServer) return
        if (await this.#probe(this.#appUrl)) return
        const child = spawn('npm', ['run', 'dev'], { cwd: this.#repoRoot, stdio: 'ignore' })
        this.#server = child
        const deadline = Date.now() + SERVER_START_TIMEOUT_MS
        while (Date.now() < deadline) {
            if (await this.#probe(this.#appUrl)) return
            await new Promise((resolve) => setTimeout(resolve, 500))
        }
        throw new Error(`Dev server did not come up at ${this.#appUrl}`)
    }

    /** Launch Chromium and boot the app once; the page is reused across calls. */
    async #boot() {
        if (this.#page) {
            const ready = await this.#page.evaluate(() => !!globalThis.__e2e?.ready).catch(() => false)
            if (ready) return this.#page
            this.#page = null
        }
        const playwright = await this.#loadPlaywright()
        this.#browser ??= await playwright.chromium.launch({
            headless: true,
            args: ['--autoplay-policy=no-user-gesture-required'],
        })
        const context = await this.#browser.newContext()
        const page = await context.newPage()
        await page.goto(this.#appUrl, { waitUntil: 'domcontentloaded' })
        await page.locator('#waiting-screen-start-btn').click()
        await page.waitForFunction(() => globalThis.__e2e?.ready === true, null, { timeout: BOOT_TIMEOUT_MS })
        await page.waitForSelector('#waiting-screen', { state: 'hidden' })
        this.#page = page
        return page
    }

    async #isRunning(page) {
        return page.evaluate(() => !!globalThis.__e2e?.serviceRegistry?.transport?.isRunning)
    }

    /** Count NOTE_TRIGGER events so a call can prove the pattern was heard. */
    async #armCounter(page) {
        await page.evaluate(() => {
            if (globalThis.__mcpTriggerCount === undefined) {
                globalThis.__mcpTriggerCount = 0
                globalThis.__e2e.playbackEvents.on('noteTrigger', () => globalThis.__mcpTriggerCount++)
            }
            globalThis.__mcpTriggerCount = 0
        })
    }

    async #status(page) {
        return page.evaluate(() => {
            const { appState, serviceRegistry } = globalThis.__e2e
            const pattern = appState.selectedPattern
            return {
                playing: !!serviceRegistry.transport?.isRunning,
                audioContextState: serviceRegistry.audioCtx?.state ?? null,
                pattern: pattern?.name ?? null,
                bpm: pattern?.bpm ?? null,
                beatCount: pattern?.beatCount ?? null,
                tracks: pattern?.tracks?.length ?? 0,
                triggeredNotes: globalThis.__mcpTriggerCount ?? 0,
            }
        })
    }

    /** Select a pattern inside the running app (auto-assigns its sounds). */
    async selectPattern(patternName) {
        const page = await this.#boot()
        return page.evaluate(async (name) => {
            const { appState, serviceRegistry } = globalThis.__e2e
            const wanted = String(name).toUpperCase()
            const index = appState.patterns.findIndex((p) => p?.name?.toUpperCase() === wanted)
            if (index < 0) throw new Error(`Pattern not found: ${name}`)
            await serviceRegistry.cmd.setSelectedPatternIdx(index)
            const pattern = appState.selectedPattern
            return {
                index,
                name: pattern.name,
                bpm: pattern.bpm,
                beatCount: pattern.beatCount,
                tracks: pattern.tracks.length,
            }
        }, patternName)
    }

    /**
     * Start the transport on the app and report what it plays.
     * @param {{ patternName?: string, seconds?: number }} [options]
     * `seconds` is how long to listen before reporting (0 = start and return).
     */
    async play({ patternName, seconds = 2 } = {}) {
        await this.#ensureServer()
        const page = await this.#boot()
        if (patternName) await this.selectPattern(patternName)
        await this.#armCounter(page)
        if (!(await this.#isRunning(page))) {
            await page.locator('.tb-start').click()
        }
        if (seconds > 0) await page.waitForTimeout(seconds * 1000)
        const status = await this.#status(page)
        return { ...status, listenedSeconds: seconds > 0 ? seconds : 0 }
    }

    async stop() {
        if (!this.#page) return { playing: false, reason: 'no active playback session' }
        const page = this.#page
        if (await this.#isRunning(page)) {
            await page.locator('.tb-start').click()
            await page.waitForTimeout(250)
        }
        return this.#status(page)
    }

    /** Close the browser; the spawned dev server is left running for the user. */
    async dispose() {
        if (this.#browser) await this.#browser.close().catch(() => {})
        this.#browser = null
        this.#page = null
        if (this.#server) this.#server.kill()
    }
}
