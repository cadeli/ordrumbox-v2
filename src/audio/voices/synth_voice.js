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
} from '../../core/constants.js'
import {
    clamp,
    toFiniteNumber,
    computeOscFrequency,
    computeNoteRatio,
    computeAccent,
    computePeakFilterFreq,
    computeAdsrEnvelopeParams,
} from '../math.js'

// Minimum ramp durations — prevents audio discontinuities (clicks / plops)
const MIN_ATTACK  = 0.003  // 3 ms
const MIN_RELEASE = 0.008  // 8 ms

export default class SynthVoice extends BaseVoice {

    // ── Glide state: persists across notes ───────────────────────────
    // Exposed as named getters/setters for backward compatibility with tests
    static #lastPitches = [undefined, undefined, undefined]
    static get lastPitchV1() { return SynthVoice.#lastPitches[0] }
    static set lastPitchV1(v) { SynthVoice.#lastPitches[0] = v }
    static get lastPitchV2() { return SynthVoice.#lastPitches[1] }
    static set lastPitchV2(v) { SynthVoice.#lastPitches[1] = v }
    static get lastPitchV3() { return SynthVoice.#lastPitches[2] }
    static set lastPitchV3(v) { SynthVoice.#lastPitches[2] = v }

    // ── LFO target map: unifies computeLfoDepth + connectLfoTarget ───
    // Each entry: { mult: depth → gainValue,  params: voice → AudioParam[] }
    static #lfoTargetMap() {
        // Lazily built once and cached on the class
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

    constructor(audioCtx, strip, generatedSound, masterLfo, soundKey = null) {
        super(audioCtx, strip)
        this.generatedSound = generatedSound
        this.soundKey       = soundKey
        this.masterLfo      = masterLfo
        this.oscNodes       = []    // filtered: active VCOs only (for start/stop/update)
        this.vcoSlots       = []    // unfiltered [v1|null, v2|null, v3|null] (for LFO index)
        this.gainEnv        = null
        this.panNode        = null
        this.noiseNode      = null
        this.voiceFilter1   = null
        this.voiceFilter2   = null
        this.noiseGain      = null
        this.noiseFilter    = null
        this.lfoGain        = null
        this.noteVelo       = 0
        this.noteRatio      = 1
        this.masterVolume   = 0.8
    }

    // ── Private: create one VCO subgraph ─────────────────────────────
    // Returns { osc, gain, baseGain, freq } or null if cfg is falsy.
    // freq is stored on the object so the glide logic can reuse it
    // without recomputing computeOscFrequency a second time.
    #setupOsc(cfg, noteRatio) {
        if (!cfg) return null
        const gainValue = toFiniteNumber(cfg.gain, 1)
        const osc  = this.registerNode(this.audioCtx.createOscillator())
        const gain = this.registerNode(this.audioCtx.createGain())
        const freq = computeOscFrequency(noteRatio, cfg.octave, cfg.detune)
        osc.frequency.value = freq
        osc.type            = typeof cfg.wave === 'string' ? cfg.wave : 'sine'
        gain.gain.value     = gainValue
        osc.connect(gain)
        gain.connect(this.panNode)
        return { osc, gain, baseGain: gainValue, freq }
    }

    // ── Private: apply filter config to both voice filters ────────────
    // Used by updateGeneratedSound to avoid duplicating 6 identical lines.
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
        const noteRatio = computeNoteRatio(flatNote.fpitch)
        this.noteRatio  = noteRatio
        this.noteVelo   = (flatNote.note?.velocity ?? 0.8) * 0.25 // ATT Balance generated/samples volume
        const env       = gs.enveloppe ?? { attack: 0, decay: 0, sustain: 1, release: 0 }
        const lfoTarget = gs.lfo?.target ?? 'NOT'

        this.gainEnv  = this.registerNode(ctx.createGain())
        this.panNode  = this.registerNode(ctx.createStereoPanner())
        this.lfoGain  = this.registerNode(ctx.createGain())

        if (this.masterLfo) {
            this.masterLfo.type            = typeof gs.lfo?.wave === 'string' ? gs.lfo.wave : 'sine'
            this.masterLfo.frequency.value = toFiniteNumber(gs.lfo?.freq, 0) + LFO_FREQ_OFFSET
            this.lfoGain.gain.value        = this.computeLfoDepth(lfoTarget)
            this.masterLfo.connect(this.lfoGain)
        }

        // ── VCOs ─────────────────────────────────────────────────────
        // vcoSlots keeps nulls so LFO connections resolve by index.
        // oscNodes is the filtered subset used everywhere else.
        this.vcoSlots = [gs.vco1, gs.vco2, gs.vco3].map(cfg => this.#setupOsc(cfg, noteRatio))
        this.oscNodes = this.vcoSlots.filter(Boolean)

        // Glide: schedule freq ramp from previous pitch if slide > 0
        const slideTime = toFiniteNumber(gs.slide, 0)
        const glideTime = slideTime / 1000
        const hasGlide  = slideTime > 0 && SynthVoice.#lastPitches[0] !== undefined
        this.vcoSlots.forEach((v, i) => {
            if (!v) return
            if (hasGlide) {
                v.osc.frequency.setValueAtTime(SynthVoice.#lastPitches[i], time)
                v.osc.frequency.linearRampToValueAtTime(v.freq, time + glideTime)
            } else {
                v.osc.frequency.setValueAtTime(v.freq, time)
            }
        })
        SynthVoice.#lastPitches = this.vcoSlots.map(v => v?.freq)

        // ── Accent ────────────────────────────────────────────────────
        const { accentMultiplier, accentFilterBoost } = computeAccent(this.noteVelo)
        if (flatNote.pan !== undefined) this.panNode.pan.value = flatNote.pan

        // ── Dual voice filter ─────────────────────────────────────────
        this.voiceFilter1 = this.registerNode(ctx.createBiquadFilter())
        this.voiceFilter2 = this.registerNode(ctx.createBiquadFilter())
        const filterType  = typeof gs.filter?.type === 'string' ? gs.filter.type : 'lowpass'
        this.voiceFilter1.type = filterType
        this.voiceFilter2.type = filterType

        const mFreq        = Utils.normalizeSynthFilterFreqValue(toFiniteNumber(gs.filter?.freq, 50) + accentFilterBoost)
        const mQ           = Utils.normalizeSynthFilterQValue(toFiniteNumber(gs.filter?.Q, 1))
        const filterEnvAmt = clamp(toFiniteNumber(gs.filter?.filterEnvelopeAmount, 0), 0, 1)
        const peakFreq     = Utils.normalizeSynthFilterFreqValue(computePeakFilterFreq(mFreq, filterEnvAmt))

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

        // ── Noise (only allocated when actually needed) ───────────────
        const noiseConfig = gs.noise ?? {}
        const noiseMix    = toFiniteNumber(noiseConfig.mix, 0)
        const needsNoise  = noiseMix > 0 || lfoTarget.startsWith('noise')

        if (needsNoise) {
            const noiseBufferSize = ctx.sampleRate * 2
            const noiseBuffer     = ctx.createBuffer(1, noiseBufferSize, ctx.sampleRate)
            const noiseData       = noiseBuffer.getChannelData(0)
            for (let i = 0; i < noiseBufferSize; i++) noiseData[i] = Math.random() * 2 - 1

            this.noiseNode        = this.registerNode(ctx.createBufferSource())
            this.noiseNode.buffer = noiseBuffer
            this.noiseNode.loop   = true
            this.noiseGain        = this.registerNode(ctx.createGain())
            this.noiseGain.gain.value = noiseMix
            this.noiseFilter      = this.registerNode(ctx.createBiquadFilter())
            this.noiseFilter.type = typeof noiseConfig.filterType === 'string' ? noiseConfig.filterType : 'highpass'
            this.noiseFilter.frequency.value = toFiniteNumber(noiseConfig.filterFreq, NOISE_FILTER_FREQ_DEFAULT)
            this.noiseFilter.Q.value         = toFiniteNumber(noiseConfig.filterQ, 1)
            this.noiseNode.connect(this.noiseFilter)
            this.noiseFilter.connect(this.noiseGain)
            this.noiseGain.connect(this.panNode)
        }

        const oscMix = 1 - noiseMix
        this.oscNodes.forEach(v => { v.gain.gain.value = v.baseGain * oscMix })

        // ── ADSR envelope ─────────────────────────────────────────────
        const masterVolume = toFiniteNumber(gs.masterVolume, 0.8)
        this.masterVolume  = masterVolume
        const { attackTime, decayTime, sustainLevel, releaseTime, peakGain } =
            computeAdsrEnvelopeParams(env, this.noteVelo, masterVolume, accentMultiplier)

        // Enforce minimums to prevent discontinuities (plops)
        const safeAttack  = Math.max(MIN_ATTACK,  attackTime)
        const safeRelease = Math.max(MIN_RELEASE, releaseTime)

        this.connectLfoTarget(lfoTarget)

        // Start from MIN_GAIN_VALUE (not 0) to avoid a hard jump
        this.gainEnv.gain.setValueAtTime(MIN_GAIN_VALUE, time)
        this.gainEnv.gain.linearRampToValueAtTime(peakGain, time + safeAttack)
        // Ramp smoothly through sustain — no redundant setValueAtTime before the ramp
        this.gainEnv.gain.linearRampToValueAtTime(peakGain * sustainLevel, time + safeAttack + decayTime)
        this.releaseStart = time + safeAttack + decayTime
        // Never ramp to absolute 0 — use MIN_GAIN_VALUE to avoid a clic at cutoff
        this.gainEnv.gain.linearRampToValueAtTime(MIN_GAIN_VALUE, this.releaseStart + safeRelease)

        this.totalStopTime = this.releaseStart + safeRelease + RELEASE_TIME
    }

    // computeLfoDepth and connectLfoTarget share the same target → entry lookup
    computeLfoDepth(target) {
        const depth = toFiniteNumber(this.generatedSound.lfo?.depth, 0)
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

    updateGeneratedSound(generatedSound, time = this.audioCtx.currentTime) {
        this.generatedSound = generatedSound
        const rampTime = 0.01

        if (this.masterLfo && this.lfoGain) {
            this.masterLfo.type = typeof generatedSound.lfo?.wave === 'string' ? generatedSound.lfo.wave : 'sine'
            this.masterLfo.frequency.setTargetAtTime(toFiniteNumber(generatedSound.lfo?.freq, 0) + LFO_FREQ_OFFSET, time, rampTime)
            try { this.lfoGain.disconnect() } catch (e) { /* node may already be disconnected */ }
            const lfoTarget = generatedSound.lfo?.target ?? 'NOT'
            this.lfoGain.gain.setTargetAtTime(this.computeLfoDepth(lfoTarget), time, rampTime)
            this.connectLfoTarget(lfoTarget)
        }

        const noiseConfig = generatedSound.noise ?? {}
        const noiseMix    = clamp(toFiniteNumber(noiseConfig.mix, 0), 0, 1)
        if (this.noiseGain)   this.noiseGain.gain.setTargetAtTime(noiseMix, time, rampTime)
        if (this.noiseFilter) {
            this.noiseFilter.type = typeof noiseConfig.filterType === 'string' ? noiseConfig.filterType : 'highpass'
            this.noiseFilter.frequency.setTargetAtTime(toFiniteNumber(noiseConfig.filterFreq, NOISE_FILTER_FREQ_DEFAULT), time, rampTime)
            this.noiseFilter.Q.setTargetAtTime(toFiniteNumber(noiseConfig.filterQ, 1), time, rampTime)
        }

        // Use vcoSlots (not oscNodes) so index i always maps to vco{i+1} config,
        // even when some VCOs are inactive.
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
        } catch (e) { /* gain node may already be detached */ }
        this.oscNodes.forEach(v => {
            try { v.osc.stop(time + STOP_EXTRA_BUFFER) } catch (e) { /* already stopped */ }
        })
        if (this.noiseNode) {
            try { this.noiseNode.stop(time + STOP_EXTRA_BUFFER) } catch (e) { /* already stopped */ }
        }
    }
}
