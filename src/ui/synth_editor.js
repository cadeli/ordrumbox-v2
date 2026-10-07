// src/ui/synth_editor.js — Coordinator
//
// Thin coordinator that delegates rendering to section modules.
// Dependencies are injected via the constructor (DI) with fallback to
// module-level singletons.
// Knob instances are kept alive between renders via setValue().

import { soundRegistry as _soundRegistrySingleton } from '../state/sound_registry.js'
import { serviceRegistry as _serviceRegistrySingleton } from '../state/service_registry.js'
import { playbackEvents as _playbackEventsSingleton } from '../state/event_bus.js'
import { logger } from '../core/logger.js'
import { syncKnobs } from './components/sync_helpers.js'
import { reportUserError, showToast } from '../core/notify.js'
import { bindTabToggles, downloadJson } from './components/ui_utils.js'
import { clamp } from '../core/numbers.js'

import GroupsSection from './synth_editor/groups_section.js'
import WaveformSection from './synth_editor/waveform_section.js'
import PresetSection from './synth_editor/preset_section.js'
import SynthPresetModel from './synth_editor/synth_preset_model.js'
import { SYNTH_PARAM_META, CARD_BYPASS_FLAGS } from './synth_editor/synth_editor_constants.js'
import { EVENTS } from '../core/events.js'

export { LFO_TARGET_SCALE } from './synth_editor/synth_editor_constants.js'

const VCO_ENABLE_KEYS = new Set(['octave', 'detune', 'wave'])
const LFO_ENABLE_KEYS = new Set(['wave', 'freq', 'depth', 'sync'])
const MOD_ENV_ENABLE_KEYS = new Set(['attack', 'decay', 'sustain', 'release'])

/**
 * SynthEditor — soft-synth parameter editor sub-panel.
 * Renders rotary knobs, wave icon selectors, and ADSR waveform preview.
 */
export default class SynthEditor {
    #soundRegistry
    #serviceRegistry
    #playbackEvents
    #model
    #scrollEl
    #delegationBound
    #knobMap
    #groups
    #waveform
    #presets
    #lfoRafId

