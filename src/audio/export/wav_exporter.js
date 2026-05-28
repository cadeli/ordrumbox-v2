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
        const originalBpm = pattern.bpm
        const offlineCtx = new OfflineAudioContext(
            2,
            Math.floor(44100 * (60 / pattern.bpm) * pattern.nbBars * loopsCount),
            44100
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
            secondsPerBeat: (60 * 4) / (pattern.bpm * TICK),
            isOffline: true
        })

        exporterAudioEngine.start(pattern)

        // Simple offline scheduling
        let currentTick = 0
        const totalTicks = pattern.nbBars * TICK * loopsCount
        const secondsPerTick = (60 * 4) / (pattern.bpm * TICK)

        for (let t = 0; t < totalTicks; t++) {
            exporterAudioEngine.playNotes(t, t * secondsPerTick)
        }

        const renderedBuffer = await offlineCtx.startRendering()
        const wavBlob = bufferToWav(renderedBuffer)
        
        return wavBlob
    }

    downloadWav = (blob, filename) => {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename || 'pattern.wav'
        a.click()
        URL.revokeObjectURL(url)
    }
}
