// e2e/gen-sliders.spec.js
//
// One test per generation slider, asserting its own effect on the notes the
// engine actually produces. pattern-lifecycle only proves the sliders WRITE to
// the model, and auto-generation only proves notes APPEAR — neither would catch
// a slider that stores its value and shapes nothing.
//
// Two techniques keep the random draws honest without stubbing Math.random:
//   - isolate: every op gate except the one under test is closed through the
//     model, so the whole variation budget lands on that single effect;
//   - roll N times and assert a one-sided invariant against the SOURCE notes —
//     at 0 the effect must NEVER appear, at 100 it must appear at least once.
//     The variation budget is deliberately small (2-3 notes), so "at least
//     once" needs many rolls.
//
// The slider under test always goes through its real control; the isolation
// writes are test plumbing, not the subject.

import { test, expect } from '@playwright/test'
import { bootApp } from './fixtures.js'
import { fillInput } from './helpers/ui_session.js'

const ROLLS = 24
// The bass generator is async and the app boots with a large persisted
// library, so the track poll needs more headroom than a plain UI action.
const GEN = { timeout: 30_000 }

/** Re-rolls the projection `rolls` times and pools every note it produced. */
const rollMany = async (page, trackIdx, rolls = ROLLS) =>
    page.evaluate(
        ({ trackIdx, rolls }) => {
            const { appState, serviceRegistry } = window.__e2e
            const pattern = appState.patterns[appState.selectedPatternIdx]
            const pooled = []
            for (let i = 0; i < rolls; i++) {
                serviceRegistry.flatNotes.applyFlatNotes(pattern)
                for (const list of appState.flatNotes.values()) {
                    for (const flatNote of list) {
                        const note = { ...flatNote.note }
                        if (flatNote.track !== tracksOf(pattern)[trackIdx]) continue
                        pooled.push(note)
                    }
                }
            }
            return pooled

            function tracksOf(p) {
                return Array.isArray(p.tracks) ? p.tracks : Object.values(p.tracks ?? {})
            }
        },
        { trackIdx, rolls },
    )

/** One re-roll of the projection, counted for the track under test only. */
const rollCount = async (page, trackIdx) => (await rollMany(page, trackIdx, 1)).length

/** Source notes of the track under test — the identity the sliders depart from. */
const sourceNotes = (page, trackIdx) =>
    page.evaluate((trackIdx) => {
        const { appState } = window.__e2e
        const pattern = appState.patterns[appState.selectedPatternIdx]
        const tracks = Array.isArray(pattern.tracks) ? pattern.tracks : Object.values(pattern.tracks ?? {})
        return Object.values(tracks[trackIdx]?.notes ?? {})
    }, trackIdx)

const trackField = (page, trackIdx, key) =>
    page.evaluate(
        ({ trackIdx, key }) => {
            const { appState } = window.__e2e
            const pattern = appState.patterns[appState.selectedPatternIdx]
            const tracks = Array.isArray(pattern.tracks) ? pattern.tracks : Object.values(pattern.tracks ?? {})
            return tracks[trackIdx]?.[key]
        },
        { trackIdx, key },
    )

/**
 * Closes every op gate except `keep`, so the variation budget is spent on that
 * single effect.
 */
const isolateGates = (page, trackIdx, keep) =>
    page.evaluate(
        ({ trackIdx, keep }) => {
            const { appState, serviceRegistry } = window.__e2e
            const pattern = appState.patterns[appState.selectedPatternIdx]
            const tracks = Array.isArray(pattern.tracks) ? pattern.tracks : Object.values(pattern.tracks ?? {})
            const gates = [
                'prob_pitch',
                'prob_velocity',
                'prob_silence',
                'prob_fill',
                'prob_ghost',
                'prob_retrig',
                'prob_euclid',
                'prob_note',
                'prob_arp',
            ]
            const updates = {}
            for (const gate of gates) updates[gate] = gate === keep ? 100 : 0
            serviceRegistry.cmd.updateTrack(tracks[trackIdx], updates, { desc: 'gen-sliders isolate' })

            // auto_variation* are deliberately absent from TRACK_VALUE_RANGES,
            // so cmd.updateTrack would drop them. Pinning them at 100 takes the
            // budget out of whatever the generator happened to pick, so the
            // assertions below do not depend on that draw.
            tracks[trackIdx].auto_variation = 100
            tracks[trackIdx].auto_variation2 = 100
        },
        { trackIdx, keep },
    )

