// src/ui/synth_editor/synth_preset_model.js
// Edit-session state and preset persistence for the SynthEditor.
// Holds draft/original/editKey (+ cardBypassed), owns registry writes and the
// frame-coalesced commit, and notifies subscribers on session changes.

import { logger } from '../../core/logger.js'
import { reportUserError } from '../../core/notify.js'
import { cacheGeneratedSounds } from '../../cache/idb_cache.js'
import { getLfoWaveformValue, syncToHz } from '../../audio/math.js'
import { WAVE_TYPES } from '../../audio/fx_values.js'
import { LFO_TARGET_SCALE, SYNTH_GROUP_DEFAULTS, CARD_BYPASS_FLAGS } from './synth_editor_constants.js'

export default class SynthPresetModel {
    #soundRegistry
    #serviceRegistry
    #editKey
    #original
    #draft
    #cardBypassed
    #listeners
    #commitRafId

    /**
     * @param {{ soundRegistry: object, serviceRegistry: object }} deps
     */
    constructor(deps) {
        this.#soundRegistry = deps.soundRegistry
        this.#serviceRegistry = deps.serviceRegistry
        this.#editKey = null
        this.#original = null
        this.#draft = null
        this.#cardBypassed = {}
        this.#listeners = new Set()
        this.#commitRafId = null
    }

    /** @returns {string|null} current edit key */
    get editKey() {
        return this.#editKey
    }
    set editKey(v) {
        this.#editKey = v
    }

    /** @returns {Object|null} current draft state */
    get draft() {
        return this.#draft
    }
    set draft(v) {
        this.#draft = v
    }

    /** @returns {Object|null} original sound (before edits) */
    get original() {
        return this.#original
    }
    set original(v) {
        this.#original = v
    }

    /** @returns {Object} card bypassed state { [groupName]: boolean } */
    get cardBypassed() {
        return this.#cardBypassed
    }

