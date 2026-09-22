// src/ui/synth_editor/PresetSection.js
// Preset CRUD operations and footer rendering.

import { escapeHtml, renderOptions } from '../components/panel_helpers.js'
import { showToast } from '../toast.js'
import { SYNTH_GROUP_DEFAULTS, SYNTH_PARAM_META } from './constants.js'
import { cacheGeneratedSounds } from '../../cache/idb_cache.js'

export default class PresetSection {
    /** @param {import('./synth_editor.js').default} editor */
    constructor(editor) { this._editor = editor }

    /** @returns {string[]} sorted keys of loaded synth presets. */
    getGeneratedSoundKeys() {
        const sr = this._editor.soundRegistry
        return Object.keys(sr.generatedSounds ?? {}).sort((a, b) => a.localeCompare(b))
    }

    /** Loads generated sounds from disk if not already loaded. */
    async ensureGeneratedSoundsLoaded() {
        const editor = this._editor
        if (editor.loadFailed) return
        if (this.getGeneratedSoundKeys().length > 0) return
        if (editor.loadPromise) return editor.loadPromise

        editor.loading = true
        editor.loadPromise = (async () => {
            try {
                await editor.serviceRegistry.resourcesLoader?.loadGeneratedSounds(
                    (await import('../../loader/resources_loader.js')).default.GENERATED_SOUNDS_URL
                )
                editor.serviceRegistry.audioEngine?.updateGeneratedSounds(editor.soundRegistry.generatedSounds)
            } catch (error) {
                editor.loadFailed = true
            } finally {
                editor.loading = false
                editor.loadPromise = null
            }
        })()
        return editor.loadPromise
    }

    /**
     * Loads a preset into the draft.
     * @returns {boolean} whether the preset was loaded
     */
    loadPreset(key) {
        const editor = this._editor
        const sound = editor.soundRegistry.generatedSounds?.[key]
        if (!sound) return false
        editor.editKey = key
        editor.original = structuredClone(sound)
        editor.draft = structuredClone(sound)
        editor.hydrateDraft()
        return true
    }

    /** Commits a sound to the registry and notifies the audio engine. */
    commitSound(key, sound) {
        const editor = this._editor
        editor.soundRegistry.generatedSounds[key] = structuredClone(sound)
        editor.serviceRegistry.audioEngine?.updateGeneratedSounds(editor.soundRegistry.generatedSounds)
        this._persist()
    }

    _persist() {
        const sr = this._editor.soundRegistry
        cacheGeneratedSounds(sr.generatedSounds).catch?.(() => {})
    }

    /** @returns {string} footer HTML with preset selector and action buttons. */
    renderFooter() {
        const editor = this._editor
        const keys = this.getGeneratedSoundKeys()
        const currentKey = editor.editKey ?? ''
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
        const editor = this._editor
        const keys = this.getGeneratedSoundKeys()
        if (keys.length === 0) return
        const idx = keys.indexOf(editor.editKey)
        const next = (idx + dir + keys.length) % keys.length
        if (!this.loadPreset(keys[next])) return
        editor.renderEditor()
    }

    selectPreset(key) {
        const editor = this._editor
        if (!key || key === editor.editKey) return
        if (!this.loadPreset(key)) return
        editor.renderEditor()
    }

    duplicatePreset() {
        const editor = this._editor
        if (!editor.draft || !editor.editKey) return
        const newKey = `${editor.editKey}_copy`
        this.commitSound(newKey, editor.draft)
        editor.editKey = newKey
        editor.original = structuredClone(editor.draft)
        editor.renderEditor()
    }

    newPreset() {
        const editor = this._editor
        const keys = this.getGeneratedSoundKeys()
        let base = 1
        let name = 'new_preset'
        while (keys.includes(name)) {
            name = `new_preset_${base++}`
        }
        const sound = structuredClone(SYNTH_GROUP_DEFAULTS)
        this.commitSound(name, sound)
        editor.editKey = name
        editor.original = structuredClone(sound)
        editor.draft = structuredClone(sound)
        editor.hydrateDraft()
        editor.renderEditor()
        showToast(`Preset "${name}" created`, 'success')
    }

    deletePreset() {
        const editor = this._editor
        if (!editor.editKey) return
        const keys = this.getGeneratedSoundKeys()
        if (keys.length <= 1) {
            showToast('Cannot delete the last preset', 'warning')
            return
        }
        const deletedName = editor.editKey
        const idx = keys.indexOf(editor.editKey)
        delete editor.soundRegistry.generatedSounds[editor.editKey]
        editor.serviceRegistry.audioEngine?.updateGeneratedSounds(editor.soundRegistry.generatedSounds)
        this._persist()
        const nextIdx = idx < keys.length - 1 ? idx : idx - 1
        const nextKey = keys[nextIdx] === deletedName
            ? keys[(idx + 1) % keys.length]
            : keys[nextIdx]
        editor.editKey = null
        editor.original = null
        editor.draft = null
        this.loadPreset(nextKey)
        editor.renderEditor()
        showToast(`Deleted "${deletedName}"`, 'success')
    }

    renamePreset() {
        const editor = this._editor
        if (!editor.editKey) return
        const newName = prompt('Rename preset:', editor.editKey)
        if (!newName || newName === editor.editKey) return
        this.commitSound(newName, editor.draft)
        delete editor.soundRegistry.generatedSounds[editor.editKey]
        editor.serviceRegistry.audioEngine?.updateGeneratedSounds(editor.soundRegistry.generatedSounds)
        this._persist()
        editor.editKey = newName
        editor.original = structuredClone(editor.draft)
        editor.renderEditor()
    }

    randomizePreset() {
        const editor = this._editor
        if (!editor.draft) return
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
        randomize(editor.draft)
        editor.hydrateDraft()
        editor.renderEditor()
    }
}
