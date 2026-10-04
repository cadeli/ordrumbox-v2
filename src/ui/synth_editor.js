// src/ui/synth_editor.js — Coordinator
//
// Thin coordinator that delegates rendering to section modules.
// Dependencies are injected via the constructor (DI) with fallback to
// module-level singletons.
// Knob instances are kept alive between renders via setValue().

import { soundRegistry as _soundRegistrySingleton } from '../state/sound_registry.js'
import { serviceRegistry as _serviceRegistrySingleton } from '../state/service_registry.js'
import { playbackEvents as _playbackEventsSingleton } from '../state/playback_events.js'
import { logger } from '../core/logger.js'
import { syncKnobs } from './components/sync_helpers.js'
import { reportUserError, showToast } from '../core/notify.js'
import { bindTabToggles, downloadJson } from './components/ui_utils.js'
import { getLfoWaveformValue, syncToHz } from '../audio/math.js'
import Utils from '../core/utils.js'

import GroupsSection from './synth_editor/groups_section.js'
import WaveformSection from './synth_editor/waveform_section.js'
import PresetSection from './synth_editor/preset_section.js'
import { SYNTH_PARAM_META, SYNTH_GROUP_DEFAULTS } from './synth_editor/constants.js'
import { EVENTS } from '../core/events.js'

/**
 * LFO target → scale factor applied to raw waveform value.
 * raw * scale = the modulation amount in the target's display units.
 * Matches the worklet synth_voice_source.js #lfoValue() mapping.
 */
