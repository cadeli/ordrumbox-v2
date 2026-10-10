// src/ui/synth_editor/waveform_section.js
// Waveform canvas drawing: oscillators + ADSR envelope preview.

import { WAVE_BUFFER } from './synth_editor_constants.js'
import { color, rgba } from '../theme.js'
import { clamp } from '../../core/numbers.js'
import { getLfoWaveformValue } from '../../audio/math.js'

const FM_DEPTH_SCALE = 0.08

export default class WaveformSection {
    #model
    #root
    #waveTab

    /**
     * @param {import('./synth_preset_model.js').default} model edit-session state
     * @param {{ root: () => HTMLElement|null }} deps element hosting the canvases
     */
    constructor(model, deps) {
        this.#model = model
        this.#root = deps.root
        this.#waveTab = 'wave'
    }

    /** Selects the waveform tab ('wave' or 'custom') and redraws. */
    setWaveTab(tabId) {
        this.#waveTab = tabId
        this.draw()
    }

    /** Resets the waveform tab to its default (panel is being reset). */
    resetTab() {
        this.#waveTab = 'wave'
    }

    /** Draw all canvases (waveform + ADSR + filter curve). */
    draw() {
        this.#drawWaveform()
        this.#drawEnvCanvas()
        this.#drawFilterResponse()
    }

    #drawWaveform() {
        const canvas = this.#root()?.querySelector('.ss-waveform')
        const draft = this.#model.draft
        if (!canvas || !draft) return
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        const w = canvas.width
        const h = canvas.height
        const mid = h / 2

        ctx.fillStyle = color('surface-2')
        ctx.fillRect(0, 0, w, h)
        ctx.strokeStyle = color('border-subtle')
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(0, mid)
        ctx.lineTo(w, mid)
        ctx.stroke()

