// e2e/pattern-lifecycle.spec.js
//
// Full user-session lifecycle — one session driven 100% through the UI:
//   T1 — create an empty pattern, add 4 tracks, edit every track / note / synth
//        parameter (knobs via their numeric prompt, sliders via fill, selects,
//        toggles, icons), change drumkit, assign sample and synth sounds.
//   T2 — persist to IndexedDB, reload the page, verify nothing was lost and
//        assert the documented design losses (track pan rewrite, auto-assigned
//        soundId reset).
//   T3 — export the pattern as a JSON file, verify its content, then re-import
//        it through the "replace" action and verify the round-trip.
//
// The only direct model writes are the 5 track keys that have no UI widget
// (swingResolution, fxSelected, sat, reverbOn, delayOn) via cmd.updateTrack —
// the only clamped write path. Everything else goes through real controls.

import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import { bootApp } from './fixtures.js'
import { findAllNotes, parseMidi } from '../tests/helpers/midi_reader.js'
import {
    alignedRange,
    diffPatterns,
    expectNum,
    expectVal,
    exportPatternAt,
    fillInput,
    installDialogHandler,
    knobSet,
    lfoField,
    snapshotState,
    stripForComparison,
    synthField,
    teHeader,
    trackAt,
    trackField,
    tracksOf,
    waitForPatternSoundsLoaded,
    waitForPatternsPersisted,
    waitForSynthSoundPersisted,
    VOLATILE_NOTE_KEYS,
} from './helpers/ui_session.js'

const NEW_PATTERN = 'LifecyclePat'

// Track keys that must survive a reload (pan + soundId are documented losses).
const TRACK_KEYS = [
    'name',
    'nbBeats',
    'stepsPerBeat',
    'loopAtStep',
    'swingResolution',
    'swingAmount',
    'velocity',
    'velocityLfo',
    'pitch',
    'pitchLfo',
    'panLfo',
    'solo',
    'mute',
    'auto',
    'useSoftSynth',
    'useAutoAssignSound',
    'mono',
    'synthSoundKey',
    'variation',
    'variation2',
    'probability',
    'prob_pitch',
    'prob_velocity',
    'prob_silence',
    'prob_fill',
    'prob_ghost',
    'prob_retrig',
    'prob_euclid',
    'prob_note',
    'prob_arp',
    'pitch_range',
    'pitch_scale_lock',
    'auto_variant',
    'auto_density',
    'filterType',
    'filterFreq',
    'filterFreqLfo',
    'filterQ',
    'filterQLfo',
    'reverbType',
    'reverbAmount',
    'delayType',
    'delayTime',
    'delayDepth',
    'saturationType',
    'saturationAmount',
    'fxSelected',
    'sat',
    'reverbOn',
    'delayOn',
]

// Note keys that must survive a reload (steppc/stepPercent are recalculated,
// arpRange/_arpScale/_arpType survive a raw reload but not a JSON round-trip).
// prob/rate/retriggerNum/euclidianFill are excluded: track.variation2 > 0
// re-randomizes them in place on every flat-notes computation.
const NOTE_KEYS = ['beat', 'beatStep', 'velocity', 'pitch', 'pan', 'every', 'pos', 'arpTriggerProbability', 'arp']

// midi_tick = engine_tick * MIDI_RATIO with PPQN 96 / TICK 32 (midi_exporter.js)
const MIDI_TICKS_PER_ENGINE_TICK = 3

/**
 * Minimal 16-bit PCM WAV reader: validates the RIFF header written by
 * src/audio/export/wav_encoder.js and measures the audio content (peak level
 * and number of non-silent samples) so an all-silent render cannot pass.
 */
function parseWav(buffer) {
    expect(buffer.length).toBeGreaterThanOrEqual(44)
    const header = {
        riff: buffer.toString('ascii', 0, 4),
        wave: buffer.toString('ascii', 8, 12),
        fmtTag: buffer.toString('ascii', 12, 16),
        fmtSize: buffer.readUInt32LE(16),
        audioFormat: buffer.readUInt16LE(20),
        channels: buffer.readUInt16LE(22),
        sampleRate: buffer.readUInt32LE(24),
        byteRate: buffer.readUInt32LE(28),
        blockAlign: buffer.readUInt16LE(32),
        bitsPerSample: buffer.readUInt16LE(34),
        dataTag: buffer.toString('ascii', 36, 40),
        dataSize: buffer.readUInt32LE(40),
    }
    expect(header.dataSize).toBe(buffer.length - 44)

    let peak = 0
    let nonZero = 0
    const sampleCount = header.dataSize / 2
    for (let i = 0; i < sampleCount; i++) {
        const value = Math.abs(buffer.readInt16LE(44 + i * 2))
        if (value > peak) peak = value
        if (value > 0) nonZero++
    }
    return { header, peak, nonZero }
}

test.setTimeout(300_000)

