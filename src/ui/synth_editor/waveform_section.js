// src/ui/synth_editor/WaveformSection.js
// Waveform canvas drawing: oscillators + ADSR envelope preview.

import { WAVE_BUFFER } from './constants.js'
import { color, rgba } from '../theme.js'

export default class WaveformSection {
    /** @param {import('./synth_editor.js').default} editor */
    constructor(editor) { this._editor = editor }

    /** Draw all canvases (waveform + ADSR). */
    draw() {
        this._drawWaveform()
        this._drawEnvCanvas()
    }

    _drawWaveform() {
        const editor = this._editor
        const canvas = editor.panel.querySelector('.ss-waveform')
        if (!canvas || !editor._draft) return
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        const w = canvas.width
        const h = canvas.height
        const mid = h / 2

        ctx.fillStyle = color('bg-canvas')
        ctx.fillRect(0, 0, w, h)
        ctx.strokeStyle = color('canvas-grid')
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(0, mid)
        ctx.lineTo(w, mid)
        ctx.stroke()

        if (editor._waveTab === 'wave') {
            this._drawOscillators(ctx, w, mid)
        }
        this._updateModuleTrace()
    }

    /** Returns wave value [-1,1] for a given normalized phase [0,1). */
    _waveAtPhase(wave, p) {
        switch (wave) {
            case 'sine': return Math.sin(2 * Math.PI * p)
            case 'square': return Math.sin(2 * Math.PI * p) >= 0 ? 1 : -1
            case 'sawtooth': return 2 * p - 1
            case 'triangle': return 4 * Math.abs(p - 0.5) - 1
            default: return Math.sin(2 * Math.PI * p)
        }
    }

    _drawOscillators(ctx, w, mid) {
        const vcos = this._buildVcoArray()
        const draft = this._editor._draft
        const masterVol = draft.masterVolume ?? 1.0
        const fmAmount = draft.fm?.amount ?? 0
        const fmAlgo = draft.fm?.algo ?? 0
        const cycles = 4
        const sampleRate = WAVE_BUFFER.length

        const freqMult = vcos.map(v =>
            Math.pow(2, v.octave) * Math.pow(2, v.detune / 1200)
        )

        const baseInc = cycles / sampleRate
        const inc = freqMult.map(fm => baseInc * fm)
        const fmDepth = fmAmount * 0.08
        const phase = [0, 0, 0]

        for (let i = 0; i < sampleRate; i++) {
            const rawO2 = this._waveAtPhase(vcos[1].wave, phase[1])
            const rawO3 = this._waveAtPhase(vcos[2].wave, phase[2])

            let f1 = inc[0], f2 = inc[1], f3 = inc[2]
            if (fmAmount > 0.001) {
                switch (fmAlgo) {
                    case 0: f1 += rawO2 * fmDepth; break
                    case 1: f1 += rawO3 * fmDepth; break
                    case 2: f1 += rawO2 * fmDepth; f2 += rawO3 * fmDepth; break
                    case 3: f1 += (rawO2 + rawO3) * fmDepth; break
                    case 4: {
                        const rawO1 = this._waveAtPhase(vcos[0].wave, phase[0])
                        f1 += rawO2 * fmDepth
                        f2 += rawO1 * fmDepth
                        break
                    }
                }
            }

            phase[0] += f1
            phase[1] += f2
            phase[2] += f3
            phase[0] -= Math.floor(phase[0])
            phase[1] -= Math.floor(phase[1])
            phase[2] -= Math.floor(phase[2])

            const val0 = this._waveAtPhase(vcos[0].wave, phase[0])
            const val1 = this._waveAtPhase(vcos[1].wave, phase[1])
            const val2 = this._waveAtPhase(vcos[2].wave, phase[2])

            WAVE_BUFFER[i] = val0 * vcos[0].gain + val1 * vcos[1].gain + val2 * vcos[2].gain
        }

        let maxVal = 0
        for (let i = 0; i < sampleRate; i++) {
            if (Math.abs(WAVE_BUFFER[i]) > maxVal) maxVal = Math.abs(WAVE_BUFFER[i])
        }
        if (maxVal > 0) {
            for (let i = 0; i < sampleRate; i++) {
                WAVE_BUFFER[i] = (WAVE_BUFFER[i] / maxVal) * masterVol
            }
        }

        ctx.beginPath()
        ctx.strokeStyle = color('waveform-green')
        ctx.lineWidth = 1.5
        for (let i = 0; i < sampleRate; i++) {
            const x = (i / sampleRate) * w
            const y = mid - WAVE_BUFFER[i] * (mid - 4)
            if (i === 0) ctx.moveTo(x, y)
            else ctx.lineTo(x, y)
        }
        ctx.stroke()
    }

