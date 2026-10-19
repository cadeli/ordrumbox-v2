// src/ui/track_editor/editor_events.js
// Delegated DOM events for the track editor — one listener per event type
// on the panel container (input / focusin / focusout / change / click).
// Owns the in-flight gesture flags (range drag, select open) that gate the
// PATTERN_CHANGE rebind on the coordinator.

export default class EditorEvents {
    #editor
    #fxSection
    #modSection
    /** @type {import('./sound_section.js').default} */
    #sndSection
    #genSection
    #sampleBar
    #isDragging
    #isSelecting

    /**
     * @param {import('../track_editor.js').default} editor
     * @param {object} deps
     * @param {import('./fx_section.js').default} deps.fxSection
     * @param {import('./modulation_section.js').default} deps.modSection
     * @param {import('./sound_section.js').default} deps.sndSection
     * @param {import('./generation_section.js').default} deps.genSection
     * @param {import('./sample_bar.js').default} deps.sampleBar
     */
    constructor(editor, deps) {
        this.#editor = editor
        this.#fxSection = deps.fxSection
        this.#modSection = deps.modSection
        this.#sndSection = deps.sndSection
        this.#genSection = deps.genSection
        this.#sampleBar = deps.sampleBar
        this.#isDragging = false
        this.#isSelecting = false
    }

    /** True while a range drag or a select menu is open. */
    get isGestureActive() {
        return this.#isDragging || this.#isSelecting
    }

    /** Bind the delegated listeners through the panel's lifecycle. */
    bind() {
        const editor = this.#editor
        // LFO sliders are plain <input> elements (not OrSlider instances)
        // and require delegated input handling. Any range-input drag marks
        // the editor as dragging so PATTERN_CHANGE events are ignored until
        // the matching change event resets the flag.
        editor.listen(editor.container, 'input', (e) => {
            const target = /** @type {HTMLElement} */ (e.target)
            // the nested note editor owns its own inputs
            if (target.closest('#ne-container')) return
            if (/** @type {HTMLInputElement} */ (target).type === 'range') this.#isDragging = true
            if (target.dataset.lfoKey) {
                this.#onLfoSlider(/** @type {HTMLInputElement} */ (target))
            }
        })

        editor.listen(editor.container, 'focusin', (e) => {
            if (/** @type {HTMLElement} */ (e.target).tagName === 'SELECT') this.#isSelecting = true
        })
        editor.listen(editor.container, 'focusout', (e) => {
            if (/** @type {HTMLElement} */ (e.target).tagName === 'SELECT') this.#isSelecting = false
        })

        editor.listen(editor.container, 'change', (e) => {
            const target = /** @type {HTMLElement} */ (e.target)
            // the nested note editor owns its own selects (arpScale, arpType…)
            if (target.closest('#ne-container')) return
            if (target.classList.contains('te-load-input')) {
                this.#sampleBar.onFileSelected(e)
                return
            }
            if (/** @type {HTMLInputElement} */ (target).type === 'range') {
                if (this.#isDragging) {
                    this.#isDragging = false
                    this.#isSelecting = false
                    this.#editor.emitTrackChange()
                }
                return
            }
            if (target.tagName === 'SELECT') {
                if (target.dataset.key) this.#onSelect(/** @type {HTMLSelectElement} */ (target))
                else if (target.dataset.lfoTypeSelect) this.#onLfoSelect(/** @type {HTMLSelectElement} */ (target))
                else if (target.dataset.sound) {
                    const soundType = target.dataset.sound
                    const p =
                        soundType === 'instrument'
                            ? this.#sndSection.onInstrumentChange(/** @type {HTMLInputElement} */ (target))
                            : soundType === 'sample'
                              ? this.#sndSection.onSampleChange(/** @type {HTMLInputElement} */ (target))
                              : soundType === 'generated'
                                ? this.#sndSection.onGeneratedChange(/** @type {HTMLInputElement} */ (target))
                                : null
                    if (p)
                        p.finally(() => {
                            this.#isSelecting = false
                        })
                }
            }
        })

        editor.listen(editor.container, 'click', (e) => {
            const target = /** @type {HTMLElement} */ (e.target)
            if (target.dataset.lfoToggleBtn) {
                this.#onLfoToggleBtn(target.dataset.lfoToggleBtn)
                return
            }
            if (target.dataset.lfoSelectBtn) {
                this.#onLfoSelectBtn(target.dataset.lfoSelectBtn)
                return
            }
            if (target.dataset.fxToggleBtn) {
                this.#toggleFxByKey(target.dataset.fxToggleBtn)
                return
            }
            if (target.dataset.fxTab) {
                this.#onFxTab(target.dataset.fxTab)
                return
            }
            const genTabEl = target.closest?.('[data-gen-tab]')
            if (genTabEl) {
                this.#onGenTab(/** @type {HTMLElement} */ (genTabEl).dataset.genTab)
                return
            }
            if (target.dataset.fxIconVal) {
                this.#onFxIcon(target)
                return
            }

            const btn = /** @type {HTMLButtonElement | null} */ (target.closest('button'))
            if (!btn) {
                const row = /** @type {HTMLElement | null} */ (target.closest('.ne-row[data-prop]'))
                if (row && target.tagName !== 'INPUT' && target.tagName !== 'SELECT') {
                    this.#onRowClick(/** @type {HTMLElement} */ (row).dataset.prop)
                }
                return
            }

            if (btn.dataset.key) this.#onToggle(btn)
            else if (btn.dataset.action === 'toggle-auto') this.#sndSection.toggleAuto()
            else if (btn.dataset.action === 'load-sample') this.#sampleBar.openFilePicker()
        })
    }

