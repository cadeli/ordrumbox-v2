// e2e/helpers/ui_session.js
// Shared helpers to drive the app UI from Playwright specs:
// dialog queueing (knob numeric prompts), model snapshots, exporter runs
// and snapshot diffing for persistence assertions.

import { expect } from '@playwright/test'
import { NOTE_DEFAULTS } from '../../src/core/note_schema.js'

/**
 * Attaches a page dialog handler backed by a FIFO queue.
 * Push the answer BEFORE triggering the prompt()/confirm() action.
 * A dialog with an empty queue is dismissed, so a stray prompt cannot
 * swallow the answer meant for a later action.
 */
export function installDialogHandler(page) {
    const queue = []
    page.on('dialog', (dialog) => {
        const value = queue.shift()
        if (value === undefined) {
            void dialog.dismiss()
        } else {
            void dialog.accept(String(value))
        }
    })
    return { queue }
}

/**
 * Opens a knob numeric prompt (right click on the OrKnob) and accepts `value`.
 * The prompt clamps to the knob min/max/step grid.
 * Fails if the prompt never opens, so the queue cannot desync.
 */
export async function knobSet(dialogs, scope, key, value) {
    dialogs.queue.push(value)
    const queued = dialogs.queue.length
    await scope.locator(`.or-knob[data-or-knob="${key}"]`).first().click({ button: 'right' })
    await expect.poll(() => dialogs.queue.length).toBe(queued - 1)
}

/** Fills an input (range/text) locator with a stringified value. */
export async function fillInput(locator, value) {
    await locator.fill(String(value))
}

/** Track editor header — shows the currently bound track name. */
export function teHeader(page) {
    return page.locator('#te-panel .track-editor .ne-track')
}

/** Deep-cloned track from the selected pattern. */
export async function trackAt(page, idx) {
    return page.evaluate((trackIdx) => {
        const { appState } = window.__e2e
        const pattern = appState.patterns[appState.selectedPatternNum]
        const tracks = Array.isArray(pattern.tracks) ? pattern.tracks : Object.values(pattern.tracks ?? {})
        const track = tracks[trackIdx]
        return track ? JSON.parse(JSON.stringify(track)) : null
    }, idx)
}

/** Single track property (evaluate-serialized). */
export function trackField(page, idx, key) {
    return page.evaluate(
        ({ trackIdx, field }) => {
            const { appState } = window.__e2e
            const pattern = appState.patterns[appState.selectedPatternNum]
            const tracks = Array.isArray(pattern.tracks) ? pattern.tracks : Object.values(pattern.tracks ?? {})
            return tracks[trackIdx]?.[field]
        },
        { trackIdx: idx, field: key },
    )
}

/** Single LFO sub-value, e.g. lfoField(page, 0, 'velocityLfo', 'min'). */
export function lfoField(page, idx, lfoKey, field) {
    return page.evaluate(
        ({ trackIdx, lfo, sub }) => {
            const { appState } = window.__e2e
            const pattern = appState.patterns[appState.selectedPatternNum]
            const tracks = Array.isArray(pattern.tracks) ? pattern.tracks : Object.values(pattern.tracks ?? {})
            return tracks[trackIdx]?.[lfo]?.[sub]
        },
        { trackIdx: idx, lfo: lfoKey, sub: field },
    )
}

/** Single nested value inside a generated (synth) sound. */
export function synthField(page, soundKey, ...path) {
    return page.evaluate(
        ({ key, segments }) => {
            const { soundRegistry } = window.__e2e
            let value = soundRegistry.generatedSounds?.[key]
            for (const segment of segments) value = value?.[segment]
            return value
        },
        { key: soundKey, segments: path },
    )
}

/**
 * Polls a numeric value. Default precision 2 (tolerance 0.005) absorbs
 * prompt step-grid snapping such as 4.5 -> 4.497 on a 0.707-based grid.
 */
export async function expectNum(getter, expected, precision = 2) {
    await expect
        .poll(async () => {
            const value = await getter()
            return typeof value === 'number' ? value : Number.NaN
        })
        .toBeCloseTo(expected, precision)
}

/** Aligns a fraction of [min..max] to the step grid (used for LFO min/max). */
export function alignedRange(min, max, step, fraction) {
    const target = min + (max - min) * fraction
    const aligned = min + Math.round((target - min) / step) * step
    return Number(aligned.toFixed(6))
}

