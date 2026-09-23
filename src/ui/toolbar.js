import { appState } from '../state/app_state.js'
import { serviceRegistry } from '../state/service_registry.js'
import { playbackEvents } from '../state/playback_events.js'
import { injectUiCss } from './components/panel_helpers.js'
import { isMobileViewport } from '../core/constants.js'
import Utils from '../core/utils.js'

import TransportControls from './toolbar/transport_controls.js'
import PatternNav from './toolbar/pattern_nav.js'
import ViewSwitch from './toolbar/view_switch.js'
import OverflowMenu from './toolbar/overflow_menu.js'
import { EVENTS } from '../core/events.js'

export default class Toolbar {
    #transport
    #patternNav
    #viewSwitch
    #overflow
    #nextUndoDesc
    #nextRedoDesc
    #bpmOverride
    #ro
    #checkOverflow

    constructor() {
        this.container = null
        this.startBtn = null
        this.patternSelect = null
        this.drumkitSelect = null
        this.bpmToggle = null
        this.bpmPanel = null
        this.bpmSlider = null
        this.bpmValue = null
        this.prevPageBtn = null
        this.nextPageBtn = null
        this.pageLabel = null

        this.#transport = new TransportControls(this)
        this.#patternNav = new PatternNav(this)
        this.#viewSwitch = new ViewSwitch(this)
        this.#overflow = new OverflowMenu(this)
        this.#nextUndoDesc = null
        this.#nextRedoDesc = null
        this.#bpmOverride = null
    }

    injectCSS() {
        injectUiCss()
    }

    init() {
        this.injectCSS()
        this.createDOM()
        this.bindEvents()
        this.sync()
        this.#bindSyncEvents()
        this.#setupOverflowObserver()
        document.addEventListener('keydown', (e) => this.#handleKeyboard(e))
    }

    #bindSyncEvents() {
        const sync = () => this.sync()
        playbackEvents.on(EVENTS.PLAYBACK_START, sync)
        playbackEvents.on(EVENTS.PLAYBACK_STOP, sync)
        playbackEvents.on(EVENTS.BPM_CHANGE, sync)
        playbackEvents.on(EVENTS.PATTERN_CHANGE, sync)
        playbackEvents.on(EVENTS.PATTERN_STRUCTURE_CHANGE, sync)
        playbackEvents.on(EVENTS.PATTERN_META_CHANGE, sync)
        playbackEvents.on(EVENTS.NOTE_CHANGE, sync)
        playbackEvents.on(EVENTS.TRACK_PARAM_CHANGE, sync)
        playbackEvents.on(EVENTS.DRUMKIT_CHANGE, sync)
        playbackEvents.on(EVENTS.HISTORY_CHANGE, (state) => {
            this.#nextUndoDesc = state?.nextUndoDesc ?? null
            this.#nextRedoDesc = state?.nextRedoDesc ?? null
            sync()
        })
    }