    /** @returns {string[]} sorted keys of loaded synth presets. */
    get soundKeys() {
        return Object.keys(this.#soundRegistry.generatedSounds ?? {}).sort((a, b) => a.localeCompare(b))
    }

    /**
     * Registers a listener called on every session change (load/revert/section mutations).
     * @param {() => void} listener
     * @returns {() => void} unsubscribe
     */
    subscribe(listener) {
        this.#listeners.add(listener)
        return () => this.#listeners.delete(listener)
    }

    /** Signals that session state was mutated outside a model operation; subscribers re-render. */
    notify() {
        for (const listener of this.#listeners) listener()
    }

    /** Applies card bypass state to the model (the caller updates the card DOM). */
    setCardBypassed(groupName, bypassed) {
        this.#cardBypassed[groupName] = bypassed
    }

    /** Derives cardBypassed from the draft so bypassed cards render correctly on preset load. */
    hydrateCardBypassed() {
        const d = this.#draft
        if (!d) return
        for (const vco of ['vco1', 'vco2', 'vco3']) {
            this.#cardBypassed[vco] = d[vco]?.gain === 0
        }
        for (const [group, flag] of Object.entries(CARD_BYPASS_FLAGS)) {
            this.#cardBypassed[group] = Boolean(d[flag])
        }
    }

    /** Fills missing draft fields with defaults. */
    hydrate() {
        if (!this.#draft) return
        try {
            for (const [key, defaultValue] of Object.entries(SYNTH_GROUP_DEFAULTS)) {
                if (this.#isPlainObject(defaultValue)) {
                    if (!this.#isPlainObject(this.#draft[key])) {
                        this.#draft[key] = structuredClone(defaultValue)
                        continue
                    }
                    for (const [childKey, childDefault] of Object.entries(defaultValue)) {
                        if (this.#draft[key][childKey] === undefined) this.#draft[key][childKey] = childDefault
                    }
                } else if (this.#draft[key] === undefined) {
                    this.#draft[key] = defaultValue
                }
            }
        } catch (e) {
            logger.warn('SynthPresetModel', 'hydrate failed', e)
        }
    }

    /**
     * Loads a preset into the draft, flushing any pending commit first.
     * @param {string} key preset key
     * @returns {boolean} whether the preset was loaded
     */
    loadPreset(key) {
        this.flush()
        const sound = this.#soundRegistry.generatedSounds?.[key]
        if (!sound) return false
        this.#editKey = key
        this.#original = structuredClone(sound)
        this.#draft = structuredClone(sound)
        this.hydrate()
        this.notify()
        return true
    }

    /** Commits a sound to the registry and notifies the audio engine. */
    commitSound(key, sound) {
        this.#soundRegistry.generatedSounds[key] = structuredClone(sound)
        this.#serviceRegistry.audioEngine?.setGeneratedSounds(this.#soundRegistry.generatedSounds)
        this.persist()
    }

    /** Removes a preset from the registry and notifies the audio engine. */
    deleteSound(key) {
        delete this.#soundRegistry.generatedSounds[key]
        this.#serviceRegistry.audioEngine?.setGeneratedSounds(this.#soundRegistry.generatedSounds)
        this.persist()
    }

    persist() {
        // Was `.catch?.(() => {})`: a failed write meant the user kept editing
        // and lost every change on reload, with no hint at all.
        Promise.resolve(cacheGeneratedSounds(structuredClone(this.#soundRegistry.generatedSounds))).catch((err) => {
            reportUserError('SynthEditor.presets.persist', 'Synth preset changes are not being saved', {
                cause: err,
            })
        })
    }

    /**
     * Commits the live-edited draft to the sound registry: immediately for
     * clicks/selections, coalesced on the next animation frame for knob drags
     * (a drag emits one change per mousemove — one commit per frame instead).
     * @param {boolean} defer coalesce on the next animation frame
     */
    commit(defer = false) {
        if (!this.#editKey || !this.#draft) return
        if (!defer) {
            this.#cancelCommit()
            this.commitSound(this.#editKey, this.#draft)
            return
        }
        if (this.#commitRafId) return
        this.#commitRafId = requestAnimationFrame(() => {
            this.#commitRafId = null
            if (this.#editKey && this.#draft) this.commitSound(this.#editKey, this.#draft)
        })
    }

    /** Commits a pending frame-coalesced preview synchronously (before preset switch/close). */
    flush() {
        if (!this.#commitRafId) return
        this.#cancelCommit()
        if (this.#editKey && this.#draft) this.commitSound(this.#editKey, this.#draft)
    }

    #cancelCommit() {
        if (this.#commitRafId) {
            cancelAnimationFrame(this.#commitRafId)
            this.#commitRafId = null
        }
    }

    /** Restores the original preset: commits it, resets the draft from it, notifies. */
    revert() {
        if (!this.#editKey || !this.#original) return
        this.#cancelCommit()
        this.commitSound(this.#editKey, this.#original)
        this.#draft = structuredClone(this.#original)
        this.notify()
    }

    /**
     * Ends the edit session: cancels the pending commit and drops the state.
     * Silent — the view hides itself, there is nothing left to render.
     */
    clearSession() {
        this.#cancelCommit()
        this.#editKey = null
        this.#original = null
        this.#draft = null
        this.#cardBypassed = {}
    }

    /**
     * Computes the LFO modulation amount for a synth LFO config.
     * Mirrors the worklet's #lfoValue() + getLfoWaveformValue() math.
     * @param {any} lfo  LFO config { target, wave, freq, depth, sync }
     * @param {number} [audioTime]  AudioContext.currentTime (defaults to the audio context time)
     * @returns {number} modulation amount in the target's display units
     */
    computeLfoMod(lfo, audioTime = this.#serviceRegistry?.audioCtx?.currentTime ?? 0) {
        const target = lfo.target
        const scale = LFO_TARGET_SCALE[target]
        if (!scale) return 0

        // Same frequency resolution as WorkletSynthVoice (tempo sync wins over freq)
        const freq = syncToHz(lfo.sync, this.#serviceRegistry?.transport?.bpm) ?? lfo.freq ?? 0
        const depth = lfo.depth ?? 0
        if (freq <= 0 || depth <= 0) return 0

        const waveName = lfo.wave ?? 'sine'
        const waveIdx = WAVE_TYPES.indexOf(waveName)
        // Not wrapped: getLfoWaveformValue() wraps internally and S&H needs the cycle index.
        const phase = audioTime * freq
        const raw = getLfoWaveformValue(phase, waveIdx >= 0 ? waveIdx : 0)

        return raw * depth * scale
    }

    /** @returns {boolean} true if value is a plain object (not array, not null). */
    #isPlainObject(val) {
        return val != null && typeof val === 'object' && !Array.isArray(val)
    }
}