/** Polls a non-numeric value (string/boolean) with strict equality. */
export async function expectVal(getter, expected) {
    await expect.poll(getter).toBe(expected)
}

/** Deep JSON snapshot of everything that must survive a reload. */
export async function snapshotState(page) {
    return page.evaluate(() => {
        const { appState, soundRegistry } = window.__e2e
        return JSON.parse(
            JSON.stringify({
                patterns: appState.patterns,
                selectedPatternNum: appState.selectedPatternNum,
                selectedDrumkitNum: appState.selectedDrumkitNum,
                bass1: soundRegistry.generatedSounds['BASS1'] ?? null,
            }),
        )
    })
}

/** Runs PatternExporter.export() on patterns[idx] inside the page. */
export async function exportPatternAt(page, idx) {
    return page.evaluate(async (patternIdx) => {
        const { PatternExporter } = await import('/src/patterns/exporter.js')
        const { appState } = window.__e2e
        return PatternExporter.export(appState.patterns[patternIdx])
    }, idx)
}

/**
 * Triggers the debounced pattern write (resourcesLoader.persistPatterns,
 * 500ms debounce) and waits until IndexedDB actually holds the in-memory
 * state. Compares content instead of sleeping: the test only continues once
 * what it is about to snapshot is exactly what a reload would read back.
 */
export async function waitForPatternsPersisted(page) {
    await page.evaluate(() => window.__e2e.serviceRegistry.resourcesLoader.persistPatterns())
    await expect
        .poll(
            () =>
                page.evaluate(async () => {
                    const { getCachedPatterns } = await import('/src/cache/idb_cache.js')
                    const cached = await getCachedPatterns()
                    const { appState } = window.__e2e
                    const expected = { infos: appState.songInfos ?? {}, patterns: appState.patterns }
                    return JSON.stringify(cached ?? null) === JSON.stringify(expected)
                }),
            { timeout: 15_000 },
        )
        .toBe(true)
}

/**
 * Waits until generatedSounds[key] is stored in IndexedDB. Synth commits are
 * fire-and-forget (preset_section.js _persist()), so there is no event to
 * await — polling the stored value is the only deterministic signal.
 * Returns false while the sound does not exist yet, so a missing sound fails
 * instead of passing vacuously.
 */
export async function waitForSynthSoundPersisted(page, key) {
    await expect
        .poll(
            () =>
                page.evaluate(async (soundKey) => {
                    const { getCachedGeneratedSounds } = await import('/src/cache/idb_cache.js')
                    const disk = (await getCachedGeneratedSounds())?.[soundKey] ?? null
                    const memory = window.__e2e.soundRegistry.generatedSounds?.[soundKey] ?? null
                    if (!memory) return false
                    return JSON.stringify(disk) === JSON.stringify(memory)
                }, key),
            { timeout: 15_000 },
        )
        .toBe(true)
}

/**
 * Waits until every sample referenced by a pattern's tracks is present in the
 * registry. Samples can belong to any drumkit (explicit assignments survive
 * kit switches), and after a reload the boot loads them on demand — the load
 * is fire-and-forget from the UI point of view, so polling is the only
 * deterministic signal. Tracks without a concrete sound (NOT_DEFINED) and
 * synth tracks (generatedSounds) are skipped.
 */
export async function waitForPatternSoundsLoaded(page, patternIdx) {
    await expect
        .poll(
            () =>
                page.evaluate((idx) => {
                    const { appState, soundRegistry } = window.__e2e
                    const pattern = appState.patterns[idx]
                    const missing = []
                    for (const track of Object.values(pattern?.tracks ?? {})) {
                        const soundId = track?.soundId
                        if (!soundId || soundId === 'NOT_DEFINED') continue
                        if (soundRegistry.sounds?.[soundId]?.buffer) continue
                        if (soundRegistry.generatedSounds?.[soundId]) continue
                        missing.push(soundId)
                    }
                    return missing
                }, patternIdx),
            { timeout: 30_000 },
        )
        .toEqual([])
}

