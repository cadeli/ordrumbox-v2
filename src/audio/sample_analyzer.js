import AudioAnalyzer from './analyze.js'
import { hzToNote } from '../core/hz_to_note.js'
import { color, rgba } from '../ui/theme.js'

const _analyzer = new AudioAnalyzer()
const _cache = new Map()

/**
 * Analyze an AudioBuffer and return metrics + note info.
 * Results are cached by buffer reference.
 * @param {AudioBuffer} audioBuffer
 * @returns {object} analysis result with noteInfo added
 */
export function analyzeSample(audioBuffer) {
    if (!audioBuffer) return null

    if (_cache.has(audioBuffer)) {
        return _cache.get(audioBuffer)
    }

    const result = _analyzer.analyzeAudioBuffer(audioBuffer)
    result.noteInfo = result.fundamentalHz
        ? hzToNote(result.fundamentalHz)
        : null

    _cache.set(audioBuffer, result)
    return result
}

/**
 * Clear the analysis cache (e.g. after replacing a sample buffer).
 * @param {AudioBuffer} [audioBuffer] – specific buffer, or all if omitted
 */
export function clearAnalysisCache(audioBuffer) {
    if (audioBuffer) {
        _cache.delete(audioBuffer)
    } else {
        _cache.clear()
    }
}

/**
 * Draw an envelope waveform on a canvas context.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number[]} envelope – array of amplitude values (0..1)
 * @param {number} width
 * @param {number} height
 * @param {string} [strokeColor] – defaults to 'color-info' token
 */
export function drawEnvelope(ctx, envelope, width, height, strokeColor) {
    if (!envelope?.length) return

    const stroke = strokeColor ?? color('color-info')
    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = rgba('canvas-shadow', 0.3)
    ctx.fillRect(0, 0, width, height)

    ctx.beginPath()
    ctx.strokeStyle = stroke
    ctx.lineWidth = 1.5

    const step = width / (envelope.length - 1)
    for (let i = 0; i < envelope.length; i++) {
        const x = i * step
        const y = height - (envelope[i] * height)
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
    }
    ctx.stroke()

    ctx.lineTo(width, height)
    ctx.lineTo(0, height)
    ctx.closePath()
    ctx.fillStyle = rgba('color-info', 0.15)
    ctx.fill()
}
