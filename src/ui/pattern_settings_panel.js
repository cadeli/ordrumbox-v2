import { appState } from '../state/app_state.js'
import { soundRegistry } from '../state/sound_registry.js'
import { serviceRegistry } from '../state/service_registry.js'
import { playbackEvents } from '../state/event_bus.js'
import { MAX_BEATS } from '../core/constants.js'
import { prevPage, nextPage } from './page_nav.js'
import { maxPageFor } from './page_nav.js'
import { EVENTS } from '../core/events.js'
import patternAutoGen from '../logic/services/pattern_auto_gen.js'

export default class PatternSettingsPanel {
    #isOpen
    #prevPageBtn
    #nextPageBtn
    #pageLabel
    #beatsSelect
    #drumkitSelect
    #patternSelect
    #drumBtn
    #bassBtn
    #chordsBtn

    get isOpen() {
        return this.#isOpen
    }
    get beatsSelect() {
        return this.#beatsSelect
    }
    get drumkitSelect() {
        return this.#drumkitSelect
    }
    get patternSelect() {
        return this.#patternSelect
    }
    get pageLabel() {
        return this.#pageLabel
    }
    get prevPageBtn() {
        return this.#prevPageBtn
    }
    get nextPageBtn() {
        return this.#nextPageBtn
    }

    /** Owns every DOM listener bound through listen() — aborted by destroy(). */
    #abortController = new AbortController()

    constructor() {
        this.container = null
        this.#isOpen = false
    }

    /**
     * addEventListener tied to the panel lifetime: destroy() aborts them all,
     * so no handler reference is kept for removeEventListener.
     * @param {EventTarget} target
     * @param {string} type
     * @param {EventListener} handler
     * @param {AddEventListenerOptions} [options]
     */
    listen(target, type, handler, options) {
        target?.addEventListener(type, handler, { ...options, signal: this.#abortController.signal })
    }

    /** Aborts every listener bound through listen(). */
    destroy() {
        this.#abortController.abort()
        this.container?.remove()
    }

    init() {
        this.#createDOM()
        this.#bindEvents()
        this.#subscribeEvents()
    }

    #createDOM() {
        this.container = document.createElement('div')
        this.container.id = 'pattern-settings-panel'

        const content = document.createElement('div')
        content.className = 'ps-content'

        const closeBtn = document.createElement('button')
        closeBtn.textContent = '×'
        closeBtn.className = 'ps-close-btn'
        closeBtn.title = 'Close'

        /* Page row */
        const pageRow = document.createElement('div')
        pageRow.className = 'ps-row'
        pageRow.innerHTML = `
            <label class="ps-label">Page</label>
            <div class="ps-control ps-page-controls">
                <button class="ps-btn ps-prev-page">◀</button>
                <span class="ps-page-label">P1</span>
                <button class="ps-btn ps-next-page">▶</button>
            </div>
        `

        /* Beats row */
        const beatsRow = document.createElement('div')
        beatsRow.className = 'ps-row'
        beatsRow.innerHTML = `
            <label class="ps-label">Beats</label>
            <select class="ps-beats-select">
                ${Array.from({ length: MAX_BEATS }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join('')}
            </select>
        `

        /* Drumkit row */
        const kitRow = document.createElement('div')
        kitRow.className = 'ps-row'
        kitRow.innerHTML = `
            <label class="ps-label">Drumkit</label>
            <select class="ps-drumkit-select"></select>
        `

        /* Pattern row */
        const patternRow = document.createElement('div')
        patternRow.className = 'ps-row'
        patternRow.innerHTML = `
            <label class="ps-label">Pattern</label>
            <select class="ps-pattern-select"></select>
        `

        /* Generation row */
        const genRow = document.createElement('div')
        genRow.className = 'ps-row'
        genRow.innerHTML = `
            <label class="ps-label">Generation</label>
            <div class="ps-control ps-gen-controls">
                <button class="ps-btn ps-gen-drum">↻ Drum</button>
                <button class="ps-btn ps-gen-bass">↻ Bass</button>
                <button class="ps-btn ps-gen-chords">↻ Chords</button>
            </div>
        `

        content.appendChild(pageRow)
        content.appendChild(beatsRow)
        content.appendChild(kitRow)
        content.appendChild(patternRow)
        content.appendChild(genRow)

        this.container.appendChild(content)
        this.container.appendChild(closeBtn)
        document.body.appendChild(this.container)

        /* Store refs */
        this.#prevPageBtn = this.container.querySelector('.ps-prev-page')
        this.#nextPageBtn = this.container.querySelector('.ps-next-page')
        this.#pageLabel = this.container.querySelector('.ps-page-label')
        this.#beatsSelect = this.container.querySelector('.ps-beats-select')
        this.#drumkitSelect = this.container.querySelector('.ps-drumkit-select')
        this.#patternSelect = this.container.querySelector('.ps-pattern-select')
        this.#drumBtn = this.container.querySelector('.ps-gen-drum')
        this.#bassBtn = this.container.querySelector('.ps-gen-bass')
        this.#chordsBtn = this.container.querySelector('.ps-gen-chords')

        /* Close button */
        this.listen(closeBtn, 'click', () => this.hide())
    }

    #bindEvents() {
        this.#bindPageControls()
        this.#bindBeatsSelect()
        this.#bindDrumkitSelect()
        this.#bindPatternSelect()
        this.#bindGenerationButtons()
    }