/**
 * Fields that cannot be compared between two exports taken at different
 * moments, for three documented reasons:
 *
 *  1. track.pan is rewritten from PAN_MAP on every load (patterns/fixer.js)
 *     and track.soundId of an auto track is discarded on load
 *     (loader/resources_loader.js) then re-derived by the boot auto-assign;
 *  2. prob/rate/retriggerNum/euclidianFill are re-randomized in place by
 *     TrackVariation.applyNoteVariation (patterns/variation.js) on every
 *     flat-notes computation while track.variation2 > 0;
 *  3. arpRange/_arpScale/_arpType live on the note root but are absent from
 *     NOTE_KEY_ORDER (core/note_schema.js), so PatternExporter drops them
 *     from the JSON file.
 *
 * Exported patterns use the compact note format (arrays + track.noteKeys),
 * so notes are decoded to objects before the fields are removed.
 */
export function stripForComparison(data) {
    const clone = structuredClone(data)
    const noteKeys = [...VOLATILE_NOTE_KEYS, ...EXPORT_DROPPED_NOTE_KEYS]
    const tracks = Array.isArray(clone.tracks) ? clone.tracks : Object.values(clone.tracks ?? {})
    for (const track of tracks) {
        delete track.pan
        delete track.soundId
        const keys = Array.isArray(track.noteKeys) ? track.noteKeys : null
        const notes = Array.isArray(track.notes) ? track.notes : Object.values(track.notes ?? {})
        track.notes = notes.map((note) => {
            const decoded =
                Array.isArray(note) && keys
                    ? Object.fromEntries(keys.slice(0, note.length).map((key, i) => [key, note[i]]))
                    : { ...note }
            for (const key of noteKeys) delete decoded[key]
            // canonical form: a key equal to its default is indistinguishable
            // from an omitted one in the compact encoding
            for (const [key, val] of Object.entries(decoded)) {
                if (key in NOTE_DEFAULTS && val === NOTE_DEFAULTS[key]) delete decoded[key]
            }
            return decoded
        })
        // noteKeys is derived from the values that are stripped above
        delete track.noteKeys
    }
    return clone
}

/**
 * Note fields rewritten in place by TrackVariation.applyNoteVariation()
 * (src/patterns/variation.js) every time flat notes are recomputed while
 * track.variation2 > 0: re-randomized on each computation.
 */
export const VOLATILE_NOTE_KEYS = ['prob', 'rate', 'retriggerNum', 'euclidianFill']

/**
 * ARP tab state kept on the note root but absent from NOTE_KEY_ORDER
 * (src/core/note_schema.js): PatternExporter drops them from the JSON file
 * while a raw IndexedDB reload keeps them.
 */
export const EXPORT_DROPPED_NOTE_KEYS = ['arpRange', '_arpScale', '_arpType']

/** Collects JSON-level mismatches for a key list. */
export function diffByKey(expected, actual, keys, path, problems = []) {
    for (const key of keys) {
        const e = JSON.stringify(expected?.[key])
        const a = JSON.stringify(actual?.[key])
        if (e !== a) problems.push(`${path}.${key}: ${e} => ${a}`)
    }
    return problems
}

/** Tracks of a pattern snapshot (array or object keyed form). */
export function tracksOf(pattern) {
    if (!pattern) return []
    return Array.isArray(pattern.tracks) ? pattern.tracks : Object.values(pattern.tracks ?? {})
}

/** Collects track and note mismatches between two pattern snapshots. */
export function diffPatterns(expectedPattern, actualPattern, { trackKeys, noteKeys }) {
    const problems = []
    const expectedTracks = tracksOf(expectedPattern)
    const actualTracks = tracksOf(actualPattern)
    if (expectedTracks.length !== actualTracks.length) {
        problems.push(`track count: ${expectedTracks.length} => ${actualTracks.length}`)
        return problems
    }
    expectedTracks.forEach((expectedTrack, i) => {
        const actualTrack = actualTracks[i]
        diffByKey(expectedTrack, actualTrack, trackKeys, `track[${i}]`, problems)
        const expectedNotes = expectedTrack.notes ?? []
        const actualNotes = actualTrack.notes ?? []
        if (expectedNotes.length !== actualNotes.length) {
            problems.push(`track[${i}] note count: ${expectedNotes.length} => ${actualNotes.length}`)
            return
        }
        expectedNotes.forEach((expectedNote, j) => {
            diffByKey(expectedNote, actualNotes[j], noteKeys, `track[${i}].note[${j}]`, problems)
        })
    })
    return problems
}