    _buildVcoArray() {
        const draft = this._editor._draft
        return [1, 2, 3].map(n => {
            const v = draft[`vco${n}`] ?? {}
            return {
                wave: v.wave ?? 'sine',
                gain: v.gain ?? (n === 1 ? 1 : 0),
                octave: v.octave ?? 0,
                detune: v.detune ?? 0
            }
        })
    }

    _getActiveModules() {
        const d = this._editor._draft
        if (!d) return []
        const vcos = this._buildVcoArray()
        const lfo1Target = d.lfo?.target ?? 'NOT'
        const lfo2Target = d.lfo2?.target ?? 'NOT'
        const modTgt = d.modEnvelope?.target ?? 'off'
        const filtEnvAmt = d.filterEnv?.filterEnvelopeAmount ?? d.filter?.filterEnvelopeAmount ?? 0
        const mods = [
            { label: 'VCO1', active: vcos[0].gain > 0.01 },
            { label: 'VCO2', active: vcos[1].gain > 0.01 },
            { label: 'VCO3', active: vcos[2].gain > 0.01 },
            { label: 'Flt',  active: !d.bypassFilter },
            { label: 'Env',  active: !d.bypassEnv },
            { label: 'LFO1', active: !d.bypassLfo1 && lfo1Target !== 'NOT' && (d.lfo?.depth ?? 0) > 0 },
            { label: 'LFO2', active: !d.bypassLfo2 && lfo2Target !== 'NOT' && (d.lfo2?.depth ?? 0) > 0 },
            { label: 'FM',   active: !d.bypassFm && (d.fm?.amount ?? 0) > 0.001 },
            { label: 'Mod',  active: !d.bypassModEnv && modTgt !== 'off' },
            { label: 'Ns',   active: !d.bypassNoise && (d.noise?.mix ?? 0) > 0.001 },
            { label: 'FltEnv', active: !d.bypassFilterEnv && filtEnvAmt > 0.001 },
        ]
        return mods
    }

    _updateModuleTrace() {
        const el = this._editor.panel?.querySelector('[data-ss-module-trace]')
        if (!el) return
        const mods = this._getActiveModules()
        el.innerHTML = mods.map(m =>
            `<span class="ss-mod-pill${m.active ? ' active' : ''}">${m.label}</span>`
        ).join('')
    }

    _drawEnvCanvas() {
        const editor = this._editor
        const canvas = editor.panel.querySelector('.ss-env-canvas')
        if (!canvas || !editor._draft) return
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        const w = canvas.width
        const h = canvas.height
        const mid = h / 2

        ctx.fillStyle = color('bg-canvas')
        ctx.fillRect(0, 0, w, h)
        ctx.strokeStyle = color('canvas-grid')
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(0, mid)
        ctx.lineTo(w, mid)
        ctx.stroke()

        this._drawAdsrEnvelope(ctx, w, mid)
    }

    _drawAdsrPath(ctx, pts, scaleX, scaleY) {
        ctx.moveTo(scaleX(pts[0].t), scaleY(pts[0].v))
        for (let i = 1; i < pts.length; i++) {
            ctx.lineTo(scaleX(pts[i].t), scaleY(pts[i].v))
        }
    }

    _drawAdsrEnvelope(ctx, w, mid) {
        const { attack = 0, decay = 0.12, sustain = 1, release = 0.05 } = this._editor._draft.enveloppe ?? {}
        const totalTime = Math.max(attack + decay + 0.3 + release, 0.5)

        const scaleX = (t) => (t / totalTime) * w
        const scaleY = (v) => mid - v * (mid - 4)
        const pts = [
            { t: 0, v: 0 },
            { t: attack, v: 1 },
            { t: attack + decay, v: sustain },
            { t: totalTime - release, v: sustain },
            { t: totalTime, v: 0 }
        ]

        ctx.beginPath()
        ctx.strokeStyle = color('waveform-red')
        ctx.lineWidth = 1.5
        ctx.setLineDash([4, 4])
        this._drawAdsrPath(ctx, pts, scaleX, scaleY)
        ctx.stroke()
        ctx.setLineDash([])

        ctx.fillStyle = rgba('waveform-red', 0.15)
        ctx.beginPath()
        this._drawAdsrPath(ctx, pts, scaleX, scaleY)
        ctx.closePath()
        ctx.fill()
    }
}
