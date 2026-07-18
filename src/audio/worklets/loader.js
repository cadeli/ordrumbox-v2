/**
 * WorkletLoader — generic framework for loading AudioWorkletProcessors
 * from inline source strings via Blob URLs.
 *
 * Usage:
 *   import WorkletLoader from './loader.js'
 *   import SATURATION_SOURCE from './processors/saturation_source.js'
 *   WorkletLoader.register('saturation', SATURATION_SOURCE)
 *   await WorkletLoader.ensureLoaded(audioCtx)
 *   const node = WorkletLoader.createNode(audioCtx, 'saturation', {
 *       numberOfInputs: 1,
 *       numberOfOutputs: 1,
 *       outputChannelCount: [2]
 *   })
 *
 * Falls back gracefully if AudioWorklet is not supported.
 */

const registry = new Map()
const loadedProcessors = new WeakMap() // audioCtx -> Set of loaded processor names

export default class WorkletLoader {
    static isSupported(audioCtx) {
        if (!audioCtx) return false
        return typeof audioCtx.audioWorklet !== 'undefined'
            && typeof audioCtx.audioWorklet.addModule === 'function'
    }

    static register(name, sourceCode) {
        if (typeof name !== 'string' || !name) {
            throw new Error('WorkletLoader.register: name must be a non-empty string')
        }
        if (typeof sourceCode !== 'string' || !sourceCode) {
            throw new Error('WorkletLoader.register: sourceCode must be a non-empty string')
        }
        registry.set(name, sourceCode)
    }

    static has(name) {
        return registry.has(name)
    }

    static list() {
        return Array.from(registry.keys())
    }

    static unregister(name) {
        registry.delete(name)
    }

    static reset() {
        registry.clear()
    }

    static async ensureLoaded(audioCtx) {
        if (!this.isSupported(audioCtx)) return false
        
        let contextLoadedSet = loadedProcessors.get(audioCtx)
        if (!contextLoadedSet) {
            contextLoadedSet = new Set()
            loadedProcessors.set(audioCtx, contextLoadedSet)
        }

        if (registry.size === 0) return true

        for (const [name, source] of registry.entries()) {
            if (contextLoadedSet.has(name)) continue

            const blob = new Blob([source], { type: 'application/javascript' })
            const url = URL.createObjectURL(blob)
            try {
                await audioCtx.audioWorklet.addModule(url)
                contextLoadedSet.add(name)
            } catch (err) {
                console.warn(`WorkletLoader: failed to load '${name}'`, err)
                throw err
            } finally {
                try { URL.revokeObjectURL(url) } catch {}
            }
        }
        return true
    }

    static createNode(audioCtx, name, options = {}) {
        if (!this.isSupported(audioCtx)) {
            throw new Error(`WorkletLoader.createNode: AudioWorklet not supported on this context`)
        }
        if (!registry.has(name)) {
            throw new Error(`WorkletLoader.createNode: processor '${name}' not registered`)
        }
        
        const contextLoadedSet = loadedProcessors.get(audioCtx)
        if (!contextLoadedSet || !contextLoadedSet.has(name)) {
            throw new Error(`WorkletLoader.createNode: processor '${name}' not loaded into this context. Call ensureLoaded(audioCtx) first.`)
        }
        return new AudioWorkletNode(audioCtx, name, options)
    }

    static isContextReady(audioCtx) {
        const contextLoadedSet = loadedProcessors.get(audioCtx)
        if (!contextLoadedSet) return false
        // Check if everything currently in registry is loaded
        for (const name of registry.keys()) {
            if (!contextLoadedSet.has(name)) return false
        }
        return true
    }
}
