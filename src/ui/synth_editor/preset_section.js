// src/ui/synth_editor/preset_section.js
// Preset CRUD operations and footer rendering.

import { escapeHtml, renderOptions } from '../components/ui_utils.js'
import { reportUserError, showToast } from '../../core/notify.js'
import { SYNTH_GROUP_DEFAULTS, SYNTH_PARAM_META } from './synth_editor_constants.js'

export default class PresetSection {
    #model
    #soundRegistry
    #serviceRegistry
    #loadFailed
    #loadPromise

    /**
     * @param {import('./synth_preset_model.js').default} model edit-session state
     * @param {{ soundRegistry: object, serviceRegistry: object }} deps
     */
    constructor(model, deps) {
        this.#model = model
        this.#soundRegistry = deps.soundRegistry
        this.#serviceRegistry = deps.serviceRegistry
        this.#loadFailed = false
        this.#loadPromise = null
    }

    /** @returns {string[]} sorted keys of loaded synth presets. */
    getGeneratedSoundKeys() {
        return this.#model.soundKeys
    }

    /** Loads generated sounds from disk if not already loaded. */
    async ensureGeneratedSoundsLoaded() {
        if (this.#loadFailed) return
        if (this.getGeneratedSoundKeys().length > 0) return
        if (this.#loadPromise) return this.#loadPromise

        this.#loadPromise = (async () => {
            try {
                await this.#serviceRegistry.resourcesLoader?.loadGeneratedSounds(
                    (await import('../../loader/resources_loader.js')).default.GENERATED_SOUNDS_URL,
                )
                this.#serviceRegistry.audioEngine?.setGeneratedSounds(this.#soundRegistry.generatedSounds)
            } catch (err) {
                this.#loadFailed = true
                reportUserError('SynthEditor.presets', 'Synth presets could not be loaded', { cause: err })
            } finally {
                this.#loadPromise = null
            }
        })()
        return this.#loadPromise
    }

    /** Clears the load state so a failed load can be retried on the next session. */
    resetLoadState() {
        this.#loadFailed = false
    }

    /** @returns {string} footer HTML with preset selector and action buttons. */
    renderFooter() {
        const keys = this.getGeneratedSoundKeys()
        const currentKey = this.#model.editKey ?? ''
        const options = renderOptions(keys, currentKey, { escape: escapeHtml })
        return `<div class="ss-footer">
             <select class="ss-preset-select" data-action="synth-preset">
                 <option value="">-- preset --</option>
                 ${options}
             </select>
             <button class="ss-tb-btn" data-action="synth-delete" title="Delete preset">✕</button>
             <span class="ss-footer-sep"></span>
             <button class="ss-tb-btn" data-action="synth-new" title="New preset">+</button>
             <button class="ss-tb-btn" data-action="synth-duplicate" title="Duplicate preset">⧉</button>
             <button class="ss-tb-btn" data-action="synth-revert" title="Revert to original settings">Revert</button>
             <span class="ss-footer-sep"></span>
             <button class="ss-tb-btn" data-action="synth-export" title="Export synth sounds as JSON">Export</button>
             <button class="ss-tb-btn" data-action="synth-import" title="Import synth sounds from JSON">Import</button>
         </div>`
    }

    // ─── Preset actions ────────────────────────────────────────────────

    navigatePreset(dir) {
        const keys = this.getGeneratedSoundKeys()
        if (keys.length === 0) return
        const idx = keys.indexOf(this.#model.editKey)
        const next = (idx + dir + keys.length) % keys.length
        this.#model.loadPreset(keys[next])
    }

    selectPreset(key) {
        if (!key || key === this.#model.editKey) return
        this.#model.loadPreset(key)
    }

    duplicatePreset() {
        const model = this.#model
        if (!model.draft || !model.editKey) return
        const newKey = `${model.editKey}_copy`
        model.commitSound(newKey, model.draft)
        model.editKey = newKey
        model.original = structuredClone(model.draft)
        model.notify()
    }

    newPreset() {
        const model = this.#model
        model.flush()
        const keys = this.getGeneratedSoundKeys()
        let base = 1
        let name = 'new_preset'
        while (keys.includes(name)) {
            name = `new_preset_${base++}`
        }
        const sound = structuredClone(SYNTH_GROUP_DEFAULTS)
        model.commitSound(name, sound)
        model.editKey = name
        model.original = structuredClone(sound)
        model.draft = structuredClone(sound)
        model.hydrate()
        model.notify()
        showToast(`Preset "${name}" created`, 'success')
    }

    deletePreset() {
        const model = this.#model
        if (!model.editKey) return
        model.flush()
        const keys = this.getGeneratedSoundKeys()
        if (keys.length <= 1) {
            showToast('Cannot delete the last preset', 'warning')
            return
        }
        const deletedName = model.editKey
        const idx = keys.indexOf(model.editKey)
        model.deleteSound(model.editKey)
        const nextIdx = idx < keys.length - 1 ? idx : idx - 1
        const nextKey = keys[nextIdx] === deletedName ? keys[(idx + 1) % keys.length] : keys[nextIdx]
        model.clearSession()
        model.loadPreset(nextKey)
        showToast(`Deleted "${deletedName}"`, 'success')
    }

    renamePreset() {
        const model = this.#model
        if (!model.editKey) return
        const newName = prompt('Rename preset:', model.editKey)
        if (!newName || newName === model.editKey) return
        model.commitSound(newName, model.draft)
        model.deleteSound(model.editKey)
        model.editKey = newName
        model.original = structuredClone(model.draft)
        model.notify()
    }

    randomizePreset() {
        const model = this.#model
        if (!model.draft) return
        const randomize = (obj, prefix = '') => {
            for (const [key, val] of Object.entries(obj)) {
                const path = prefix ? `${prefix}.${key}` : key
                if (val != null && typeof val === 'object' && !Array.isArray(val)) {
                    randomize(val, path)
                } else if (typeof val === 'number') {
                    const meta = SYNTH_PARAM_META[path]
                    obj[key] = meta ? meta.min + Math.random() * (meta.max - meta.min) : Math.random()
                }
            }
        }
        randomize(model.draft)
        model.hydrate()
        model.notify()
    }
}
