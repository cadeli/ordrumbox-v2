// e2e/helpers/synth_render.js
//
// Renders synth notes via the real Engine (src/audio/engine.js) inside an
// OfflineAudioContext — exactly like wav_exporter.js does for WAV export.
//
// CRITICAL 1 — one context per batch: Chromium's AudioWorklet only produces
// audio on the FIRST startRendering() per page, so all notes are scheduled at
// different time offsets inside a SINGLE OfflineAudioContext and the render is
// sliced per note afterwards.
//
// CRITICAL 2 — flush before rendering: an OfflineAudioContext starts rendering
// eagerly and can render past a note's time before its port messages reach the
// processor, which yields a valid but entirely silent buffer. This is not a
// spec subtlety but a measured Chromium behaviour, documented (with the same
// workaround) in src/audio/export/wav_exporter.js. The processor is only
// instantiated once rendering starts, so no acknowledgement round trip is
// possible — it would deadlock before startRendering(). Hence the fixed flush
// below, plus a verification and one longer-flush retry: a silent batch is
// retried rather than reported, because a silent batch carries no information
// about the patch.

/**
 * Render N synth notes in a SINGLE OfflineAudioContext.
 *
 * Each config gets a time slot of `durationPerNote` seconds (plus optional gap).
 * After rendering, the audio is sliced per slot and returned as an array.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Array<{synthOverrides?: object, baseSynthSoundKey?: string}>} configs
 * @param {object} [opts]
 * @param {number} [opts.durationPerNote=1.0]
 * @param {number} [opts.gapSec=0.05]
 * @param {number} [opts.pitch=0]
 * @param {number} [opts.bpm=120]
 * @returns {Promise<Array<{channelData: number[][], sampleRate: number}>>}
 */
const PREFERRED_BASE_SYNTH_KEY = 'SYNTH2'