/** Pitch classes of the scale the track is locked to. */
const scaleSteps = (page, trackIdx) =>
    page.evaluate(
        ({ trackIdx }) => {
            const { appState, soundRegistry } = window.__e2e
            const pattern = appState.patterns[appState.selectedPatternIdx]
            const tracks = Array.isArray(pattern.tracks) ? pattern.tracks : Object.values(pattern.tracks ?? {})
            const name = tracks[trackIdx]?.scaleName
            // Same fallback pickPitch() uses, so the assertion matches the code.
            return soundRegistry.scales?.[name]?.scaleSteps ?? [0, 2, 4, 5, 7, 9, 11]
        },
        { trackIdx },
    )

/**
 * Replaces the track's source notes with a known grid.
 *
 * The generator leaves whatever the bass pattern happens to contain —
 * retriggers, euclidean fills, irregular gaps. An op only ever gets a
 * candidate when its note has the right shape around it (silence needs a note
 * flanked on both sides, an add or a ghost needs a free step nearby), so the
 * fixture picks the shape the op under test needs and every other test gets
 * clean notes with no variation of their own.
 */
const seedNotes = (page, trackIdx, notes) =>
    page.evaluate(
        ({ trackIdx, notes }) => {
            const { appState, serviceRegistry } = window.__e2e
            const pattern = appState.patterns[appState.selectedPatternIdx]
            const tracks = Array.isArray(pattern.tracks) ? pattern.tracks : Object.values(pattern.tracks ?? {})
            tracks[trackIdx].notes = notes
            serviceRegistry.flatNotes.applyFlatNotes(pattern)
        },
        { trackIdx, notes },
    )

const note = (beat, beatStep) => ({
    beat,
    beatStep,
    velocity: 0.8,
    pitch: 0,
    pan: 0,
    every: 1,
    pos: 0,
    prob: 1,
    retriggerCount: 1,
    rate: 1,
    arp: null,
    arpTriggerProbability: 1,
    euclideanFill: 0,
    euclideanRotation: 0,
})

/** One note every 4 steps: each has a free step beside it (add / ghost). */
const sparseGrid = () => [0, 1, 2, 3].map((beat) => note(beat, 0))

/** One note every step: every interior note is flanked on both sides (silence). */
const denseGrid = () => {
    const notes = []
    for (let beat = 0; beat < 4; beat++)
        for (let beatStep = 0; beatStep < 4; beatStep++) notes.push(note(beat, beatStep))
    return notes
}

const any = (notes, pred) => notes.some(pred)
const none = (notes, pred) => !notes.some(pred)

