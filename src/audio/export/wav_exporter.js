// @ts-check
import AudioEngine from '../engine.js'
import { TICK } from '../../core/constants.js'
import { bufferToWav } from './wav_encoder.js'
import { serviceRegistry } from '../../state/service_registry.js'
import { getAutoGenerateService } from '../../state/service_loader.js'
import { soundRegistry } from '../../state/sound_registry.js'
import { nameOr } from '../../core/logger.js'
import { downloadBlob } from '../../core/download.js'
import { appState } from '../../state/app_state.js'
import { BEATS_PER_BAR, songLengthBars } from '../../model/song_schema.js'
import { songTempo } from '../../logic/song_playback.js'

export default class WavExporter {
    constructor() {}

    exportPatternToWav = async (pattern, loopsCount = 1) => {
        const TICK_TIME = ((60 * 4) / (pattern.bpm * TICK)) * 0.25 // Match Transport.js timing
        const duration = pattern.beatCount * TICK * loopsCount * TICK_TIME
        const sampleRate = 44100
        const offlineCtx = new OfflineAudioContext(2, Math.floor(sampleRate * duration), sampleRate)

        const exporterAudioEngine = new AudioEngine({
            audioCtx: offlineCtx,
            sounds: soundRegistry.sounds,
            generatedSounds: soundRegistry.generatedSounds,
            patterns: [pattern],
            selectedPatternIdx: 0,
            getSelectedPatternIdx: () => 0,
            getAutoGenerate: getAutoGenerateService,
            uiState: {},
            TICK,
            secondsPerBeat: TICK_TIME * 4, // Approx seconds per beat for swing
            isOffline: true,
        })

        // start() awaits the worklet mixer init internally — must be awaited
        // before playNotes, otherwise this.player is null and notes are dropped.
        // It rethrows on failure so we never render a silent WAV.
        await exporterAudioEngine.start(pattern)

        // Sync strip BPM so delay/reverb timing matches the pattern tempo.
        // engine.start() applies track effects but never calls mixer.setBpm().
        exporterAudioEngine.mixer.setBpm(pattern.bpm)

        // Synth voices read serviceRegistry.transport.bpm for auto-release and
        // LFO-sync timing (worklet_synth_voice), and other services keep
        // reading start/tick/isRunning on the live transport — so never swap
        // the object: only the bpm value is changed in place, then restored.
        const savedTransport = serviceRegistry.transport
        const savedBpm = savedTransport?.bpm
        if (savedTransport) {
            savedTransport.bpm = pattern.bpm
        } else {
            serviceRegistry.transport = { bpm: pattern.bpm }
        }

        try {
            // Simple offline scheduling
            const totalTicks = pattern.beatCount * TICK * loopsCount

            for (let t = 0; t < totalTicks; t++) {
                await exporterAudioEngine.playNotes(t, t * TICK_TIME)
            }
        } finally {
            // Always restore, even on render/schedule failure
            if (savedTransport) {
                savedTransport.bpm = savedBpm
            } else {
                serviceRegistry.transport = null
            }
        }

        const renderedBuffer = await offlineCtx.startRendering()
        const wavBlob = bufferToWav(renderedBuffer)

        return wavBlob
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
     * @param {number} [opts.loopBars] override the arrangement length
     * @returns {Promise<Blob>}
     */
    exportSongToWav = async (song, { patterns = appState.patterns ?? [], loopBars } = {}) => {
        /** @type {Map<string, { bpm?: number }>} */
        const library = new Map(patterns.filter((p) => p?.id).map((p) => [p.id, p]))
        const usedPatterns = (song.clips ?? []).map((c) => library.get(c.pattern)).filter(Boolean)
        if (usedPatterns.length === 0) throw new Error('This song has no playable clip')

        const bpm = songTempo(song, library) ?? 120
        const totalBars = Math.max(1, loopBars ?? song.loopBars ?? songLengthBars(song))

        const TICK_TIME = ((60 * 4) / (bpm * TICK)) * 0.25 // Match Transport.js timing
        const totalTicks = Math.ceil(totalBars * BEATS_PER_BAR * TICK)
        const duration = totalTicks * TICK_TIME
        const sampleRate = 44100
        const offlineCtx = new OfflineAudioContext(2, Math.ceil(sampleRate * duration), sampleRate)

        const exporterAudioEngine = new AudioEngine({
            audioCtx: offlineCtx,
            sounds: soundRegistry.sounds,
            generatedSounds: soundRegistry.generatedSounds,
            // The whole library: clips reference patterns by id, not by index.
            patterns,
            selectedPatternIdx: 0,
            getSelectedPatternIdx: () => 0,
            getAutoGenerate: getAutoGenerateService,
            // Song mode: the engine derives its playback mode from the view
            // (AudioEngine.getPlaybackMode), so getCurrentView is the switch
            // that puts it in arrangement mode.
            getCurrentView: () => 'song',
            getSongs: () => [song],
            getSelectedSongIdx: () => 0,
            uiState: {},
            TICK,
            secondsPerBeat: TICK_TIME * 4,
            isOffline: true,
        })

        await exporterAudioEngine.start(usedPatterns[0])
        // Every layered pattern needs its own strips (filter/reverb/delay), and
        // strips are created lazily per track name — start() only syncs one.
        for (const pattern of usedPatterns) {
            await exporterAudioEngine.syncAllTracks(pattern)
        }

        exporterAudioEngine.mixer.setBpm(bpm)

        // Synth voices read serviceRegistry.transport.bpm (auto-release, LFO
        // sync) and other services read start/tick/isRunning: never swap the
        // object, only the bpm value, then restore it.
        const savedTransport = serviceRegistry.transport
        const savedBpm = savedTransport?.bpm
        if (savedTransport) {
            savedTransport.bpm = bpm
        } else {
            serviceRegistry.transport = { bpm }
        }

        try {
            for (let t = 0; t < totalTicks; t++) {
                await exporterAudioEngine.playNotes(t, t * TICK_TIME)
            }
        } finally {
            if (savedTransport) {
                savedTransport.bpm = savedBpm
            } else {
                serviceRegistry.transport = null
            }
        }

        const renderedBuffer = await offlineCtx.startRendering()
        return bufferToWav(renderedBuffer)
    }

    downloadWav = (blob, filename) => {
        downloadBlob(blob, nameOr(filename, 'pattern.wav', 'WavExporter', 'filename fallback'))
    }
}
