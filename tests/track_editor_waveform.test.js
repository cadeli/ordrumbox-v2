// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../src/audio/sample_analyzer.js', () => ({
    analyzeSample: vi.fn(() => ({ envelope: [0.1, 0.9, 0.4], noteInfo: null, length: 0.5, peakDb: -3 })),
    clearAnalysisCache: vi.fn(),
    drawEnvelope: vi.fn(),
}))

import TrackEditor from '../src/ui/track_editor.js'
import { drawEnvelope } from '../src/audio/sample_analyzer.js'
import { sampleWaveformTheme } from '../src/ui/theme.js'
import { soundRegistry } from '../src/state/sound_registry.js'

const ENVELOPE = [0.1, 0.9, 0.4]

function makeEditor({ decay = 100, duration = 0.5 } = {}) {
    const editor = new TrackEditor()
    editor.container = document.createElement('div')
    editor._track = { soundId: 'real/kick.wav', useSoftSynth: false }
    soundRegistry.sounds = { 'real/kick.wav': { buffer: { duration }, decay } }
    editor.container.innerHTML = '<canvas class="te-waveform" width="500" height="48"></canvas>'
    return { editor, canvas: editor.container.querySelector('.te-waveform') }
}

const markerCalls = (canvas) => {
    const ctx = canvas.getContext('2d')
    return { ctx, x: ctx.moveTo.mock.calls[0]?.[0], y: ctx.moveTo.mock.calls[0]?.[1] }
}

describe('TrackEditor — sample waveform contrast', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        soundRegistry.reset()
    })

    it('draws the envelope with the dark scope background and phosphor curve', () => {
        const { editor, canvas } = makeEditor()
        editor._drawSampleWaveform()

        const dpr = window.devicePixelRatio || 1
        const theme = sampleWaveformTheme(2 * dpr)
        expect(drawEnvelope).toHaveBeenCalledWith(canvas.getContext('2d'), ENVELOPE, canvas.width, canvas.height, theme)
        // Legacy default was a light gray panel with a pale green line — the
        // two colors the graph was unreadable with.
        expect(theme.background).not.toBe('#D1D2CE')
        expect(theme.stroke).not.toBe('#D1D2CE')
        expect(theme.stroke).not.toBe(theme.background)
    })

    it('draws the decay cutoff as a glowing pink dashed marker', () => {
        const { editor, canvas } = makeEditor({ decay: 100, duration: 0.5 })
        const ctx = canvas.getContext('2d')
        // shadow* are plain properties on the stub — spy on their writes to
        // prove the glow was applied and then cleaned up.
        const blurs = []
        const colors = []
        Object.defineProperty(ctx, 'shadowBlur', {
            configurable: true,
            get: () => blurs.at(-1),
            set: (v) => {
                blurs.push(v)
            },
        })
        Object.defineProperty(ctx, 'shadowColor', {
            configurable: true,
            get: () => colors.at(-1),
            set: (v) => {
                colors.push(v)
            },
        })

        editor._drawSampleWaveform()

        const theme = sampleWaveformTheme(2)
        const { x, y } = markerCalls(canvas)
        expect(ctx.strokeStyle).toBe(theme.marker)
        expect(colors).toEqual([theme.marker, 'transparent'])
        expect(blurs).toEqual([6, 0])
        expect(ctx.setLineDash.mock.calls[0]).toEqual([[4, 4]])
        expect(ctx.setLineDash.mock.calls.at(-1)).toEqual([[]])
        expect(x).toBeCloseTo(100, 6) // 100 ms of a 500 ms sample → 20% of width
        expect(y).toBe(0)
        expect(ctx.lineTo).toHaveBeenCalledWith(x, 48)
    })

    it('clamps the marker to the right edge when decay exceeds the sample length', () => {
        const { editor, canvas } = makeEditor({ decay: 5000, duration: 0.2 })
        editor._drawSampleWaveform()

        const { ctx, x } = markerCalls(canvas)
        expect(x).toBe(500)
        expect(ctx.lineTo).toHaveBeenCalledWith(500, 48)
    })

    it('keeps the backing store when the canvas is not laid out (jsdom fallback)', () => {
        const { editor, canvas } = makeEditor()
        editor._drawSampleWaveform()
        expect(canvas.width).toBe(500)
        expect(canvas.height).toBe(48)
    })
})
