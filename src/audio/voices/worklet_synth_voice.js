import BaseVoice from './base_voice.js'
import WorkletLoader from '../worklets/loader.js'
import SYNTH_VOICE_SOURCE from '../worklets/processors/synth_voice_source.js'
import { computeOscFrequency, computeNoteRatio, computeAccent, toFiniteNumber, clamp, syncToHz } from '../math.js'
import { RELEASE_TIME } from '../../core/constants.js'
import { serviceRegistry } from '../../state/service_registry.js'

// Register the synth-voice processor (idempotent)
WorkletLoader.register('synth-voice', SYNTH_VOICE_SOURCE)

const WAVE_TO_INT = { sine: 0, triangle: 1, sawtooth: 2, square: 3, random: 4 }
const FILTER_TO_INT = { lowpass: 0, highpass: 1, bandpass: 2, notch: 3 }
const LFO_TARGET_TO_INT = { NOT: 0, FLT: 1, VCO1: 2, VCO2: 3, VCO3: 4, masterVolume: 5, 'vco1.gain': 6, 'vco1.detune': 7, 'vco1.octave': 8, 'vco2.gain': 9, 'vco2.detune': 10, 'vco2.octave': 11, 'vco3.gain': 12, 'vco3.detune': 13, 'vco3.octave': 14, 'filter.freq': 15, 'filter.filterEnvelopeAmount': 16, 'filter.Q': 17, 'noise.mix': 18 }

const SYNTH_VOICE_OPTIONS = Object.freeze({
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [2],
})

async function createSynthVoiceNode(audioCtx) {
    await WorkletLoader.ensureLoaded(audioCtx)
    return WorkletLoader.createNode(audioCtx, 'synth-voice', SYNTH_VOICE_OPTIONS)
}

function postTrigger(node, startTime) {
    node.port.postMessage({ type: 'trigger', startTime })
}

function postRelease(node, releaseTime) {
    node.port.postMessage({ type: 'release', releaseTime })
}

function postUpdate(node, params) {
    node.port.postMessage({ type: 'update', ...params })
}

/**
 * Synth voice that runs entirely on an AudioWorklet processor.
 *
 * The host sends trigger/release/update messages via the worklet's port;
 * the worklet runs the ADSR + filter DSP in the audio thread. This avoids
 * the per-note OscillatorNode + GainNode + BiquadFilterNode allocation
 * pressure that a native Web Audio node graph would impose.
 *
 * Features: 3 VCOs, 2 LFOs, glide, filter envelope, noise sub-filter.
 */
export default class WorkletSynthVoice extends BaseVoice {
    constructor(audioCtx, strip, generatedSound, soundKey = null, nodePool = null) {
        super(audioCtx, strip, nodePool)
        this.generatedSound = generatedSound
        this.soundKey = soundKey
        this.workletNode = null
        this.noteVelo = 0.8
        this.noteRatio = 1
        this.masterVolume = 0.8
        this._cleanupTimer = null
    }

    async setup(flatNote, time) {
        const ctx = this.audioCtx
        const gs = this.generatedSound
        this.noteRatio = computeNoteRatio(flatNote.fpitch)

        // Normalize velocity by total VCO gain so output level matches SampleVoice
        const totalVcoGain = toFiniteNumber(gs.vco1?.gain, 0) + toFiniteNumber(gs.vco2?.gain, 0) + toFiniteNumber(gs.vco3?.gain, 0)
        const vcoNorm = totalVcoGain > 0.001 ? 1 / totalVcoGain : 1
        this.noteVelo = (flatNote.note?.velocity ?? 0.8) * vcoNorm

        this.workletNode = this.registerNode(await createSynthVoiceNode(ctx))
        this._sendUpdate(gs, flatNote.pan ?? 0)
        this.connectToStripInput(this.workletNode)
    }