export async function renderSynthBatch(page, configs, opts = {}) {
    const { durationPerNote = 1.0, gapSec = 0.05, pitch = 0, bpm = 120 } = opts

    return page.evaluate(
        async ({ configs, durationPerNote, gapSec, pitch, bpm, preferredBaseKey }) => {
            const { default: Engine } = await import('/src/audio/engine.js')

            function deepMerge(target, src) {
                for (const k of Object.keys(src)) {
                    if (src[k] && typeof src[k] === 'object' && !Array.isArray(src[k])) {
                        target[k] = deepMerge({ ...(target[k] ?? {}) }, src[k])
                    } else {
                        target[k] = src[k]
                    }
                }
                return target
            }

            const { soundRegistry } = window.__e2e
            const realKeys = Object.keys(soundRegistry.generatedSounds ?? {})
            // Pin the base patch instead of taking realKeys[0]. Key order
            // depends on load order, so the tests used to run against a
            // different patch from run to run: against a dark one (BASS0 is a
            // sawtooth an octave down behind a 480 Hz lowpass) highpass and
            // bandpass at 800 Hz are physically near-identical, and any
            // gated group (modEnvelope, noise, fm) stays silent. SYNTH2 is
            // bright and harmonic-rich, so a filter change is always audible.
            const sourceKey =
                configs[0]?.baseSynthSoundKey ?? (realKeys.includes(preferredBaseKey) ? preferredBaseKey : realKeys[0])
            if (!sourceKey) {
                throw new Error(
                    'No generatedSound found in soundRegistry — load/select a synth patch before running this test.',
                )
            }

            const baseSound = structuredClone(soundRegistry.generatedSounds[sourceKey])
            const TEST_KEY = '__e2e_test_synth__'
            const sampleRate = 44100

            const slotDuration = durationPerNote + gapSec
            const totalDuration = configs.length * slotDuration

            const pattern = {
                bpm,
                beatCount: 1,
                tracks: [
                    {
                        name: '__e2e_track__',
                        useSoftSynth: true,
                        synthSoundKey: TEST_KEY,
                        stepsPerBeat: 4,
                        velocity: 1,
                        notes: [{ beat: 0, beatStep: 0, pitch }],
                    },
                ],
            }

            const { TICK } = await import('/src/core/constants.js')

            const rms = (data) => {
                let sum = 0
                for (let i = 0; i < data.length; i++) sum += data[i] * data[i]
                return Math.sqrt(sum / Math.max(1, data.length))
            }
            const slice = (rendered) =>
                configs.map((_, i) => {
                    const startSample = Math.floor(i * slotDuration * sampleRate)
                    const endSample = Math.floor((i * slotDuration + durationPerNote) * sampleRate)
                    return {
                        channelData: [
                            Array.from(rendered.getChannelData(0).slice(startSample, endSample)),
                            Array.from(rendered.getChannelData(1).slice(startSample, endSample)),
                        ],
                        sampleRate,
                    }
                })

            // Schedule the whole batch, flush, render, then LOOK at the result: a
            // batch that came out silent carries no information about the patch
            // (the worklet never got its messages), so it is rendered again with a
            // longer flush instead of being reported as a failure. 25 ms is the
            // value the WAV exporter uses for the same race.
            const flushMs = [25, 150, 400]
            let results = null
            for (let attempt = 0; attempt < flushMs.length; attempt++) {
                // A fresh context per attempt: startRendering() is one-shot.
                const offlineCtx = new OfflineAudioContext(2, Math.floor(sampleRate * totalDuration), sampleRate)
                const engine = new Engine({
                    audioCtx: offlineCtx,
                    sounds: {},
                    generatedSounds: { [TEST_KEY]: structuredClone(baseSound) },
                    patterns: [pattern],
                    selectedPatternIdx: 0,
                    getSelectedPatternIdx: () => 0,
                    getAutoGenerator: () => false,
                    uiState: {},
                    TICK,
                    secondsPerTick: 60 / bpm,
                    isOffline: true,
                })
                await engine.start(pattern)
                engine.mixer.setBpm(bpm)

                for (let i = 0; i < configs.length; i++) {
                    const offset = i * slotDuration
                    const testSound = deepMerge(structuredClone(baseSound), configs[i].synthOverrides ?? {})
                    engine.generatedSounds[TEST_KEY] = testSound
                    await engine.playNotes(0, offset)
                }

                await new Promise((resolve) => setTimeout(resolve, flushMs[attempt]))
                const rendered = await offlineCtx.startRendering()
                const candidate = slice(rendered)
                if (candidate.some((r) => rms(r.channelData[0]) > 0)) {
                    results = candidate
                    break
                }
            }
            if (!results) {
                throw new Error(
                    `renderSynthBatch produced pure silence for all ${configs.length} notes after ` +
                        `${flushMs.length} attempts (flushes ${flushMs.join('/')} ms) — the worklet never ` +
                        'received its messages; this is the known Chromium OfflineAudioContext race, not a silent patch',
                )
            }
            return results
        },
        {
            configs,
            durationPerNote,
            gapSec,
            pitch,
            bpm,
            preferredBaseKey: PREFERRED_BASE_SYNTH_KEY,
        },
    )
}

/** RMS on a window [startSec, endSec) of a given channel. */
export function rmsWindow(channelData, sampleRate, startSec, endSec) {
    const start = Math.floor(startSec * sampleRate)
    const end = Math.min(channelData.length, Math.floor(endSec * sampleRate))
    let sumSq = 0
    for (let i = start; i < end; i++) sumSq += channelData[i] * channelData[i]
    return Math.sqrt(sumSq / Math.max(1, end - start))
}

/** Split a channel into N equal RMS windows — used to detect "frozen" audio. */
export function rmsWindows(channelData, sampleRate, durationSec, n = 8) {
    const step = durationSec / n
    return Array.from({ length: n }, (_, i) => rmsWindow(channelData, sampleRate, i * step, (i + 1) * step))
}
