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

    it('release sends setPooled and reset messages to processor', async () => {
        const node = await pool.acquire()
        pool.release(node)
        expect(node.port.postMessage).toHaveBeenCalledWith({ type: 'setPooled', value: true })
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

    // ── zombie node / lifecycle tests ──────────────────────────────────

    it('fresh node created by acquire gets setPooled(true) immediately', async () => {
        const node = await pool.acquire()
        expect(node.port.postMessage).toHaveBeenCalledWith({ type: 'setPooled', value: true })
    })

    it('reused node receives setPooled+reset on release, then can be re-acquired', async () => {
        const node1 = await pool.acquire()
        node1.port.postMessage.mockClear()

        pool.release(node1)
        expect(node1.port.postMessage).toHaveBeenCalledWith({ type: 'setPooled', value: true })
        expect(node1.port.postMessage).toHaveBeenCalledWith({ type: 'reset' })

        const node2 = await pool.acquire()
        expect(node2).toBe(node1)
    })

    it('full lifecycle: acquire → release → acquire works without losing the node', async () => {
        const nodes = []
        for (let i = 0; i < 3; i++) {
            const n = await pool.acquire()
            nodes.push(n)
        }
        expect(pool.stats.active).toBe(3)

        for (const n of nodes) pool.release(n)
        expect(pool.stats.active).toBe(0)
        expect(pool.stats.available).toBe(3)

        const reacquired = []
        for (let i = 0; i < 3; i++) {
            reacquired.push(await pool.acquire())
        }
        expect(pool.stats.active).toBe(3)
        // Pool is LIFO (pop), so reacquired order is reversed
        expect(reacquired[0]).toBe(nodes[2])
        expect(reacquired[1]).toBe(nodes[1])
        expect(reacquired[2]).toBe(nodes[0])
    })

    it('release-to-pool then acquire clears disconnect count (fresh connection state)', async () => {
        const node = await pool.acquire()
        const disconnectCountBefore = node.disconnect.mock.calls.length

        pool.release(node)
        expect(node.disconnect.mock.calls.length).toBeGreaterThan(disconnectCountBefore)

        const reacquired = await pool.acquire()
        expect(reacquired).toBe(node)
        // After acquire, safeDisconnect is called again (from silent gain)
        expect(node.disconnect.mock.calls.length).toBeGreaterThan(disconnectCountBefore + 1)
    })
})