test.describe.serial('Full session lifecycle', () => {
    let context
    let page
    let dialogs
    const pageLogs = []

    let baseCount = 0
    let newIdx = -1
    let t2Instrument = ''
    let beforeReload = null
    let exportBeforeReload = null
    let exportedFilePath = null

    const cell = (trackIdx, beat, step) =>
        page.locator(`.pp-cell[data-track="${trackIdx}"][data-beat="${beat}"][data-step="${step}"]`)

    const noteAt = async (trackIdx, noteIdx) => {
        const track = await trackAt(page, trackIdx)
        return track?.notes?.[noteIdx]
    }

    /** Opens the Tools panel on its Export tab (idempotent). */
    const openToolsExportTab = async () => {
        const panel = page.locator('#tools-panel')
        if (!(await panel.isVisible())) {
            await page.locator('button.tb-tools').click()
            await expect(panel).toBeVisible()
        }
        await page.locator('.ne-tab-btn[data-ne-tab="export"]').click()
        await expect(page.locator('#tp-export-midi')).toBeVisible()
        await expect(page.locator('#tp-export-wav')).toBeVisible()
    }

    test.beforeAll(async ({ browser }) => {
        context = await browser.newContext({ acceptDownloads: true })
        await context.addInitScript(() => {
            // The pattern "replace" action clicks a detached <input type="file">.
            // Attach such inputs so Playwright can observe the file chooser while
            // the app's own change handler still runs.
            const originalClick = HTMLInputElement.prototype.click
            HTMLInputElement.prototype.click = function () {
                if (this.type === 'file' && !this.isConnected) document.body.appendChild(this)
                return originalClick.call(this)
            }
        })
        page = await context.newPage()
        page.on('console', (message) => pageLogs.push(message.text()))
        await bootApp(page)
        dialogs = installDialogHandler(page)
    })

    test.afterAll(async () => {
        await context?.close()
    })

    test('T1 — build the full session through the UI', async () => {
        await test.step('phase 1 — create an empty pattern and rename it', async () => {
            baseCount = await page.evaluate(() => window.__e2e.appState.patterns.length)
            await page.locator('.pp-action-btn[data-pp-action="new"]').click()
            await expect.poll(() => page.evaluate(() => window.__e2e.appState.patterns.length)).toBe(baseCount + 1)
            newIdx = baseCount

            dialogs.queue.push(NEW_PATTERN)
            await page.locator('.pp-action-btn[data-pp-action="rename"]').click()
            await expect.poll(() => dialogs.queue.length).toBe(0)
            await expect
                .poll(() => page.evaluate((i) => window.__e2e.appState.patterns[i]?.name, newIdx))
                .toBe(NEW_PATTERN)
            await expect.poll(() => page.evaluate(() => window.__e2e.appState.selectedPatternNum)).toBe(newIdx)

            const tracks = await page.evaluate((i) => window.__e2e.appState.patterns[i].tracks?.length ?? 0, newIdx)
            expect(tracks).toBe(0)
        })

        await test.step('phase 2 — add 4 tracks and bind the track editor to T1', async () => {
            for (let i = 0; i < 4; i++) {
                await page.locator('#pp-add-track').click()
            }
            await expect(page.locator('.pp-track:not(.pp-master-track)')).toHaveCount(4)
            await expect.poll(async () => (await trackAt(page, 3))?.name).toBe('T4')

            // Deterministic selection: a fresh track index, then T1.
            await page.locator('.pp-track-name[data-track="1"]').click()
            await expect(teHeader(page)).toContainText('Track: T2')
            await page.locator('.pp-track-name[data-track="0"]').click()
            await expect(teHeader(page)).toContainText('Track: T1')
        })

        await test.step('phase 3a — transport: 8 beats', async () => {
            await page.locator('.tb-beats-group select').selectOption('8')
            await expect.poll(() => page.evaluate((i) => window.__e2e.appState.patterns[i]?.nbBeats, newIdx)).toBe(8)
            await expectNum(() => trackField(page, 0, 'nbBeats'), 8)
        })

        await test.step('phase 3b — knob bar: velocity, pan, pitch', async () => {
            await knobSet(dialogs, page.locator('.te-knob-bar'), 'velocity', 0.62)
            await expectNum(() => trackField(page, 0, 'velocity'), 0.62)
            await knobSet(dialogs, page.locator('.te-knob-bar'), 'pan', 0.25)
            await expectNum(() => trackField(page, 0, 'pan'), 0.25)
            await knobSet(dialogs, page.locator('.te-knob-bar'), 'pitch', -7)
            await expectNum(() => trackField(page, 0, 'pitch'), -7)
        })

        await test.step('phase 3c — loop tab: stepsPerBeat, loopAtStep, swing', async () => {
            await page.locator('#te-panel button[data-ne-tab="loop"]').click()
            await fillInput(page.locator('#te-panel input[data-loop="stepsPerBeat"]'), 8)
            await expectNum(() => trackField(page, 0, 'stepsPerBeat'), 8)
            await fillInput(page.locator('#te-panel input[data-loop="loopAtStep"]'), 24)
            await expectNum(() => trackField(page, 0, 'loopAtStep'), 24)
            await fillInput(page.locator('#te-panel input[data-loop="swingAmount"]'), 0.35)
            await expectNum(() => trackField(page, 0, 'swingAmount'), 0.35)
            // the grid rebuilds with 8 cells per beat
            await expect(page.locator('.pp-cell[data-track="0"][data-beat="0"]')).toHaveCount(8)
        })

        await test.step('phase 3d — FX tab: reverb, delay, saturation, filter', async () => {
            await page.locator('#te-panel button[data-ne-tab="fx"]').click()

            // Reverb (sub-tab 0 is active by default)
            await page.locator('#te-panel select[data-key="reverbType"]').selectOption('hall')
            await knobSet(dialogs, page.locator('[data-fx-panel="0"]'), 'reverbAmount', 0.4)
            await expectVal(() => trackField(page, 0, 'reverbType'), 'hall')
            await expectNum(() => trackField(page, 0, 'reverbAmount'), 0.4)
            // LED toggle dance: amount > 0 -> off (0) -> on (0.5) -> back to 0.4
            await page.locator('[data-fx-toggle-btn="reverbAmount"]').click()
            await expectNum(() => trackField(page, 0, 'reverbAmount'), 0)
            await page.locator('[data-fx-toggle-btn="reverbAmount"]').click()
            await expectNum(() => trackField(page, 0, 'reverbAmount'), 0.5)
            await knobSet(dialogs, page.locator('[data-fx-panel="0"]'), 'reverbAmount', 0.4)
            await expectNum(() => trackField(page, 0, 'reverbAmount'), 0.4)

            // Delay
            await page.locator('#te-panel [data-fx-tab="1"]').click()
            await page.locator('#te-panel select[data-key="delayType"]').selectOption('pingpong')
            await page.locator('#te-panel select[data-key="delayTime"]').selectOption('0.25')
            await knobSet(dialogs, page.locator('[data-fx-panel="1"]'), 'delayDepth', 0.3)
            await expectVal(() => trackField(page, 0, 'delayType'), 'pingpong')
            await expectNum(() => trackField(page, 0, 'delayTime'), 0.25)
            await expectNum(() => trackField(page, 0, 'delayDepth'), 0.3)

            // Saturation
            await page.locator('#te-panel [data-fx-tab="2"]').click()
            await page.locator('#te-panel select[data-key="saturationType"]').selectOption('tape')
            await knobSet(dialogs, page.locator('[data-fx-panel="2"]'), 'saturationAmount', 0.5)
            await expectVal(() => trackField(page, 0, 'saturationType'), 'tape')
            await expectNum(() => trackField(page, 0, 'saturationAmount'), 0.5)

            // Filter: icon toggle dance allpass -> highpass -> allpass -> highpass
            await page.locator('#te-panel [data-fx-tab="3"]').click()
            const hpIcon = page.locator('.fx-tab-panel[data-fx-panel="3"] .fx-icon-btn[data-fx-icon-val="highpass"]')
            await hpIcon.click()
            await expectVal(() => trackField(page, 0, 'filterType'), 'highpass')
            await hpIcon.click()
            await expectVal(() => trackField(page, 0, 'filterType'), 'allpass')
            await hpIcon.click()
            await expectVal(() => trackField(page, 0, 'filterType'), 'highpass')
            await knobSet(dialogs, page.locator('[data-fx-panel="3"]'), 'filterFreq', 1200)
            await expectNum(() => trackField(page, 0, 'filterFreq'), 1200)
            await knobSet(dialogs, page.locator('[data-fx-panel="3"]'), 'filterQ', 4.5)
            await expectNum(() => trackField(page, 0, 'filterQ'), 4.5)
        })

        await test.step('phase 3e — mod tab: one LFO per supported target', async () => {
            await page.locator('#te-panel button[data-ne-tab="mod"]').click()
            const targets = [
                { prop: 'filterFreq', lfo: 'filterFreqLfo' },
                { prop: 'filterQ', lfo: 'filterQLfo' },
                { prop: 'velocity', lfo: 'velocityLfo' },
                { prop: 'pan', lfo: 'panLfo' },
                { prop: 'pitch', lfo: 'pitchLfo' },
            ]
            for (const target of targets) {
                // LED click creates the LFO and selects it as active target
                await page.locator(`[data-lfo-toggle-btn="${target.prop}"]`).click()
                // re-render so the range inputs carry this target's min/max/step
                await page.locator('#te-panel button[data-ne-tab="loop"]').click()
                await page.locator('#te-panel button[data-ne-tab="mod"]').click()

                await page.locator('#te-panel select[data-lfo-type-select]').selectOption('sawtooth')
                await fillInput(page.locator('#te-panel input[data-lfo-key="freq"]'), 1.2)

                const minInput = page.locator('#te-panel input[data-lfo-key="min"]')
                const maxInput = page.locator('#te-panel input[data-lfo-key="max"]')
                const base = {
                    min: parseFloat(await minInput.getAttribute('min')),
                    max: parseFloat(await minInput.getAttribute('max')),
                    step: parseFloat(await minInput.getAttribute('step')),
                }
                const low = alignedRange(base.min, base.max, base.step, 0.25)
                const high = alignedRange(base.min, base.max, base.step, 0.75)
                await fillInput(minInput, low)
                await fillInput(maxInput, high)
                await fillInput(page.locator('#te-panel input[data-lfo-key="phase"]'), 0.5)

                await expectVal(() => lfoField(page, 0, target.lfo, 'type'), 'sawtooth')
                await expectNum(() => lfoField(page, 0, target.lfo, 'freq'), 1.2)
                await expectNum(() => lfoField(page, 0, target.lfo, 'min'), low)
                await expectNum(() => lfoField(page, 0, target.lfo, 'max'), high)
                await expectNum(() => lfoField(page, 0, target.lfo, 'phase'), 0.5)
            }
        })

        await test.step('phase 3f — gen tab: basic, groove and engine props', async () => {
            await page.locator('#te-panel button[data-ne-tab="gen"]').click()
            const gen = page.locator('#te-panel [data-tab-panel="gen"]')
            await gen.locator('button[data-key="auto"]').click()
            await expectVal(() => trackField(page, 0, 'auto'), true)
            await fillInput(gen.locator('input[data-key="variation"]'), 40)
            await fillInput(gen.locator('input[data-key="variation2"]'), 65)
            await fillInput(gen.locator('input[data-key="probability"]'), 0.7)

            const groove = page.locator('#te-panel [data-gen-panel="groove"]')
            await fillInput(groove.locator('input[data-key="prob_pitch"]'), 70)
            await fillInput(groove.locator('input[data-key="prob_velocity"]'), 30)
            await fillInput(groove.locator('input[data-key="prob_silence"]'), 60)
            await fillInput(groove.locator('input[data-key="prob_fill"]'), 45)
            await fillInput(groove.locator('input[data-key="prob_ghost"]'), 25)
            await fillInput(groove.locator('input[data-key="pitch_range"]'), 18)
            await groove.locator('button[data-key="pitch_scale_lock"]').click()
            await expectVal(() => trackField(page, 0, 'pitch_scale_lock'), true)

            await page.locator('#te-panel [data-gen-tab="engine"]').click()
            const engine = page.locator('#te-panel [data-gen-panel="engine"]')
            await fillInput(engine.locator('input[data-key="prob_retrig"]'), 55)
            await fillInput(engine.locator('input[data-key="prob_euclid"]'), 65)
            await fillInput(engine.locator('input[data-key="prob_note"]'), 35)
            await fillInput(engine.locator('input[data-key="prob_arp"]'), 75)
            await engine.locator('select[data-key="auto_variant"]').selectOption('fill')
            await fillInput(engine.locator('input[data-key="auto_density"]'), 0.4)

            const expected = {
                variation: 40,
                variation2: 65,
                probability: 0.7,
                prob_pitch: 70,
                prob_velocity: 30,
                prob_silence: 60,
                prob_fill: 45,
                prob_ghost: 25,
                pitch_range: 18,
                prob_retrig: 55,
                prob_euclid: 65,
                prob_note: 35,
                prob_arp: 75,
                auto_density: 0.4,
            }
            for (const [key, value] of Object.entries(expected)) {
                await expectNum(() => trackField(page, 0, key), value)
            }
            await expectVal(() => trackField(page, 0, 'auto_variant'), 'fill')
        })

        await test.step('phase 3g — grid row controls: volume, mute, solo', async () => {
            await fillInput(page.locator('.pp-volume[data-track="1"]'), 0.45)
            await expectNum(() => trackField(page, 1, 'velocity'), 0.45)
            await page.locator('.pp-divider[data-track="0"]').click()
            await expectVal(() => trackField(page, 0, 'mute'), true)
            await page.locator('.pp-solo[data-track="1"]').click()
            await expectVal(() => trackField(page, 1, 'solo'), true)
        })

        await test.step('phase 3h — non-UI track keys via cmd.updateTrack', async () => {
            await page.evaluate((patternIdx) => {
                const { appState, serviceRegistry } = window.__e2e
                const pattern = appState.patterns[patternIdx]
                const tracks = Array.isArray(pattern.tracks) ? pattern.tracks : Object.values(pattern.tracks ?? {})
                serviceRegistry.cmd.updateTrack(tracks[0], {
                    swingResolution: 2,
                    fxSelected: 'delay',
                    sat: false,
                    reverbOn: false,
                    delayOn: false,
                })
            }, newIdx)
            await expectNum(() => trackField(page, 0, 'swingResolution'), 2)
            await expectVal(() => trackField(page, 0, 'fxSelected'), 'delay')
            await expectVal(() => trackField(page, 0, 'sat'), false)
            await expectVal(() => trackField(page, 0, 'reverbOn'), false)
            await expectVal(() => trackField(page, 0, 'delayOn'), false)
        })

        await test.step('phase 4a — note 1 on T1 with every note parameter', async () => {
            await cell(0, 0, 0).click()
            const ne = page.locator('#ne-container')
            await knobSet(dialogs, ne, 'velocity', 0.55)
            await knobSet(dialogs, ne, 'pitch', -3)
            await knobSet(dialogs, ne, 'pan', 0.4)
            await fillInput(ne.locator('input[data-key="every"]'), 2)
            await fillInput(ne.locator('input[data-key="pos"]'), 5)
            await fillInput(ne.locator('input[data-key="prob"]'), 0.85)

            await expectNum(async () => (await noteAt(0, 0))?.velocity, 0.55)
            await expectNum(async () => (await noteAt(0, 0))?.pitch, -3)
            await expectNum(async () => (await noteAt(0, 0))?.pan, 0.4)
            await expectNum(async () => (await noteAt(0, 0))?.every, 2)
            await expectNum(async () => (await noteAt(0, 0))?.pos, 5)
            await expectNum(async () => (await noteAt(0, 0))?.prob, 0.85)

            await ne.locator('button[data-ne-tab="retrig"]').click()
            await fillInput(ne.locator('input[data-key="retriggerNum"]'), 3)
            await fillInput(ne.locator('input[data-key="rate"]'), 2)
            await fillInput(ne.locator('input[data-key="euclidianFill"]'), 6)
            await fillInput(ne.locator('input[data-key="arpTriggerProbability"]'), 0.5)
            await expectNum(async () => (await noteAt(0, 0))?.retriggerNum, 3)
            await expectNum(async () => (await noteAt(0, 0))?.rate, 2)
            await expectNum(async () => (await noteAt(0, 0))?.euclidianFill, 6)
            await expectNum(async () => (await noteAt(0, 0))?.arpTriggerProbability, 0.5)

            await ne.locator('button[data-ne-tab="arp"]').click()
            const scaleSel = ne.locator('select[data-key="arpScale"]')
            const scales = await scaleSel
                .locator('option')
                .evaluateAll((options) => options.map((option) => option.value))
            const currentScale = await scaleSel.inputValue()
            const scale = scales.includes('minor') ? 'minor' : scales.find((v) => v !== currentScale)
            expect(scale).toBeTruthy()
            await scaleSel.selectOption(scale)
            await ne.locator('select[data-key="arpType"]').selectOption('updown')
            await fillInput(ne.locator('input[data-key="arpRange"]'), 7)

            await expectVal(async () => (await noteAt(0, 0))?._arpScale, scale)
            await expectVal(async () => (await noteAt(0, 0))?._arpType, 'updown')
            await expectNum(async () => (await noteAt(0, 0))?.arpRange, 7)
            const note0 = await noteAt(0, 0)
            expect(note0.arp?.mode).toBe('updown')
            expect(Array.isArray(note0.arp?.intervals)).toBe(true)
            expect(note0.arp.intervals.length).toBeGreaterThan(0)
        })

        await test.step('phase 4b — more notes on T1, T2, T3 (T4 stays empty)', async () => {
            await cell(0, 1, 0).click()
            await knobSet(dialogs, page.locator('#ne-container'), 'velocity', 0.7)
            await cell(0, 2, 3).click()
            await knobSet(dialogs, page.locator('#ne-container'), 'pitch', 5)
            await cell(1, 0, 0).click()
            await cell(1, 0, 2).click()
            await cell(2, 0, 1).click()

            await expect.poll(async () => (await trackAt(page, 0)).notes.length).toBe(3)
            await expect.poll(async () => (await trackAt(page, 1)).notes.length).toBe(2)
            await expect.poll(async () => (await trackAt(page, 2)).notes.length).toBe(1)
            await expect.poll(async () => (await trackAt(page, 3)).notes.length).toBe(0)
            await expectNum(async () => (await noteAt(0, 1))?.velocity, 0.7)
            await expectNum(async () => (await noteAt(0, 2))?.pitch, 5)
        })

        await test.step('phase 5 — switch drumkit (auto-assign kicks in)', async () => {
            const kitSelect = page
                .locator('.tb-group', { has: page.locator('.tb-label:text-is("Drumkit")') })
                .locator('select')
            await kitSelect.selectOption('1')
            await expectVal(() => page.evaluate(() => window.__e2e.appState.selectedDrumkitNum), 1)
            // auto-assign runs for every auto track: T4 must get a concrete sound
            await expect
                .poll(async () => (await trackAt(page, 3))?.soundId, { timeout: 30_000 })
                .not.toBe('NOT_DEFINED')
            for (const idx of [0, 1, 2]) {
                await expect
                    .poll(async () => (await trackAt(page, idx))?.soundId, { timeout: 30_000 })
                    .not.toBe('NOT_DEFINED')
            }
        })

        await test.step('phase 6a — T2: instrument then sample assignment', async () => {
            await page.locator('.pp-track-name[data-track="1"]').click()
            await expect(teHeader(page)).toContainText('Track: T2')
            await page.locator('#te-panel button[data-ne-tab="snd"]').click()

            const instrSel = page.locator('#te-panel select[data-sound="instrument"]')
            const instrOptions = await instrSel
                .locator('option')
                .evaluateAll((options) => options.map((option) => option.value))
            expect(instrOptions.length).toBeGreaterThan(1)
            const currentInstr = await instrSel.inputValue()
            const instr2 = instrOptions.find((v) => v !== currentInstr) ?? instrOptions[0]
            t2Instrument = instr2
            await instrSel.selectOption(instr2)
            await expectVal(() => trackField(page, 1, 'name'), instr2)
            await expectVal(() => trackField(page, 1, 'useAutoAssignSound'), false)

            const sampleSel = page.locator('#te-panel select[data-sound="sample"]')
            await expect
                .poll(async () => {
                    const track = await trackAt(page, 1)
                    const url = await sampleSel.inputValue()
                    return url !== '' && track?.soundId === url
                })
                .toBe(true)

            const sampleOptions = await sampleSel
                .locator('option')
                .evaluateAll((options) => options.map((option) => option.value))
            const currentSample = await sampleSel.inputValue()
            const sample2 = sampleOptions.find((v) => v !== currentSample && v !== '')
            if (sample2) {
                await sampleSel.selectOption(sample2)
                await expectVal(() => trackField(page, 1, 'soundId'), sample2)
            }
        })

        await test.step('phase 6b — T3: instrument then sample assignment', async () => {
            await page.locator('.pp-track-name[data-track="2"]').click()
            await expect(teHeader(page)).toContainText('Track: T3')

            const instrSel = page.locator('#te-panel select[data-sound="instrument"]')
            const instrOptions = await instrSel
                .locator('option')
                .evaluateAll((options) => options.map((option) => option.value))
            const currentInstr = await instrSel.inputValue()
            const instr3 =
                instrOptions.find((v) => v !== currentInstr && v !== t2Instrument) ??
                instrOptions.find((v) => v !== currentInstr) ??
                instrOptions[0]
            await instrSel.selectOption(instr3)
            await expectVal(() => trackField(page, 2, 'name'), instr3)
            await expectVal(() => trackField(page, 2, 'useAutoAssignSound'), false)

            const sampleSel = page.locator('#te-panel select[data-sound="sample"]')
            await expect
                .poll(async () => {
                    const track = await trackAt(page, 2)
                    const url = await sampleSel.inputValue()
                    return url !== '' && track?.soundId === url
                })
                .toBe(true)

            const sampleOptions = await sampleSel
                .locator('option')
                .evaluateAll((options) => options.map((option) => option.value))
            const currentSample = await sampleSel.inputValue()
            const sample3 = sampleOptions.find((v) => v !== currentSample && v !== '')
            if (sample3) {
                await sampleSel.selectOption(sample3)
                await expectVal(() => trackField(page, 2, 'soundId'), sample3)
            }
        })

        await test.step('phase 6c — T1: auto LED dance, mono, decay', async () => {
            await page.locator('.pp-track-name[data-track="0"]').click()
            await expect(teHeader(page)).toContainText('Track: T1')
            await page.locator('#te-panel button[data-ne-tab="snd"]').click()

            const autoLed = page.locator('#te-panel button[data-action="toggle-auto"]')
            await autoLed.click()
            await expectVal(() => trackField(page, 0, 'useAutoAssignSound'), false)
            await autoLed.click()
            await expectVal(() => trackField(page, 0, 'useAutoAssignSound'), true)
            await autoLed.click()
            await expectVal(() => trackField(page, 0, 'useAutoAssignSound'), false)
            await expect
                .poll(async () => (await trackAt(page, 0))?.soundId, { timeout: 30_000 })
                .not.toBe('NOT_DEFINED')

            await page.locator('#te-panel [data-tab-panel="snd"] button[data-key="mono"]').click()
            await expectVal(() => trackField(page, 0, 'mono'), true)

            // decay writes into the loaded sound object (not the track)
            await knobSet(dialogs, page.locator('.te-knob-bar'), 'decay', 1200)
            await expectNum(
                () =>
                    page.evaluate((patternIdx) => {
                        const { appState, soundRegistry } = window.__e2e
                        const pattern = appState.patterns[patternIdx]
                        const tracks = Array.isArray(pattern.tracks)
                            ? pattern.tracks
                            : Object.values(pattern.tracks ?? {})
                        return soundRegistry.sounds[tracks[0]?.soundId]?.decay
                    }, newIdx),
                1200,
            )
        })

        await test.step('phase 7a — T1 becomes a synth track (BASS1)', async () => {
            await page.locator('#te-panel select[data-sound="generated"]').selectOption('BASS1')
            await expectVal(() => trackField(page, 0, 'useSoftSynth'), true)
            await expectVal(() => trackField(page, 0, 'useAutoAssignSound'), false)
            await expectVal(() => trackField(page, 0, 'synthSoundKey'), 'BASS1')
        })

        await test.step('phase 7b — synth OSC tab', async () => {
            await page.locator('button.tb-view-btn[data-view="synth"]').click()
            const ss = page.locator('#soft-synth-panel')
            await expect(ss).toBeVisible()
            await expect(ss.locator('.or-knob[data-or-knob="vco1.gain"]')).toBeVisible()

            await knobSet(dialogs, ss, 'vco1.gain', 0.7)
            await knobSet(dialogs, ss, 'vco1.octave', 1)
            await knobSet(dialogs, ss, 'vco1.detune', -12)
            await ss.locator('button[data-synth-path="vco1.wave"][data-wave-val="sawtooth"]').click()
            await knobSet(dialogs, ss, 'vco2.gain', 0.5)
            await knobSet(dialogs, ss, 'vco2.octave', -1)
            await knobSet(dialogs, ss, 'vco2.detune', 15)
            await ss.locator('button[data-synth-path="vco2.wave"][data-wave-val="square"]').click()
            await knobSet(dialogs, ss, 'vco3.gain', 0.4)
            await knobSet(dialogs, ss, 'vco3.octave', 2)
            await knobSet(dialogs, ss, 'vco3.detune', -20)
            await ss.locator('button[data-synth-path="vco3.wave"][data-wave-val="triangle"]').click()
            await knobSet(dialogs, ss, 'fm.amount', 0.6)
            await ss.locator('button[data-synth-path="fm.algo"][data-wave-val="3"]').click()

            const expected = [
                ['vco1', 'gain', 0.7],
                ['vco1', 'octave', 1],
                ['vco1', 'detune', -12],
                ['vco2', 'gain', 0.5],
                ['vco2', 'octave', -1],
                ['vco2', 'detune', 15],
                ['vco3', 'gain', 0.4],
                ['vco3', 'octave', 2],
                ['vco3', 'detune', -20],
                ['fm', 'amount', 0.6],
            ]
            for (const [group, key, value] of expected) {
                await expectNum(() => synthField(page, 'BASS1', group, key), value)
            }
            await expectVal(() => synthField(page, 'BASS1', 'vco1', 'wave'), 'sawtooth')
            await expectVal(() => synthField(page, 'BASS1', 'vco2', 'wave'), 'square')
            await expectVal(() => synthField(page, 'BASS1', 'vco3', 'wave'), 'triangle')
            await expectVal(async () => String(await synthField(page, 'BASS1', 'fm', 'algo')), '3')
        })

        await test.step('phase 7c — synth FLT tab (filter, filter env, mod envelope)', async () => {
            const ss = page.locator('#soft-synth-panel')
            await ss.locator('button[data-ne-tab="flt"]').click()
            await ss.locator('button[data-synth-path="filter.type"][data-wave-val="highpass"]').click()
            await knobSet(dialogs, ss, 'filter.freq', 2500)
            await knobSet(dialogs, ss, 'filter.Q', 8.5)
            await knobSet(dialogs, ss, 'filter.drive', 0.5)
            await knobSet(dialogs, ss, 'filterEnv.filterEnvelopeAmount', 0.7)
            await knobSet(dialogs, ss, 'modEnvelope.attack', 0.05)
            await knobSet(dialogs, ss, 'modEnvelope.decay', 0.2)
            await knobSet(dialogs, ss, 'modEnvelope.sustain', 0.4)
            await knobSet(dialogs, ss, 'modEnvelope.release', 0.15)
            await ss.locator('select[data-synth-path="modEnvelope.target"]').selectOption('filter')

            await expectVal(() => synthField(page, 'BASS1', 'filter', 'type'), 'highpass')
            await expectNum(() => synthField(page, 'BASS1', 'filter', 'freq'), 2500)
            await expectNum(() => synthField(page, 'BASS1', 'filter', 'Q'), 8.5)
            await expectNum(() => synthField(page, 'BASS1', 'filter', 'drive'), 0.5)
            await expectNum(() => synthField(page, 'BASS1', 'filterEnv', 'filterEnvelopeAmount'), 0.7)
            await expectNum(() => synthField(page, 'BASS1', 'modEnvelope', 'attack'), 0.05)
            await expectNum(() => synthField(page, 'BASS1', 'modEnvelope', 'decay'), 0.2)
            await expectNum(() => synthField(page, 'BASS1', 'modEnvelope', 'sustain'), 0.4)
            await expectNum(() => synthField(page, 'BASS1', 'modEnvelope', 'release'), 0.15)
            await expectVal(() => synthField(page, 'BASS1', 'modEnvelope', 'target'), 'filter')
        })

        await test.step('phase 7d — synth MOD tab (LFOs, noise, power card)', async () => {
            const ss = page.locator('#soft-synth-panel')
            await ss.locator('button[data-ne-tab="mod"]').click()

            await ss.locator('select[data-synth-path="lfo.target"]').selectOption('filter.freq')
            await ss.locator('button[data-synth-path="lfo.wave"][data-wave-val="triangle"]').click()
            await knobSet(dialogs, ss, 'lfo.freq', 1.5)
            await knobSet(dialogs, ss, 'lfo.depth', 0.8)
            await ss.locator('select[data-synth-path="lfo.sync"]').selectOption('1/4')

            await ss.locator('select[data-synth-path="lfo2.target"]').selectOption('vco1.detune')
            await ss.locator('button[data-synth-path="lfo2.wave"][data-wave-val="square"]').click()
            await knobSet(dialogs, ss, 'lfo2.freq', 0.5)
            await knobSet(dialogs, ss, 'lfo2.depth', 0.4)
            await ss.locator('select[data-synth-path="lfo2.sync"]').selectOption('1/8')

            await knobSet(dialogs, ss, 'noise.mix', 0.6)
            await ss.locator('button[data-synth-path="noise.filterType"][data-wave-val="bandpass"]').click()
            await expectVal(() => synthField(page, 'BASS1', 'noise', 'filterType'), 'bandpass')
            await ss.locator('button[data-synth-path="noise.filterType"][data-wave-val="highpass"]').click()
            await knobSet(dialogs, ss, 'noise.filterFreq', 4000)
            await knobSet(dialogs, ss, 'noise.filterQ', 3)

            await expectVal(() => synthField(page, 'BASS1', 'lfo', 'target'), 'filter.freq')
            await expectVal(() => synthField(page, 'BASS1', 'lfo', 'wave'), 'triangle')
            await expectNum(() => synthField(page, 'BASS1', 'lfo', 'freq'), 1.5)
            await expectNum(() => synthField(page, 'BASS1', 'lfo', 'depth'), 0.8)
            await expectVal(() => synthField(page, 'BASS1', 'lfo', 'sync'), '1/4')
            await expectVal(() => synthField(page, 'BASS1', 'lfo2', 'target'), 'vco1.detune')
            await expectVal(() => synthField(page, 'BASS1', 'lfo2', 'wave'), 'square')
            await expectNum(() => synthField(page, 'BASS1', 'lfo2', 'freq'), 0.5)
            await expectNum(() => synthField(page, 'BASS1', 'lfo2', 'depth'), 0.4)
            await expectVal(() => synthField(page, 'BASS1', 'lfo2', 'sync'), '1/8')
            await expectNum(() => synthField(page, 'BASS1', 'noise', 'mix'), 0.6)
            await expectVal(() => synthField(page, 'BASS1', 'noise', 'filterType'), 'highpass')
            await expectNum(() => synthField(page, 'BASS1', 'noise', 'filterFreq'), 4000)
            await expectNum(() => synthField(page, 'BASS1', 'noise', 'filterQ'), 3)

            // power card dance: bypass on -> off
            await ss.locator('button[data-power-card="noise"]').click()
            await expectVal(() => synthField(page, 'BASS1', 'bypassNoise'), true)
            await ss.locator('button[data-power-card="noise"]').click()
            await expectVal(() => synthField(page, 'BASS1', 'bypassNoise'), false)
        })

        await test.step('phase 7e — synth ENV tab (envelope + master)', async () => {
            const ss = page.locator('#soft-synth-panel')
            await ss.locator('button[data-ne-tab="env"]').click()
            await knobSet(dialogs, ss, 'envelope.attack', 0.02)
            await knobSet(dialogs, ss, 'envelope.decay', 0.15)
            await knobSet(dialogs, ss, 'envelope.sustain', 0.6)
            await knobSet(dialogs, ss, 'envelope.release', 0.25)
            await knobSet(dialogs, ss, 'masterVolume', 0.9)
            await knobSet(dialogs, ss, 'subGain', 0.3)
            await knobSet(dialogs, ss, 'pitchPunch', 0.5)

            await expectNum(() => synthField(page, 'BASS1', 'envelope', 'attack'), 0.02)
            await expectNum(() => synthField(page, 'BASS1', 'envelope', 'decay'), 0.15)
            await expectNum(() => synthField(page, 'BASS1', 'envelope', 'sustain'), 0.6)
            await expectNum(() => synthField(page, 'BASS1', 'envelope', 'release'), 0.25)
            await expectNum(() => synthField(page, 'BASS1', 'masterVolume'), 0.9)
            await expectNum(() => synthField(page, 'BASS1', 'subGain'), 0.3)
            await expectNum(() => synthField(page, 'BASS1', 'pitchPunch'), 0.5)
        })

        await test.step('phase 8 — back to the grid, persist and snapshot', async () => {
            // leaving the synth view commits the edited sound
            // (view_manager exit → synthEditor.hidePanel → commitSound → _persist)
            await page.locator('button.tb-view-btn[data-view="edit"]').click()
            await expect(page.locator('#pattern-panel')).toBeVisible()
            await waitForSynthSoundPersisted(page, 'BASS1')
            await waitForPatternsPersisted(page)

            beforeReload = await snapshotState(page)
            exportBeforeReload = await exportPatternAt(page, newIdx)
            expect(beforeReload.selectedPatternNum).toBe(newIdx)
            expect(beforeReload.selectedDrumkitNum).toBe(1)
        })
    })

    test('T2 — reload: verify persistence and documented losses', async () => {
        pageLogs.length = 0
        await page.reload()
        await page.locator('#waiting-screen-start-btn').click()
        await page.waitForFunction(() => window.__e2e?.ready === true, { timeout: 30_000 })
        await page.waitForSelector('#waiting-screen', { state: 'hidden' })

        // the boot reloads the samples referenced by the pattern, including the
        // ones that belong to another drumkit than the selected one (they used
        // to be skipped, which silently muted those tracks after a reload)
        await waitForPatternSoundsLoaded(page, newIdx)

        const after = await snapshotState(page)
        const beforePattern = beforeReload.patterns[newIdx]
        const afterPattern = after.patterns[newIdx]

        // session state
        expect(after.selectedPatternNum).toBe(newIdx)
        expect(after.selectedDrumkitNum).toBe(1)
        expect(after.patterns.length).toBe(baseCount + 1)
        expect(afterPattern.name).toBe(NEW_PATTERN)
        expect(afterPattern.nbBeats).toBe(8)

        // every whitelisted track key and note key must be identical
        const problems = diffPatterns(beforePattern, afterPattern, {
            trackKeys: TRACK_KEYS,
            noteKeys: NOTE_KEYS,
        })
        expect(problems).toEqual([])

        const beforeTracks = tracksOf(beforePattern)
        const afterTracks = tracksOf(afterPattern)
        expect(afterTracks).toHaveLength(4)
        expect(afterTracks.map((track) => (track.notes ?? []).length)).toEqual([3, 2, 1, 0])

        // documented loss 1: pan is rewritten from PAN_MAP on every load
        expect(beforeTracks.map((track) => track.pan)).toEqual([0.25, 0, 0, 0])
        expect(afterTracks.map((track) => track.pan)).toEqual([0, 0.3, 0.5, -0.4])

        // documented loss 2: auto-assigned soundId is reset to NOT_DEFINED
        // documented loss 2: the persisted soundId of an auto track is discarded
        // on load (resources_loader.js:302-304) and re-derived by the boot
        // auto-assign — proven by the boot log, since a random pick could
        // coincidentally match the persisted value.
        expect(beforeTracks[3].useAutoAssignSound).toBe(true)
        expect(afterTracks[3].useAutoAssignSound).toBe(true)
        expect(beforeTracks[3].soundId).not.toBe('NOT_DEFINED')
        expect(afterTracks[3].soundId).not.toBe('NOT_DEFINED')
        expect(
            pageLogs.some((line) => line.includes(NEW_PATTERN) && line.includes('Auto-assign')),
            'boot auto-assign must run for the restored pattern',
        ).toBe(true)
        expect(
            pageLogs.some((line) => line.includes('T4') && line.includes(`=> ${afterTracks[3].soundId}`)),
            'T4 soundId must come from the boot auto-assign, not from storage',
        ).toBe(true)
        // manual and synth assignments are restored as-is
        expect(afterTracks[0].soundId).toBe(beforeTracks[0].soundId)
        expect(afterTracks[1].soundId).toBe(beforeTracks[1].soundId)
        expect(afterTracks[2].soundId).toBe(beforeTracks[2].soundId)

        // arp transient fields survive a raw reload (only lost on JSON round-trip)
        const beforeNote0 = beforeTracks[0].notes[0]
        const afterNote0 = afterTracks[0].notes[0]
        expect(afterNote0.arpRange).toBe(beforeNote0.arpRange)
        expect(afterNote0._arpScale).toBe(beforeNote0._arpScale)
        expect(afterNote0._arpType).toBe(beforeNote0._arpType)
        expect(afterNote0.arp).toEqual(beforeNote0.arp)

        // variation2 > 0 rewrites these note fields in place on every
        // flat-notes computation: only their type can be checked after a reload
        expect(afterTracks[0].variation2).toBe(65)
        for (const note of afterTracks[0].notes ?? []) {
            for (const key of VOLATILE_NOTE_KEYS) {
                expect(typeof note[key]).toBe('number')
            }
        }

        // synth preset (BASS1) survived in IndexedDB
        expect(after.bass1).toEqual(beforeReload.bass1)
    })

    test('T3 — export the JSON file, verify it, re-import the round-trip', async () => {
        const downloadPromise = page.waitForEvent('download')
        await page.locator('.pp-action-btn[data-pp-action="save"]').click()
        const download = await downloadPromise
        expect(download.suggestedFilename()).toBe(`ordrumbox-${NEW_PATTERN}.json`)

        exportedFilePath = await download.path()
        expect(exportedFilePath).toBeTruthy()
        const fileJson = JSON.parse(fs.readFileSync(exportedFilePath, 'utf8'))
        const liveExport = await exportPatternAt(page, newIdx)

        // the file is exactly what the exporter produces for the live pattern
        expect(fileJson).toEqual(liveExport)
        expect(fileJson.application).toBe('online-ordrumbox')
        expect(fileJson.name).toBe(NEW_PATTERN)
        expect(fileJson.nbBeats).toBe(8)
        const fileTracks = Array.isArray(fileJson.tracks) ? fileJson.tracks : Object.values(fileJson.tracks ?? {})
        expect(fileTracks).toHaveLength(4)

        // the file matches the pre-reload export modulo documented losses:
        // pan/soundId rewritten at load, variation2 note fields re-randomized
        // on every computation and ARP tab fields dropped by the exporter
        expect(stripForComparison(fileJson)).toEqual(stripForComparison(exportBeforeReload))

        // round-trip: re-import the file through the "replace" action
        const chooserPromise = page.waitForEvent('filechooser')
        await page.locator('.pp-action-btn[data-pp-action="replace"]').click()
        const chooser = await chooserPromise
        await chooser.setFiles(exportedFilePath)
        await expect.poll(() => page.evaluate(() => window.__e2e.appState.patterns.length)).toBe(baseCount + 2)

        const importedExport = await exportPatternAt(page, baseCount + 1)
        expect(importedExport).toEqual(liveExport)
    })

    test('T4 — export MIDI and verify the file content', async () => {
        const selectedIdx = await page.evaluate(() => window.__e2e.appState.selectedPatternNum)
        const selectedName = await page.evaluate((i) => window.__e2e.appState.patterns[i]?.name, selectedIdx)
        expect(selectedName).toBe(NEW_PATTERN)

        // What the pattern engine produces right now for the tracks that
        // actually play (Utils.shouldTrackPlay) — the exact input the exporter
        // feeds into the file. velocityLfo values are resolved by the exporter
        // itself, so they are marked as "unknown" here.
        const reference = await page.evaluate(
            async ({ patternIdx, ratio }) => {
                const { appState } = window.__e2e
                const Utils = (await import('/src/core/utils.js')).default
                const { recomputeFlatNotes } = await import('/src/patterns/engine.js')

                const pattern = appState.patterns[patternIdx]
                const tracks = Array.isArray(pattern.tracks) ? pattern.tracks : Object.values(pattern.tracks ?? {})
                const anySolo = Utils.hasAnySolo(tracks)
                const playing = tracks.filter((t) => Utils.shouldTrackPlay(t, anySolo))

                const notes = []
                const countByTrack = {}
                for (const [engineTick, flatNotes] of recomputeFlatNotes(pattern, 0)) {
                    for (const flatNote of flatNotes) {
                        if (!playing.some((t) => t.name === flatNote.track.name)) continue
                        countByTrack[flatNote.track.name] = (countByTrack[flatNote.track.name] ?? 0) + 1
                        notes.push({
                            absTick: engineTick * ratio,
                            velocity: flatNote.track.velocityLfo
                                ? null
                                : Math.round((flatNote.note.velocity ?? 0.8) * 127),
                        })
                    }
                }
                return {
                    bpm: pattern.bpm,
                    playingNames: playing.map((t) => t.name),
                    countByTrack,
                    notes,
                }
            },
            { patternIdx: selectedIdx, ratio: MIDI_TICKS_PER_ENGINE_TICK },
        )

        // phase 3g soloed T2: the solo set is the only material that may be exported
        expect(reference.playingNames).toEqual([(await trackAt(page, 1)).name])
        expect(reference.notes.length).toBeGreaterThan(0)

        await openToolsExportTab()
        const downloadPromise = page.waitForEvent('download')
        await page.locator('#tp-export-midi').click()
        const download = await downloadPromise
        expect(download.suggestedFilename()).toBe(`ordrumbox-${NEW_PATTERN}.mid`)

        const midiPath = await download.path()
        expect(midiPath).toBeTruthy()
        const midi = parseMidi(new Uint8Array(fs.readFileSync(midiPath)))

        expect(midi.header.format).toBe(1)
        expect(midi.header.division).toBe(96)
        expect(midi.tracks).toHaveLength(midi.header.numTracks)

        // conductor track: name, 4/4 time signature and the pattern tempo
        expect(midi.trackNames[0]).toBe('orDrumbox Pattern')
        const tempoEvents = midi.tracks[0].filter((e) => e.type === 'meta' && e.metaType === 0x51)
        expect(tempoEvents).toHaveLength(1)
        const [hi, mid, lo] = tempoEvents[0].data
        expect(((hi << 16) | (mid << 8) | lo) >>> 0).toBe(Math.round(60_000_000 / reference.bpm))
        const timeSig = midi.tracks[0].find((e) => e.type === 'meta' && e.metaType === 0x58)
        expect(timeSig?.data?.[0]).toBe(4)

        // one instrument track per playing track that has events, in model order
        const expectedTrackNames = reference.playingNames.filter((name) => reference.countByTrack[name] > 0)
        expect(midi.trackNames.slice(1)).toEqual(expectedTrackNames)

        const noteOns = findAllNotes(midi)
        expect(noteOns).toHaveLength(reference.notes.length)

        const byTickThenVelocity = (a, b) => a.absTick - b.absTick || (a.velocity ?? -1) - (b.velocity ?? -1)
        const exported = noteOns
            .map((n) => ({ absTick: n.absTick, velocity: n.velocity, note: n.note }))
            .sort(byTickThenVelocity)
        const expected = [...reference.notes].sort(byTickThenVelocity)
        exported.forEach((note, i) => {
            expect(note.absTick).toBe(expected[i].absTick)
            // engine ticks are whole ticks, converted at MIDI_TICKS_PER_ENGINE_TICK each
            expect(note.absTick % MIDI_TICKS_PER_ENGINE_TICK).toBe(0)
            expect(note.note).toBeGreaterThanOrEqual(0)
            expect(note.note).toBeLessThanOrEqual(127)
            expect(note.velocity).toBeGreaterThanOrEqual(1)
            expect(note.velocity).toBeLessThanOrEqual(127)
            if (expected[i].velocity !== null) expect(note.velocity).toBe(expected[i].velocity)
        })

        // every note-on is paired with a note-off
        const noteOffs = midi.tracks
            .slice(1)
            .flatMap((trackEvents) =>
                trackEvents.filter(
                    (e) => e.type === 'midi' && (e.status === 0x80 || (e.status === 0x90 && e.velocity === 0)),
                ),
            )
        expect(noteOffs).toHaveLength(noteOns.length)
    })

    test('T5 — export WAV and verify the file content', async () => {
        const selectedIdx = await page.evaluate(() => window.__e2e.appState.selectedPatternNum)
        const meta = await page.evaluate((i) => {
            const pattern = window.__e2e.appState.patterns[i]
            return { name: pattern.name, bpm: pattern.bpm, nbBeats: pattern.nbBeats }
        }, selectedIdx)
        expect(meta.name).toBe(NEW_PATTERN)

        // samples can belong to a non-selected drumkit: wait until the boot
        // finished loading them, otherwise the render would be silent
        await waitForPatternSoundsLoaded(page, selectedIdx)

        await openToolsExportTab()
        const downloadPromise = page.waitForEvent('download', { timeout: 120_000 })
        await page.locator('#tp-export-wav').click()
        const download = await downloadPromise
        expect(download.suggestedFilename()).toBe(`ordrumbox-${NEW_PATTERN}.wav`)

        const wavPath = await download.path()
        expect(wavPath).toBeTruthy()
        const buffer = fs.readFileSync(wavPath)
        const { header, peak, nonZero } = parseWav(buffer)

        // container: 16-bit PCM stereo @ 44.1 kHz (wav_encoder.js)
        expect(header.riff).toBe('RIFF')
        expect(header.wave).toBe('WAVE')
        expect(header.fmtTag).toBe('fmt ')
        expect(header.fmtSize).toBe(16)
        expect(header.audioFormat).toBe(1)
        expect(header.channels).toBe(2)
        expect(header.sampleRate).toBe(44_100)
        expect(header.bitsPerSample).toBe(16)
        expect(header.blockAlign).toBe(4)
        expect(header.byteRate).toBe(44_100 * 4)
        expect(header.dataTag).toBe('data')

        // one loop of the pattern: nbBeats beats at the pattern tempo
        const duration = header.dataSize / header.byteRate
        const musicalDuration = (meta.nbBeats * 60) / meta.bpm
        expect(duration).toBeCloseTo(musicalDuration, 3)
        // OfflineAudioContext length = floor(sampleRate * duration) — one
        // sample of rounding slack either way
        const sampleCount = header.dataSize / header.blockAlign
        expect(Math.abs(sampleCount - Math.floor(44_100 * musicalDuration))).toBeLessThanOrEqual(1)

        // the render must actually contain audio (the soloed track playing)
        expect(peak).toBeGreaterThan(500)
        expect(nonZero).toBeGreaterThan(1_000)
    })
})
