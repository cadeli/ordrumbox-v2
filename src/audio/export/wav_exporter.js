import AudioEngine from '../engine.js'
import { TICK } from '../../core/constants.js'
import { bufferToWav } from './wav_encoder.js'
import { serviceRegistry } from '../../state/service_registry.js'
import { getAutoGeneratorService } from '../../state/service_loader.js'
import { soundRegistry } from '../../state/sound_registry.js'
import { valueOrFallback, logger } from '../../core/logger.js'
import { downloadBlob } from '../../core/download.js'
import { appState } from '../../state/app_state.js'
import { BEATS_PER_MEASURE, songLengthMeasures } from '../../model/song_schema.js'
import { songTempo } from '../../logic/song_playback.js'
import { getTracksArray } from '../../core/tracks.js'

/** Flush delays used by #renderUntilAudible, in ms, one per attempt. */
const WORKLET_FLUSH_MS = [25, 150, 400]

/** Peak amplitude under which a render counts as silent (~-100 dBFS). */
const SILENCE_PEAK = 1e-5

/**
 * True when at least one track holds a note and is not muted, i.e. when the
 * export is *expected* to produce audio. A silent render of such a pattern means
 * the worklet lost its messages; a silent render of an empty one is correct.
 * @param {Array<object>} patterns
 * @returns {boolean}
 */
function expectsAudio(patterns) {
    return patterns.some((pattern) =>
        getTracksArray(pattern).some((track) => !track.mute && Object.keys(track.notes ?? {}).length > 0),
    )
}

/** True when the buffer holds anything above the silence floor. */
function bufferHasSignal(buffer) {
    for (let c = 0; c < buffer.numberOfChannels; c++) {
        const data = buffer.getChannelData(c)
        for (let i = 0; i < data.length; i++) {
            if (Math.abs(data[i]) > SILENCE_PEAK) return true
        }
    }
    return false
}

export default class WavExporter {
    /** Set to false by renderers that cannot make any sound (test harnesses
     *  without AudioWorklet): a silent render is then returned as is instead of
     *  being retried. */
    #expectAudio

    /** @param {{expectAudio?: boolean}} [opts] */
    constructor({ expectAudio = true } = {}) {
        this.#expectAudio = expectAudio
    }

    /**
     * Lets the audio thread drain the messages posted to it before rendering.
     * @param {number} [ms] delay, defaults to the first attempt's
     */
    async flushWorklets(ms = WORKLET_FLUSH_MS[0]) {
        await new Promise((resolve) => setTimeout(resolve, ms))
    }

