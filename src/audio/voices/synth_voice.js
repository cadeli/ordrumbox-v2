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
    NOISE_FILTER_FREQ_DEFAULT
} from '../../core/constants.js'
import {
    clamp,
    toFiniteNumber,
    computeOscFrequency,
    computeNoteRatio,
    computeAccent,
    computePeakFilterFreq,
    computeAdsrEnvelopeParams
} from '../math.js'

export default class SynthVoice extends BaseVoice {
    static lastPitchV1 = undefined
    static lastPitchV2 = undefined
    static lastPitchV3 = undefined

    constructor(audioCtx, strip, generatedSound, masterLfo, soundKey = null) {
        super(audioCtx, strip)
        this.generatedSound = generatedSound
        this.soundKey = soundKey
        this.masterLfo = masterLfo
        this.oscNodes = []
        this.gainEnv = null
        this.panNode = null
        this.noiseNode = null
        this.voiceFilter1 = null
        this.voiceFilter2 = null
        this.noiseGain = null
        this.noiseFilter = null
        this.lfoGain = null
        this.lfoNodes = null
        this.noteVelo = 0
        this.noteRatio = 1
        this.masterVolume = 0.8
    }

    setup(flatNote, time) {
        const ctx = this.audioCtx
        const generatedSound = this.generatedSound
        const noteRatio = computeNoteRatio(flatNote.fpitch)
        this.noteRatio = noteRatio
        const rawVelo = flatNote.note?.velocity ?? 0.8
        this.noteVelo = rawVelo /8
        const env = generatedSound.enveloppe ?? { attack: 0, decay: 0, sustain: 1, release: 0 }

        this.gainEnv = this.registerNode(ctx.createGain())
        this.panNode = this.registerNode(ctx.createStereoPanner())
        const lfoGain = this.registerNode(ctx.createGain())
        this.lfoGain = lfoGain
        const lfoTarget = generatedSound.lfo?.target ?? "NOT"

        if (this.masterLfo) {
            this.masterLfo.type = typeof generatedSound.lfo?.wave === "string" ? generatedSound.lfo.wave : "sine"
            this.masterLfo.frequency.value = toFiniteNumber(generatedSound.lfo?.freq, 0) + LFO_FREQ_OFFSET
            lfoGain.gain.value = this.computeLfoDepth(lfoTarget)
            this.masterLfo.connect(lfoGain)
        }

        const setupOsc = (cfg) => {
            if (!cfg) return null
            const gainValue = toFiniteNumber(cfg.gain, 1)
            const osc = this.registerNode(ctx.createOscillator())
            const gain = this.registerNode(ctx.createGain())
            const freq = computeOscFrequency(noteRatio, cfg.octave, cfg.detune)
            osc.frequency.value = freq
            osc.type = typeof cfg.wave === "string" ? cfg.wave : "sine"
            gain.gain.value = gainValue
            osc.connect(gain)
            gain.connect(this.panNode)
            return { osc, gain, baseGain: gainValue }
        }

        const v1 = setupOsc(generatedSound.vco1)
        const v2 = setupOsc(generatedSound.vco2)
        const v3 = setupOsc(generatedSound.vco3)
        this.oscNodes = [v1, v2, v3].filter(Boolean)

        const slideTime = toFiniteNumber(generatedSound.slide, 0)
        const currentPitchV1 = computeOscFrequency(noteRatio, generatedSound.vco1?.octave, generatedSound.vco1?.detune)
        const currentPitchV2 = computeOscFrequency(noteRatio, generatedSound.vco2?.octave, generatedSound.vco2?.detune)
        const currentPitchV3 = computeOscFrequency(noteRatio, generatedSound.vco3?.octave, generatedSound.vco3?.detune)

        if (slideTime > 0 && SynthVoice.lastPitchV1 !== undefined) {
            const glideTime = slideTime / 1000
            if (v1) { v1.osc.frequency.setValueAtTime(SynthVoice.lastPitchV1, time); v1.osc.frequency.linearRampToValueAtTime(currentPitchV1, time + glideTime); }
            if (v2) { v2.osc.frequency.setValueAtTime(SynthVoice.lastPitchV2, time); v2.osc.frequency.linearRampToValueAtTime(currentPitchV2, time + glideTime); }
            if (v3) { v3.osc.frequency.setValueAtTime(SynthVoice.lastPitchV3, time); v3.osc.frequency.linearRampToValueAtTime(currentPitchV3, time + glideTime); }
        } else {
            if (v1) v1.osc.frequency.setValueAtTime(currentPitchV1, time)
            if (v2) v2.osc.frequency.setValueAtTime(currentPitchV2, time)
            if (v3) v3.osc.frequency.setValueAtTime(currentPitchV3, time)
        }
        SynthVoice.lastPitchV1 = currentPitchV1
        SynthVoice.lastPitchV2 = currentPitchV2
        SynthVoice.lastPitchV3 = currentPitchV3

        const { accentMultiplier, accentFilterBoost } = computeAccent(this.noteVelo)

        if (flatNote.pan !== undefined) this.panNode.pan.value = flatNote.pan

        const voiceFilter1 = this.registerNode(ctx.createBiquadFilter())
        const voiceFilter2 = this.registerNode(ctx.createBiquadFilter())
        this.voiceFilter1 = voiceFilter1
        this.voiceFilter2 = voiceFilter2
        voiceFilter1.type = typeof generatedSound.filter?.type === "string" ? generatedSound.filter.type : "lowpass"
        voiceFilter2.type = voiceFilter1.type

        const mFreq = Utils.normalizeSynthFilterFreqValue(toFiniteNumber(generatedSound.filter?.freq, 50) + accentFilterBoost)
        const mQ = Utils.normalizeSynthFilterQValue(toFiniteNumber(generatedSound.filter?.Q, 1))
        const filterEnvelopeAmount = Math.min(1, Math.max(0, toFiniteNumber(generatedSound.filter?.filterEnvelopeAmount, 0)))
        const peakFreq = Utils.normalizeSynthFilterFreqValue(computePeakFilterFreq(mFreq, filterEnvelopeAmount))

        voiceFilter1.frequency.setValueAtTime(mFreq, time)
        voiceFilter1.Q.setValueAtTime(mQ, time)
        voiceFilter2.frequency.setValueAtTime(mFreq, time)
        voiceFilter2.Q.setValueAtTime(mQ, time)
        if (filterEnvelopeAmount > 0) {
            voiceFilter1.frequency.linearRampToValueAtTime(peakFreq, time + env.attack)
            voiceFilter1.frequency.linearRampToValueAtTime(mFreq, time + env.attack + env.decay)
            voiceFilter2.frequency.linearRampToValueAtTime(peakFreq, time + env.attack)
            voiceFilter2.frequency.linearRampToValueAtTime(mFreq, time + env.attack + env.decay)
        }

        this.panNode.connect(voiceFilter1)
        voiceFilter1.connect(voiceFilter2)
        voiceFilter2.connect(this.gainEnv)
        this.connectToStripInput(this.gainEnv)

        const noiseConfig = generatedSound.noise ?? {}
        const noiseMix = toFiniteNumber(noiseConfig.mix, 0)
        let noiseGain = null
        let noiseFilter = null

        const noiseBufferSize = ctx.sampleRate * 2
        const noiseBuffer = ctx.createBuffer(1, noiseBufferSize, ctx.sampleRate)
        const noiseData = noiseBuffer.getChannelData(0)
        for (let i = 0; i < noiseBufferSize; i++) noiseData[i] = Math.random() * 2 - 1

        this.noiseNode = this.registerNode(ctx.createBufferSource())
        this.noiseNode.buffer = noiseBuffer
        this.noiseNode.loop = true
        noiseGain = this.registerNode(ctx.createGain())
        noiseGain.gain.value = noiseMix
        noiseFilter = this.registerNode(ctx.createBiquadFilter())
        noiseFilter.type = typeof noiseConfig.filterType === "string" ? noiseConfig.filterType : "highpass"
        noiseFilter.frequency.value = toFiniteNumber(noiseConfig.filterFreq, NOISE_FILTER_FREQ_DEFAULT)
        noiseFilter.Q.value = toFiniteNumber(noiseConfig.filterQ, 1)
        this.noiseNode.connect(noiseFilter)
        noiseFilter.connect(noiseGain)
        noiseGain.connect(this.panNode)
        this.noiseGain = noiseGain
        this.noiseFilter = noiseFilter

        const oscMix = 1 - noiseMix
        this.oscNodes.forEach(v => v.gain.gain.value = v.baseGain * oscMix)

        const masterVolume = toFiniteNumber(generatedSound.masterVolume, 0.8)
        this.masterVolume = masterVolume
        const { attackTime, decayTime, sustainLevel, releaseTime, peakGain } = computeAdsrEnvelopeParams(env, this.noteVelo, masterVolume, accentMultiplier)

        this.lfoNodes = {
            v1,
            v2,
            v3,
            voiceFilter1,
            voiceFilter2,
            noiseGain,
            noiseFilter,
            gainEnv: this.gainEnv
        }
        this.connectLfoTarget(lfoTarget)

        // Envelope timings with anti-click protection
        const safeAttack = Math.max(attackTime, 0.002) // Min 2ms attack
        const safeDecay = Math.max(decayTime, 0.002)   // Min 2ms decay
        const safeRelease = Math.max(releaseTime, 0.005) // Min 5ms release

        this.gainEnv.gain.setValueAtTime(0, time)
        this.gainEnv.gain.linearRampToValueAtTime(peakGain, time + safeAttack)
        this.gainEnv.gain.linearRampToValueAtTime(peakGain * sustainLevel, time + safeAttack + safeDecay)
        
        this.releaseStart = time + safeAttack + safeDecay
        this.gainEnv.gain.exponentialRampToValueAtTime(MIN_GAIN_VALUE, this.releaseStart + safeRelease)

        this.totalStopTime = this.releaseStart + safeRelease + RELEASE_TIME
    }

