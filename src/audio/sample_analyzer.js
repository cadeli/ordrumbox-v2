import AudioAnalyzer from './analyze.js'
import { hzToNote } from '../core/hz_to_note.js'

const analyzer = new AudioAnalyzer()
/** @type {Map<AudioBuffer, SampleAnalysis>} */
const cache = new Map()

/**
 * Sample analysis: what AudioAnalyzer returns, plus noteInfo.
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
 * @param {CanvasRenderingContext2D} canvasCtx
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
 * @param {CanvasRenderingContext2D} canvasCtx
 * @param {{decay?: number, buffer?: {duration: number}, duration?: number}} sound
 * @param {number} width canvas width in CSS px
 * @param {number} height canvas height in CSS px
 * @param {{marker: string, lineWidth: number}} theme
 * @param {number} dpr devicePixelRatio (marker dashes are scaled by it)
 */
export function drawDecayMarker(canvasCtx, sound, width, height, theme, dpr) {
    // AudioBuffer.duration is in seconds, sound.duration is in ms (that is how the
    // loader writes it), and decay is in ms: mixing them put the marker at 1/1000
    // of its place whenever the buffer was missing.
    const durationSec = sound?.buffer?.duration ?? (Number(sound?.duration) || 0) / 1000
    if (!(durationSec > 0)) return
    const ratio = Math.min((sound.decay ?? 0) / 1000 / durationSec, 1)
    const x = ratio * width
    canvasCtx.beginPath()
    canvasCtx.setLineDash([4 * dpr, 4 * dpr])
    canvasCtx.strokeStyle = theme.marker
    canvasCtx.shadowColor = theme.marker
    canvasCtx.shadowBlur = 6 * dpr
    canvasCtx.lineWidth = theme.lineWidth
    canvasCtx.moveTo(x, 0)
    canvasCtx.lineTo(x, height)
    canvasCtx.stroke()
    canvasCtx.setLineDash([])
    canvasCtx.shadowBlur = 0
    canvasCtx.shadowColor = 'transparent'
}

export function drawEnvelope(canvasCtx, envelope, width, height, strokeOrColors) {
    if (!envelope?.length) return

    const colors = typeof strokeOrColors === 'string' ? { stroke: strokeOrColors } : (strokeOrColors ?? {})

    const stroke = colors.stroke ?? '#202321'
    const background = colors.background ?? '#D1D2CE'
    const fill = colors.fill ?? 'rgba(32,35,33,0.08)'
    const lineWidth = colors.lineWidth ?? 1.5

    canvasCtx.clearRect(0, 0, width, height)
    canvasCtx.fillStyle = background
    canvasCtx.fillRect(0, 0, width, height)

    canvasCtx.beginPath()
    canvasCtx.strokeStyle = stroke
    canvasCtx.lineWidth = lineWidth

    const step = width / (envelope.length - 1)
    for (let i = 0; i < envelope.length; i++) {
        const x = i * step
        const y = height - envelope[i] * height
        if (i === 0) canvasCtx.moveTo(x, y)
        else canvasCtx.lineTo(x, y)
    }
    canvasCtx.stroke()

    canvasCtx.lineTo(width, height)
    canvasCtx.lineTo(0, height)
    canvasCtx.closePath()
    canvasCtx.fillStyle = fill
    canvasCtx.fill()
}
