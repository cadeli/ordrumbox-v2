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
const loadedContexts = new WeakSet()

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
        if (loadedContexts.has(audioCtx)) return true
        if (registry.size === 0) return true

        for (const [name, source] of registry.entries()) {
            const blob = new Blob([source], { type: 'application/javascript' })
            const url = URL.createObjectURL(blob)
            try {
                await audioCtx.audioWorklet.addModule(url)
            } catch (err) {
                console.warn(`WorkletLoader: failed to load '${name}'`, err)
                throw err
            } finally {
                // Revoke the Blob URL as soon as the module is loaded (or has
                // failed to load) — the browser has already fetched the source
                // into memory and the URL is no longer needed. Revoking
                // immediately avoids accumulating URLs across many contexts
                // (e.g. repeated exports, page reloads).
                try { URL.revokeObjectURL(url) } catch {}
            }
        }
        loadedContexts.add(audioCtx)
        return true
    }

    static createNode(audioCtx, name, options = {}) {
        if (!this.isSupported(audioCtx)) {
            throw new Error(`WorkletLoader.createNode: AudioWorklet not supported on this context`)
        }
        if (!registry.has(name)) {
            throw new Error(`WorkletLoader.createNode: processor '${name}' not registered`)
        }
        if (!loadedContexts.has(audioCtx)) {
            throw new Error(`WorkletLoader.createNode: call ensureLoaded(audioCtx) first`)
        }
        return new AudioWorkletNode(audioCtx, name, options)
    }

    static isContextReady(audioCtx) {
        return loadedContexts.has(audioCtx)
    }
}