    #bindPageControls() {
        this.listen(this.#prevPageBtn, 'click', () => prevPage())
        this.listen(this.#nextPageBtn, 'click', () => nextPage())
    }

    #bindBeatsSelect() {
        this.listen(this.#beatsSelect, 'change', () => this.#onBeatsChange())
    }

    #onBeatsChange() {
        const val = parseInt(this.#beatsSelect.value, 10)
        if (isNaN(val)) return
        const pattern = appState.selectedPattern
        if (!pattern) return
        serviceRegistry.cmd.setPatternBeatCount(pattern, val)
        serviceRegistry.cmd.resetPage()
        playbackEvents.batch(() => {
            playbackEvents.emit(EVENTS.PATTERN_META_CHANGE)
            playbackEvents.emit(EVENTS.PATTERN_CHANGE)
        })
    }

    #bindDrumkitSelect() {
        this.listen(this.#drumkitSelect, 'change', () => this.#onDrumkitChange())
    }

    #onDrumkitChange() {
        const num = parseInt(this.#drumkitSelect.value, 10)
        if (!isNaN(num)) {
            serviceRegistry.cmd.setSelectedDrumkitIdx(num)
        }
    }

    #bindPatternSelect() {
        this.listen(this.#patternSelect, 'change', () => this.#onPatternChange())
    }

    #onPatternChange() {
        const num = parseInt(this.#patternSelect.value, 10)
        if (!isNaN(num)) {
            serviceRegistry.cmd.setSelectedPatternIdx(num)
            serviceRegistry.cmd.resetPage()
            playbackEvents.batch(() => {
                playbackEvents.emit(EVENTS.PATTERN_STRUCTURE_CHANGE)
                playbackEvents.emit(EVENTS.PATTERN_CHANGE)
            })
        }
    }

    // ── Generation buttons ───────────────────────────────────────────
    // Drum toggles auto-gen on the whole percussion family, Bass/Chords
    // drive one melodic track type and create it on first use — the whole
    // orchestration (undo transaction, genre/harmony resolution, event
    // batch) lives in logic/services/pattern_auto_gen.js, shared with the
    // toolbar's ViewSwitch.

    #bindGenerationButtons() {
        this.listen(this.#drumBtn, 'click', () => patternAutoGen.toggleDrums())
        this.listen(this.#bassBtn, 'click', () => patternAutoGen.toggleMelodic('BASS'))
        this.listen(this.#chordsBtn, 'click', () => patternAutoGen.toggleMelodic('PIANO'))
    }

    #subscribeEvents() {
        playbackEvents.on(EVENTS.PATTERN_META_CHANGE, () => this.sync())
        playbackEvents.on(EVENTS.PATTERN_STRUCTURE_CHANGE, () => this.sync())
        playbackEvents.on(EVENTS.DRUMKIT_CHANGE, () => this.syncSelects())
        playbackEvents.on(EVENTS.PATTERN_SETTINGS_TOGGLE, (show) => {
            if (show) this.show()
            else this.hide()
        })
    }

    sync() {
        const pattern = appState.selectedPattern
        if (!pattern) return

        this.#beatsSelect.value = pattern.beatCount ?? 4

        const maxPage = maxPageFor(pattern)
        this.#pageLabel.textContent = `${appState.currentPage + 1}/${maxPage + 1}`
        this.#prevPageBtn.disabled = appState.currentPage === 0
        this.#nextPageBtn.disabled = appState.currentPage >= maxPage
    }

    /** Rebuilds BOTH the drumkit and the pattern <select> (it is called on DRUMKIT_CHANGE). */
    syncSelects() {
        this.#drumkitSelect.innerHTML = ''
        soundRegistry.drumkitList.forEach((kit, i) => {
            const opt = document.createElement('option')
            opt.value = String(i)
            opt.textContent = kit.name ?? `Kit ${i}`
            this.#drumkitSelect.appendChild(opt)
        })
        if (this.#drumkitSelect.options.length > 0) {
            const idx = Math.min(appState.selectedDrumkitIdx, this.#drumkitSelect.options.length - 1)
            this.#drumkitSelect.selectedIndex = idx
        }

        this.#patternSelect.innerHTML = ''
        appState.patterns.forEach((pat, i) => {
            const opt = document.createElement('option')
            opt.value = String(i)
            opt.textContent = pat.name ?? `Pattern ${i}`
            this.#patternSelect.appendChild(opt)
            if (i === appState.selectedPatternIdx) opt.selected = true
        })
    }

    show() {
        this.#isOpen = true
        this.container.classList.add('open')
        this.sync()
        this.syncSelects()
    }

    hide() {
        this.#isOpen = false
        this.container.classList.remove('open')
    }
}
