import { describe, it, expect, vi, beforeEach } from 'vitest'

function createMockAudioCtx() {
    let id = 0
    const createNode = (type) => {
        const node = {
            constructor: { name: type },
            disconnect: vi.fn(),
            gain: { value: 1, cancelScheduledValues: vi.fn(), setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), setTargetAtTime: vi.fn() },
            frequency: { value: 350, cancelScheduledValues: vi.fn(), setValueAtTime: vi.fn(), setTargetAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
            Q: { value: 1, cancelScheduledValues: vi.fn(), setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() },
            pan: { value: 0, cancelScheduledValues: vi.fn(), setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() },
            type: 'lowpass',
        }
        return node
    }
    return {
        createGain: () => createNode('GainNode'),
        createBiquadFilter: () => createNode('BiquadFilterNode'),
        createStereoPanner: () => createNode('StereoPannerNode'),
        createOscillator: () => createNode('OscillatorNode'),
        createBufferSource: () => createNode('BufferSourceNode'),
    }
}

import NodePool from '../src/audio/node_pool.js'

describe('NodePool', () => {
    let audioCtx, pool

    beforeEach(() => {
        audioCtx = createMockAudioCtx()
        pool = new NodePool(audioCtx)
    })

    it('creates a new node when pool is empty', () => {
        const node = pool.acquire('GainNode')
        expect(node).toBeDefined()
        expect(node.constructor.name).toBe('GainNode')
    })

    it('returns a disconnected node', () => {
        const node1 = pool.acquire('GainNode')
        node1.disconnect.mockClear()
        pool.release(node1)
        const node2 = pool.acquire('GainNode')
        expect(node2).toBe(node1)
        expect(node2.disconnect).toHaveBeenCalled()
    })

    it('recycles released nodes', () => {
        const node1 = pool.acquire('GainNode')
        pool.release(node1)
        const node2 = pool.acquire('GainNode')
        expect(node2).toBe(node1)
    })

    it('creates fresh node after pool exhausted', () => {
        const node1 = pool.acquire('GainNode')
        const node2 = pool.acquire('GainNode')
        pool.release(node1)
        pool.release(node2)
        const node3 = pool.acquire('GainNode')
        const node4 = pool.acquire('GainNode')
        // LIFO: node3 gets node2, node4 gets node1
        expect(node3).toBe(node2)
        expect(node4).toBe(node1)
        // Pool is now empty — next acquire creates a fresh node
        const node5 = pool.acquire('GainNode')
        expect(node5).not.toBe(node1)
        expect(node5).not.toBe(node2)
    })

    it('resetNode resets GainNode', () => {
        const node = pool.acquire('GainNode')
        node.gain.value = 0.5
        pool.release(node)
        pool.acquire('GainNode')
        expect(node.gain.cancelScheduledValues).toHaveBeenCalled()
        expect(node.gain.value).toBe(1)
    })

    it('resetNode resets BiquadFilterNode', () => {
        const node = pool.acquire('BiquadFilterNode')
        node.frequency.value = 5000
        node.Q.value = 10
        node.type = 'bandpass'
        pool.release(node)
        pool.acquire('BiquadFilterNode')
        expect(node.frequency.cancelScheduledValues).toHaveBeenCalled()
        expect(node.frequency.value).toBe(350)
        expect(node.Q.value).toBe(1)
        expect(node.type).toBe('lowpass')
    })

    it('resetNode resets StereoPannerNode', () => {
        const node = pool.acquire('StereoPannerNode')
        node.pan.value = 0.8
        pool.release(node)
        pool.acquire('StereoPannerNode')
        expect(node.pan.cancelScheduledValues).toHaveBeenCalled()
        expect(node.pan.value).toBe(0)
    })

    it('release disconnects node', () => {
        const node = pool.acquire('GainNode')
        pool.release(node)
        expect(node.disconnect).toHaveBeenCalled()
    })

    it('release ignores null/undefined', () => {
        expect(() => pool.release(null)).not.toThrow()
        expect(() => pool.release(undefined)).not.toThrow()
    })

    it('pools different types independently', () => {
        const gain = pool.acquire('GainNode')
        const filter = pool.acquire('BiquadFilterNode')
        pool.release(gain)
        pool.release(filter)
        expect(pool.acquire('GainNode')).toBe(gain)
        expect(pool.acquire('BiquadFilterNode')).toBe(filter)
    })

    it('stats reports pool sizes', () => {
        const gain1 = pool.acquire('GainNode')
        const gain2 = pool.acquire('GainNode')
        pool.release(gain1)
        pool.release(gain2)
        const filter = pool.acquire('BiquadFilterNode')
        pool.release(filter)

        const stats = pool.stats
        expect(stats.GainNode).toBe(2)
        expect(stats.BiquadFilterNode).toBe(1)
        expect(stats.StereoPannerNode).toBeUndefined()
    })

    it('throws for unsupported node types', () => {
        expect(() => pool.acquire('AudioWorkletNode')).toThrow('unsupported node type')
    })

    it('resetNode is a no-op for null/undefined', () => {
        expect(() => pool.resetNode(null, 'GainNode')).not.toThrow()
        expect(() => pool.resetNode(undefined, 'GainNode')).not.toThrow()
    })

    it('does not pool disposable node types', () => {
        const node = pool.acquire('OscillatorNode')
        pool.release(node)
        // Pool should be empty for this type (disposable, not recycled)
        expect(pool.stats.OscillatorNode).toBe(0)
    })
})