    /**
     * Runs `fn` with `serviceRegistry.transport.bpm` set to `bpm`, then restores
     * it — even if `fn` throws.
     *
     * The transport OBJECT is never swapped: synth voices read its bpm (auto
     * release, LFO sync) while other services read start/tick/isRunning, so a
     * replacement would be visible to them.
     *
     * @template T
     * @param {number} bpm
     * @param {() => Promise<T>} fn
     * @returns {Promise<T>}
     */
    async #withTransportBpm(bpm, fn) {
        const savedTransport = serviceRegistry.transport
        const savedBpm = savedTransport?.bpm
        if (savedTransport) {
            savedTransport.bpm = bpm
        } else {
            serviceRegistry.transport = { bpm }
        }
        try {
            return await fn()
        } finally {
            if (savedTransport) {
                savedTransport.bpm = savedBpm
            } else {
                serviceRegistry.transport = null
            }
        }
    }

    /**
     * Renders an offline export, retrying while the buffer comes back silent.
     *
     * A soft-synth note is triggered by `port.postMessage` (see
     * WorkletSynthVoice.start), and offline there is no synth node pool
     * (`Sound`: `isOffline ? null : new SynthVoiceNodePool(...)`), so every note
     * builds its own AudioWorkletNode. An OfflineAudioContext starts rendering
     * eagerly and can render past the note's time before those messages reach the
     * processor, which yields a perfectly valid but entirely silent export — one
     * run in four with no flush at all, one in ten with the flat 25 ms this used
     * to wait.
     *
     * There is no way to await an acknowledgement: the processor is only
     * instantiated once rendering starts, so any round trip would deadlock
     * before `startRendering()`. Yielding for a macrotask is not enough either.
     * So the result is INSPECTED and rendered again with a longer flush when it
     * came out silent, each attempt on a fresh context (`startRendering()` is
     * one-shot). Sample voices are unaffected — they read an AudioBuffer
     * directly, with no message involved.
     *
     * @param {() => Promise<OfflineAudioContext>} schedule builds a fresh context
     *   with every note already scheduled, and resolves with it
     * @param {boolean} expectAudio false when the patterns are silent on purpose
     * @returns {Promise<AudioBuffer>}
     */
    async #renderUntilAudible(schedule, expectAudio) {
        const checked = expectAudio && this.#expectAudio
        const attempts = checked ? WORKLET_FLUSH_MS : WORKLET_FLUSH_MS.slice(0, 1)
        for (const flushMs of attempts) {
            const offlineCtx = await schedule()
            await this.flushWorklets(flushMs)
            const buffer = await offlineCtx.startRendering()
            if (!checked || bufferHasSignal(buffer)) return buffer
            logger.warn('WavExporter', `silent render after a ${flushMs} ms flush, rendering again`)
        }
        throw new Error(
            `the render stayed silent after ${attempts.length} attempts (flushes ${attempts.join('/')} ms) — ` +
                'this is the known Chromium offline-rendering race, not a silent pattern. Try exporting again.',
        )
    }

    exportPatternToWav = async (pattern, loopsCount = 1) => {
        // same formula as Transport.setBpm: TICK ticks per beat
        const secondsPerTick = 60 / (pattern.bpm * TICK)
        const duration = pattern.beatCount * TICK * loopsCount * secondsPerTick
        const sampleRate = 44100
        const totalTicks = pattern.beatCount * TICK * loopsCount

        const schedule = async () => {
            const offlineCtx = new OfflineAudioContext(2, Math.floor(sampleRate * duration), sampleRate)

            const exporterAudioEngine = new AudioEngine({
                audioCtx: offlineCtx,
                sounds: soundRegistry.sounds,
                generatedSounds: soundRegistry.generatedSounds,
                patterns: [pattern],
                getSelectedPatternIdx: () => 0,
                getAutoGenerator: getAutoGeneratorService,
                uiState: {},
                TICK,
                secondsPerTick: secondsPerTick, // one sequencer tick, for swing
                isOffline: true,
            })

            // start() awaits the worklet mixer init internally — must be awaited
            // before playNotes, otherwise this.player is null and notes are dropped.
            // It rethrows on failure so we never render a silent WAV.
            await exporterAudioEngine.start(pattern)

            // Sync strip BPM so delay/reverb timing matches the pattern tempo.
            // engine.start() applies track effects but never calls mixer.setBpm().
            exporterAudioEngine.mixer.setBpm(pattern.bpm)

            // Simple offline scheduling
            await this.#withTransportBpm(pattern.bpm, async () => {
                for (let t = 0; t < totalTicks; t++) {
                    await exporterAudioEngine.playNotes(t, t * secondsPerTick)
                }
            })

            return offlineCtx
        }

        const renderedBuffer = await this.#renderUntilAudible(schedule, expectsAudio([pattern]))
        return bufferToWav(renderedBuffer)
    }

    /**
     * Render a song arrangement to a WAV file.
     *
     * Unlike the pattern export this runs the engine in song mode, so every clip
     * covering the current measure is layered exactly as it sounds live, and the
     * whole arrangement plays at the song's single tempo.
     *
     * @param {import('../../model/song_schema.js').Song} song a normalized song
     * @param {object} [opts]
     * @param {Array<{id?: string, bpm?: number}>} [opts.patterns] the pattern library (defaults to appState)
     * @param {number} [opts.loopMeasureCount] override the arrangement length
     * @returns {Promise<Blob>}
     */
    exportSongToWav = async (song, { patterns = appState.patterns ?? [], loopMeasureCount } = {}) => {
        /** @type {Map<string, { bpm?: number }>} */
        const library = new Map(patterns.filter((p) => p?.id).map((p) => [p.id, p]))
        const usedPatterns = (song.clips ?? []).map((c) => library.get(c.pattern)).filter(Boolean)
        if (usedPatterns.length === 0) throw new Error('This song has no playable clip')

        const bpm = songTempo(song, library) ?? 120
        const totalMeasures = Math.max(1, loopMeasureCount ?? song.loopMeasureCount ?? songLengthMeasures(song))

        // same formula as Transport.setBpm: TICK ticks per beat
        const secondsPerTick = 60 / (bpm * TICK)
        const totalTicks = Math.ceil(totalMeasures * BEATS_PER_MEASURE * TICK)
        const duration = totalTicks * secondsPerTick
        const sampleRate = 44100

        const schedule = async () => {
            const offlineCtx = new OfflineAudioContext(2, Math.ceil(sampleRate * duration), sampleRate)

            const exporterAudioEngine = new AudioEngine({
                audioCtx: offlineCtx,
                sounds: soundRegistry.sounds,
                generatedSounds: soundRegistry.generatedSounds,
                // The whole library: clips reference patterns by id, not by index.
                patterns,
                getSelectedPatternIdx: () => 0,
                getAutoGenerator: getAutoGeneratorService,
                // Song mode: the engine derives its playback mode from the view
                // (AudioEngine.getPlaybackMode), so getCurrentView is the switch
                // that puts it in arrangement mode.
                getCurrentView: () => 'song',
                getSongs: () => [song],
                getSelectedSongIdx: () => 0,
                uiState: {},
                TICK,
                secondsPerTick: secondsPerTick,
                isOffline: true,
            })

            await exporterAudioEngine.start(usedPatterns[0])
            // Every layered pattern needs its own strips (filter/reverb/delay), and
            // strips are created lazily per track name — start() only syncs one.
            for (const pattern of usedPatterns) {
                await exporterAudioEngine.syncAllTracks(pattern)
            }

            exporterAudioEngine.mixer.setBpm(bpm)

            await this.#withTransportBpm(bpm, async () => {
                for (let t = 0; t < totalTicks; t++) {
                    await exporterAudioEngine.playNotes(t, t * secondsPerTick)
                }
            })

            return offlineCtx
        }

        const renderedBuffer = await this.#renderUntilAudible(schedule, expectsAudio(usedPatterns))
        return bufferToWav(renderedBuffer)
    }

    downloadWav = (blob, filename) => {
        downloadBlob(blob, valueOrFallback(filename, 'pattern.wav', 'WavExporter', 'filename fallback'))
    }
}
