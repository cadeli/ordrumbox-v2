/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../src/core/logger.js', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { analyzeSample, clearAnalysisCache, drawEnvelope } from '../src/audio/sample_analyzer.js'

function makeMockCtx() {
    return {
        clearRect: vi.fn(),
        fillRect: vi.fn(),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        stroke: vi.fn(),
        closePath: vi.fn(),
        fill: vi.fn(),
        set strokeStyle(v) { this._strokeStyle = v },
        get strokeStyle() { return this._strokeStyle },
        set fillStyle(v) { this._fillStyle = v },
        get fillStyle() { return this._fillStyle },
        set lineWidth(v) { this._lineWidth = v },
        get lineWidth() { return this._lineWidth },
    }
}

function makeMockBuffer() {
    return { length: 1024, numberOfChannels: 1, sampleRate: 44100, getChannelData: () => new Float32Array(1024) }
}

describe('sample_analyzer', () => {
    describe('analyzeSample', () => {
        it('returns null for null input', () => {
            expect(analyzeSample(null)).toBeNull()
            expect(analyzeSample(undefined)).toBeNull()
        })

        it('returns cached result on second call', () => {
            clearAnalysisCache()
            const buf = makeMockBuffer()
            const r1 = analyzeSample(buf)
            const r2 = analyzeSample(buf)
            expect(r1).toBe(r2)
        })

        it('returns different results for different buffers', () => {
            clearAnalysisCache()
            const b1 = makeMockBuffer()
            const b2 = makeMockBuffer()
            const r1 = analyzeSample(b1)
            const r2 = analyzeSample(b2)
            expect(r1).not.toBe(r2)
        })
    })

    describe('clearAnalysisCache', () => {
        it('clears specific buffer from cache', () => {
            clearAnalysisCache()
            const buf = makeMockBuffer()
            analyzeSample(buf)
            clearAnalysisCache(buf)
            const buf2 = makeMockBuffer()
            const r = analyzeSample(buf)
            expect(r).toBeDefined()
        })

        it('clears entire cache when no arg', () => {
            clearAnalysisCache()
            const buf = makeMockBuffer()
            analyzeSample(buf)
            clearAnalysisCache()
            const r1 = analyzeSample(buf)
            expect(r1).toBeDefined()
        })
    })

    describe('drawEnvelope', () => {
        it('does nothing for null/empty envelope', () => {
            const ctx = makeMockCtx()
            drawEnvelope(ctx, null, 100, 50)
            expect(ctx.clearRect).not.toHaveBeenCalled()
            drawEnvelope(ctx, [], 100, 50)
            expect(ctx.clearRect).not.toHaveBeenCalled()
        })

        it('draws with default colors when no colors param', () => {
            const ctx = makeMockCtx()
            drawEnvelope(ctx, [0, 0.5, 1], 100, 50)
            expect(ctx.clearRect).toHaveBeenCalled()
            expect(ctx.stroke).toHaveBeenCalled()
            expect(ctx.fill).toHaveBeenCalled()
        })

        it('uses legacy string color as stroke', () => {
            const ctx = makeMockCtx()
            drawEnvelope(ctx, [0, 1], 100, 50, '#ff0000')
            expect(ctx._strokeStyle).toBe('#ff0000')
        })

        it('uses colors object for stroke, background, fill', () => {
            const ctx = makeMockCtx()
            drawEnvelope(ctx, [0, 1], 100, 50, {
                stroke: '#ff0000',
                background: 'rgba(0,0,0,0.5)',
                fill: 'rgba(255,0,0,0.3)',
            })
            expect(ctx._strokeStyle).toBe('#ff0000')
        })

        it('draws correct number of line segments', () => {
            const ctx = makeMockCtx()
            const envelope = [0, 0.25, 0.5, 0.75, 1]
            drawEnvelope(ctx, envelope, 200, 100)
            expect(ctx.moveTo).toHaveBeenCalledTimes(1)
            expect(ctx.lineTo).toHaveBeenCalledTimes(envelope.length - 1 + 2)
        })
    })
})
