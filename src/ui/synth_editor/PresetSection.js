// src/ui/synth_editor/PresetSection.js
// Preset CRUD operations and footer rendering.

import { escapeHtml, renderOptions } from '../components/panel_helpers.js'
import { showToast } from '../toast.js'
import { SYNTH_GROUP_DEFAULTS, SYNTH_PARAM_META } from './constants.js'
import { cacheGeneratedSounds } from '../../cache/idb_cache.js'

export default class PresetSection {
    /** @param {import('./synth_editor.js').default} co */
    constructor(co) { this._co = co }

    /** @returns {string[]} sorted keys of loaded synth presets. */
    getGeneratedSoundKeys() {
        const sr = this._co._soundRegistry
        return Object.keys(sr.generatedSounds ?? {}).sort((a, b) => a.localeCompare(b))
    }

    /** Loads generated sounds from disk if not already loaded. */
    async ensureGeneratedSoundsLoaded() {
        const co = this._co
        if (co._loadFailed) return
        if (this.getGeneratedSoundKeys().length > 0) return
        if (co._loadPromise) return co._loadPromise

        co._loading = true
        co._loadPromise = (async () => {
            try {
                await co._serviceRegistry.resourcesLoader?.loadGeneratedSounds(
                    (await import('../../loader/resources_loader.js')).default.GENERATED_SOUNDS_URL
                )
                co._serviceRegistry.audioEngine?.updateGeneratedSounds(co._soundRegistry.generatedSounds)
            } catch (error) {
                co._loadFailed = true
            } finally {
                co._loading = false
                co._loadPromise = null
            }
        })()
        return co._loadPromise
    }

    /**
     * Loads a preset into the draft.
     * @returns {boolean} whether the preset was loaded
     */
    loadPreset(key) {
        const co = this._co
        const sound = co._soundRegistry.generatedSounds?.[key]
        if (!sound) return false
        co._editKey = key
        co._original = structuredClone(sound)
        co._draft = structuredClone(sound)
        co._hydrateDraft()
        return true
    }

    /** Commits a sound to the registry and notifies the audio engine. */
    commitSound(key, sound) {
        const co = this._co
        co._soundRegistry.generatedSounds[key] = structuredClone(sound)
        co._serviceRegistry.audioEngine?.updateGeneratedSounds(co._soundRegistry.generatedSounds)
        this._persist()
    }

    _persist() {
        const sr = this._co._soundRegistry
        cacheGeneratedSounds(sr.generatedSounds).catch?.(() => {})
    }

    /** @returns {string} footer HTML with preset selector and action buttons. */
    renderFooter() {
        const co = this._co
        const keys = this.getGeneratedSoundKeys()
        const currentKey = co._editKey ?? ''
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
             <button class="ss-tb-btn" data-action="synth-ok" title="Save">Save</button>
             <button class="ss-tb-btn" data-action="synth-revert" title="Revert to original settings">Revert</button>
         </div>`
    }

    // ─── Preset actions ────────────────────────────────────────────────

    navigatePreset(dir) {
        const co = this._co
        const keys = this.getGeneratedSoundKeys()
        if (keys.length === 0) return
        const idx = keys.indexOf(co._editKey)
        const next = (idx + dir + keys.length) % keys.length
        if (!this.loadPreset(keys[next])) return
        co._renderEditor()
    }

    selectPreset(key) {
        const co = this._co
        if (!key || key === co._editKey) return
        if (!this.loadPreset(key)) return
        co._renderEditor()
    }

    duplicatePreset() {
        const co = this._co
        if (!co._draft || !co._editKey) return
        const newKey = `${co._editKey}_copy`
        this.commitSound(newKey, co._draft)
        co._editKey = newKey
        co._original = structuredClone(co._draft)
        co._renderEditor()
    }

    newPreset() {
        const co = this._co
        const keys = this.getGeneratedSoundKeys()
        let base = 1
        let name = 'new_preset'
        while (keys.includes(name)) {
            name = `new_preset_${base++}`
        }
        const sound = structuredClone(SYNTH_GROUP_DEFAULTS)
        this.commitSound(name, sound)
        co._editKey = name
        co._original = structuredClone(sound)
        co._draft = structuredClone(sound)
        co._hydrateDraft()
        co._renderEditor()
        showToast(`Preset "${name}" created`, 'success')
    }

    deletePreset() {
        const co = this._co
        if (!co._editKey) return
        const keys = this.getGeneratedSoundKeys()
        if (keys.length <= 1) {
            showToast('Cannot delete the last preset', 'warning')
            return
        }
        const deletedName = co._editKey
        const idx = keys.indexOf(co._editKey)
        delete co._soundRegistry.generatedSounds[co._editKey]
        co._serviceRegistry.audioEngine?.updateGeneratedSounds(co._soundRegistry.generatedSounds)
        this._persist()
        const nextIdx = idx < keys.length - 1 ? idx : idx - 1
        const nextKey = keys[nextIdx] === deletedName
            ? keys[(idx + 1) % keys.length]
            : keys[nextIdx]
        co._editKey = null
        co._original = null
        co._draft = null
        this.loadPreset(nextKey)
        co._renderEditor()
        showToast(`Deleted "${deletedName}"`, 'success')
    }

    renamePreset() {
        const co = this._co
        if (!co._editKey) return
        const newName = prompt('Rename preset:', co._editKey)
        if (!newName || newName === co._editKey) return
        this.commitSound(newName, co._draft)
        delete co._soundRegistry.generatedSounds[co._editKey]
        co._serviceRegistry.audioEngine?.updateGeneratedSounds(co._soundRegistry.generatedSounds)
        this._persist()
        co._editKey = newName
        co._original = structuredClone(co._draft)
        co._renderEditor()
    }

    randomizePreset() {
        const co = this._co
        if (!co._draft) return
        const randomize = (obj, prefix = '') => {
            for (const [key, val] of Object.entries(obj)) {
                const path = prefix ? `${prefix}.${key}` : key
                if (val != null && typeof val === 'object' && !Array.isArray(val)) {
                    randomize(val, path)
                } else if (typeof val === 'number') {
                    const meta = SYNTH_PARAM_META[path]
                    obj[key] = meta
                        ? meta.min + Math.random() * (meta.max - meta.min)
                        : Math.random()
                }
            }
        }
        randomize(co._draft)
        co._hydrateDraft()
        co._renderEditor()
    }
}
