import { safeDisconnect } from '../math.js'
import WorkletLoader from '../worklets/loader.js'
import SYNTH_VOICE_SOURCE from '../worklets/processors/synth_voice_source.js'
import { logger } from '../../core/logger.js'

WorkletLoader.register('synth-voice', SYNTH_VOICE_SOURCE)

const SYNTH_VOICE_OPTIONS = Object.freeze({
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [2],
})

const DEFAULT_MAX_POOL_SIZE = 16

/**
 * Pool for AudioWorkletNode instances used by synth voices.
 *
 * Reusing nodes avoids repeated AudioWorkletNode construction and keeps
 * processors alive in the audio thread. When released, a node is
 * reconnected to a silent gain (preventing GC) and sent a `reset` message
 * so the processor returns to its idle state (startTime=-1, process()
 * returns true, outputs silence).
 */
export default class SynthVoiceNodePool {
    #pool = []
    #audioCtx
    #maxSize
    #silentGain
    #activeCount = 0

    constructor(audioCtx, maxSize = DEFAULT_MAX_POOL_SIZE) {
        this.#audioCtx = audioCtx
        this.#maxSize = maxSize
    }

    get #silent() {
        if (!this.#silentGain) {
            this.#silentGain = this.#audioCtx.createGain()
            this.#silentGain.gain.value = 0
            this.#silentGain.connect(this.#audioCtx.destination)
        }
        return this.#silentGain
    }

    async acquire() {
        while (this.#pool.length > 0) {
            const node = this.#pool.pop()
            if (node) {
                safeDisconnect(node)
                this.#activeCount++
                return node
            }
        }
        try {
            await WorkletLoader.ensureLoaded(this.#audioCtx)
            const node = WorkletLoader.createNode(this.#audioCtx, 'synth-voice', SYNTH_VOICE_OPTIONS)
            node.port.postMessage({ type: 'setPooled', value: true })
            this.#activeCount++
            return node
        } catch (e) {
            logger.error('SynthVoiceNodePool', 'acquire: failed to create worklet node', e)
            throw e
        }
    }

    release(node) {
        if (!node) return
        this.#activeCount = Math.max(0, this.#activeCount - 1)
        safeDisconnect(node)
        try {
            node.connect(this.#silent)
        } catch (e) {
            logger.warn('SynthVoiceNodePool', 'release: reconnect to silent failed', e)
        }
        node.port.postMessage({ type: 'setPooled', value: true })
        node.port.postMessage({ type: 'reset' })
        if (this.#pool.length < this.#maxSize) {
            this.#pool.push(node)
        }
    }

    get stats() {
        return {
            available: this.#pool.length,
            active: this.#activeCount,
            maxSize: this.#maxSize,
        }
    }

    destroy() {
        for (const node of this.#pool) {
            safeDisconnect(node)
        }
        this.#pool.length = 0
        if (this.#silentGain) {
            safeDisconnect(this.#silentGain)
            this.#silentGain = null
        }
    }
}
