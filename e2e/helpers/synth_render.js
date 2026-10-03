// e2e/helpers/synth_render.js
//
// Renders synth notes via the real AudioEngine (src/audio/engine.js) inside an
// OfflineAudioContext — exactly like wav_exporter.js does for WAV export.
//
// CRITICAL: Chromium's AudioWorklet + OfflineAudioContext only produces audio
// on the FIRST startRendering() per page. All subsequent OfflineAudioContexts
// produce silence. The fix: batch ALL note renders into a SINGLE
// OfflineAudioContext by scheduling notes at different time offsets, then slice
// the rendered audio per note.

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
            const { default: AudioEngine } = await import('/src/audio/engine.js')

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
            const offlineCtx = new OfflineAudioContext(2, Math.floor(sampleRate * totalDuration), sampleRate)

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

            const engine = new AudioEngine({
                audioCtx: offlineCtx,
                sounds: {},
                generatedSounds: { [TEST_KEY]: structuredClone(baseSound) },
                patterns: [pattern],
                selectedPatternIdx: 0,
                getSelectedPatternIdx: () => 0,
                getAutoGenerate: () => false,
                uiState: {},
                TICK,
                secondsPerBeat: 60 / bpm,
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

            // No sleep here: the port queue is flushed before the first render
            // quantum, so every note posted above is in the processor by the time
            // startRendering() runs. This used to wait a flat 25 ms, which was a
            // guess — on a loaded runner the queue can drain later than that and
            // the last note rendered silent.
            const rendered = await offlineCtx.startRendering()
            const results = []
            for (let i = 0; i < configs.length; i++) {
                const startSample = Math.floor(i * slotDuration * sampleRate)
                const endSample = Math.floor((i * slotDuration + durationPerNote) * sampleRate)
                results.push({
                    channelData: [
                        Array.from(rendered.getChannelData(0).slice(startSample, endSample)),
                        Array.from(rendered.getChannelData(1).slice(startSample, endSample)),
                    ],
                    sampleRate,
                })
            }
            // A silent batch means the messages never reached the processor (or the
            // patch is genuinely silent): say so instead of letting each caller
            // fail later on an unexplained RMS.
            const rms = (data) => {
                let sum = 0
                for (let i = 0; i < data.length; i++) sum += data[i] * data[i]
                return Math.sqrt(sum / Math.max(1, data.length))
            }
            const anySignal = results.some((r) => rms(r.channelData[0]) > 0)
            if (!anySignal) {
                throw new Error(
                    'renderSynthBatch produced pure silence for every note — the worklet never received its messages',
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

/**
 * Render a single synth note. For backward compatibility — internally uses a
 * single-config batch. If you need multiple renders, use renderSynthBatch()
 * instead (multiple standalone OfflineAudioContexts produce silence after the
 * first one in Chromium).
 */
export async function renderSynthNote(page, opts = {}) {
    const results = await renderSynthBatch(page, [{ synthOverrides: opts.synthOverrides }], {
        durationPerNote: opts.durationSec ?? 1.0,
        gapSec: 0,
        pitch: opts.pitch ?? 0,
        bpm: opts.bpm ?? 120,
    })
    return results[0]
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
