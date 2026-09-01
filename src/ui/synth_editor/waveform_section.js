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
        const samplesPerCycle = Math.floor(sampleRate / cycles)

        const freqMult = vcos.map(v =>
            Math.pow(2, v.octave) * Math.pow(2, v.detune / 1200)
        )

        const modDepth = fmAmount * 0.25
        const phase = [0, 0, 0]
        const modAccum = [0, 0, 0]

        for (let i = 0; i < sampleRate; i++) {
            const t = i / sampleRate

            const modPhases = [0, 0, 0]
            for (let v = 0; v < 3; v++) {
                modPhases[v] = ((t * cycles * freqMult[v] * samplesPerCycle) % samplesPerCycle) / samplesPerCycle
            }

            let mod1 = 0, mod2 = 0, mod3 = 0
            if (fmAmount > 0) {
                switch (fmAlgo) {
                    case 0:
                        mod1 = this._waveAtPhase(vcos[1].wave, modPhases[1]) * modDepth
                        break
                    case 1:
                        mod1 = this._waveAtPhase(vcos[2].wave, modPhases[2]) * modDepth
                        break
                    case 2:
                        mod3 = this._waveAtPhase(vcos[2].wave, modPhases[2]) * modDepth
                        mod2 = this._waveAtPhase(vcos[1].wave, modPhases[1] + mod3) * modDepth
                        mod1 = mod2
                        break
                    case 3:
                        mod1 = (this._waveAtPhase(vcos[1].wave, modPhases[1])
                              + this._waveAtPhase(vcos[2].wave, modPhases[2])) * modDepth
                        break
                    case 4:
                        modAccum[1] += this._waveAtPhase(vcos[0].wave, modPhases[0]) * modDepth
                        modAccum[0] += this._waveAtPhase(vcos[1].wave, modPhases[1]) * modDepth
                        mod1 = modAccum[0]
                        mod2 = modAccum[1]
                        break
                }
            }

            const val0 = this._waveAtPhase(vcos[0].wave, modPhases[0] + mod1)
            const val1 = this._waveAtPhase(vcos[1].wave, modPhases[1] + mod2)
            const val2 = this._waveAtPhase(vcos[2].wave, modPhases[2] + mod3)

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