test.describe('Generation sliders — individual effect', () => {
    /** Index of the melodic track the test drives, bound to the track editor. */
    let trackIdx = -1

    test.beforeEach(async ({ page }) => {
        await bootApp(page)

        // The app boots with a large persisted library, so the flat-note count
        // is already non-zero: poll for the BASS track the generator creates
        // instead of trusting the projection.
        await page.locator('.tb-gen-btn[data-gen="bass"]').click()
        await expect
            .poll(
                () =>
                    page.evaluate(() => {
                        const { appState } = window.__e2e
                        const pattern = appState.patterns[appState.selectedPatternIdx]
                        const tracks = Array.isArray(pattern.tracks)
                            ? pattern.tracks
                            : Object.values(pattern.tracks ?? {})
                        return tracks.findIndex((t) => t?.auto === true && (t.notes ?? []).length > 0)
                    }),
                GEN,
            )
            .toBeGreaterThanOrEqual(0)

        trackIdx = await page.evaluate(() => {
            const { appState } = window.__e2e
            const pattern = appState.patterns[appState.selectedPatternIdx]
            const tracks = Array.isArray(pattern.tracks) ? pattern.tracks : Object.values(pattern.tracks ?? {})
            return tracks.findIndex((t) => t?.auto === true && (t.notes ?? []).length > 0)
        })

        await page.locator(`.pp-track-name[data-track="${trackIdx}"]`).click()
        await page.locator('#te-panel button[data-ne-tab="gen"]').click()

        // Deterministic source notes; the silence test swaps in a dense grid.
        await seedNotes(page, trackIdx, sparseGrid())
    })

    test.describe('manual group — visible with auto off', () => {
        const gen = (page) => page.locator('#te-panel [data-tab-panel="gen"]')

        test.beforeEach(async ({ page }) => {
            await gen(page).locator('button[data-key="auto"]').click()
            await expect.poll(() => trackField(page, trackIdx, 'auto'), GEN).toBe(false)
        })

        test('variation (Var Pos) is the Groove layer budget', async ({ page }) => {
            const sources = await sourceNotes(page, trackIdx)
            expect(sources.length).toBeGreaterThan(0)

            await fillInput(gen(page).locator('input[data-key="variation"]'), 0)
            await fillInput(gen(page).locator('input[data-key="variation2"]'), 0)
            const pitches = new Set(sources.map((n) => n.pitch ?? 0))
            const velocities = new Set(sources.map((n) => n.velocity))
            const base = await rollMany(page, trackIdx, 6)
            expect(none(base, (n) => !pitches.has(n.pitch ?? 0) || !velocities.has(n.velocity))).toBe(true)

            await fillInput(gen(page).locator('input[data-key="variation"]'), 100)
            const varied = await rollMany(page, trackIdx, 6)
            expect(any(varied, (n) => !pitches.has(n.pitch ?? 0) || !velocities.has(n.velocity))).toBe(true)
        })

        test('variation2 (Var Prop) is the Engine layer budget', async ({ page }) => {
            await fillInput(gen(page).locator('input[data-key="variation"]'), 0)
            await fillInput(gen(page).locator('input[data-key="variation2"]'), 0)
            const base = await rollMany(page, trackIdx, 6)
            expect(base.length).toBeGreaterThan(0)
            expect(none(base, (n) => n.retriggerCount > 1 || n.euclideanFill > 0)).toBe(true)

            await fillInput(gen(page).locator('input[data-key="variation2"]'), 100)
            const varied = await rollMany(page, trackIdx, 6)
            expect(any(varied, (n) => n.retriggerCount > 1 || n.euclideanFill > 0)).toBe(true)
        })

        test('probability gates every note of the pattern', async ({ page }) => {
            await fillInput(gen(page).locator('input[data-key="variation"]'), 0)
            await fillInput(gen(page).locator('input[data-key="variation2"]'), 0)

            await fillInput(gen(page).locator('input[data-key="probability"]'), 0)
            expect(await rollCount(page, trackIdx)).toBe(0)

            await fillInput(gen(page).locator('input[data-key="probability"]'), 1)
            expect(await rollCount(page, trackIdx)).toBeGreaterThan(0)
        })
    })

    test.describe('groove panel — auto on', () => {
        const groove = (page) => page.locator('#te-panel [data-gen-panel="groove"]')

        test('prob_pitch never moves a pitch at 0, always moves one at 100', async ({ page }) => {
            const pitches = new Set((await sourceNotes(page, trackIdx)).map((n) => n.pitch ?? 0))
            await isolateGates(page, trackIdx, 'prob_pitch')

            await fillInput(groove(page).locator('input[data-key="prob_pitch"]'), 0)
            const base = await rollMany(page, trackIdx, 8)
            expect(base.length).toBeGreaterThan(0)
            expect(none(base, (n) => !pitches.has(n.pitch ?? 0))).toBe(true)

            await fillInput(groove(page).locator('input[data-key="prob_pitch"]'), 100)
            const varied = await rollMany(page, trackIdx, 8)
            expect(any(varied, (n) => !pitches.has(n.pitch ?? 0))).toBe(true)
        })

        test('prob_velocity never moves a velocity at 0, always moves one at 100', async ({ page }) => {
            const velocities = new Set((await sourceNotes(page, trackIdx)).map((n) => n.velocity))
            await isolateGates(page, trackIdx, 'prob_velocity')

            await fillInput(groove(page).locator('input[data-key="prob_velocity"]'), 0)
            const base = await rollMany(page, trackIdx, 8)
            expect(none(base, (n) => !velocities.has(n.velocity))).toBe(true)

            await fillInput(groove(page).locator('input[data-key="prob_velocity"]'), 100)
            const varied = await rollMany(page, trackIdx, 8)
            expect(any(varied, (n) => !velocities.has(n.velocity))).toBe(true)
        })

        test('prob_silence never removes a note at 0, always removes one at 100', async ({ page }) => {
            // A silence op only has a candidate on a note flanked on both sides.
            await seedNotes(page, trackIdx, denseGrid())
            await isolateGates(page, trackIdx, 'prob_silence')

            await fillInput(groove(page).locator('input[data-key="prob_silence"]'), 0)
            const base = await rollMany(page, trackIdx, 4)

            await fillInput(groove(page).locator('input[data-key="prob_silence"]'), 100)
            const varied = await rollMany(page, trackIdx, 4)
            expect(varied.length, 'a Silence of 100 must drop notes').toBeLessThan(base.length)
        })

        test('prob_fill never adds a note at 0, always adds one at 100', async ({ page }) => {
            await isolateGates(page, trackIdx, 'prob_fill')

            await fillInput(groove(page).locator('input[data-key="prob_fill"]'), 0)
            const base = await rollMany(page, trackIdx, 4)

            await fillInput(groove(page).locator('input[data-key="prob_fill"]'), 100)
            const varied = await rollMany(page, trackIdx, 4)
            expect(varied.length, 'a Fill of 100 must add notes').toBeGreaterThan(base.length)
        })

        test('prob_ghost never adds a soft note at 0, always adds one at 100', async ({ page }) => {
            const velocities = new Set((await sourceNotes(page, trackIdx)).map((n) => n.velocity))
            await isolateGates(page, trackIdx, 'prob_ghost')

            await fillInput(groove(page).locator('input[data-key="prob_ghost"]'), 0)
            const base = await rollMany(page, trackIdx, 8)
            expect(none(base, (n) => !velocities.has(n.velocity))).toBe(true)

            await fillInput(groove(page).locator('input[data-key="prob_ghost"]'), 100)
            const varied = await rollMany(page, trackIdx, 8)
            expect(any(varied, (n) => !velocities.has(n.velocity))).toBe(true)
        })

        test('pitch_range bounds how far a pitch can travel', async ({ page }) => {
            const sourcePitches = new Set((await sourceNotes(page, trackIdx)).map((n) => n.pitch ?? 0))
            await isolateGates(page, trackIdx, 'prob_pitch')

            // Only the re-pitched notes may move: the rest keep their source
            // pitch, which is free to sit well outside the range.
            const movedOut = (notes, limit) =>
                notes.filter((n) => !sourcePitches.has(n.pitch ?? 0) && Math.abs(n.pitch ?? 0) > limit)

            await fillInput(groove(page).locator('input[data-key="pitch_range"]'), 1)
            const tight = await rollMany(page, trackIdx, 8)
            expect(tight.length).toBeGreaterThan(0)
            expect(movedOut(tight, 1).length, 'a Pitch Rng of 1 must keep every new pitch inside +/-1').toBe(0)

            await fillInput(groove(page).locator('input[data-key="pitch_range"]'), 24)
            const wide = await rollMany(page, trackIdx, 8)
            expect(movedOut(wide, 12).length, 'a Pitch Rng of 24 must throw pitches past an octave').toBeGreaterThan(0)
        })

        test('pitch_scale_lock keeps every varied pitch inside the scale', async ({ page }) => {
            const sourcePitches = new Set((await sourceNotes(page, trackIdx)).map((n) => n.pitch ?? 0))
            await isolateGates(page, trackIdx, 'prob_pitch')
            await fillInput(groove(page).locator('input[data-key="pitch_range"]'), 24)

            const steps = await scaleSteps(page, trackIdx)
            const onScale = (pitch) => steps.includes(Math.abs(pitch ?? 0) % 12)
            // Untouched notes keep whatever pitch the generator wrote, which is
            // free to sit outside the scale: only the re-picked ones count.
            const offScaleMoves = (notes) => notes.filter((n) => !sourcePitches.has(n.pitch ?? 0) && !onScale(n.pitch))

            await groove(page).locator('button[data-key="pitch_scale_lock"]').click()
            await expect.poll(() => trackField(page, trackIdx, 'pitch_scale_lock'), GEN).toBe(true)
            const locked = await rollMany(page, trackIdx, 12)
            expect(locked.length).toBeGreaterThan(0)
            expect(offScaleMoves(locked).length, 'Scale Lock must never leave the scale').toBe(0)

            await groove(page).locator('button[data-key="pitch_scale_lock"]').click()
            await expect.poll(() => trackField(page, trackIdx, 'pitch_scale_lock'), GEN).toBe(false)
            const free = await rollMany(page, trackIdx, 12)
            expect(offScaleMoves(free).length, 'without Scale Lock a wide range must leave the scale').toBeGreaterThan(
                0,
            )
        })
    })

    test.describe('engine panel — auto on', () => {
        const engine = (page) => page.locator('#te-panel [data-gen-panel="engine"]')

        // Groove is the default subtab; the Engine rows are not fillable until
        // their panel is the one being shown.
        test.beforeEach(async ({ page }) => {
            await page.locator('#te-panel [data-gen-tab="engine"]').click()
            await expect(engine(page)).toBeVisible()
        })

        test('prob_retrig never retriggers at 0, always retriggers at 100', async ({ page }) => {
            await isolateGates(page, trackIdx, 'prob_retrig')

            await fillInput(engine(page).locator('input[data-key="prob_retrig"]'), 0)
            const base = await rollMany(page, trackIdx, 8)
            expect(base.length).toBeGreaterThan(0)
            expect(none(base, (n) => n.retriggerCount > 1)).toBe(true)

            await fillInput(engine(page).locator('input[data-key="prob_retrig"]'), 100)
            const varied = await rollMany(page, trackIdx, 8)
            expect(any(varied, (n) => n.retriggerCount > 1)).toBe(true)
        })

        test('prob_euclid never fills a beat at 0, always fills one at 100', async ({ page }) => {
            await isolateGates(page, trackIdx, 'prob_euclid')

            await fillInput(engine(page).locator('input[data-key="prob_euclid"]'), 0)
            const base = await rollMany(page, trackIdx, 8)
            expect(none(base, (n) => n.euclideanFill > 0)).toBe(true)

            await fillInput(engine(page).locator('input[data-key="prob_euclid"]'), 100)
            const varied = await rollMany(page, trackIdx, 8)
            expect(any(varied, (n) => n.euclideanFill > 0)).toBe(true)
        })

        test('prob_note never randomizes a play probability at 0, always at 100', async ({ page }) => {
            const probs = new Set((await sourceNotes(page, trackIdx)).map((n) => n.prob ?? 1))
            await isolateGates(page, trackIdx, 'prob_note')

            await fillInput(engine(page).locator('input[data-key="prob_note"]'), 0)
            const base = await rollMany(page, trackIdx, 8)
            expect(base.length).toBeGreaterThan(0)
            expect(none(base, (n) => !probs.has(n.prob ?? 1))).toBe(true)

            await fillInput(engine(page).locator('input[data-key="prob_note"]'), 100)
            const varied = await rollMany(page, trackIdx, 8)
            expect(any(varied, (n) => !probs.has(n.prob ?? 1))).toBe(true)
        })

        test('prob_note_depth stretches how far the draw can fall', async ({ page }) => {
            const probs = new Set((await sourceNotes(page, trackIdx)).map((n) => n.prob ?? 1))
            await isolateGates(page, trackIdx, 'prob_note')
            await fillInput(engine(page).locator('input[data-key="prob_note"]'), 100)

            await fillInput(engine(page).locator('input[data-key="prob_note_depth"]'), 0)
            const untouched = await rollMany(page, trackIdx, 8)
            expect(
                none(untouched, (n) => !probs.has(n.prob ?? 1)),
                'a Depth of 0 must leave the note alone',
            ).toBe(true)

            await fillInput(engine(page).locator('input[data-key="prob_note_depth"]'), 100)
            const stretched = await rollMany(page, trackIdx, 8)
            expect(any(stretched, (n) => !probs.has(n.prob ?? 1))).toBe(true)
            expect(
                none(stretched, (n) => (n.prob ?? 1) < 0.2),
                'the draw must never fall below 0.2',
            ).toBe(true)
        })
    })
})