    computeLfoDepth(target) {
        const depth = toFiniteNumber(this.generatedSound.lfo?.depth, 0)
        switch (target) {
            case "filter.freq":
            case "filter.filterEnvelopeAmount":
            case "noise.filterFreq":
                return LFO_GAIN_MULTIPLIER * depth
            case "filter.Q":
            case "noise.filterQ":
                return 24 * depth
            case "vco1.detune":
            case "vco2.detune":
            case "vco3.detune":
                return 100 * depth
            case "vco1.octave":
            case "vco2.octave":
            case "vco3.octave":
                return 1200 * depth
            case "masterVolume":
            case "vco1.gain":
            case "vco2.gain":
            case "vco3.gain":
            case "noise.mix":
                return depth
            default:
                return 0
        }
    }

    connectLfoTarget(target) {
        if (!this.masterLfo || !target || target === "NOT") return
        const lfoGain = this.lfoGain
        const nodes = this.lfoNodes
        if (!lfoGain || !nodes) return
        const connect = (param) => {
            if (param) lfoGain.connect(param)
        }

        switch (target) {
            case "masterVolume":
                connect(nodes.gainEnv?.gain)
                break
            case "vco1.gain":
                connect(nodes.v1?.gain.gain)
                break
            case "vco1.detune":
                connect(nodes.v1?.osc.detune)
                break
            case "vco1.octave":
                connect(nodes.v1?.osc.detune)
                break
            case "vco2.gain":
                connect(nodes.v2?.gain.gain)
                break
            case "vco2.detune":
                connect(nodes.v2?.osc.detune)
                break
            case "vco2.octave":
                connect(nodes.v2?.osc.detune)
                break
            case "vco3.gain":
                connect(nodes.v3?.gain.gain)
                break
            case "vco3.detune":
                connect(nodes.v3?.osc.detune)
                break
            case "vco3.octave":
                connect(nodes.v3?.osc.detune)
                break
            case "filter.freq":
            case "filter.filterEnvelopeAmount":
                connect(nodes.voiceFilter1?.frequency)
                connect(nodes.voiceFilter2?.frequency)
                break
            case "filter.Q":
                connect(nodes.voiceFilter1?.Q)
                connect(nodes.voiceFilter2?.Q)
                break
            case "noise.mix":
                connect(nodes.noiseGain?.gain)
                break
            case "noise.filterFreq":
                connect(nodes.noiseFilter?.frequency)
                break
            case "noise.filterQ":
                connect(nodes.noiseFilter?.Q)
                break
        }
    }