    start(time) {
        if (!this.workletNode) return

        const gs = this.generatedSound
        const slideTime = toFiniteNumber(gs.slide, 0)
        const hasGlide = slideTime > 0

        // Compute target frequencies
        const f1 = gs.vco1 ? computeOscFrequency(this.noteRatio, gs.vco1.octave, gs.vco1.detune) : 0
        const f2 = gs.vco2 ? computeOscFrequency(this.noteRatio, gs.vco2.octave, gs.vco2.detune) : 0
        const f3 = gs.vco3 ? computeOscFrequency(this.noteRatio, gs.vco3.octave, gs.vco3.detune) : 0

        // Send trigger with last frequencies for glide
        const triggerMsg = { type: 'trigger', startTime: time }
        if (hasGlide) {
            triggerMsg.lastFreq1 = this.workletNode._lastFreq1 ?? f1
            triggerMsg.lastFreq2 = this.workletNode._lastFreq2 ?? f2
            triggerMsg.lastFreq3 = this.workletNode._lastFreq3 ?? f3
        }
        this.workletNode.port.postMessage(triggerMsg)

        // Store current freqs for next note's glide
        this.workletNode._lastFreq1 = f1
        this.workletNode._lastFreq2 = f2
        this.workletNode._lastFreq3 = f3

        // Safety: force-stop after 3 seconds to prevent infinite sustain
        if (this._safetyTimer) clearTimeout(this._safetyTimer)
        this._safetyTimer = setTimeout(() => {
            if (!this.stopped) this.stop(this.audioCtx.currentTime)
            this._safetyTimer = null
        }, 3000)
    }

    stop(time) {
        if (this.stopped) return
        super.stop(time)
        if (this._cleanupTimer) {
            clearTimeout(this._cleanupTimer)
            this._cleanupTimer = null
        }
        if (this._safetyTimer) {
            clearTimeout(this._safetyTimer)
            this._safetyTimer = null
        }
        if (this.workletNode) {
            postRelease(this.workletNode, time)
        }

        const gs = this.generatedSound
        const env = gs?.enveloppe ?? { release: 0.1 }
        const release = Math.max(0.008, toFiniteNumber(env.release, 0.1))
        const cleanupDelay = Math.max(0, time - this.audioCtx.currentTime) + release + RELEASE_TIME
        if (typeof setTimeout === 'function') {
            this._cleanupTimer = setTimeout(() => {
                this.cleanup()
                if (this.onEnded) this.onEnded()
                this._cleanupTimer = null
            }, cleanupDelay * 1000)
        }
    }

    updateGeneratedSound(generatedSound) {
        this.generatedSound = generatedSound
        if (!this.workletNode) return
        this._sendUpdate(generatedSound, 0)
    }

    // Note: do not override cleanup() — BaseVoice's cleanup iterates
    // `this.nodes` and disconnects each one. The workletNode is
    // registered via registerNode() in setup(), so the parent handles
    // disconnect automatically. We only need to null the local ref.

    _sendUpdate(gs, pan) {
        const env = gs.enveloppe ?? { attack: 0.01, decay: 0.1, sustain: 0.7, release: 0.1 }
        const noiseCfg = gs.noise ?? {}
        const filterCfg = gs.filter ?? {}

        // Match native peakGain = noteVelo * masterVolume * accentMultiplier
        const { accentMultiplier } = computeAccent(this.noteVelo)
        const masterVolume = toFiniteNumber(gs.masterVolume, 0.8)
        this.masterVolume = masterVolume
        const peak = this.noteVelo * masterVolume * accentMultiplier

        postUpdate(this.workletNode, {
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
            attack: Math.min(0.5, Math.max(0.003, toFiniteNumber(env.attack, 0.01))),
            decay: Math.min(1.0, toFiniteNumber(env.decay, 0.1)),
            sustain: toFiniteNumber(env.sustain, 0.7),
            release: Math.min(0.5, Math.max(0.008, toFiniteNumber(env.release, 0.1))),
            master: 1.0,
            pan: toFiniteNumber(pan, 0),
            velocity: peak,
            lfo1Target: LFO_TARGET_TO_INT[gs.lfo?.target] ?? 0,
            lfo1Wave: WAVE_TO_INT[gs.lfo?.wave] ?? 0,
            lfo1Freq: syncToHz(gs.lfo?.sync, serviceRegistry.transport?.bpm) ?? toFiniteNumber(gs.lfo?.freq, 0),
            lfo1Depth: toFiniteNumber(gs.lfo?.depth, 0),
            lfo2Target: LFO_TARGET_TO_INT[gs.lfo2?.target] ?? 0,
            lfo2Wave: WAVE_TO_INT[gs.lfo2?.wave] ?? 0,
            lfo2Freq: syncToHz(gs.lfo2?.sync, serviceRegistry.transport?.bpm) ?? toFiniteNumber(gs.lfo2?.freq, 0),
            lfo2Depth: toFiniteNumber(gs.lfo2?.depth, 0),
            slide: toFiniteNumber(gs.slide, 0) / 1000,
            filterEnvAmt: clamp(toFiniteNumber(filterCfg.filterEnvelopeAmount, 0), 0, 1),
            fmAmount: clamp(toFiniteNumber(gs.fm?.amount, 0), 0, 1),
        })
    }
}
