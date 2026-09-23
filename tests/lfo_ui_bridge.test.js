// tests/lfo_ui_bridge.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockCreateNode = vi.fn()
const mockEnsureLoaded = vi.fn()
const mockIsSupported = vi.fn()
const mockRegister = vi.fn()

vi.mock('../src/audio/worklets/loader.js', () => ({
  default: {
    register: mockRegister,
    isSupported: mockIsSupported,
    ensureLoaded: mockEnsureLoaded,
    createNode: mockCreateNode,
  }
}))

vi.mock('../src/audio/worklets/processors/lfo_ui_source.js', () => ({
  default: 'mock-lfo-ui-processor'
}))

let LfoUiBridge

beforeEach(async () => {
  vi.clearAllMocks()
  mockIsSupported.mockReturnValue(true)
  mockEnsureLoaded.mockResolvedValue()
  LfoUiBridge = (await import('../src/logic/lfo_ui_bridge.js')).default
})

describe('LfoUiBridge', () => {
  describe('constructor', () => {
    it('sets fallback=true when audioCtx is null', () => {
      const bridge = new LfoUiBridge(null)
      expect(bridge.fallback).toBe(true)
    })

    it('sets fallback=true when WorkletLoader.isSupported returns false', () => {
      mockIsSupported.mockReturnValue(false)
      const bridge = new LfoUiBridge({})
      expect(bridge.fallback).toBe(true)
    })

    it('creates worklet node on successful init', async () => {
      const mockNode = { port: { onmessage: null }, disconnect: vi.fn() }
      mockCreateNode.mockReturnValue(mockNode)

      const bridge = new LfoUiBridge({})
      await vi.waitFor(() => expect(mockEnsureLoaded).toHaveBeenCalled())
      expect(bridge.fallback).toBe(false)
    })

    it('sets fallback=true when init throws', async () => {
      mockEnsureLoaded.mockRejectedValue(new Error('worklet load failed'))
      const bridge = new LfoUiBridge({})
      await vi.waitFor(() => expect(bridge.fallback).toBe(true))
    })
  })

  describe('compute', () => {
    it('returns null when track has no LFO keys', () => {
      const bridge = new LfoUiBridge(null)
      const result = bridge.compute({ name: 'KICK' }, 0, 128)
      expect(result).toBeNull()
    })

    it('uses fallback path when worklet unavailable', () => {
      const bridge = new LfoUiBridge(null)
      const track = { velocityLfo: { freq: 1, min: 0, max: 1, phase: 0, waveform: 'sine' } }
      const result = bridge.compute(track, 0, 128)
      expect(result).toBeDefined()
      expect(typeof result.velocity).toBe('number')
    })

    it('fallback computes correct value for sine at tick=0 (min)', () => {
      const bridge = new LfoUiBridge(null)
      const track = { velocityLfo: { freq: 1, min: 0, max: 1, phase: 0, waveform: 'sine' } }
      const result = bridge.compute(track, 0, 128)
      expect(result.velocity).toBe(0)
    })

    it('fallback computes correct value with min/max range', () => {
      const bridge = new LfoUiBridge(null)
      const track = { velocityLfo: { freq: 1, min: 0.2, max: 0.8, phase: 0, waveform: 'sine' } }
      const result = bridge.compute(track, 0, 128)
      expect(result.velocity).toBe(0.2)
      expect(result.velocity).toBeGreaterThanOrEqual(0.2)
      expect(result.velocity).toBeLessThanOrEqual(0.8)
    })

    it('worklet path sends postMessage and resolves from response', async () => {
      const mockNode = {
        port: {
          onmessage: null,
          postMessage: vi.fn(),
        },
        disconnect: vi.fn(),
      }
      mockCreateNode.mockReturnValue(mockNode)

      const bridge = new LfoUiBridge({})
      await vi.waitFor(() => expect(mockEnsureLoaded).toHaveBeenCalled())

      const track = { velocityLfo: { freq: 1, min: 0, max: 1, phase: 0, waveform: 'sine' } }
      const promise = bridge.compute(track, 0, 128)

      expect(mockNode.port.postMessage).toHaveBeenCalled()
      const msg = mockNode.port.postMessage.mock.calls[0][0]
      expect(msg.lfos).toBeDefined()
      expect(msg.tick).toBe(0)

      mockNode.port.onmessage({ data: { id: msg.id, vals: { velocity: 0.75 } } })

      const result = await promise
      expect(result).toEqual({ velocity: 0.75 })
    })
  })

  describe('destroy', () => {
    it('disconnects node and resolves pending promises with null', async () => {
      const mockNode = {
        port: {
          onmessage: null,
          postMessage: vi.fn(),
        },
        disconnect: vi.fn(),
      }
      mockCreateNode.mockReturnValue(mockNode)

      const bridge = new LfoUiBridge({})
      await vi.waitFor(() => expect(mockEnsureLoaded).toHaveBeenCalled())

      const track = { velocityLfo: { freq: 1, min: 0, max: 1, phase: 0, waveform: 'sine' } }
      const promise = bridge.compute(track, 0, 128)

      bridge.destroy()

      const result = await promise
      expect(result).toBeNull()
      expect(mockNode.disconnect).toHaveBeenCalled()
    })

    it('is safe to call multiple times', async () => {
      const mockNode = {
        port: { onmessage: null, postMessage: vi.fn() },
        disconnect: vi.fn(),
      }
      mockCreateNode.mockReturnValue(mockNode)

      const bridge = new LfoUiBridge({})
      await vi.waitFor(() => expect(mockEnsureLoaded).toHaveBeenCalled())

      bridge.destroy()
      bridge.destroy()
    })
  })

  describe('multiple LFO targets', () => {
    it('computes all LFO targets in fallback', () => {
      const bridge = new LfoUiBridge(null)
      const track = {
        velocityLfo: { freq: 1, min: 0, max: 1, phase: 0, waveform: 'sine' },
        panLfo: { freq: 0.5, min: -1, max: 1, phase: 0, waveform: 'sine' },
        pitchLfo: { freq: 2, min: -12, max: 12, phase: 0, waveform: 'sine' },
      }
      const result = bridge.compute(track, 32, 128)
      expect(result).toHaveProperty('velocity')
      expect(result).toHaveProperty('pan')
      expect(result).toHaveProperty('pitch')
    })
  })
})
