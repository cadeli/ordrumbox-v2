import AudioEngine from '../engine.js'
import { TICK } from '../../core/constants.js'
import { bufferToWav } from './wav_encoder.js'
import { serviceRegistry } from '../../state/service_registry.js'
import { getAutoGenerateService } from '../../state/service_loader.js'
import { soundRegistry } from '../../state/sound_registry.js'
import { nameOr } from '../../core/logger.js'
import { downloadBlob } from '../../core/download.js'

export default class WavExporter {
    constructor() {}

    exportPatternToWav = async (pattern, loopsCount = 1) => {
        const TICK_TIME = ((60 * 4) / (pattern.bpm * TICK)) * 0.25 // Match Transport.js timing
        const duration = pattern.nbBeats * TICK * loopsCount * TICK_TIME
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
            const totalTicks = pattern.nbBeats * TICK * loopsCount

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

    downloadWav = (blob, filename) => {
        downloadBlob(blob, nameOr(filename, 'pattern.wav', 'WavExporter', 'filename fallback'))
    }
}
