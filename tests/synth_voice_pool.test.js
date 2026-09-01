import { describe, it, expect, beforeEach, vi } from 'vitest'
import SynthVoiceNodePool from '../src/audio/voices/synth_voice_pool.js'
import WorkletLoader from '../src/audio/worklets/loader.js'

const postMessageMock = vi.fn()
const connectMock = vi.fn()
const disconnectMock = vi.fn()
function makeWorkletNodeMock() {
    return {
        port: { postMessage: vi.fn() },
        connect: vi.fn(),
        disconnect: vi.fn(),
    }
}

vi.spyOn(WorkletLoader, 'isSupported').mockReturnValue(true)
vi.spyOn(WorkletLoader, 'ensureLoaded').mockResolvedValue(true)

let nodeCounter = 0
vi.spyOn(WorkletLoader, 'createNode').mockImplementation(() => {
    return makeWorkletNodeMock()
})

function createMockAudioCtx() {
    return {
        currentTime: 1.0,
        sampleRate: 44100,
        destination: { connect: vi.fn() },
        createGain: vi.fn(() => ({
            gain: { value: 1, cancelScheduledValues: vi.fn() },
            connect: vi.fn(),
            disconnect: vi.fn(),
        })),
    }
}

describe('SynthVoiceNodePool', () => {
    let audioCtx
    let pool

    beforeEach(() => {
        audioCtx = createMockAudioCtx()
        pool = new SynthVoiceNodePool(audioCtx, 4)
        WorkletLoader.createNode.mockClear()
    })

    it('acquire creates a new node when pool is empty', async () => {
        const node = await pool.acquire()
        expect(node).toBeTruthy()
        expect(node.port).toBeTruthy()
        expect(WorkletLoader.createNode).toHaveBeenCalledTimes(1)
    })

    it('acquire reuses a previously released node', async () => {
        const node1 = await pool.acquire()
        pool.release(node1)
        expect(WorkletLoader.createNode).toHaveBeenCalledTimes(1)

        const node2 = await pool.acquire()
        expect(node2).toBe(node1)
        expect(WorkletLoader.createNode).toHaveBeenCalledTimes(1)
    })

    it('release sends reset message to processor', async () => {
        const node = await pool.acquire()
        pool.release(node)
        expect(node.port.postMessage).toHaveBeenCalledWith({ type: 'reset' })
    })

    it('release disconnects node (from strip) then reconnects to silent gain', async () => {
        const node = await pool.acquire()
        pool.release(node)
        expect(node.disconnect).toHaveBeenCalled()
        expect(node.connect).toHaveBeenCalled()
    })

    it('respects max pool size — excess nodes are discarded', async () => {
        const nodes = []
        for (let i = 0; i < 6; i++) {
            nodes.push(await pool.acquire())
        }
        for (const n of nodes) pool.release(n)

        expect(pool.stats.available).toBe(4)
        expect(pool.stats.active).toBe(0)
    })

    it('tracks active count correctly', async () => {
        expect(pool.stats.active).toBe(0)
        const n1 = await pool.acquire()
        expect(pool.stats.active).toBe(1)
        const n2 = await pool.acquire()
        expect(pool.stats.active).toBe(2)
        pool.release(n1)
        expect(pool.stats.active).toBe(1)
        pool.release(n2)
        expect(pool.stats.active).toBe(0)
    })

    it('acquire creates fresh node after pool is exhausted', async () => {
        const nodes = []
        for (let i = 0; i < 4; i++) nodes.push(await pool.acquire())
        for (const n of nodes) pool.release(n)

        const fresh = await pool.acquire()
        expect(fresh).toBeTruthy()
        expect(pool.stats.available).toBe(3)
    })

    it('destroy clears the pool and silent gain', async () => {
        const node = await pool.acquire()
        pool.release(node)
        expect(pool.stats.available).toBe(1)
        pool.destroy()
        expect(pool.stats.available).toBe(0)
    })

    it('release handles null node gracefully', () => {
        expect(() => pool.release(null)).not.toThrow()
        expect(() => pool.release(undefined)).not.toThrow()
    })
})
