import MfAudioAnalyze from './analyze.js'
import { hzToNote } from '../core/hz_to_note.js'

const _analyzer = new MfAudioAnalyze()
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
 * @param {string} [color='#4fc3f7']
 */
export function drawEnvelope(ctx, envelope, width, height, color = '#4fc3f7') {
    if (!envelope?.length) return

    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = 'rgba(0,0,0,0.3)'
    ctx.fillRect(0, 0, width, height)

    ctx.beginPath()
    ctx.strokeStyle = color
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
    ctx.fillStyle = 'rgba(79,195,247,0.15)'
    ctx.fill()
}
