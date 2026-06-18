import WorkletLoader from '../audio/worklets/loader.js'
import LFO_UI_SOURCE from '../audio/worklets/processors/lfo_ui_source.js'
import { LFO_MAP } from './lfo_engine.js'
import { computeLfoValue } from '../audio/math.js'

WorkletLoader.register('lfo-ui', LFO_UI_SOURCE)

export default class LfoUiBridge {
    #node = null
    #pending = new Map()
    #nextId = 1
    #fallback = false

    constructor(audioCtx) {
        if (!audioCtx || !WorkletLoader.isSupported(audioCtx)) {
            this.#fallback = true
            return
        }
        this.#init(audioCtx).catch(() => {
            this.#fallback = true
            this.#node = null
        })
    }

    get fallback() { return this.#fallback }

    async #init(audioCtx) {
        await WorkletLoader.ensureLoaded(audioCtx)
        this.#node = WorkletLoader.createNode(audioCtx, 'lfo-ui', {
            numberOfInputs: 0,
            numberOfOutputs: 1,
            outputChannelCount: [1]
        })
        this.#node.port.onmessage = (e) => {
            const { id, vals } = e.data
            const resolve = this.#pending.get(id)
            if (resolve) {
                resolve(vals)
                this.#pending.delete(id)
            }
        }
    }

    compute(track, tick, nbTicks) {
        const lfos = {}
        for (const { lfoKey, resultKey } of LFO_MAP) {
            const lfo = track[lfoKey]
            if (lfo) lfos[resultKey] = lfo
        }
        if (Object.keys(lfos).length === 0) return null

        if (this.#fallback) {
            const values = {}
            for (const { lfoKey, resultKey } of LFO_MAP) {
                const lfo = track[lfoKey]
                values[resultKey] = lfo ? computeLfoValue(lfo, tick, nbTicks, resultKey, null, 120) : 0
            }
            return values
        }

        return new Promise(resolve => {
            const id = this.#nextId++
            this.#pending.set(id, resolve)
            this.#node.port.postMessage({ id, lfos, tick, nbTicks })
        })
    }

    destroy() {
        if (this.#node) {
            this.#node.port.onmessage = null
            this.#node.disconnect()
            this.#node = null
        }
        for (const [, resolve] of this.#pending) resolve(null)
        this.#pending.clear()
    }
}
