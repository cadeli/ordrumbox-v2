// src/ui/track_editor/knob_bar.js
// Knob bar — the four header knobs (velocity, pan, pitch, decay).
// Built once by mount(); sync() only updates values in place. The decay
// knob writes to the sound registry (not the track), the rest go through
// cmd.updateTrack.

import { OrKnob } from '../components/or_knob.js'
import { knobFormat, knobUnit } from '../components/ui_utils.js'
import { KNOB_PROPS } from './track_editor_constants.js'
import { TRACK_DEFAULTS } from '../../model/track_schema.js'

export default class KnobBar {
    #editor
    #onDecayChange
    /** @type {import('../components/or_knob.js').OrKnob[]} */
    #knobs = []

    /**
     * @param {import('../track_editor.js').default} editor
     * @param {object} [options]
     * @param {() => void} [options.onDecayChange] repaint hook — the decay
     *   marker lives on the sample waveform, outside this module
     */
    /** @param {import('../track_editor.js').default} editor @param {{onDecayChange?: () => void}} [options] */
    constructor(editor, options = {}) {
        this.#editor = editor
        this.#onDecayChange = options.onDecayChange ?? (() => {})
    }

    /** Create the knob-bar OrKnobs once, replacing the placeholders. @param {HTMLElement} root */
    mount(root) {
        const bar = root.querySelector('.te-knob-bar')
        this.#knobs = KNOB_PROPS.map((def) => {
            const isDecay = def.key === 'decay'
            const dflt = TRACK_DEFAULTS[def.key] ?? (isDecay ? 500 : def.min)
            const knob = new OrKnob({
                key: def.key,
                label: def.label,
                min: def.min,
                max: def.max,
                step: def.step,
                value: isDecay
                    ? (this.#editor.soundRegistry.sounds[this.#editor.track?.sampleId]?.decay ?? 0)
                    : (this.#editor.track?.[def.key] ?? dflt),
                defaultValue: isDecay ? 500 : dflt,
                scale: def.scale,
                format: knobFormat(def),
                // decay's formatter already appends "ms" — a unit here
                // would render the value as "5000 ms ms".
                unit: knobUnit(def),
                onChange: (v) => {
                    if (isDecay) {
                        // Looked up live: the track's sample can change while
                        // the knob persists.
                        const sound = this.#editor.soundRegistry.sounds[this.#editor.track?.sampleId]
                        if (sound) sound.decay = v
                    } else {
                        // Continuous knob: coalesce the drag into ONE undo step.
                        this.#editor.serviceRegistry.cmd?.updateTrack(
                            this.#editor.track,
                            { [def.key]: v },
                            { desc: `${def.label} on ${this.#editor.track.name}`, coalesce: true },
                        )
                    }
                    this.#emitTrackChange()
                    if (isDecay) this.#onDecayChange()
                },
            })
            bar.querySelector(`[data-or-knob="${def.key}"]`)?.replaceWith(knob.createElement())
            return knob
        })
    }

    /** Sync knob bar values in place. @param {import('../../model/track_schema.js').Track} track */
    sync(track) {
        for (const def of KNOB_PROPS) {
            const knob = this.getKnob(def.key)
            if (!knob) continue
            if (def.key === 'decay') {
                const sound = this.#editor.soundRegistry.sounds[track?.sampleId]
                knob.setValue(sound?.decay ?? 0)
            } else {
                knob.setValue(track[def.key] ?? def.min)
            }
        }
    }

    /** @param {string} key @returns {import('../components/or_knob.js').OrKnob|null} */
    getKnob(key) {
        return this.#knobs.find((k) => k.key === key) ?? null
    }

    /**
     * Push LFO values into the knobs whose LFO is armed on the track.
     * @param {Record<string, number>} lfoValues
     * @param {import('../../model/track_schema.js').Track} track
     */
    applyLfo(lfoValues, track) {
        for (const p of KNOB_PROPS) {
            if (p.lfoKey && track[p.lfoKey]) {
                const knob = this.getKnob(p.key)
                if (knob) knob.setValue(lfoValues[p.key] ?? 0)
            }
        }
    }

    destroy() {
        for (const k of this.#knobs) k.destroy()
        this.#knobs = []
    }

    #emitTrackChange() {
        this.#editor.emitTrackChange()
    }
}