    constructor(host, deps = {}) {
        this.host = host
        this.panel = null

        this.#soundRegistry = deps.soundRegistry ?? _soundRegistrySingleton
        this.#serviceRegistry = deps.serviceRegistry ?? _serviceRegistrySingleton
        this.#playbackEvents = deps.playbackEvents ?? _playbackEventsSingleton

        this.#delegationBound = false

        this.#model = new SynthPresetModel({
            soundRegistry: this.#soundRegistry,
            serviceRegistry: this.#serviceRegistry,
        })
        this.#model.subscribe(() => this.#renderEditor())

        /** @type {Map<string, import('./components/or_knob.js').OrKnob>} knob instances kept alive between renders */
        this.#knobMap = new Map()

        this.#groups = new GroupsSection(this.#model)
        this.#waveform = new WaveformSection(this.#model, { root: () => this.panel })
        this.#presets = new PresetSection(this.#model, {
            soundRegistry: this.#soundRegistry,
            serviceRegistry: this.#serviceRegistry,
        })

        this.#lfoRafId = null
    }

    createDOM() {
        this.panel = document.createElement('div')
        this.panel.id = 'soft-synth-panel'
        this.panel.classList.add('workspace-panel')
        this.panel.style.display = 'none'
        this.#scrollEl = document.createElement('div')
        this.#scrollEl.className = 'ss-scroll'
        this.panel.appendChild(this.#scrollEl)
    }

    dispose() {
        this.panel?.remove()
    }

    /** @returns {string[]} sorted keys of loaded synth presets. */
    getGeneratedSoundKeys() {
        return this.#presets.getGeneratedSoundKeys()
    }

    /** Loads generated sounds from disk if not already loaded. */
    async ensureGeneratedSoundsLoaded() {
        return this.#presets.ensureGeneratedSoundsLoaded()
    }

    /**
     * Shows the panel and loads the current track's synth preset into the editor
     * (the first available preset when the track has none). The only entry
     * point.
     */
    async showPanel() {
        try {
            await this.ensureGeneratedSoundsLoaded()
            this.#showSynthPanel()

            const track = this.host.track
            const key = track?.synthSoundKey
            const generatedSound = key ? this.#soundRegistry.generatedSounds?.[key] : null

            if (key && generatedSound) {
                this.#model.loadPreset(key)
            } else {
                const keys = this.getGeneratedSoundKeys()
                if (keys.length > 0) {
                    this.#model.loadPreset(keys[0])
                } else {
                    this.#scrollEl.innerHTML = `
                    <div class="ss-body ss-body-empty">
                        No synth presets loaded.
                    </div>`
                    this.#bindEvents()
                }
            }
        } catch (e) {
            logger.error('SynthEditor', 'showPanel failed', e)
        }
    }

    /**
     * Closes the synth panel. When an edit session is open it COMMITS the draft
     * and drops the session (invalidate, events, model.clearSession()), so the
     * next showPanel() starts from the stored preset again — hence the name: this
     * is not a visibility toggle.
     */
    closePanelAndCommit() {
        if (this.panel.style.display !== 'flex') return
        if (this.#model.editKey && this.#model.draft) {
            this.#closeEditor(true)
        } else {
            this.#hideSynthPanel()
            if (this.host.track) {
                this.host.sync()
            }
        }
    }

    // ─── Panel visibility ──────────────────────────────────────────────

    #showSynthPanel() {
        this.panel.style.display = 'flex'
        this.#startLfoWatch()
    }

    #hideSynthPanel() {
        this.panel.style.display = 'none'
        this.#stopLfoWatch()
    }

    // ─── Rendering ─────────────────────────────────────────────────────

    /** Renders the full editor: groups, footer, knobs, waveform. */
    #renderEditor() {
        if (!this.#model.draft || !this.#model.editKey) return
        this.#model.hydrateCardBypassed()
        try {
            const knobConfigs = []
            let html = this.#presets.renderFooter()
            html += this.#groups.render(knobConfigs)

            this.#scrollEl.innerHTML = html
            bindTabToggles(this.#scrollEl, () => {
                requestAnimationFrame(() => this.#waveform.draw())
            })
            this.#syncKnobs(knobConfigs)
            this.#updateLfoIndicators()
            this.#bindEvents()
            this.#waveform.draw()
        } catch (e) {
            logger.error('SynthEditor', '#renderEditor failed', e)
        }
    }

    /**
     * Syncs knob instances: reuse existing via setValue(), create new only for new paths,
     * destroy orphaned knobs. Keeps instances alive between renders.
     */
    #syncKnobs(configs) {
        this.#knobMap = syncKnobs({
            container: this.panel,
            configs,
            selector: 'ss-knob-placeholder',
            prev: this.#knobMap,
            paramMeta: SYNTH_PARAM_META,
            onChange: (key, val) => this.#onKnobChange(key, val),
        })
    }

    #onKnobChange(pathStr, value) {
        this.#setValue(pathStr, Number.isNaN(value) ? 0 : value, true)
        this.#updateLfoIndicators()
        this.#waveform.draw()
    }

    /**
     * Sets hasLfo on knobs whose path matches an active LFO target.
     * An LFO is "active" when its target is not 'NOT', depth > 0, and not bypassed.
     */
    #updateLfoIndicators() {
        const draft = this.#model.draft
        if (!draft) return
        const lfo1 = draft.lfo ?? {}
        const lfo2 = draft.lfo2 ?? {}
        const activeTargets = new Set()
        if (lfo1.target && lfo1.target !== 'NOT' && (lfo1.depth ?? 0) > 0 && !draft.bypassLfo1) {
            activeTargets.add(lfo1.target)
        }
        if (lfo2.target && lfo2.target !== 'NOT' && (lfo2.depth ?? 0) > 0 && !draft.bypassLfo2) {
            activeTargets.add(lfo2.target)
        }
        for (const [path, knob] of this.#knobMap) {
            knob.setHasLfo?.(activeTargets.has(path))
        }
    }

    // ── LFO animation (real-time knob display) ───────────────────────

    #startLfoWatch() {
        if (this.#lfoRafId) return
        const tick = () => {
            if (this.panel?.style.display !== 'flex') {
                this.#lfoRafId = null
                return
            }
            try {
                this.#updateLfoKnobs()
                this.#waveform.draw()
            } catch (err) {
                reportUserError('SynthEditor.lfoLoop', 'Synth LFO meters stopped updating', { cause: err })
            }
            this.#lfoRafId = requestAnimationFrame(tick)
        }
        this.#lfoRafId = requestAnimationFrame(tick)
    }

    #stopLfoWatch() {
        if (this.#lfoRafId) {
            cancelAnimationFrame(this.#lfoRafId)
            this.#lfoRafId = null
        }
    }

    /**
     * Computes and applies LFO-modulated values to synth knobs in real time.
     * Mirrors the worklet's #lfoValue() + getLfoWaveformValue() math.
     */
    #updateLfoKnobs() {
        const draft = this.#model.draft
        if (!draft || !this.#knobMap.size) return
        const audioCtx = this.#serviceRegistry.audioCtx
        if (!audioCtx) return
        const now = audioCtx.currentTime

        const lfo1 = draft.bypassLfo1 ? null : draft.lfo
        const lfo2 = draft.bypassLfo2 ? null : draft.lfo2

        for (const [path, knob] of this.#knobMap) {
            let totalMod = 0
            if (lfo1?.target === path && (lfo1.depth ?? 0) > 0) {
                totalMod += this.#model.computeLfoMod(lfo1, now)
            }
            if (lfo2?.target === path && (lfo2.depth ?? 0) > 0) {
                totalMod += this.#model.computeLfoMod(lfo2, now)
            }
            if (totalMod !== 0) {
                const base = this.#getValue(path) ?? 0
                const meta = SYNTH_PARAM_META[path]
                const min = meta?.min ?? -Infinity
                const max = meta?.max ?? Infinity
                knob.setValue(clamp(base + totalMod, min, max))
            }
        }
    }

    // ─── Event handling ────────────────────────────────────────────────

    #bindEvents() {
        if (this.#delegationBound) return

        this.panel.addEventListener('click', (e) => this.#handleClick(e))
        this.panel.addEventListener('change', (e) => {
            const target = /** @type {HTMLInputElement} */ (e.target)
            if (target.tagName === 'SELECT' && target.dataset.synthPath) {
                this.#setValue(target.dataset.synthPath, target.value)
                this.#updateLfoIndicators()
                this.#waveform.draw()
            }
            if (target.tagName === 'SELECT' && target.dataset.action === 'synth-preset') {
                this.#presets.selectPreset(target.value)
            }
        })

        this.#delegationBound = true
    }

    #handleClick(e) {
        try {
            const { target } = e
            if (this.#handlePowerBtn(target, e)) return
            if (this.#handleWaveTab(target)) return
            if (this.#handleBooleanBtn(target)) return
            if (this.#handleIconBtn(target)) return
            if (this.#handleAction(target)) return
            this.#handlePresetNav(target)
        } catch (err) {
            logger.warn('SynthEditor', '#handleClick failed', err)
        }
    }

    #handlePowerBtn(target, e) {
        const powerBtn = target.closest('[data-power-card]')
        if (!powerBtn) return false
        e.stopPropagation()
        const groupName = powerBtn.dataset.powerCard
        this.#setCardBypass(groupName, !this.#model.cardBypassed[groupName])

        const draftGroup = this.#model.draft?.[groupName]
        if (groupName.startsWith('vco') && draftGroup && typeof draftGroup === 'object') {
            if (this.#model.cardBypassed[groupName]) {
                draftGroup._savedGain = draftGroup.gain ?? 0
                draftGroup.gain = 0
            } else {
                draftGroup.gain = draftGroup._savedGain ?? (groupName === 'vco1' ? 1 : 0)
                delete draftGroup._savedGain
            }
        } else {
            const flag = CARD_BYPASS_FLAGS[groupName]
            if (flag) {
                this.#model.draft[flag] = this.#model.cardBypassed[groupName]
                if (groupName === 'envelope' && !this.#model.cardBypassed[groupName]) {
                    this.#model.draft._resetEnv = true
                }
            }
        }

        this.#waveform.draw()
        this.#updateLfoIndicators()
        this.#model.commit()
        return true
    }

    #handleWaveTab(target) {
        const waveTab = target.closest('[data-wave-tab]')
        if (!waveTab) return false
        this.panel.querySelectorAll('[data-wave-tab]').forEach((t) => t.classList.remove('active'))
        waveTab.classList.add('active')
        this.#waveform.setWaveTab(waveTab.dataset.waveTab)
        return true
    }

    #handleBooleanBtn(target) {
        if (target.dataset.synthType !== 'boolean') return false
        const next = !this.#getValue(target.dataset.synthPath)
        this.#setValue(target.dataset.synthPath, next)
        target.textContent = next ? 'ON' : 'OFF'
        target.classList.toggle('active', next)
        this.#updateLfoIndicators()
        this.#waveform.draw()
        return true
    }

    #handleIconBtn(target) {
        const waveIcon = target.closest('.ss-wave-icon, .ss-ft-icon, .ss-fm-icon')
        if (!waveIcon) return false
        const path = waveIcon.dataset.synthPath
        const val = waveIcon.dataset.waveVal
        this.#setValue(path, val)
        const scope = waveIcon.closest('.ne-row') ?? waveIcon.closest('.ss-group')
        scope
            ?.querySelectorAll('.ss-wave-icon, .ss-ft-icon, .ss-fm-icon')
            .forEach((b) => b.classList.remove('selected'))
        waveIcon.classList.add('selected')
        this.#waveform.draw()
        return true
    }

    #handleAction(target) {
        const action = target.dataset.action
        if (action === 'synth-revert') this.#revertPreset()
        else if (action === 'synth-duplicate') this.#presets.duplicatePreset()
        else if (action === 'synth-rename') this.#presets.renamePreset()
        else if (action === 'synth-randomize') this.#presets.randomizePreset()
        else if (action === 'synth-new') this.#presets.newPreset()
        else if (action === 'synth-delete') this.#presets.deletePreset()
        else if (action === 'synth-export') this.#exportSynth()
        else if (action === 'synth-import') this.#importSynth()
        else return false
        return true
    }

    #handlePresetNav(target) {
        const nav = target.closest('[data-preset-nav]')
        if (!nav) return
        const dir = parseInt(nav.dataset.presetNav, 10)
        // Without this guard a malformed dataset value reaches navigatePreset
        // as NaN → keys[NaN] is undefined → loadPreset(undefined) fails
        // silently and the ◀/▶ buttons stop working.
        if (!Number.isInteger(dir) || dir === 0) return
        this.#presets.navigatePreset(dir)
    }

    // ─── Value access ──────────────────────────────────────────────────

    /** @param {string} pathString dot-separated path */
    #getValue(pathString) {
        return pathString.split('.').reduce((obj, key) => obj?.[key], this.#model.draft)
    }

    /** Sets a nested draft value and triggers preview (deferred for knob drags). */
    #setValue(pathString, value, deferPreview = false) {
        try {
            const path = pathString.split('.')
            let target = this.#model.draft
            for (let i = 0; i < path.length - 1; i++) {
                target = target?.[path[i]]
                if (target === undefined || target === null) return
            }
            const enabled = this.#implicitEnable(pathString)
            target[path.at(-1)] = value
            if (enabled.length) this.#refreshSynthControls(enabled)
            this.#model.commit(deferPreview)
        } catch (e) {
            logger.warn('SynthEditor', '#setValue failed', e)
        }
    }

    /**
     * Implicitly enables a "dead by default" group when one of its controls is touched
     * (e.g. picking an LFO wave while lfo.target is 'NOT'). Presets are never modified.
     * @param {string} pathString dot-separated path being edited
     * @returns {string[]} draft paths whose values changed (for control refresh)
     */
    #implicitEnable(pathString) {
        const d = this.#model.draft
        if (!d) return []
        const dot = pathString.indexOf('.')
        if (dot < 1) return []
        const group = pathString.slice(0, dot)
        const key = pathString.slice(dot + 1)
        const changed = []

        if ((group === 'vco2' || group === 'vco3') && VCO_ENABLE_KEYS.has(key) && (d[group]?.gain ?? 0) === 0) {
            d[group].gain = 0.5
            delete d[group]._savedGain
            this.#setCardBypass(group, false)
            changed.push(`${group}.gain`)
        } else if (group === 'fm' && key === 'algo' && (d.fm?.amount ?? 0) === 0) {
            d.fm.amount = 0.3
            d.bypassFm = false
            this.#setCardBypass('fm', false)
            changed.push('fm.amount')
        } else if (group === 'noise' && key.startsWith('filter') && (d.noise?.mix ?? 0) === 0) {
            d.noise.mix = 0.15
            d.bypassNoise = false
            this.#setCardBypass('noise', false)
            changed.push('noise.mix')
        } else if ((group === 'lfo' || group === 'lfo2') && LFO_ENABLE_KEYS.has(key) && d[group]?.target === 'NOT') {
            d[group].target = 'filter.freq'
            d[group === 'lfo' ? 'bypassLfo1' : 'bypassLfo2'] = false
            if (key !== 'depth' && (d[group].depth ?? 0) === 0) {
                d[group].depth = 0.5
                changed.push(`${group}.depth`)
            }
            this.#setCardBypass(group, false)
            changed.push(`${group}.target`)
        } else if (group === 'modEnvelope' && MOD_ENV_ENABLE_KEYS.has(key) && d.modEnvelope?.target === 'off') {
            d.modEnvelope.target = 'filter'
            d.bypassModEnv = false
            this.#setCardBypass('modEnvelope', false)
            changed.push('modEnvelope.target')
        }
        return changed
    }

    /** Updates knob instances and selects for paths changed by implicit enable (no re-trigger). */
    #refreshSynthControls(paths) {
        for (const p of paths) {
            const value = this.#getValue(p)
            const knob = this.#knobMap.get(p)
            if (knob) knob.setValue(value)
            const select = /** @type {HTMLSelectElement} */ (
                this.panel?.querySelector(`select[data-synth-path="${p}"]`)
            )
            if (select) select.value = String(value)
        }
    }

    /** Applies card bypass state to the model and the card/power-button DOM. */
    #setCardBypass(groupName, bypassed) {
        this.#model.setCardBypassed(groupName, bypassed)
        const card = this.panel?.querySelector(`[data-ss-card="${groupName}"]`)
        card?.classList.toggle('bypassed', bypassed)
        const btn = this.panel?.querySelector(`[data-power-card="${groupName}"]`)
        btn?.classList.toggle('active', !bypassed)
    }

    /** Commits a pending frame-coalesced preview synchronously (before preset switch/close). */
    flushPreview() {
        this.#model.flush()
    }

    // ─── Close / save / revert ─────────────────────────────────────────

    #revertPreset() {
        if (!this.#model.editKey || !this.#model.original) return
        try {
            this.#model.revert()
            this.#serviceRegistry.audioEngine?.invalidateCache?.()
            this.#playbackEvents.batch(() => {
                this.#playbackEvents.emit(EVENTS.TRACK_PARAM_CHANGE, this.host.track)
                this.#playbackEvents.emit(EVENTS.PATTERN_CHANGE, [this.host.track])
            })
        } catch (e) {
            logger.error('SynthEditor', '#revertPreset failed', e)
        }
    }

    // ─── Value access ──────────────────────────────────────────────────

    #exportSynth() {
        try {
            const sounds = this.#soundRegistry.generatedSounds
            if (!sounds || Object.keys(sounds).length === 0) {
                showToast('No synth sounds loaded', 'info')
                return
            }
            downloadJson(sounds, 'ordrumbox-synth-sounds.json')
            showToast('Synth sounds exported', 'success')
        } catch (e) {
            logger.error('SynthEditor', '#exportSynth failed', e)
            showToast('Export failed', 'error')
        }
    }

    #importSynth() {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = '.json'
        input.addEventListener('change', async () => {
            const file = input.files?.[0]
            if (!file) return
            try {
                const text = await file.text()
                const data = JSON.parse(text)
                if (!data || typeof data !== 'object' || Array.isArray(data)) {
                    showToast('Invalid synth file: expected a JSON object', 'error')
                    return
                }
                const sr = this.#soundRegistry
                let count = 0
                for (const [key, val] of Object.entries(data)) {
                    if (val && typeof val === 'object') {
                        sr.generatedSounds[key] = val
                        count++
                    }
                }
                this.#serviceRegistry.audioEngine?.setGeneratedSounds(sr.generatedSounds)
                this.#model.persist()
                this.#presets.ensureGeneratedSoundsLoaded()
                this.#renderEditor()
                showToast(`Imported ${count} synth sound(s)`, 'success')
            } catch (err) {
                showToast('Import failed: ' + err.message, 'error')
            }
        })
        input.click()
    }

    #closeEditor(shouldSave) {
        try {
            const model = this.#model
            if (shouldSave && model.editKey && model.draft) {
                model.commit()
                this.#serviceRegistry.audioEngine?.invalidateCache?.()
                this.#playbackEvents.batch(() => {
                    this.#playbackEvents.emit(EVENTS.TRACK_PARAM_CHANGE, this.host.track)
                    this.#playbackEvents.emit(EVENTS.PATTERN_CHANGE, [this.host.track])
                })
            } else if (!shouldSave && model.editKey && model.original) {
                model.commitSound(model.editKey, model.original)
            }

            this.#hideSynthPanel()
            if (this.host.track) {
                this.host.sync()
            }
        } catch (e) {
            logger.error('SynthEditor', '#closeEditor failed', e)
        } finally {
            this.#model.clearSession()
        }
    }

    reset() {
        this.panel.style.display = 'none'
        this.#stopLfoWatch()
        this.#model.clearSession()
        this.#presets.resetLoadState()
        this.#waveform.resetTab()
    }

    // ─── Public API ───────────────────────────────────────────────────────

    /** @returns {SynthPresetModel} edit-session state model */
    get model() {
        return this.#model
    }

    /** @returns {import('./components/or_knob.js').OrKnob[]} current knob instances */
    get knobs() {
        return [...this.#knobMap.values()]
    }

    /** Render the editor with current draft. */
    renderEditor() {
        this.#renderEditor()
    }

    /** Close the editor panel. */
    closeEditor(shouldSave) {
        this.#closeEditor(shouldSave)
    }

    /** @returns {PresetSection} preset section */
    get presets() {
        return this.#presets
    }

    updateLfoIndicators() {
        this.#updateLfoIndicators()
    }
    updateLfoKnobs() {
        this.#updateLfoKnobs()
    }
    startLfoWatch() {
        this.#startLfoWatch()
    }
    stopLfoWatch() {
        this.#stopLfoWatch()
    }

    get lfoRafId() {
        return this.#lfoRafId
    }
}
