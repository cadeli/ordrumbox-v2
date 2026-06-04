import BaseVoice from './base_voice.js'
import WorkletBridge from '../worklets/bridge.js'
import { computeOscFrequency, computeNoteRatio, computeAccent, toFiniteNumber } from '../math.js'
import { RELEASE_TIME } from '../../core/constants.js'

const WAVE_TO_INT = { sine: 0, triangle: 1, sawtooth: 2, square: 3 }
const FILTER_TO_INT = { lowpass: 0, highpass: 1, bandpass: 2, notch: 3 }

/**
 * Drop-in replacement for SynthVoice when AudioWorklet mode is active.
 *
 * The host sends trigger/release/update messages via the worklet's port;
 * the worklet runs the ADSR + filter DSP in the audio thread. This avoids
 * the per-note OscillatorNode + GainNode + BiquadFilterNode allocation
 * pressure that the native SynthVoice imposes.
 *
 * Limitations (vs. native SynthVoice):
 *   - No glide (slide)
 *   - No LFO routing
 *   - Single filter (no dual)
 *   - No filter envelope
 *   - No noise sub-filter
 *
 * The voice_factory decides whether to instantiate this or the native
 * SynthVoice based on generatedSound content.
 */
export default class WorkletSynthVoice extends BaseVoice {
    constructor(audioCtx, strip, generatedSound, soundKey = null) {
        super(audioCtx, strip)
        this.generatedSound = generatedSound
        this.soundKey = soundKey
        this.workletNode = null
        this.noteVelo = 0.8
        this.noteRatio = 1
        this.masterVolume = 0.8
    }

    setup(flatNote, time) {
        const ctx = this.audioCtx
        const gs = this.generatedSound
        this.noteRatio = computeNoteRatio(flatNote.fpitch)
        this.noteVelo = (flatNote.note?.velocity ?? 0.8) * 0.25

        this.workletNode = WorkletBridge.createSynthVoice(ctx)
        this._sendUpdate(gs, flatNote.pan ?? 0)
        this.connectToStripInput(this.workletNode)
    }

    start(time) {
        if (!this.workletNode) return
        WorkletBridge.triggerVoice(this.workletNode, time)
        const env = this.generatedSound.enveloppe ?? {}
        const totalSec = (env.attack || 0) + (env.decay || 0) + (env.release || 0) + RELEASE_TIME
        this.totalStopTime = time + totalSec
        // Cleanup runs in the audio thread, but we still need to release JS-side refs.
        // Use a microtask-based timer to avoid blocking the call site.
        if (typeof setTimeout === 'function') {
            setTimeout(() => {
                this.cleanup()
                if (this.onEnded) this.onEnded()
            }, totalSec * 1000)
        }
    }

    stop(time) {
        if (this.stopped) return
        super.stop(time)
        if (this.workletNode) {
            WorkletBridge.releaseVoice(this.workletNode, time)
        }
    }

    updateGeneratedSound(generatedSound) {
        this.generatedSound = generatedSound
        if (!this.workletNode) return
        this._sendUpdate(generatedSound, 0)
    }

    cleanup = () => {
        if (this.workletNode) {
            try { this.workletNode.disconnect() } catch (e) { /* already disconnected */ }
        }
        this.workletNode = null
        super.cleanup()
    }

    _sendUpdate(gs, pan) {
        const env = gs.enveloppe ?? { attack: 0.01, decay: 0.1, sustain: 0.7, release: 0.1 }
        const noiseCfg = gs.noise ?? {}
        const filterCfg = gs.filter ?? {}

        // Match native peakGain = noteVelo * masterVolume * accentMultiplier
        const { accentMultiplier } = computeAccent(this.noteVelo)
        const masterVolume = toFiniteNumber(gs.masterVolume, 0.8)
        this.masterVolume = masterVolume
        const peak = this.noteVelo * masterVolume * accentMultiplier

        WorkletBridge.updateVoice(this.workletNode, {
            osc1Freq: gs.vco1 ? computeOscFrequency(this.noteRatio, gs.vco1.octave, gs.vco1.detune) : 0,
            osc2Freq: gs.vco2 ? computeOscFrequency(this.noteRatio, gs.vco2.octave, gs.vco2.detune) : 0,
            osc3Freq: gs.vco3 ? computeOscFrequency(this.noteRatio, gs.vco3.octave, gs.vco3.detune) : 0,
            osc1Gain: toFiniteNumber(gs.vco1?.gain, 0),
            osc2Gain: toFiniteNumber(gs.vco2?.gain, 0),
            osc3Gain: toFiniteNumber(gs.vco3?.gain, 0),
            osc1Detune: toFiniteNumber(gs.vco1?.detune, 0),
            osc2Detune: toFiniteNumber(gs.vco2?.detune, 0),
            osc3Detune: toFiniteNumber(gs.vco3?.detune, 0),
            osc1Wave: WAVE_TO_INT[gs.vco1?.wave] ?? 0,
            osc2Wave: WAVE_TO_INT[gs.vco2?.wave] ?? 0,
            osc3Wave: WAVE_TO_INT[gs.vco3?.wave] ?? 0,
            noiseMix: toFiniteNumber(noiseCfg.mix, 0),
            filterType: FILTER_TO_INT[filterCfg.type] ?? 0,
            filterFreq: toFiniteNumber(filterCfg.freq, 1000),
            filterQ: toFiniteNumber(filterCfg.Q, 0.7),
            attack: Math.max(0.003, toFiniteNumber(env.attack, 0.01)),
            decay: toFiniteNumber(env.decay, 0.1),
            sustain: toFiniteNumber(env.sustain, 0.7),
            release: Math.max(0.008, toFiniteNumber(env.release, 0.1)),
            master: 1.0,  // velocity already absorbs masterVolume for the worklet path
            pan: toFiniteNumber(pan, 0),
            velocity: peak,
        })
    }
}
