import AudioEngine from '../engine.js'
import { MAX_EXPORT_LOOPS, TICK } from '../../core/constants.js'
import { bufferToWav } from './wav_encoder.js'
import { appState } from '../../state/app_state.js'
import { getAutoGenerateService, serviceRegistry } from '../../state/service_registry.js'
import { soundRegistry } from '../../state/sound_registry.js'

export default class MfWavExporter {
    constructor() {
    }

    exportPatternToWav = async (pattern, loopsCount = 1) => {
        const TICK_TIME = (60 * 4) / (pattern.bpm * TICK) * 0.25 // Match Transport.js timing
        const duration = pattern.nbBars * TICK * loopsCount * TICK_TIME
        const sampleRate = 44100
        const offlineCtx = new OfflineAudioContext(
            2,
            Math.floor(sampleRate * duration),
            sampleRate
        )

        const exporterAudioEngine = new AudioEngine({
            audioCtx: offlineCtx,
            sounds: soundRegistry.sounds,
            generatedSounds: soundRegistry.generatedSounds,
            patterns: [pattern],
            selectedPatternNum: 0,
            getSelectedPatternNum: () => 0,
            computeNextStep: (note, track) => serviceRegistry.mfPatterns.computeNextPatternStepNote(note, track),
            getAutoGenerate: getAutoGenerateService,
            uiState: {},
            TICK,
            secondsPerBeat: TICK_TIME * 4, // Approx seconds per beat for swing
            isOffline: true
        })

        // start() awaits the worklet mixer init internally — must be awaited
        // before playNotes, otherwise this.player is null and notes are dropped.
        await exporterAudioEngine.start(pattern)

        // Simple offline scheduling
        const totalTicks = pattern.nbBars * TICK * loopsCount

        for (let t = 0; t < totalTicks; t++) {
            await exporterAudioEngine.playNotes(t, t * TICK_TIME)
        }

        const renderedBuffer = await offlineCtx.startRendering()
        const wavBlob = bufferToWav(renderedBuffer)
        
        return wavBlob
    }

    downloadWav = (blob, filename) => {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename ?? (console.warn('WAV', 'filename fallback'), 'pattern.wav')
        a.click()
        URL.revokeObjectURL(url)
    }
}
