// src/ui/track_editor/lfo_step_watch.js
// rAF loop that mirrors the sequencer tick and pushes LFO values into the
// live controls (knobs + sliders) while playback runs. One LfoUiBridge is
// created lazily and destroyed with the loop.

import { TICK } from '../../core/constants.js'
import LfoUiBridge from '../../logic/lfo_ui_bridge.js'
import { reportUserError } from '../../core/notify.js'
import { ALL_TRACK_PROPS } from './track_editor_constants.js'

export default class LfoStepWatch {
    #editor
    #rafId
    #lastTick
    #lfoBridge

    /** @param {import('../track_editor.js').default} editor */
    /** @param {any} editor */
    constructor(editor) {
        this.#editor = editor
        this.#rafId = null
        this.#lastTick = -1
        this.#lfoBridge = null
    }

    start() {
        if (this.#rafId) return
        this.#lastTick = -1
        const tick = () => {
            const transport = this.#editor.serviceRegistry.transport
            if (!transport?.isRunning) {
                this.#rafId = null
                return
            }
            try {
                const currentTick = transport.tick
                if (currentTick !== this.#lastTick) {
                    this.#lastTick = currentTick
                    this.#update()
                }
            } catch (err) {
                reportUserError('TrackEditor.lfoLoop', 'LFO meters stopped updating', { cause: err })
            }
            this.#rafId = requestAnimationFrame(tick)
        }
        this.#rafId = requestAnimationFrame(tick)
    }

    stop() {
        if (this.#rafId) {
            cancelAnimationFrame(this.#rafId)
            this.#rafId = null
        }
        this.#lastTick = -1
        if (this.#lfoBridge) {
            this.#lfoBridge.destroy()
            this.#lfoBridge = null
        }
    }

    /** @param {number} tick */
    #lfoValuesForTick(tick) {
        const track = this.#editor.track
        if (!track) return null
        const pattern = this.#editor.appState.selectedPattern
        if (!pattern) return null
        const tickCount = TICK * pattern.beatCount
        if (!this.#lfoBridge) this.#lfoBridge = new LfoUiBridge(this.#editor.serviceRegistry.audioCtx)
        return this.#lfoBridge.compute(track, tick, tickCount)
    }

    /** @param {any} lfoValues */
    #applyLfoValues(lfoValues) {
        const track = this.#editor.track
        if (!lfoValues || !track) return
        ALL_TRACK_PROPS.forEach((p) => {
            if (!p.lfoKey || !track[p.lfoKey]) return
            const ctrl = this.#editor.getControl(p.key)
            if (!ctrl) return
            const raw = lfoValues[p.key] ?? 0
            ctrl.setValue(p.denormalize ? p.denormalize(raw) : raw)
        })
        this.#editor.knobBar.applyLfo(lfoValues, track)
    }

    async #update() {
        const track = this.#editor.track
        if (!track || !this.#editor.isVisible) return
        const transport = this.#editor.serviceRegistry.transport
        if (!transport) return
        const tick = transport.tick
        const result = this.#lfoValuesForTick(tick)
        if (!result) return
        const values = result instanceof Promise ? await result : result
        if (values && transport.tick === tick) this.#applyLfoValues(values)
    }
}
