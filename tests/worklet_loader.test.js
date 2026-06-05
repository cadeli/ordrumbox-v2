/**
 * @vitest-environment jsdom
 *
 * WorkletLoader framework tests.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import WorkletLoader from '../src/audio/worklets/loader.js'

describe('WorkletLoader', () => {
    beforeEach(() => {
        WorkletLoader.reset()
    })

    it('throws if register() receives invalid name', () => {
        expect(() => WorkletLoader.register('', 'src')).toThrow(/name/)
        expect(() => WorkletLoader.register(null, 'src')).toThrow(/name/)
        expect(() => WorkletLoader.register(123, 'src')).toThrow(/name/)
    })

    it('throws if register() receives invalid source', () => {
        expect(() => WorkletLoader.register('foo', '')).toThrow(/source/)
        expect(() => WorkletLoader.register('foo', null)).toThrow(/source/)
        expect(() => WorkletLoader.register('foo', 42)).toThrow(/source/)
    })

    it('registers a processor and reports it via has/list', () => {
        WorkletLoader.register('foo', 'class FooProc extends AudioWorkletProcessor {}')
        expect(WorkletLoader.has('foo')).toBe(true)
        expect(WorkletLoader.has('bar')).toBe(false)
        expect(WorkletLoader.list()).toContain('foo')
    })

    it('unregister() removes a processor', () => {
        WorkletLoader.register('foo', 'src')
        expect(WorkletLoader.has('foo')).toBe(true)
        WorkletLoader.unregister('foo')
        expect(WorkletLoader.has('foo')).toBe(false)
    })

    it('reset() clears all registrations', () => {
        WorkletLoader.register('a', 'src')
        WorkletLoader.register('b', 'src')
        WorkletLoader.reset()
        expect(WorkletLoader.list()).toEqual([])
    })

    it('isSupported() returns false for null context', () => {
        expect(WorkletLoader.isSupported(null)).toBe(false)
        expect(WorkletLoader.isSupported(undefined)).toBe(false)
    })

    it('isSupported() returns false for context without audioWorklet', () => {
        const fakeCtx = { sampleRate: 44100, currentTime: 0 }
        expect(WorkletLoader.isSupported(fakeCtx)).toBe(false)
    })

    it('isSupported() returns true for context with audioWorklet', () => {
        const fakeCtx = {
            sampleRate: 44100,
            currentTime: 0,
            audioWorklet: { addModule: vi.fn().mockResolvedValue(undefined) }
        }
        expect(WorkletLoader.isSupported(fakeCtx)).toBe(true)
    })

    it('createNode() throws if audioWorklet not supported', () => {
        const fakeCtx = { sampleRate: 44100, currentTime: 0 }
        WorkletLoader.register('foo', 'src')
        expect(() => WorkletLoader.createNode(fakeCtx, 'foo')).toThrow(/not supported/)
    })

    it('createNode() throws if processor not registered', () => {
        const fakeCtx = {
            sampleRate: 44100,
            currentTime: 0,
            audioWorklet: { addModule: vi.fn().mockResolvedValue(undefined) }
        }
        global.AudioWorkletNode = vi.fn()
        expect(() => WorkletLoader.createNode(fakeCtx, 'missing')).toThrow(/not registered/)
    })

    it('createNode() throws if context not loaded yet', () => {
        const fakeCtx = {
            sampleRate: 44100,
            currentTime: 0,
            audioWorklet: { addModule: vi.fn().mockResolvedValue(undefined) }
        }
        WorkletLoader.register('foo', 'src')
        global.AudioWorkletNode = vi.fn()
        expect(() => WorkletLoader.createNode(fakeCtx, 'foo')).toThrow(/ensureLoaded/)
    })

    it('ensureLoaded() returns false when not supported', async () => {
        const fakeCtx = { sampleRate: 44100, currentTime: 0 }
        const result = await WorkletLoader.ensureLoaded(fakeCtx)
        expect(result).toBe(false)
    })

    it('ensureLoaded() returns true with no registered processors', async () => {
        const fakeCtx = {
            sampleRate: 44100,
            currentTime: 0,
            audioWorklet: { addModule: vi.fn().mockResolvedValue(undefined) }
        }
        const result = await WorkletLoader.ensureLoaded(fakeCtx)
        expect(result).toBe(true)
    })

    it('ensureLoaded() calls audioWorklet.addModule for each registered processor', async () => {
        const addModule = vi.fn().mockResolvedValue(undefined)
        const fakeCtx = {
            sampleRate: 44100,
            currentTime: 0,
            audioWorklet: { addModule }
        }
        const createObjectURL = vi.fn().mockReturnValue('blob:foo')
        const revokeObjectURL = vi.fn()
        global.URL = { createObjectURL, revokeObjectURL }
        global.Blob = class { constructor(parts) { this.parts = parts } }

        WorkletLoader.register('a', 'src-a')
        WorkletLoader.register('b', 'src-b')

        await WorkletLoader.ensureLoaded(fakeCtx)

        expect(addModule).toHaveBeenCalledTimes(2)
        expect(addModule).toHaveBeenCalledWith('blob:foo')
        expect(createObjectURL).toHaveBeenCalledTimes(2)
    })

    it('ensureLoaded() is idempotent (caches per context)', async () => {
        const addModule = vi.fn().mockResolvedValue(undefined)
        const fakeCtx = {
            sampleRate: 44100,
            currentTime: 0,
            audioWorklet: { addModule }
        }
        global.URL = { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} }
        global.Blob = class {}

        WorkletLoader.register('a', 'src-a')
        await WorkletLoader.ensureLoaded(fakeCtx)
        await WorkletLoader.ensureLoaded(fakeCtx)

        expect(addModule).toHaveBeenCalledTimes(1)
        expect(WorkletLoader.isContextReady(fakeCtx)).toBe(true)
    })

    it('ensureLoaded() revokes the Blob URL immediately after addModule()', async () => {
        const addModule = vi.fn().mockResolvedValue(undefined)
        const fakeCtx = {
            sampleRate: 44100,
            currentTime: 0,
            audioWorklet: { addModule }
        }
        const createObjectURL = vi.fn(() => 'blob:abc')
        const revokeObjectURL = vi.fn()
        global.URL = { createObjectURL, revokeObjectURL }
        global.Blob = class {}

        WorkletLoader.register('proc', 'src')
        await WorkletLoader.ensureLoaded(fakeCtx)

        expect(createObjectURL).toHaveBeenCalledTimes(1)
        expect(revokeObjectURL).toHaveBeenCalledTimes(1)
        expect(revokeObjectURL).toHaveBeenCalledWith('blob:abc')
    })

    it('ensureLoaded() still revokes the Blob URL when addModule() fails', async () => {
        const addModule = vi.fn().mockRejectedValue(new Error('parse fail'))
        const fakeCtx = {
            sampleRate: 44100,
            currentTime: 0,
            audioWorklet: { addModule }
        }
        const createObjectURL = vi.fn(() => 'blob:xyz')
        const revokeObjectURL = vi.fn()
        global.URL = { createObjectURL, revokeObjectURL }
        global.Blob = class {}
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

        WorkletLoader.register('proc', 'src')
        await expect(WorkletLoader.ensureLoaded(fakeCtx)).rejects.toThrow('parse fail')

        expect(revokeObjectURL).toHaveBeenCalledWith('blob:xyz')
        warnSpy.mockRestore()
    })

    it('createNode() succeeds after ensureLoaded()', () => {
        const fakeNode = { parameters: new Map(), port: {}, connect: vi.fn() }
        const MockWorkletNode = vi.fn(function() { return fakeNode })
        const fakeCtx = {
            sampleRate: 44100,
            currentTime: 0,
            audioWorklet: { addModule: vi.fn().mockResolvedValue(undefined) }
        }
        global.AudioWorkletNode = MockWorkletNode
        global.URL = { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} }
        global.Blob = class {}

        WorkletLoader.register('foo', 'src')
        return WorkletLoader.ensureLoaded(fakeCtx).then(() => {
            const node = WorkletLoader.createNode(fakeCtx, 'foo', { numberOfInputs: 1 })
            expect(node).toBe(fakeNode)
            expect(MockWorkletNode).toHaveBeenCalledWith(fakeCtx, 'foo', { numberOfInputs: 1 })
        })
    })
})
