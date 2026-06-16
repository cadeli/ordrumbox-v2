import BaseVoice from './base_voice.js'
import Utils from '../../core/utils.js'
import {
    LFO_GAIN_MULTIPLIER,
    LFO_FREQ_OFFSET,
    NOTE_VELO_BALANCE,
    MIN_GAIN_VALUE,
    STOP_BUFFER,
    STOP_EXTRA_BUFFER,
    RELEASE_TIME,
    NOISE_FILTER_FREQ_DEFAULT,
    FILTER_FREQ_MAX,
} from '../../core/constants.js'
import {
    clamp,
    toFiniteNumber,
    computeOscFrequency,
    computeNoteRatio,
    computeAccent,
} from '../math.js'

const MIN_ATTACK  = 0.003
const MIN_RELEASE = 0.008

let _sharedNoiseBuffer = null
let _sharedNoiseSampleRate = 0

export default class SynthVoice extends BaseVoice {

    static #lfoTargetMap() {
        if (SynthVoice._lfoMap) return SynthVoice._lfoMap
        const hz    = d => LFO_GAIN_MULTIPLIER * d
        const q24   = d => 24 * d
        const det   = d => 100 * d
        const oct   = d => 1200 * d
        const unity = d => d
        SynthVoice._lfoMap = {
            'FLT':                         { mult: hz,    params: v => [v.voiceFilter1?.frequency, v.voiceFilter2?.frequency] },
            'VCO1':                        { mult: hz,    params: v => [v.vcoSlots[0]?.osc.detune] },
            'VCO2':                        { mult: hz,    params: v => [v.vcoSlots[1]?.osc.detune] },
            'VCO3':                        { mult: hz,    params: v => [v.vcoSlots[2]?.osc.detune] },
            'masterVolume':                { mult: unity, params: v => [v.gainEnv?.gain] },
            'vco1.gain':                   { mult: unity, params: v => [v.vcoSlots[0]?.gain.gain] },
            'vco1.detune':                 { mult: det,   params: v => [v.vcoSlots[0]?.osc.detune] },
            'vco1.octave':                 { mult: oct,   params: v => [v.vcoSlots[0]?.osc.detune] },
            'vco2.gain':                   { mult: unity, params: v => [v.vcoSlots[1]?.gain.gain] },
            'vco2.detune':                 { mult: det,   params: v => [v.vcoSlots[1]?.osc.detune] },
            'vco2.octave':                 { mult: oct,   params: v => [v.vcoSlots[1]?.osc.detune] },
            'vco3.gain':                   { mult: unity, params: v => [v.vcoSlots[2]?.gain.gain] },
            'vco3.detune':                 { mult: det,   params: v => [v.vcoSlots[2]?.osc.detune] },
            'vco3.octave':                 { mult: oct,   params: v => [v.vcoSlots[2]?.osc.detune] },
            'filter.freq':                 { mult: hz,    params: v => [v.voiceFilter1?.frequency, v.voiceFilter2?.frequency] },
            'filter.filterEnvelopeAmount': { mult: hz,    params: v => [v.voiceFilter1?.frequency, v.voiceFilter2?.frequency] },
            'filter.Q':                    { mult: q24,   params: v => [v.voiceFilter1?.Q, v.voiceFilter2?.Q] },
            'noise.mix':                   { mult: unity, params: v => [v.noiseGain?.gain] },
            'noise.filterFreq':            { mult: hz,    params: v => [v.noiseFilter?.frequency] },
            'noise.filterQ':               { mult: q24,   params: v => [v.noiseFilter?.Q] },
        }
        return SynthVoice._lfoMap
    }

    constructor(audioCtx, strip, generatedSound, soundKey = null, nodePool = null) {
        super(audioCtx, strip, nodePool)
        this.generatedSound = generatedSound
        this.soundKey       = soundKey
        this.masterLfo      = null
        this.masterLfo2     = null
        this.oscNodes       = []
        this.vcoSlots       = []
        this.gainEnv        = null
        this.panNode        = null
        this.noiseNode      = null
        this.voiceFilter1   = null
        this.voiceFilter2   = null
        this.noiseGain      = null
        this.noiseFilter    = null
        this.lfoGain        = null
        this.lfoGain2       = null
        this.noteVelo       = 0
        this.noteRatio      = 1
        this.masterVolume   = 0.8
        this._cleanupTimer  = null
    }

    #setupOsc(cfg, noteRatio) {
        if (!cfg) return null
        const gainValue = toFiniteNumber(cfg.gain, 1)
        const osc  = this.registerNode(this.audioCtx.createOscillator())
        const gain = this.acquireNode('GainNode')
        const freq = computeOscFrequency(noteRatio, cfg.octave, cfg.detune)
        osc.frequency.value = freq
        osc.type            = typeof cfg.wave === 'string' ? cfg.wave : 'sine'
        gain.gain.value     = gainValue
        osc.connect(gain)
        gain.connect(this.panNode)
        return { osc, gain, baseGain: gainValue, freq }
    }

    #applyFilterParams(filterConfig, time, rampTime) {
        if (!this.voiceFilter1 || !this.voiceFilter2) return
        const type = typeof filterConfig?.type === 'string' ? filterConfig.type : 'lowpass'
        const freq = Utils.normalizeSynthFilterFreqValue(toFiniteNumber(filterConfig?.freq, 50))
        const q    = Utils.normalizeSynthFilterQValue(toFiniteNumber(filterConfig?.Q, 1))
        this.voiceFilter1.type = type
        this.voiceFilter2.type = type
        this.voiceFilter1.frequency.setTargetAtTime(freq, time, rampTime)
        this.voiceFilter2.frequency.setTargetAtTime(freq, time, rampTime)
        this.voiceFilter1.Q.setTargetAtTime(q, time, rampTime)
        this.voiceFilter2.Q.setTargetAtTime(q, time, rampTime)
    }

    setup(flatNote, time) {
        const ctx   = this.audioCtx
        const gs    = this.generatedSound
        const track = flatNote.track
        const noteRatio = computeNoteRatio(flatNote.fpitch)
        this.noteRatio  = noteRatio
        this.noteVelo   = (flatNote.note?.velocity ?? 0.8) * 0.25
        const env       = gs.enveloppe ?? { attack: 0, decay: 0, sustain: 1, release: 0 }
        const lfoTarget = gs.lfo?.target ?? 'NOT'
        const lfoTarget2 = gs.lfo2?.target ?? 'NOT'

        this.gainEnv  = this.acquireNode('GainNode')
        this.panNode  = this.acquireNode('StereoPannerNode')
        this.lfoGain  = this.acquireNode('GainNode')
        this.lfoGain2 = this.acquireNode('GainNode')

        if (lfoTarget !== 'NOT') {
            this.masterLfo = this.registerNode(this.audioCtx.createOscillator())
            this.masterLfo.type            = typeof gs.lfo?.wave === 'string' ? gs.lfo.wave : 'sine'
            this.masterLfo.frequency.value = toFiniteNumber(gs.lfo?.freq, 0) + LFO_FREQ_OFFSET
            this.lfoGain.gain.value        = this.computeLfoDepth(lfoTarget)
            this.masterLfo.connect(this.lfoGain)
        }

        if (lfoTarget2 !== 'NOT') {
            this.masterLfo2 = this.registerNode(this.audioCtx.createOscillator())
            this.masterLfo2.type            = typeof gs.lfo2?.wave === 'string' ? gs.lfo2.wave : 'sine'
            this.masterLfo2.frequency.value = toFiniteNumber(gs.lfo2?.freq, 0) + LFO_FREQ_OFFSET
            this.lfoGain2.gain.value        = this.computeLfoDepth2(lfoTarget2)
            this.masterLfo2.connect(this.lfoGain2)
        }

        this.vcoSlots = [gs.vco1, gs.vco2, gs.vco3].map(cfg => this.#setupOsc(cfg, noteRatio))
        this.oscNodes = this.vcoSlots.filter(Boolean)

        const slideTime = toFiniteNumber(gs.slide, 0)
        const glideTime = slideTime / 1000
        const hasGlide  = slideTime > 0
        
        if (!track._lastPitches) track._lastPitches = [undefined, undefined, undefined]
        
        this.vcoSlots.forEach((v, i) => {
            if (!v) return
            const targetFreq = toFiniteNumber(v.freq, 440)
            const lastFreq = track._lastPitches[i]

            if (hasGlide && lastFreq !== undefined && Number.isFinite(lastFreq)) {
                v.osc.frequency.setValueAtTime(lastFreq, time)
                v.osc.frequency.linearRampToValueAtTime(targetFreq, time + glideTime)
            } else {
                v.osc.frequency.setValueAtTime(targetFreq, time)
            }
        })
        track._lastPitches[0] = this.vcoSlots[0]?.freq
        track._lastPitches[1] = this.vcoSlots[1]?.freq
        track._lastPitches[2] = this.vcoSlots[2]?.freq

        const { accentMultiplier, accentFilterBoost } = computeAccent(this.noteVelo)
        if (flatNote.pan !== undefined) this.panNode.pan.value = toFiniteNumber(flatNote.pan, 0)

        this.voiceFilter1 = this.acquireNode('BiquadFilterNode')
        this.voiceFilter2 = this.acquireNode('BiquadFilterNode')
        const filterType  = typeof gs.filter?.type === 'string' ? gs.filter.type : 'lowpass'
        this.voiceFilter1.type = filterType
        this.voiceFilter2.type = filterType

        const baseFreq     = toFiniteNumber(gs.filter?.freq, 50)
        const mFreq        = Utils.normalizeSynthFilterFreqValue(baseFreq + accentFilterBoost)
        const mQ           = Utils.normalizeSynthFilterQValue(toFiniteNumber(gs.filter?.Q, 1))
        const filterEnvAmt = clamp(toFiniteNumber(gs.filter?.filterEnvelopeAmount, 0), 0, 1)
        const peakFreq     = Utils.normalizeSynthFilterFreqValue(mFreq + ((FILTER_FREQ_MAX - mFreq) * filterEnvAmt))

        this.voiceFilter1.frequency.setValueAtTime(mFreq, time)
        this.voiceFilter1.Q.setValueAtTime(mQ, time)
        this.voiceFilter2.frequency.setValueAtTime(mFreq, time)
        this.voiceFilter2.Q.setValueAtTime(mQ, time)
        if (filterEnvAmt > 0) {
            this.voiceFilter1.frequency.linearRampToValueAtTime(peakFreq, time + env.attack)
            this.voiceFilter1.frequency.linearRampToValueAtTime(mFreq,    time + env.attack + env.decay)
            this.voiceFilter2.frequency.linearRampToValueAtTime(peakFreq, time + env.attack)
            this.voiceFilter2.frequency.linearRampToValueAtTime(mFreq,    time + env.attack + env.decay)
        }

        this.panNode.connect(this.voiceFilter1)
        this.voiceFilter1.connect(this.voiceFilter2)
        this.voiceFilter2.connect(this.gainEnv)
        this.connectToStripInput(this.gainEnv)

        const noiseConfig = gs.noise ?? {}
        const noiseMix    = toFiniteNumber(noiseConfig.mix, 0)
        const needsNoise  = noiseMix > 0 || lfoTarget.startsWith('noise')

        if (needsNoise) {
            if (!_sharedNoiseBuffer || _sharedNoiseSampleRate !== ctx.sampleRate) {
                const noiseBufferSize = ctx.sampleRate * 2
                _sharedNoiseBuffer = ctx.createBuffer(1, noiseBufferSize, ctx.sampleRate)
                const noiseData = _sharedNoiseBuffer.getChannelData(0)
                for (let i = 0; i < noiseBufferSize; i++) noiseData[i] = Math.random() * 2 - 1
                _sharedNoiseSampleRate = ctx.sampleRate
            }

            this.noiseNode        = this.registerNode(ctx.createBufferSource())
            this.noiseNode.buffer = _sharedNoiseBuffer
            this.noiseNode.loop   = true
            this.noiseGain        = this.acquireNode('GainNode')
            this.noiseGain.gain.value = noiseMix
            this.noiseFilter      = this.acquireNode('BiquadFilterNode')
            this.noiseFilter.type = typeof noiseConfig.filterType === 'string' ? noiseConfig.filterType : 'highpass'
            this.noiseFilter.frequency.value = toFiniteNumber(noiseConfig.filterFreq, NOISE_FILTER_FREQ_DEFAULT)
            this.noiseFilter.Q.value         = toFiniteNumber(noiseConfig.filterQ, 1)
            this.noiseNode.connect(this.noiseFilter)
            this.noiseFilter.connect(this.noiseGain)
            this.noiseGain.connect(this.panNode)
        }

        const oscMix = 1 - noiseMix
        this.oscNodes.forEach(v => { v.gain.gain.value = v.baseGain * oscMix })

        const masterVolume = toFiniteNumber(gs.masterVolume, 0.8)
        this.masterVolume  = masterVolume
        const attackTime    = env.attack ?? 0
        const decayTime     = env.decay ?? 0
        const sustainLevel  = env.sustain ?? 1
        const releaseTime   = env.release ?? 0
        const peakGain      = this.noteVelo * masterVolume * accentMultiplier

        const safeAttack  = Math.max(MIN_ATTACK,  attackTime)
        const safeRelease = Math.max(MIN_RELEASE, releaseTime)

        this.connectLfoTarget(lfoTarget)
        this.connectLfoTarget2(lfoTarget2)

        this.gainEnv.gain.setValueAtTime(MIN_GAIN_VALUE, time)
        this.gainEnv.gain.linearRampToValueAtTime(peakGain, time + safeAttack)
        this.gainEnv.gain.linearRampToValueAtTime(peakGain * sustainLevel, time + safeAttack + decayTime)
        this.releaseStart = time + safeAttack + decayTime
        this.gainEnv.gain.linearRampToValueAtTime(MIN_GAIN_VALUE, this.releaseStart + safeRelease)

        this.totalStopTime = this.releaseStart + safeRelease + RELEASE_TIME
    }

    computeLfoDepth(target) {
        const depth = toFiniteNumber(this.generatedSound.lfo?.depth, 0)
        return SynthVoice.#lfoTargetMap()[target]?.mult(depth) ?? 0
    }

    computeLfoDepth2(target) {
        const depth = toFiniteNumber(this.generatedSound.lfo2?.depth, 0)
        return SynthVoice.#lfoTargetMap()[target]?.mult(depth) ?? 0
    }

    connectLfoTarget(target) {
        if (!this.masterLfo || !target || target === 'NOT') return
        if (!this.lfoGain) return
        const entry = SynthVoice.#lfoTargetMap()[target]
        if (!entry) return
        for (const param of entry.params(this)) {
            if (param) this.lfoGain.connect(param)
        }
    }

    connectLfoTarget2(target) {
        if (!this.masterLfo2 || !target || target === 'NOT') return
        if (!this.lfoGain2) return
        const entry = SynthVoice.#lfoTargetMap()[target]
        if (!entry) return
        for (const param of entry.params(this)) {
            if (param) this.lfoGain2.connect(param)
        }
    }

    #updateLfo(lfoNum, lfoConfig, time, rampTime) {
        const target = lfoConfig?.target ?? 'NOT'
        const masterLfo = lfoNum === 1 ? this.masterLfo : this.masterLfo2
        const lfoGain = lfoNum === 1 ? this.lfoGain : this.lfoGain2
        const connectFn = lfoNum === 1 ? (t) => this.connectLfoTarget(t) : (t) => this.connectLfoTarget2(t)
        const depthFn = lfoNum === 1 ? (t) => this.computeLfoDepth(t) : (t) => this.computeLfoDepth2(t)

        if (target !== 'NOT') {
            if (!masterLfo) {
                const osc = this.registerNode(this.audioCtx.createOscillator())
                if (lfoNum === 1) this.masterLfo = osc
                else this.masterLfo2 = osc
            }
            const lfo = lfoNum === 1 ? this.masterLfo : this.masterLfo2
            lfo.type = typeof lfoConfig?.wave === 'string' ? lfoConfig.wave : 'sine'
            lfo.frequency.setTargetAtTime(toFiniteNumber(lfoConfig?.freq, 0) + LFO_FREQ_OFFSET, time, rampTime)
            try { lfoGain.disconnect() } catch (e) {}
            lfoGain.gain.setTargetAtTime(depthFn(target), time, rampTime)
            connectFn(target)
        } else if (masterLfo) {
            try { lfoGain.disconnect() } catch (e) {}
            if (lfoNum === 1) this.masterLfo = null
            else this.masterLfo2 = null
        }
    }

    updateGeneratedSound(generatedSound, time = this.audioCtx.currentTime) {
        this.generatedSound = generatedSound
        const rampTime = 0.01

        this.#updateLfo(1, generatedSound.lfo, time, rampTime)
        this.#updateLfo(2, generatedSound.lfo2, time, rampTime)

        const noiseConfig = generatedSound.noise ?? {}
        const noiseMix    = clamp(toFiniteNumber(noiseConfig.mix, 0), 0, 1)
        if (this.noiseGain)   this.noiseGain.gain.setTargetAtTime(noiseMix, time, rampTime)
        if (this.noiseFilter) {
            this.noiseFilter.type = typeof noiseConfig.filterType === 'string' ? noiseConfig.filterType : 'highpass'
            this.noiseFilter.frequency.setTargetAtTime(toFiniteNumber(noiseConfig.filterFreq, NOISE_FILTER_FREQ_DEFAULT), time, rampTime)
            this.noiseFilter.Q.setTargetAtTime(toFiniteNumber(noiseConfig.filterQ, 1), time, rampTime)
        }

        const oscMix   = 1 - noiseMix
        const vcoCfgs  = [generatedSound.vco1, generatedSound.vco2, generatedSound.vco3]
        this.vcoSlots.forEach((v, i) => {
            if (!v) return
            const cfg       = vcoCfgs[i]
            const gainValue = toFiniteNumber(cfg?.gain, v.baseGain)
            v.baseGain      = gainValue
            v.gain.gain.setTargetAtTime(gainValue * oscMix, time, rampTime)
            if (typeof cfg?.wave === 'string') v.osc.type = cfg.wave
            v.osc.frequency.setTargetAtTime(computeOscFrequency(this.noteRatio, cfg?.octave, cfg?.detune), time, rampTime)
            v.osc.detune.setTargetAtTime(toFiniteNumber(cfg?.detune, 0), time, rampTime)
        })

        const nextMasterVolume = toFiniteNumber(generatedSound.masterVolume, this.masterVolume)
        if (this.gainEnv && nextMasterVolume !== this.masterVolume) {
            const ratio    = this.masterVolume > 0 ? nextMasterVolume / this.masterVolume : nextMasterVolume
            const nextGain = Math.max(MIN_GAIN_VALUE, (this.gainEnv.gain.value || MIN_GAIN_VALUE) * ratio)
            this.gainEnv.gain.setTargetAtTime(nextGain, time, rampTime)
            this.masterVolume = nextMasterVolume
        }

        this.#applyFilterParams(generatedSound.filter, time, rampTime)
    }

    start(time) {
        this.oscNodes.forEach(v => {
            v.osc.start(time)
            v.osc.stop(this.totalStopTime)
        })
        if (this.noiseNode) {
            this.noiseNode.start(time)
            this.noiseNode.stop(this.totalStopTime + 0.1)
        }
        if (this.masterLfo) {
            this.masterLfo.start(time)
            this.masterLfo.stop(this.totalStopTime + 0.1)
        }
        if (this.masterLfo2) {
            this.masterLfo2.start(time)
            this.masterLfo2.stop(this.totalStopTime + 0.1)
        }
        // Single cleanup timer — matches WorkletSynthVoice pattern.
        // Per-oscillator onended caused a race: the first oscillator to end
        // called cleanup() which released pooled nodes back to the NodePool,
        // while oscillators 2 & 3 were still scheduled. A new voice acquiring
        // those recycled nodes could inherit stale audio graph connections.
        const totalSec = Math.max(0, this.totalStopTime - time) + 0.1
        if (typeof setTimeout === 'function') {
            this._cleanupTimer = setTimeout(() => {
                this.cleanup()
                if (this.onEnded) this.onEnded()
                this._cleanupTimer = null
            }, totalSec * 1000)
        }
    }

    stop(time) {
        if (this.stopped) return
        super.stop(time)
        if (this._cleanupTimer) {
            clearTimeout(this._cleanupTimer)
            this._cleanupTimer = null
        }
        try {
            this.gainEnv.gain.cancelScheduledValues(time)
            const currentGain = Math.max(MIN_GAIN_VALUE, this.gainEnv.gain.value || this.noteVelo || 1)
            this.gainEnv.gain.setValueAtTime(currentGain, time)
            this.gainEnv.gain.exponentialRampToValueAtTime(MIN_GAIN_VALUE, time + STOP_BUFFER)
        } catch (e) {}
        for (let i = 0; i < this.oscNodes.length; i++) {
            try { this.oscNodes[i].osc.stop(time + STOP_EXTRA_BUFFER) } catch (e) {}
        }
        if (this.noiseNode) try { this.noiseNode.stop(time + STOP_EXTRA_BUFFER) } catch (e) {}
        if (this.masterLfo) try { this.masterLfo.stop(time + STOP_EXTRA_BUFFER) } catch (e) {}
        if (this.masterLfo2) try { this.masterLfo2.stop(time + STOP_EXTRA_BUFFER) } catch (e) {}

        // Schedule a final cleanup after the stop ramp completes
        const stopDelay = Math.max(0, time - this.audioCtx.currentTime) + STOP_EXTRA_BUFFER + 0.05
        if (typeof setTimeout === 'function') {
            this._cleanupTimer = setTimeout(() => {
                this.cleanup()
                if (this.onEnded) this.onEnded()
                this._cleanupTimer = null
            }, stopDelay * 1000)
        }
    }
}
