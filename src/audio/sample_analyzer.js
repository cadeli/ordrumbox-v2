import AudioAnalyzer from './analyze.js'
import { hzToNote } from '../core/hz_to_note.js'

const analyzer = new AudioAnalyzer()
/** @type {Map<AudioBuffer, SampleAnalysis>} */
const cache = new Map()

/**
 * Analyse d'un echantillon : ce que renvoie AudioAnalyzer, plus noteInfo.
 * @typedef {import('./analyze.js').AudioAnalysis & {
 *     noteInfo: {note: string, octave: number, cents: number}|null,
 * }} SampleAnalysis
 */

/**
 * Analyze an AudioBuffer and return metrics + note info.
 * Results are cached by buffer reference.
 * @param {AudioBuffer} audioBuffer
 * @returns {SampleAnalysis|null} analysis result, or null without a buffer
 */
export function analyzeSample(audioBuffer) {
    if (!audioBuffer) return null

    if (cache.has(audioBuffer)) {
        return cache.get(audioBuffer)
    }

    // Etendu plutot que mute : noteInfo n'appartient pas a AudioAnalysis.
    const base = analyzer.analyzeAudioBuffer(audioBuffer)
    const result = { ...base, noteInfo: base.fundamentalHz ? hzToNote(base.fundamentalHz) : null }

    cache.set(audioBuffer, result)
    return result
}

/**
 * Clear the analysis cache (e.g. after replacing a sample buffer).
 * @param {AudioBuffer} [audioBuffer] - specific buffer, or all if omitted
 */
export function clearAnalysisCache(audioBuffer) {
    if (audioBuffer) {
        cache.delete(audioBuffer)
    } else {
        cache.clear()
    }
}

/**
 * Draw an envelope waveform on a canvas context.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number[]} envelope - array of amplitude values (0..1)
 * @param {number} width
 * @param {number} height
 * @param {string|object} [strokeOrColors] - CSS color string (legacy) or
 *        { stroke, background, fill, lineWidth }. `lineWidth` is in canvas
 *        pixels (default 1.5) — pass a devicePixelRatio-scaled value when the
 *        backing store is scaled.
 */
/**
 * Vertical marker at the decay position of a sample. Both sample panels drew
 * this identical 14-line block (one even carried a comment saying it mirrored
 * the other), so any tweak had to be made twice.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{decay?: number, buffer?: {duration: number}, duration?: number}} sound
 * @param {number} width canvas width in CSS px
 * @param {number} height canvas height in CSS px
 * @param {{marker: string, lineWidth: number}} theme
 * @param {number} dpr devicePixelRatio (marker dashes are scaled by it)
 */
export function drawDecayMarker(ctx, sound, width, height, theme, dpr) {
    const totalSec = sound?.buffer?.duration ?? sound?.duration ?? 0
    if (!(totalSec > 0)) return
    const ratio = Math.min((sound.decay ?? 0) / 1000 / totalSec, 1)
    const x = ratio * width
    ctx.beginPath()
    ctx.setLineDash([4 * dpr, 4 * dpr])
    ctx.strokeStyle = theme.marker
    ctx.shadowColor = theme.marker
    ctx.shadowBlur = 6 * dpr
    ctx.lineWidth = theme.lineWidth
    ctx.moveTo(x, 0)
    ctx.lineTo(x, height)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.shadowBlur = 0
    ctx.shadowColor = 'transparent'
}

export function drawEnvelope(ctx, envelope, width, height, strokeOrColors) {
    if (!envelope?.length) return

    const colors = typeof strokeOrColors === 'string' ? { stroke: strokeOrColors } : (strokeOrColors ?? {})

    const stroke = colors.stroke ?? '#202321'
    const background = colors.background ?? '#D1D2CE'
    const fill = colors.fill ?? 'rgba(32,35,33,0.08)'
    const lineWidth = colors.lineWidth ?? 1.5

    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = background
    ctx.fillRect(0, 0, width, height)

    ctx.beginPath()
    ctx.strokeStyle = stroke
    ctx.lineWidth = lineWidth

    const step = width / (envelope.length - 1)
    for (let i = 0; i < envelope.length; i++) {
        const x = i * step
        const y = height - envelope[i] * height
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
    }
    ctx.stroke()

    ctx.lineTo(width, height)
    ctx.lineTo(0, height)
    ctx.closePath()
    ctx.fillStyle = fill
    ctx.fill()
}
