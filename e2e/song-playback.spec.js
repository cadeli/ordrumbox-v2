// e2e/song-playback.spec.js
//
// Playback follows the visible view: the Song view plays the arrangement
// (every clip covering the current measure, layered), any other view keeps looping
// the selected pattern.
//
// Live audio is not observable in headless Chromium, so layering is asserted by
// which patterns the player asks the engine to resolve — the step that decides
// how many patterns sound on a tick.

import { test, expect } from '@playwright/test'
import { bootApp, stackClipOnMeasure } from './fixtures.js'

/**
 * Records which patterns the engine resolves flat notes for.
 *
 * Patches the engine INSTANCE, not the prototype: the player receives
 * `getFlatNotesForPattern` as an arrow closure over the instance at
 * construction, so replacing the prototype afterwards is never seen.
 */
async function spyOnFlatNotes(page) {
    await page.evaluate(() => {
        const engine = window.__e2e.serviceRegistry.audioEngine
        window.__resolved = []
        if (!engine.__spied) {
            const origSong = engine.getFlatNotesForPattern.bind(engine)
            engine.getFlatNotesForPattern = (pattern, loop) => {
                window.__resolved.push(pattern?.id ?? null)
                return origSong(pattern, loop)
            }
            const origPattern = engine.getFlatNotesForCurrentPattern.bind(engine)
            engine.getFlatNotesForCurrentPattern = (loop) => {
                window.__resolved.push('@current')
                return origPattern(loop)
            }
            engine.__spied = true
        }
    })
}

const resolvedPatterns = (page) => page.evaluate(() => [...new Set(window.__resolved)])
const mode = (page) =>
    page.evaluate(() => {
        const p = window.__e2e.serviceRegistry.audioEngine?.player
        return {
            view: window.__e2e.appState.currentView,
            songMode: p?.isSongMode ?? null,
            tempo: p?.getSongTempo?.() ?? null,
        }
    })

/** Starts playback and waits for the engine (created lazily on first play). */
async function startPlayback(page) {
    await page.evaluate(() => window.__e2e.serviceRegistry.seq.toggleStartStop?.())
    await page.waitForFunction(() => !!window.__e2e.serviceRegistry.audioEngine?.player, { timeout: 20_000 })
}

test.describe('Song playback mode follows the visible view', () => {
    test('song view plays the arrangement at the song tempo', async ({ page }) => {
        await bootApp(page)
        await page.locator('.tb-view-btn[data-view="song"]').click()
        await startPlayback(page)
        await spyOnFlatNotes(page)
        await page.waitForTimeout(1200)

        const m = await mode(page)
        expect(m.view).toBe('song')
        expect(m.songMode).toBe(true)
        expect(m.tempo).toBe(120) // the arrangement's bpm, not a pattern's

        await page.evaluate(() => window.__e2e.serviceRegistry.seq.toggleStartStop?.())
    })

    test('switching to proll or grid returns to looping the selected pattern', async ({ page }) => {
        await bootApp(page)
        await page.locator('.tb-view-btn[data-view="song"]').click()
        await startPlayback(page)
        await spyOnFlatNotes(page)

        for (const view of ['proll', 'edit', 'synth']) {
            await page.locator(`.tb-view-btn[data-view="${view}"]`).click()
            await page.waitForTimeout(400)
            const m = await mode(page)
            expect(m.view, view).toBe(view)
            expect(m.songMode, `${view} must loop the pattern`).toBe(false)
            expect(m.tempo, `${view} has no arrangement tempo`).toBeNull()
        }

        await page.evaluate(() => window.__e2e.serviceRegistry.seq.toggleStartStop?.())
    })

    test('in song mode the transport advances through the arrangement', async ({ page }) => {
        await bootApp(page)
        await page.locator('.tb-view-btn[data-view="song"]').click()
        await startPlayback(page)

        const measure = () => page.evaluate(() => window.__e2e.serviceRegistry.audioEngine.player.currentSongMeasure)
        const first = await measure()
        await page.waitForTimeout(1200)
        const later = await measure()

        expect(later).toBeGreaterThan(first)
        await page.evaluate(() => window.__e2e.serviceRegistry.seq.toggleStartStop?.())
    })

    // The demo arrangement stacks nothing, so a second clip is placed on measure 0
    // first: this is about the resolver layering, not about the demo song.
    test('overlapping clips are resolved together, not one after the other', async ({ page }) => {
        await bootApp(page)
        await page.locator('.tb-view-btn[data-view="song"]').click()
        await stackClipOnMeasure(page, 0)
        await startPlayback(page)
        await spyOnFlatNotes(page)
        await page.waitForTimeout(600)

        const patterns = await resolvedPatterns(page)
        const expected = await page.evaluate(() => {
            const song = window.__e2e.appState.songs[0]
            return [...new Set(song.clips.filter((c) => c.startMeasure === 0).map((c) => c.pattern))]
        })
        expect(expected.length).toBeGreaterThan(1)
        for (const id of expected) {
            expect(patterns, `${id} must sound with the others`).toContain(id)
        }

        await page.evaluate(() => window.__e2e.serviceRegistry.seq.toggleStartStop?.())
    })

    // Pattern mode goes through the single-pattern resolver and never asks for
    // a per-pattern map, which is what keeps it from layering.
    test('pattern mode uses the single-pattern resolver, never the song one', async ({ page }) => {
        await bootApp(page)
        await startPlayback(page)
        await spyOnFlatNotes(page)
        await page.waitForTimeout(700)

        const patterns = await resolvedPatterns(page)
        expect(patterns.length).toBeGreaterThan(0)
        expect(new Set(patterns)).toEqual(new Set(['@current']))

        await page.evaluate(() => window.__e2e.serviceRegistry.seq.toggleStartStop?.())
    })

    // Regression: the sequencer only ever auto-assigned the *selected* pattern,
    // so in song mode every other pattern the arrangement plays kept
    // sampleId 'NOT_DEFINED' and no voice could be built (silent playback, plus
    // a "VoiceFactory: No soundBuffer" warning per track).
    test('starting in song mode makes every pattern it plays audible', async ({ page }) => {
        const noBuffer = []
        page.on('console', (m) => {
            if (m.text().includes('No soundBuffer')) noBuffer.push(m.text())
        })
        await bootApp(page)
        await page.locator('.tb-view-btn[data-view="song"]').click()
        await startPlayback(page)
        await page.waitForTimeout(1200)

        const broken = await page.evaluate(() => {
            const { appState, soundRegistry } = window.__e2e
            const patternsById = new Map(appState.patterns.map((p) => [p.id, p]))
            const ids = [...new Set(appState.songs[0].clips.map((c) => c.pattern))]
            return ids
                .map((id) => {
                    const pattern = patternsById.get(id)
                    const tracks = Object.values(pattern?.tracks ?? {})
                    const silent = tracks.filter(
                        (t) => !t.useSoftSynth && !t.synthSoundKey && !soundRegistry.sounds?.[t.sampleId]?.buffer,
                    )
                    return { id, total: tracks.length, silent: silent.map((t) => t.name) }
                })
                .filter((r) => r.silent.length > 0)
        })

        expect(broken, 'every pattern the song plays must have a loaded sample').toEqual([])
        expect(noBuffer, 'no track should fail to find its sample buffer').toEqual([])

        await page.evaluate(() => window.__e2e.serviceRegistry.seq.toggleStartStop?.())
    })
})