    sync() {
        const transport = serviceRegistry.transport
        const running = transport?.isRunning ?? false
        this.startBtn.textContent = running ? '■' : '▶'
        this.startBtn.classList.toggle('running', running)

        const pat = appState.patterns[appState.selectedPatternNum]
        const bpm = this.#bpmOverride ?? pat?.bpm ?? 120
        this.#bpmOverride = null
        this.bpmSlider.value = bpm
        this.bpmValue.textContent = bpm
        this.bpmToggle.textContent = bpm

        this.beatsSelect.value = pat?.nbBeats ?? 4

        if (pat) {
            const stepsPerBeat = Utils.getTracksArray(pat)[0]?.stepsPerBeat ?? 4
            const totalSteps = (pat.nbBeats ?? 4) * stepsPerBeat
            const maxPage = Math.ceil(totalSteps / 16) - 1
            this.pageLabel.textContent = `${appState.currentPage + 1}/${maxPage + 1}`
            this.nextPageBtn.disabled = appState.currentPage >= maxPage
        } else {
            this.pageLabel.textContent = '1/1'
            this.nextPageBtn.disabled = true
        }
        this.prevPageBtn.disabled = appState.currentPage === 0

        const history = serviceRegistry.history
        const canUndo = history?.canUndo ?? false
        const canRedo = history?.canRedo ?? false
        this.undoBtn.disabled = !canUndo
        this.redoBtn.disabled = !canRedo
        this.undoBtn.title = canUndo ? `Undo: ${this.#nextUndoDesc ?? ''} (Ctrl+Z)` : 'Undo (Ctrl+Z)'
        this.redoBtn.title = canRedo ? `Redo: ${this.#nextRedoDesc ?? ''} (Ctrl+Y)` : 'Redo (Ctrl+Y)'

        const tracks = pat ? Utils.getTracksArray(pat) : []
        const drumTypes = new Set(['KICK', 'SNARE', 'HAT', 'CLAP', 'COWBELL', 'PERC'])
        this.drumBtn.classList.toggle(
            'active',
            tracks.some((t) => t._toolbarAuto && drumTypes.has(Utils.detectTrackType(t.name))),
        )
        this.bassBtn.classList.toggle(
            'active',
            tracks.some((t) => t._toolbarAuto && Utils.detectTrackType(t.name) === 'BASS'),
        )
        this.chordsBtn.classList.toggle(
            'active',
            tracks.some((t) => t._toolbarAuto && Utils.detectTrackType(t.name) === 'PIANO'),
        )

        this.#patternNav.rebuildPatternSelect()
        this.#patternNav.rebuildDrumkitSelect()

        if (pat && this.patternNameMobile) {
            this.patternNameMobile.textContent = pat.name ?? `Pattern ${appState.selectedPatternNum + 1}`
        }
    }

    #handleKeyboard(e) {
        if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') {
            e.preventDefault()
            serviceRegistry.history?.undo()
        } else if ((e.ctrlKey || e.metaKey) && ((e.shiftKey && e.key === 'z') || e.key === 'y')) {
            e.preventDefault()
            serviceRegistry.history?.redo()
        }
    }

    createDOM() {
        this.container = document.createElement('div')
        this.container.id = 'tb'

        const brand = document.createElement('span')
        brand.className = 'tb-brand tb-hide-mobile'
        brand.textContent = 'orDrumbox'

        const { startBtn, bpmWrap, beatsWrap } = this.#transport.createDOM()
        const { patWrap, pageWrap, kitWrap } = this.#patternNav.createDOM()
        const { genWrap, undoWrap, viewWrap } = this.#viewSwitch.createDOM()
        const { toolsBtn, aboutBtn, settingsBtn } = this.#overflow.createDOM()

        this.container.appendChild(brand)
        this.container.appendChild(startBtn)
        this.container.appendChild(this.patternNameMobile)
        this.container.appendChild(bpmWrap)
        this.container.appendChild(patWrap)
        this.container.appendChild(pageWrap)
        this.container.appendChild(beatsWrap)
        this.container.appendChild(kitWrap)
        this.container.appendChild(genWrap)

        const sep = document.createElement('div')
        sep.className = 'tb-sep'
        this.container.appendChild(sep)

        this.container.appendChild(undoWrap)
        this.container.appendChild(viewWrap)
        this.container.appendChild(toolsBtn)
        this.container.appendChild(aboutBtn)
        this.container.appendChild(settingsBtn)
        document.body.appendChild(this.container)
    }

    bindEvents() {
        this.#transport.bindEvents()
        this.#patternNav.bindEvents()
        this.#viewSwitch.bindEvents()
        this.#overflow.bindEvents()
    }

    #setupOverflowObserver() {
        const isMobile = () => isMobileViewport()
        const check = () => {
            if (!this.container) return
            const overflowing = isMobile() && this.container.scrollWidth > this.container.clientWidth + 1
            this.container.classList.toggle('tb-overflow', overflowing)
        }
        if (typeof ResizeObserver !== 'undefined') {
            this.#ro = new ResizeObserver(check)
            this.#ro.observe(this.container)
        }
        window.addEventListener('resize', check)
        this.#checkOverflow = check
        setTimeout(check, 0)
    }

    get bpmOverride() {
        return this.#bpmOverride
    }
    set bpmOverride(v) {
        this.#bpmOverride = v
    }

    checkOverflow() {
        this.#checkOverflow?.()
    }
}
