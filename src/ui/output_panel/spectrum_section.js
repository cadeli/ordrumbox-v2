// src/ui/output_panel/spectrum_section.js
// Spectrum analyzer animation loop + drawing.

import { serviceRegistry } from '../../state/service_registry.js'
import { reportUserError } from '../../core/notify.js'
import { color, rgba } from '../theme.js'

export default class SpectrumSection {
    #editor
    #animId
    #bgColor

    /** @param {import('../output_panel.js').default} editor */
    constructor(editor) {
        this.#editor = editor
        this.#animId = null
        this.#bgColor = null
    }

    get animId() {
        return this.#animId
    }

    startAnimation() {
        this.stopAnimation()
        const draw = () => {
            if (!this.#editor.isVisible) return
            try {
                this.drawSpectrum()
            } catch (err) {
                reportUserError('OutputPanel.spectrum', 'Spectrum display stopped updating', { cause: err })
            }
            this.#animId = requestAnimationFrame(draw)
        }
        draw()
    }

    stopAnimation() {
        if (this.#animId) {
            cancelAnimationFrame(this.#animId)
            this.#animId = null
        }
    }

    drawSpectrum() {
        const canvas = this.#editor.canvas
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        const w = canvas.width
        const h = canvas.height
        if (!this.#bgColor) {
            this.#bgColor = color('scope-bg')
        }
        const data = serviceRegistry.audioEngine?.getAnalyserData?.()

        ctx.fillStyle = this.#bgColor
        ctx.fillRect(0, 0, w, h)

        ctx.save()
        ctx.strokeStyle = rgba('toy-cyan', 0.16)
        ctx.lineWidth = 1
        ctx.beginPath()
        const gridX = w / 8
        const gridY = h / 4
        for (let x = gridX; x < w; x += gridX) {
            ctx.moveTo(x, 0)
            ctx.lineTo(x, h)
        }
        for (let y = gridY; y < h; y += gridY) {
            ctx.moveTo(0, y)
            ctx.lineTo(w, y)
        }
        ctx.stroke()
        ctx.restore()

        if (!data) return
        data.analyser.getByteFrequencyData(data.gFftData)
        const bins = data.gFftData
        const beatCount = Math.min(bins.length, w)

        ctx.beginPath()
        ctx.strokeStyle = color('phosphor')
        ctx.lineWidth = 1.5
        ctx.shadowColor = color('phosphor')
        ctx.shadowBlur = 8
        for (let i = 0; i < beatCount; i++) {
            const val = bins[i] / 255
            const x = (i / beatCount) * w
            const y = h - val * h
            if (i === 0) ctx.moveTo(x, y)
            else ctx.lineTo(x, y)
        }
        ctx.stroke()
        ctx.shadowBlur = 0
    }
}