export const LFO_TARGET_SCALE = {
    'vco1.octave': 1,
    'vco1.detune': 100,
    'vco1.gain': 1,
    'vco2.octave': 1,
    'vco2.detune': 100,
    'vco2.gain': 1,
    'vco3.octave': 1,
    'vco3.detune': 100,
    'vco3.gain': 1,
    'filter.freq': 1000,
    'filter.Q': 24,
    'filter.drive': 1,
    'filterEnv.filterEnvelopeAmount': 1,
    masterVolume: 1,
    'noise.mix': 1,
    'noise.filterFreq': 10000,
    'noise.filterQ': 24,
    'fm.amount': 1,
    'fm.algo': 1,
    subGain: 1,
    pitchPunch: 1,
    'envelope.attack': 0.25,
    'envelope.decay': 0.5,
    'envelope.sustain': 0.5,
    'envelope.release': 0.25,
    'modEnvelope.attack': 0.25,
    'modEnvelope.decay': 0.5,
    'modEnvelope.sustain': 0.5,
    'modEnvelope.release': 0.25,
}

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
    #editKey
    #original
    #draft
    #loading
    #loadFailed
    #loadPromise
    #cardBypassed
    #waveTab
    #scrollEl
    #delegationBound
    #knobMap
    #groups
    #waveform
    #presets
    #lfoRafId
    #commitRafId

    constructor(host, deps = {}) {
        this.host = host
        this.panel = null

        this.#soundRegistry = deps.soundRegistry ?? _soundRegistrySingleton
        this.#serviceRegistry = deps.serviceRegistry ?? _serviceRegistrySingleton
        this.#playbackEvents = deps.playbackEvents ?? _playbackEventsSingleton

        this.#editKey = null
        this.#original = null
        this.#draft = null
        this.#loading = false
        this.#loadFailed = false
        this.#loadPromise = null
        this.#delegationBound = false
        this.#cardBypassed = {}
        this.#waveTab = 'wave'

        /** @type {Map<string, import('./components/or_knob.js').OrKnob>} knob instances kept alive between renders */
        this.#knobMap = new Map()

        this.#groups = new GroupsSection(this)
        this.#waveform = new WaveformSection(this)
        this.#presets = new PresetSection(this)

        this.#lfoRafId = null
        this.#commitRafId = null
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
     * (the first available preset when the track has none). This is the only
     * entry point: an openEditor() twin used to exist here, identical minus
     * that fallback, and no src file called it.
     */
    async showPanel() {
        try {
            await this.ensureGeneratedSoundsLoaded()
            this.#showSynthPanel()

            const track = this.host.track
            const key = track?.synthSoundKey
            const generatedSound = key ? this.#soundRegistry.generatedSounds?.[key] : null

            if (key && generatedSound) {
                this.#presets.loadPreset(key)
                this.#renderEditor()
            } else {
                const keys = this.getGeneratedSoundKeys()
                if (keys.length > 0) {
                    this.#presets.loadPreset(keys[0])
                    this.#renderEditor()
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
     * and drops the session (invalidate, events, #editKey/#draft = null), so the
     * next showPanel() starts from the stored preset again — hence the name: this
     * is not a visibility toggle.
     */
    closePanelAndCommit() {
        if (this.panel.style.display !== 'flex') return
        if (this.#editKey && this.#draft) {
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
        if (!this.#draft || !this.#editKey) return
        this.#hydrateCardBypass()
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
        if (!this.#draft) return
        const lfo1 = this.#draft.lfo ?? {}
        const lfo2 = this.#draft.lfo2 ?? {}
        const activeTargets = new Set()
        if (lfo1.target && lfo1.target !== 'NOT' && (lfo1.depth ?? 0) > 0 && !this.#draft.bypassLfo1) {
            activeTargets.add(lfo1.target)
        }
        if (lfo2.target && lfo2.target !== 'NOT' && (lfo2.depth ?? 0) > 0 && !this.#draft.bypassLfo2) {
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
        if (!this.#draft || !this.#knobMap.size) return
        const audioCtx = this.#serviceRegistry.audioCtx
        if (!audioCtx) return
        const now = audioCtx.currentTime

        const lfo1 = this.#draft.bypassLfo1 ? null : this.#draft.lfo
        const lfo2 = this.#draft.bypassLfo2 ? null : this.#draft.lfo2

        for (const [path, knob] of this.#knobMap) {
            let totalMod = 0
            if (lfo1?.target === path && (lfo1.depth ?? 0) > 0) {
                totalMod += this.#computeSynthLfoMod(lfo1, now)
            }
            if (lfo2?.target === path && (lfo2.depth ?? 0) > 0) {
                totalMod += this.#computeSynthLfoMod(lfo2, now)
            }
            if (totalMod !== 0) {
                const base = this.#getValue(path) ?? 0
                const meta = SYNTH_PARAM_META[path]
                const min = meta?.min ?? -Infinity
                const max = meta?.max ?? Infinity
                knob.setValue(Utils.clamp(base + totalMod, min, max))
            }
        }
    }

    /**
     * Computes the LFO modulation amount for a synth LFO config.
     * @param {any} lfo  LFO config { target, wave, freq, depth, sync }
     * @param {number} audioTime  AudioContext.currentTime
     * @returns {number} modulation amount in the target's display units
     */
    #computeSynthLfoMod(lfo, audioTime) {
        const target = lfo.target
        const scale = LFO_TARGET_SCALE[target]
        if (!scale) return 0

        // Same frequency resolution as WorkletSynthVoice (tempo sync wins over freq)
        const freq = syncToHz(lfo.sync, this.#serviceRegistry.transport?.bpm) ?? lfo.freq ?? 0
        const depth = lfo.depth ?? 0
        if (freq <= 0 || depth <= 0) return 0

        const waveName = lfo.wave ?? 'sine'
        const waveIdx = Utils.waveList.indexOf(waveName)
        // Not wrapped: getLfoWaveformValue() wraps internally and S&H needs the cycle index.
        const phase = audioTime * freq
        const raw = getLfoWaveformValue(phase, waveIdx >= 0 ? waveIdx : 0)

        return raw * depth * scale
    }

    // ─── Draft hydration ───────────────────────────────────────────────

    /** Fills missing draft fields with defaults. */
    #hydrateDraft() {
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
            logger.warn('SynthEditor', '#hydrateDraft failed', e)
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
        this.#setCardBypass(groupName, !this.#cardBypassed[groupName])

        const draftGroup = this.#draft?.[groupName]
        if (groupName.startsWith('vco') && draftGroup && typeof draftGroup === 'object') {
            if (this.#cardBypassed[groupName]) {
                draftGroup._savedGain = draftGroup.gain ?? 0
                draftGroup.gain = 0
            } else {
                draftGroup.gain = draftGroup._savedGain ?? (groupName === 'vco1' ? 1 : 0)
                delete draftGroup._savedGain
            }
        } else {
            const flagMap = {
                noise: 'bypassNoise',
                filter: 'bypassFilter',
                filterEnv: 'bypassFilterEnv',
                envelope: 'bypassEnv',
                lfo: 'bypassLfo1',
                lfo2: 'bypassLfo2',
                fm: 'bypassFm',
                modEnvelope: 'bypassModEnv',
            }
            const flag = flagMap[groupName]
            if (flag) {
                this.#draft[flag] = this.#cardBypassed[groupName]
                if (groupName === 'envelope' && !this.#cardBypassed[groupName]) {
                    this.#draft._resetEnv = true
                }
            }
        }

        this.#waveform.draw()
        this.#updateLfoIndicators()
        this.#commitDraft()
        return true
    }

    #handleWaveTab(target) {
        const waveTab = target.closest('[data-wave-tab]')
        if (!waveTab) return false
        this.panel.querySelectorAll('[data-wave-tab]').forEach((t) => t.classList.remove('active'))
        waveTab.classList.add('active')
        this.#waveTab = waveTab.dataset.waveTab
        this.#waveform.draw()
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
        return pathString.split('.').reduce((obj, key) => obj?.[key], this.#draft)
    }

    /** Sets a nested draft value and triggers preview (deferred for knob drags). */
    #setValue(pathString, value, deferPreview = false) {
        try {
            const path = pathString.split('.')
            let target = this.#draft
            for (let i = 0; i < path.length - 1; i++) {
                target = target?.[path[i]]
                if (target === undefined || target === null) return
            }
            const enabled = this.#implicitEnable(pathString)
            target[path.at(-1)] = value
            if (enabled.length) this.#refreshSynthControls(enabled)
            this.#commitDraft(deferPreview)
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
        const d = this.#draft
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

    /** Derives #cardBypassed from the draft so bypassed cards render correctly on preset load. */
    #hydrateCardBypass() {
        const d = this.#draft
        if (!d) return
        for (const vco of ['vco1', 'vco2', 'vco3']) {
            this.#cardBypassed[vco] = d[vco]?.gain === 0
        }
        const flagMap = {
            noise: 'bypassNoise',
            filter: 'bypassFilter',
            filterEnv: 'bypassFilterEnv',
            envelope: 'bypassEnv',
            lfo: 'bypassLfo1',
            lfo2: 'bypassLfo2',
            fm: 'bypassFm',
            modEnvelope: 'bypassModEnv',
        }
        for (const [group, flag] of Object.entries(flagMap)) {
            this.#cardBypassed[group] = Boolean(d[flag])
        }
    }

    /** Applies card bypass state to the model and the card/power-button DOM. */
    #setCardBypass(groupName, bypassed) {
        this.#cardBypassed[groupName] = bypassed
        const card = this.panel?.querySelector(`[data-ss-card="${groupName}"]`)
        card?.classList.toggle('bypassed', bypassed)
        const btn = this.panel?.querySelector(`[data-power-card="${groupName}"]`)
        btn?.classList.toggle('active', !bypassed)
    }

    /**
     * Commits the live-edited draft to the sound registry: immediately for
     * clicks/selections, coalesced on the next animation frame for knob drags
     * (a drag emits one change per mousemove — one commit per frame instead).
     */
    #commitDraft(defer = false) {
        if (!this.#editKey || !this.#draft) return
        if (!defer) {
            this.#cancelCommit()
            this.#presets.commitSound(this.#editKey, this.#draft)
            return
        }
        if (this.#commitRafId) return
        this.#commitRafId = requestAnimationFrame(() => {
            this.#commitRafId = null
            if (this.#editKey && this.#draft) this.#presets.commitSound(this.#editKey, this.#draft)
        })
    }

    #cancelCommit() {
        if (this.#commitRafId) {
            cancelAnimationFrame(this.#commitRafId)
            this.#commitRafId = null
        }
    }

    /** Commits a pending frame-coalesced preview synchronously (before preset switch/close). */
    flushPreview() {
        if (!this.#commitRafId) return
        this.#cancelCommit()
        if (this.#editKey && this.#draft) this.#presets.commitSound(this.#editKey, this.#draft)
    }

    // ─── Close / save / revert ─────────────────────────────────────────

    #revertPreset() {
        if (!this.#editKey || !this.#original) return
        try {
            this.#cancelCommit()
            this.#presets.commitSound(this.#editKey, this.#original)
            this.#draft = structuredClone(this.#original)
            this.#renderEditor()
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
                this.#presets.persist()
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
            this.#cancelCommit()
            if (shouldSave && this.#editKey && this.#draft) {
                this.#presets.commitSound(this.#editKey, this.#draft)
                this.#serviceRegistry.audioEngine?.invalidateCache?.()
                this.#playbackEvents.batch(() => {
                    this.#playbackEvents.emit(EVENTS.TRACK_PARAM_CHANGE, this.host.track)
                    this.#playbackEvents.emit(EVENTS.PATTERN_CHANGE, [this.host.track])
                })
            } else if (!shouldSave && this.#editKey && this.#original) {
                this.#presets.commitSound(this.#editKey, this.#original)
            }

            this.#hideSynthPanel()
            if (this.host.track) {
                this.host.sync()
            }
        } catch (e) {
            logger.error('SynthEditor', '#closeEditor failed', e)
        } finally {
            this.#editKey = null
            this.#original = null
            this.#draft = null
        }
    }

    reset() {
        this.panel.style.display = 'none'
        this.#stopLfoWatch()
        this.#cancelCommit()
        this.#editKey = null
        this.#original = null
        this.#draft = null
        this.#loading = false
        this.#loadFailed = false
        this.#cardBypassed = {}
        this.#waveTab = 'wave'
    }

    // ─── Utilities ─────────────────────────────────────────────────────

    /** @returns {boolean} true if value is a plain object (not array, not null). */
    #isPlainObject(val) {
        return val != null && typeof val === 'object' && !Array.isArray(val)
    }

    // ─── Public API ───────────────────────────────────────────────────────
    /** @returns {Object|null} current draft state */
    get draft() {
        return this.#draft
    }
    set draft(v) {
        this.#draft = v
    }

    /** @returns {object} sound registry */
    get soundRegistry() {
        return this.#soundRegistry
    }
    set soundRegistry(v) {
        this.#soundRegistry = v
    }

    /** @returns {object} service registry */
    get serviceRegistry() {
        return this.#serviceRegistry
    }
    set serviceRegistry(v) {
        this.#serviceRegistry = v
    }

    /** @returns {object} playback events */
    get playbackEvents() {
        return this.#playbackEvents
    }

    /** @returns {string|null} current edit key */
    get editKey() {
        return this.#editKey
    }
    set editKey(k) {
        this.#editKey = k
    }

    /** @returns {Object|null} original draft (before edits) */
    get original() {
        return this.#original
    }
    set original(v) {
        this.#original = v
    }

    /** @returns {boolean} true if loading */
    get loading() {
        return this.#loading
    }
    set loading(v) {
        this.#loading = v
    }

    /** @returns {boolean} true if load failed */
    get loadFailed() {
        return this.#loadFailed
    }
    set loadFailed(v) {
        this.#loadFailed = v
    }

    /** @returns {Promise|null} load promise */
    get loadPromise() {
        return this.#loadPromise
    }
    set loadPromise(v) {
        this.#loadPromise = v
    }

    /** @returns {string} current wave tab ('wave' or 'custom') */
    get waveTab() {
        return this.#waveTab
    }

    /** @returns {Object} card bypassed state { [groupName]: boolean } */
    get cardBypassed() {
        return this.#cardBypassed
    }

    /** @returns {import('./components/or_knob.js').OrKnob[]} current knob instances */
    get knobs() {
        return [...this.#knobMap.values()]
    }

    /** Render the editor with current draft. */
    renderEditor() {
        this.#renderEditor()
    }

    /** Hydrate draft from a sound object. */
    hydrateDraft() {
        this.#hydrateDraft()
    }

    /** Compute LFO modulation value. */
    computeSynthLfoMod(lfo, audioTime) {
        return this.#computeSynthLfoMod(lfo, audioTime)
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
    showSynthPanel() {
        this.#showSynthPanel()
    }
    hideSynthPanel() {
        this.#hideSynthPanel()
    }

    get lfoRafId() {
        return this.#lfoRafId
    }
}