        if (this.#waveTab === 'wave') {
            this.#drawOscillators(ctx, w, mid)
        }
        this.#updateModuleTrace()
    }

    /** Returns wave value [-1,1] for a given normalized phase [0,1). */
    #waveAtPhase(wave, p, cycle = 0) {
        switch (wave) {
            case 'sine':
                return Math.sin(2 * Math.PI * p)
            case 'square':
                return Math.sin(2 * Math.PI * p) >= 0 ? 1 : -1
            case 'sawtooth':
                return 2 * p - 1
            case 'triangle':
                return 4 * Math.abs(p - 0.5) - 1
            case 'random':
                return getLfoWaveformValue(cycle + p, 4)
            default:
                return Math.sin(2 * Math.PI * p)
        }
    }

    #drawOscillators(ctx, w, mid) {
        const vcos = this.#buildVcoArray()
        const draft = this.#model.draft
        const masterVol = draft.masterVolume ?? 1.0
        const fmAmount = draft.fm?.amount ?? 0
        const fmAlgo = draft.fm?.algo ?? 0
        const cycles = 4
        // the length of the scratch buffer, NOT a sample rate (no time axis here)
        const sampleCount = WAVE_BUFFER.length

        const lfo1 = draft.bypassLfo1 ? null : draft.lfo
        const lfo2 = draft.bypassLfo2 ? null : draft.lfo2
        const lfo1Mod = lfo1 ? this.#model.computeLfoMod(lfo1) : 0
        const lfo2Mod = lfo2 ? this.#model.computeLfoMod(lfo2) : 0

        const freqMult = vcos.map((v, i) => {
            let octave = v.octave
            let detune = v.detune
            const vcoKey = `vco${i + 1}`
            if (draft.lfo?.target === `${vcoKey}.octave`) octave += lfo1Mod
            if (draft.lfo2?.target === `${vcoKey}.octave`) octave += lfo2Mod
            if (draft.lfo?.target === `${vcoKey}.detune`) detune += lfo1Mod
            if (draft.lfo2?.target === `${vcoKey}.detune`) detune += lfo2Mod
            return Math.pow(2, octave) * Math.pow(2, detune / 1200)
        })

        const gainMod = vcos.map((v, i) => {
            let g = v.gain
            const vcoKey = `vco${i + 1}`
            if (draft.lfo?.target === `${vcoKey}.gain`) g += lfo1Mod
            if (draft.lfo2?.target === `${vcoKey}.gain`) g += lfo2Mod
            return clamp(g, 0, 1)
        })

        const baseInc = cycles / sampleCount
        const inc = freqMult.map((fm) => baseInc * fm)
        const fmDepth = fmAmount * FM_DEPTH_SCALE
        const phase = [0, 0, 0]
        const cycle = [0, 0, 0]
        for (let i = 0; i < sampleCount; i++) {
            const rawO2 = this.#waveAtPhase(vcos[1].wave, phase[1], cycle[1])
            const rawO3 = this.#waveAtPhase(vcos[2].wave, phase[2], cycle[2])

            let f1 = inc[0],
                f2 = inc[1]
            const f3 = inc[2]
            if (fmAmount > 0.001) {
                switch (fmAlgo) {
                    case 0:
                        f1 += rawO2 * fmDepth
                        break
                    case 1:
                        f1 += rawO3 * fmDepth
                        break
                    case 2:
                        f1 += rawO2 * fmDepth
                        f2 += rawO3 * fmDepth
                        break
                    case 3:
                        f1 += (rawO2 + rawO3) * fmDepth
                        break
                    case 4: {
                        const rawO1 = this.#waveAtPhase(vcos[0].wave, phase[0], cycle[0])
                        f1 += rawO2 * fmDepth
                        f2 += rawO1 * fmDepth
                        break
                    }
                }
            }

            phase[0] += f1
            phase[1] += f2
            phase[2] += f3
            const step0 = Math.floor(phase[0])
            const step1 = Math.floor(phase[1])
            const step2 = Math.floor(phase[2])
            cycle[0] += step0
            cycle[1] += step1
            cycle[2] += step2
            phase[0] -= step0
            phase[1] -= step1
            phase[2] -= step2

            const val0 = this.#waveAtPhase(vcos[0].wave, phase[0], cycle[0])
            const val1 = this.#waveAtPhase(vcos[1].wave, phase[1], cycle[1])
            const val2 = this.#waveAtPhase(vcos[2].wave, phase[2], cycle[2])
            const sub = (draft.subGain ?? 0) > 0 ? this.#waveAtPhase('sine', (phase[0] * 0.5) % 1) * draft.subGain : 0

            let sample = val0 * gainMod[0] + val1 * gainMod[1] + val2 * gainMod[2] + sub
            const drive = draft.filter?.drive ?? draft.drive ?? 0
            if (drive > 0) {
                const driven = sample * (1 + drive * 3)
                sample = driven / (1 + Math.abs(driven) * 0.5)
            }
            WAVE_BUFFER[i] = sample
        }

        let maxVal = 0
        for (let i = 0; i < sampleCount; i++) {
            if (Math.abs(WAVE_BUFFER[i]) > maxVal) maxVal = Math.abs(WAVE_BUFFER[i])
        }
        if (maxVal > 0) {
            for (let i = 0; i < sampleCount; i++) {
                WAVE_BUFFER[i] = (WAVE_BUFFER[i] / maxVal) * masterVol
            }
        }

        ctx.beginPath()
        ctx.strokeStyle = color('accent')
        ctx.lineWidth = 1.5
        for (let i = 0; i < sampleCount; i++) {
            const x = (i / sampleCount) * w
            const y = mid - WAVE_BUFFER[i] * (mid - 4)
            if (i === 0) ctx.moveTo(x, y)
            else ctx.lineTo(x, y)
        }
        ctx.stroke()
    }

    #buildVcoArray() {
        const draft = this.#model.draft
        return [1, 2, 3].map((n) => {
            const v = draft[`vco${n}`] ?? {}
            return {
                wave: v.wave ?? 'sine',
                gain: v.gain ?? (n === 1 ? 1 : 0),
                octave: v.octave ?? 0,
                detune: v.detune ?? 0,
            }
        })
    }

    #getActiveModules() {
        const d = this.#model.draft
        if (!d) return []
        const vcos = this.#buildVcoArray()
        const lfo1Target = d.lfo?.target ?? 'NOT'
        const lfo2Target = d.lfo2?.target ?? 'NOT'
        const modTgt = d.modEnvelope?.target ?? 'off'
        const filtEnvAmt = d.filterEnv?.filterEnvelopeAmount ?? d.filter?.filterEnvelopeAmount ?? 0
        const mods = [
            { label: 'VCO1', active: vcos[0].gain > 0.01 },
            { label: 'VCO2', active: vcos[1].gain > 0.01 },
            { label: 'VCO3', active: vcos[2].gain > 0.01 },
            { label: 'Flt', active: !d.bypassFilter },
            { label: 'Env', active: !d.bypassEnv },
            { label: 'LFO1', active: !d.bypassLfo1 && lfo1Target !== 'NOT' && (d.lfo?.depth ?? 0) > 0 },
            { label: 'LFO2', active: !d.bypassLfo2 && lfo2Target !== 'NOT' && (d.lfo2?.depth ?? 0) > 0 },
            { label: 'FM', active: !d.bypassFm && (d.fm?.amount ?? 0) > 0.001 },
            { label: 'Mod', active: !d.bypassModEnv && modTgt !== 'off' },
            { label: 'Ns', active: !d.bypassNoise && (d.noise?.mix ?? 0) > 0.001 },
            { label: 'FltEnv', active: !d.bypassFilterEnv && filtEnvAmt > 0.001 },
        ]
        return mods
    }

    #updateModuleTrace() {
        const el = this.#root()?.querySelector('[data-ss-module-trace]')
        if (!el) return
        const mods = this.#getActiveModules()
        el.innerHTML = mods
            .map((m) => `<span class="ss-mod-pill${m.active ? ' active' : ''}">${m.label}</span>`)
            .join('')
    }

    #drawEnvCanvas() {
        const canvas = this.#root()?.querySelector('.ss-env-canvas')
        if (!canvas || !this.#model.draft) return
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        const w = canvas.width
        const h = canvas.height
        const mid = h / 2

        ctx.fillStyle = color('surface-2')
        ctx.fillRect(0, 0, w, h)
        ctx.strokeStyle = color('border-subtle')
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(0, mid)
        ctx.lineTo(w, mid)
        ctx.stroke()

        this.#drawAdsrEnvelope(ctx, w, mid)
    }

    #drawAdsrPath(ctx, pts, scaleX, scaleY) {
        ctx.moveTo(scaleX(pts[0].t), scaleY(pts[0].v))
        for (let i = 1; i < pts.length; i++) {
            ctx.lineTo(scaleX(pts[i].t), scaleY(pts[i].v))
        }
    }

    #drawAdsrEnvelope(ctx, w, mid) {
        const { attack = 0, decay = 0.12, sustain = 1, release = 0.05 } = this.#model.draft.envelope ?? {}
        const totalTime = Math.max(attack + decay + 0.3 + release, 0.5)

        const scaleX = (t) => (t / totalTime) * w
        const scaleY = (v) => mid - v * (mid - 4)
        const pts = [
            { t: 0, v: 0 },
            { t: attack, v: 1 },
            { t: attack + decay, v: sustain },
            { t: totalTime - release, v: sustain },
            { t: totalTime, v: 0 },
        ]

        ctx.beginPath()
        ctx.strokeStyle = color('accent')
        ctx.lineWidth = 1.5
        this.#drawAdsrPath(ctx, pts, scaleX, scaleY)
        ctx.stroke()

        ctx.fillStyle = rgba('accent', 0.15)
        ctx.beginPath()
        this.#drawAdsrPath(ctx, pts, scaleX, scaleY)
        ctx.closePath()
        ctx.fill()
    }

    #drawFilterResponse() {
        const canvas = this.#root()?.querySelector('.ss-filter-curve')
        if (!canvas || !this.#model.draft) return
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        const w = canvas.width
        const h = canvas.height
        const draft = this.#model.draft
        const flt = draft.filter ?? {}
        const type = flt.type ?? 'lowpass'
        let fc = clamp(flt.freq ?? 400, 20, 20000)
        let Q = clamp(flt.Q ?? 1, 0.1, 24)

        const lfo1 = draft.bypassLfo1 ? null : draft.lfo
        const lfo2 = draft.bypassLfo2 ? null : draft.lfo2
        if (lfo1?.target === 'filter.freq') fc += this.#model.computeLfoMod(lfo1)
        if (lfo2?.target === 'filter.freq') fc += this.#model.computeLfoMod(lfo2)
        if (lfo1?.target === 'filter.Q') Q += this.#model.computeLfoMod(lfo1)
        if (lfo2?.target === 'filter.Q') Q += this.#model.computeLfoMod(lfo2)
        fc = clamp(fc, 20, 20000)
        Q = clamp(Q, 0.1, 24)

        ctx.fillStyle = color('surface-2')
        ctx.fillRect(0, 0, w, h)

        const fMin = 20
        const fMax = 20000
        const dbMin = -30
        const dbMax = 12

        const logFMin = Math.log10(fMin)
        const logFMax = Math.log10(fMax)
        const toX = (f) => ((Math.log10(f) - logFMin) / (logFMax - logFMin)) * w
        const toY = (db) => h - ((db - dbMin) / (dbMax - dbMin)) * h

        ctx.strokeStyle = color('border-subtle')
        ctx.lineWidth = 0.5
        for (const gf of [100, 1000, 10000]) {
            const x = toX(gf)
            ctx.beginPath()
            ctx.moveTo(x, 0)
            ctx.lineTo(x, h)
            ctx.stroke()
        }
        for (const gdb of [0, -20]) {
            const y = toY(gdb)
            ctx.beginPath()
            ctx.moveTo(0, y)
            ctx.lineTo(w, y)
            ctx.stroke()
        }

        const N = 200
        const drawCurve = (centerFreq, strokeStyle, fillAlpha, lineWidth) => {
            ctx.beginPath()
            ctx.strokeStyle = strokeStyle
            ctx.lineWidth = lineWidth
            let first = true
            for (let i = 0; i <= N; i++) {
                const f = fMin * Math.pow(fMax / fMin, i / N)
                let mag
                const d = centerFreq * centerFreq - f * f
                const denom = Math.sqrt(d * d + ((centerFreq * f) / Q) * ((centerFreq * f) / Q))
                if (type === 'highpass') {
                    mag = (f * f) / denom
                } else if (type === 'bandpass') {
                    mag = (centerFreq * f) / Q / denom
                } else {
                    mag = (centerFreq * centerFreq) / denom
                }
                const db = 20 * Math.log10(Math.max(mag, 1e-10))
                const x = (i / N) * w
                const y = toY(clamp(db, dbMin, dbMax))
                if (first) {
                    ctx.moveTo(x, y)
                    first = false
                } else ctx.lineTo(x, y)
            }
            ctx.stroke()
            if (fillAlpha > 0) {
                ctx.fillStyle = rgba('accent', fillAlpha)
                ctx.lineTo(w, toY(0))
                ctx.lineTo(0, toY(0))
                ctx.closePath()
                ctx.fill()
            }
        }

        const lfo1raw = draft.lfo ?? {}
        const lfo2raw = draft.lfo2 ?? {}
        const isLfo1Filter = lfo1raw.target === 'filter.freq' && !draft.bypassLfo1 && (lfo1raw.depth ?? 0) > 0
        const isLfo2Filter = lfo2raw.target === 'filter.freq' && !draft.bypassLfo2 && (lfo2raw.depth ?? 0) > 0

        if (isLfo1Filter || isLfo2Filter) {
            const lfoDepth = Math.max(isLfo1Filter ? (lfo1raw.depth ?? 0) : 0, isLfo2Filter ? (lfo2raw.depth ?? 0) : 0)
            const modHz = lfoDepth * 1000
            const fcMin = Math.max(20, fc - modHz)
            const fcMax = Math.min(20000, fc + modHz)

            drawCurve(fcMin, rgba('accent', 0.3), 0, 1)
            drawCurve(fcMax, rgba('accent', 0.3), 0, 1)
        }

        drawCurve(fc, color('accent'), 0.12, 1.5)
    }
}
