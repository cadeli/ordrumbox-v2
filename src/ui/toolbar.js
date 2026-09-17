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

export default class Toolbar {
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

        this._transport = new TransportControls(this)
        this._patternNav = new PatternNav(this)
        this._viewSwitch = new ViewSwitch(this)
        this._overflow = new OverflowMenu(this)
        this._nextUndoDesc = null
        this._nextRedoDesc = null
        this._bpmOverride = null
    }

    injectCSS() {
        injectUiCss()
    }

    init() {
        this.injectCSS()
        this.createDOM()
        this.bindEvents()
        this.sync()
        this._bindSyncEvents()
        this._setupOverflowObserver()
        document.addEventListener('keydown', (e) => this._handleKeyboard(e))
    }

    _bindSyncEvents() {
        const sync = () => this.sync()
        playbackEvents.on('playbackStart', sync)
        playbackEvents.on('playbackStop', sync)
        playbackEvents.on('bpmChange', sync)
        playbackEvents.on('patternChange', sync)
        playbackEvents.on('patternStructureChange', sync)
        playbackEvents.on('patternMetaChange', sync)
        playbackEvents.on('noteChange', sync)
        playbackEvents.on('trackParamChange', sync)
        playbackEvents.on('drumkitChange', sync)
        playbackEvents.on('historyChange', (state) => {
            this._nextUndoDesc = state?.nextUndoDesc ?? null
            this._nextRedoDesc = state?.nextRedoDesc ?? null
            sync()
        })
    }

    sync() {
        const transport = serviceRegistry.transport
        const running = transport?.isRunning ?? false
        this.startBtn.textContent = running ? '■' : '▶'
        this.startBtn.classList.toggle('running', running)

        const pat = appState.patterns[appState.selectedPatternNum]
        const bpm = this._bpmOverride ?? pat?.bpm ?? 120
        this._bpmOverride = null
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
        this.undoBtn.title = canUndo
            ? `Undo: ${this._nextUndoDesc ?? ''} (Ctrl+Z)`
            : 'Undo (Ctrl+Z)'
        this.redoBtn.title = canRedo
            ? `Redo: ${this._nextRedoDesc ?? ''} (Ctrl+Y)`
            : 'Redo (Ctrl+Y)'

        const tracks = pat ? Utils.getTracksArray(pat) : []
        const drumTypes = new Set(['KICK', 'SNARE', 'HAT', 'CLAP', 'COWBELL', 'PERC'])
        this.drumBtn.classList.toggle('active',
            tracks.some(t => t._toolbarAuto && drumTypes.has(Utils.detectTrackType(t.name))))
        this.bassBtn.classList.toggle('active',
            tracks.some(t => t._toolbarAuto && Utils.detectTrackType(t.name) === 'BASS'))
        this.chordsBtn.classList.toggle('active',
            tracks.some(t => t._toolbarAuto && Utils.detectTrackType(t.name) === 'PIANO'))

        this._patternNav.rebuildPatternSelect()
        this._patternNav.rebuildDrumkitSelect()

        if (pat && this.patternNameMobile) {
            this.patternNameMobile.textContent = pat.name ?? `Pattern ${appState.selectedPatternNum + 1}`
        }
    }

    _handleKeyboard(e) {
        if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') {
            e.preventDefault()
            serviceRegistry.history?.undo()
        } else if ((e.ctrlKey || e.metaKey) && (e.shiftKey && e.key === 'z' || e.key === 'y')) {
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

        const { startBtn, bpmWrap, beatsWrap } = this._transport.createDOM()
        const { patWrap, pageWrap, kitWrap } = this._patternNav.createDOM()
        const { genWrap, undoWrap, viewWrap } = this._viewSwitch.createDOM()
        const { toolsBtn, aboutBtn, settingsBtn } = this._overflow.createDOM()

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
        this._transport.bindEvents()
        this._patternNav.bindEvents()
        this._viewSwitch.bindEvents()
        this._overflow.bindEvents()
    }

    _rebuildPatternSelect() {
        this._patternNav.rebuildPatternSelect()
    }

    _rebuildDrumkitSelect() {
        this._patternNav.rebuildDrumkitSelect()
    }

    _setupOverflowObserver() {
        const isMobile = () => isMobileViewport()
        const check = () => {
            if (!this.container) return
            const overflowing = isMobile() && this.container.scrollWidth > this.container.clientWidth + 1
            this.container.classList.toggle('tb-overflow', overflowing)
        }
        if (typeof ResizeObserver !== 'undefined') {
            this._ro = new ResizeObserver(check)
            this._ro.observe(this.container)
        }
        window.addEventListener('resize', check)
        this._checkOverflow = check
        setTimeout(check, 0)
    }
}