    updateGeneratedSound(generatedSound, time = this.audioCtx.currentTime) {
        this.generatedSound = generatedSound
        const rampTime = 0.01

        if (this.masterLfo && this.lfoGain) {
            this.masterLfo.type = typeof generatedSound.lfo?.wave === "string" ? generatedSound.lfo.wave : "sine"
            this.masterLfo.frequency.setTargetAtTime(toFiniteNumber(generatedSound.lfo?.freq, 0) + LFO_FREQ_OFFSET, time, rampTime)
            try { this.lfoGain.disconnect() } catch (e) { }
            const lfoTarget = generatedSound.lfo?.target ?? "NOT"
            this.lfoGain.gain.setTargetAtTime(this.computeLfoDepth(lfoTarget), time, rampTime)
            this.connectLfoTarget(lfoTarget)
        }

        const noiseConfig = generatedSound.noise ?? {}
        const noiseMix = Math.max(0, Math.min(1, toFiniteNumber(noiseConfig.mix, 0)))
        if (this.noiseGain) this.noiseGain.gain.setTargetAtTime(noiseMix, time, rampTime)
        if (this.noiseFilter) {
            this.noiseFilter.type = typeof noiseConfig.filterType === "string" ? noiseConfig.filterType : "highpass"
            this.noiseFilter.frequency.setTargetAtTime(toFiniteNumber(noiseConfig.filterFreq, NOISE_FILTER_FREQ_DEFAULT), time, rampTime)
            this.noiseFilter.Q.setTargetAtTime(toFiniteNumber(noiseConfig.filterQ, 1), time, rampTime)
        }

        const oscMix = 1 - noiseMix
        const oscConfigs = [generatedSound.vco1, generatedSound.vco2, generatedSound.vco3]
        oscConfigs.forEach((cfg, index) => {
            const oscNode = this.oscNodes[index]
            if (!oscNode) return
            const gainValue = toFiniteNumber(cfg?.gain, oscNode.baseGain)
            oscNode.baseGain = gainValue
            oscNode.gain.gain.setTargetAtTime(gainValue * oscMix, time, rampTime)
            if (typeof cfg?.wave === "string") oscNode.osc.type = cfg.wave
            const nextFreq = computeOscFrequency(this.noteRatio, cfg?.octave, cfg?.detune)
            oscNode.osc.frequency.setTargetAtTime(nextFreq, time, rampTime)
            oscNode.osc.detune.setTargetAtTime(toFiniteNumber(cfg?.detune, 0), time, rampTime)
        })

        const nextMasterVolume = toFiniteNumber(generatedSound.masterVolume, this.masterVolume)
        if (this.gainEnv && nextMasterVolume !== this.masterVolume) {
            const ratio = this.masterVolume > 0 ? nextMasterVolume / this.masterVolume : nextMasterVolume
            const nextGain = Math.max(MIN_GAIN_VALUE, (this.gainEnv.gain.value || MIN_GAIN_VALUE) * ratio)
            this.gainEnv.gain.setTargetAtTime(nextGain, time, rampTime)
            this.masterVolume = nextMasterVolume
        }

        if (this.voiceFilter1 && this.voiceFilter2) {
            const filterType = typeof generatedSound.filter?.type === "string" ? generatedSound.filter.type : "lowpass"
            const mFreq = Utils.normalizeSynthFilterFreqValue(toFiniteNumber(generatedSound.filter?.freq, 50))
            const mQ = Utils.normalizeSynthFilterQValue(toFiniteNumber(generatedSound.filter?.Q, 1))
            this.voiceFilter1.type = filterType
            this.voiceFilter2.type = filterType
            this.voiceFilter1.frequency.setTargetAtTime(mFreq, time, rampTime)
            this.voiceFilter2.frequency.setTargetAtTime(mFreq, time, rampTime)
            this.voiceFilter1.Q.setTargetAtTime(mQ, time, rampTime)
            this.voiceFilter2.Q.setTargetAtTime(mQ, time, rampTime)
        }
    }

    start(time) {
        this.oscNodes.forEach(v => {
            v.osc.start(time)
            v.osc.stop(this.totalStopTime)
            v.osc.onended = () => {
                this.cleanup()
                if (this.onEnded) this.onEnded()
            }
        })
        if (this.noiseNode) {
            this.noiseNode.start(time)
            this.noiseNode.stop(this.totalStopTime + 0.1)
        }
    }

    stop(time) {
        if (this.stopped) return
        super.stop(time)

        try {
            this.gainEnv.gain.cancelScheduledValues(time)
            const currentGain = Math.max(MIN_GAIN_VALUE, this.gainEnv.gain.value || this.noteVelo || 1)
            this.gainEnv.gain.setValueAtTime(currentGain, time)
            this.gainEnv.gain.exponentialRampToValueAtTime(MIN_GAIN_VALUE, time + STOP_BUFFER)
        } catch (e) { }

        this.oscNodes.forEach(v => {
            try { v.osc.stop(time + STOP_EXTRA_BUFFER) } catch (e) { }
        })
        if (this.noiseNode) {
            try { this.noiseNode.stop(time + STOP_EXTRA_BUFFER) } catch (e) { }
        }
    }
}
