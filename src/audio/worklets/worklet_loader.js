/**
 * WorkletLoader — generic framework for loading AudioWorkletProcessors
 * from inline source strings via Blob URLs.
 *
 * Usage:
 *   import WorkletLoader from './worklet_loader.js'
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

import { logger } from '../../core/logger.js'

const registry = new Map()
const loadedProcessors = new WeakMap() // audioCtx -> Set of loaded processor names
const pendingLoads = new WeakMap() // audioCtx -> Map<name, in-flight load Promise>

export default class WorkletLoader {
    /** @param {any} audioCtx @returns {boolean} */
    static isSupported(audioCtx) {
        if (!audioCtx) return false
        return typeof audioCtx.audioWorklet !== 'undefined' && typeof audioCtx.audioWorklet.addModule === 'function'
    }

    /** @param {string} name @param {string} sourceCode */
    static register(name, sourceCode) {
        if (typeof name !== 'string' || !name) {
            throw new Error('WorkletLoader.register: name must be a non-empty string')
        }
        if (typeof sourceCode !== 'string' || !sourceCode) {
            throw new Error('WorkletLoader.register: sourceCode must be a non-empty string')
        }
        registry.set(name, sourceCode)
    }

    /** @param {string} name @returns {boolean} */
    static has(name) {
        return registry.has(name)
    }

    /** @returns {string[]} */
    static list() {
        return Array.from(registry.keys())
    }

    /** @param {string} name */
    static unregister(name) {
        registry.delete(name)
    }

    /** @returns {void} */
    static reset() {
        registry.clear()
    }

    /** @param {any} audioCtx @returns {Promise<boolean>} */
    static async ensureLoaded(audioCtx) {
        if (!this.isSupported(audioCtx)) return false

        let contextLoadedSet = loadedProcessors.get(audioCtx)
        if (!contextLoadedSet) {
            contextLoadedSet = new Set()
            loadedProcessors.set(audioCtx, contextLoadedSet)
        }

        if (registry.size === 0) return true

        let contextPending = pendingLoads.get(audioCtx)
        if (!contextPending) {
            contextPending = new Map()
            pendingLoads.set(audioCtx, contextPending)
        }

        const waits = []
        for (const [name, source] of registry.entries()) {
            if (contextLoadedSet.has(name)) continue

            // Reuse an in-flight load for this (audioCtx, name) instead of
            // starting a second addModule() for the same processor. Several
            // call sites (strip creation, the synth-voice pool, the master
            // bus, the LFO UI bridge, ...) can call ensureLoaded() for the
            // same context within the same tick — e.g. several notes of a
            // chord firing at once. Per the Web Audio spec, registerProcessor()
            // throws if the same name is registered twice in one
            // AudioWorkletGlobalScope, so an un-deduplicated second
            // addModule() call for a name already loading can reject and
            // silently drop whatever note/node triggered it — and even when
            // it doesn't throw, it redundantly fetches/parses the module a
            // second time right when latency matters most.
            let loadPromise = contextPending.get(name)
            if (!loadPromise) {
                loadPromise = (async () => {
                    const blob = new Blob([source], { type: 'application/javascript' })
                    const url = URL.createObjectURL(blob)
                    try {
                        await audioCtx.audioWorklet.addModule(url)
                        contextLoadedSet.add(name)
                    } catch (err) {
                        logger.warn('WorkletLoader', `WorkletLoader: failed to load '${name}'`, err)
                        throw err
                    } finally {
                        try {
                            URL.revokeObjectURL(url)
                        } catch (e) {
                            logger.warn('WorkletLoader', `Failed to revoke Blob URL for '${name}'`, e)
                        }
                        contextPending.delete(name)
                    }
                })()
                // Recorded synchronously, before any `await` above actually
                // runs — any concurrent ensureLoaded() call for the same
                // (audioCtx, name) reaching this point will see this entry
                // via contextPending.get(name) above and await the same
                // promise instead of racing a second addModule().
                contextPending.set(name, loadPromise)
            }
            waits.push(loadPromise)
        }

        if (waits.length > 0) {
            await Promise.all(waits)
        }
        return true
    }

    /** @param {any} audioCtx @param {string} name @param {any} [options] @returns {AudioWorkletNode} */
    static createNode(audioCtx, name, options = {}) {
        if (!this.isSupported(audioCtx)) {
            throw new Error(`WorkletLoader.createNode: AudioWorklet not supported on this context`)
        }
        if (!registry.has(name)) {
            throw new Error(`WorkletLoader.createNode: processor '${name}' not registered`)
        }

        const contextLoadedSet = loadedProcessors.get(audioCtx)
        if (!contextLoadedSet || !contextLoadedSet.has(name)) {
            throw new Error(
                `WorkletLoader.createNode: processor '${name}' not loaded into this context. Call ensureLoaded(audioCtx) first.`,
            )
        }
        return new AudioWorkletNode(audioCtx, name, options)
    }

    /** @param {any} audioCtx @returns {boolean} */
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