    /** @param {string} propKey */
    #onRowClick(propKey) {
        this.#editor.selectedPropKey = propKey
        this.#editor.sync()
    }

    /** @param {HTMLSelectElement} sel */
    #onSelect(sel) {
        const track = this.#editor.track
        if (!track) return
        const key = sel.dataset.key
        let val = /** @type {string|number} */ (sel.value)
        if (key === 'delayTime') val = parseFloat(/** @type {string} */ (val))
        this.#editor.serviceRegistry.cmd?.updateTrack(
            track,
            { [key]: val },
            {
                desc: `${key} on ${track.name}`,
            },
        )
        this.#editor.emitTrackChange()
    }

    /** @param {HTMLButtonElement} btn */
    #onToggle(btn) {
        const track = this.#editor.track
        if (!track) return
        const key = btn.dataset.key
        this.#editor.serviceRegistry.cmd?.updateTrack(
            track,
            { [key]: !track[key] },
            {
                desc: `${key} on ${track.name}`,
            },
        )
        btn.textContent = track[key] ? 'ON' : 'OFF'
        btn.classList.toggle('active', track[key])
        this.#editor.emitTrackChange()
        // Auto swaps which half of the gen tab is visible (manual props vs Groove/Engine).
        if (key === 'auto') this.#editor.sync()
    }

    /** @param {string} key */
    #toggleFxByKey(key) {
        const track = this.#editor.track
        const updates = this.#fxSection.toggleFxByKey(key)
        if (updates) {
            this.#editor.serviceRegistry.cmd?.updateTrack(track, updates, {
                desc: `Toggle ${key} on ${track.name}`,
            })
        }
        this.#editor.sync()
        this.#editor.emitTrackChange()
    }

    /** @param {HTMLElement} target */
    #onFxIcon(target) {
        const track = this.#editor.track
        const updates = this.#fxSection.onFxIcon(target)
        if (updates) {
            this.#editor.serviceRegistry.cmd?.updateTrack(track, updates, {
                desc: `Filter type on ${track.name}`,
            })
        }
        this.#editor.sync()
        this.#editor.emitTrackChange()
    }

    /** @param {string} fxTabId */
    #onFxTab(fxTabId) {
        this.#fxSection.onFxTab(fxTabId)
    }

    /** @param {string} genTabId */
    #onGenTab(genTabId) {
        if (!genTabId) return
        this.#genSection.subTab.setActive(genTabId)
        this.#editor.sync()
    }

    /** @param {string} k */
    #onLfoSelectBtn(k) {
        this.#modSection.onSelectBtn(k)
        this.#editor.sync()
        this.#editor.emitTrackChange()
    }

    /** @param {string} k */
    #onLfoToggleBtn(k) {
        const res = this.#modSection.onToggleBtn(k)
        if (res) {
            this.#editor.serviceRegistry.cmd?.updateTrack(this.#editor.track, res.updates, {
                desc: `LFO ${k} on ${this.#editor.track.name}`,
            })
        }
        this.#editor.sync()
        this.#editor.emitTrackChange()
    }

    /** @param {HTMLInputElement} input */
    #onLfoSlider(input) {
        const res = this.#modSection.onSlider(input)
        if (res) {
            this.#editor.serviceRegistry.cmd?.updateTrack(this.#editor.track, res.updates, {
                desc: `LFO ${input.dataset.lfoKey} on ${this.#editor.track.name}`,
                coalesce: true,
            })
        }
        if (res?.created) this.#editor.sync()
        this.#editor.emitTrackChange()
    }

    /** @param {HTMLSelectElement} sel */
    #onLfoSelect(sel) {
        const res = this.#modSection.onSelect(sel)
        if (res) {
            this.#editor.serviceRegistry.cmd?.updateTrack(this.#editor.track, res.updates, {
                desc: `LFO type on ${this.#editor.track.name}`,
            })
        }
        this.#editor.emitTrackChange()
    }
}
