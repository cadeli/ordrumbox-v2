import { appState } from '../state/app_state.js'
import { serviceRegistry } from '../state/service_registry.js'
import { playbackEvents } from '../state/event_bus.js'
import { injectUiCss } from './components/ui_utils.js'
import { isMobileViewport } from '../core/constants.js'
import { DRUM_TYPES, detectTrackType } from '../core/drum_taxonomy.js'
import { getTracksArray } from '../core/tracks.js'
import { Lifecycle } from '../core/lifecycle.js'

import TransportControls from './toolbar/transport_controls.js'
import { maxPageFor } from './page_nav.js'
import PatternNav from './toolbar/pattern_nav.js'
import ViewSwitch from './toolbar/view_switch.js'
import OverflowMenu from './toolbar/overflow_menu.js'
import { EVENTS } from '../core/events.js'

/**
 * Toolbar — assembles the four sections into one bar and coordinates them.
 *
 * Elements are owned by the section that creates them (transport, pattern nav,
 * view switch, overflow); this class only exposes read-only accessors and
 * feeds each `sync()` the model it has to render.
 */
export default class Toolbar {
    #transport
    #patternNav
    #viewSwitch
    #overflow
    /** Owns every listener bound through #life — released by destroy(). */
    #life = new Lifecycle()
    #initialized = false
    #nextUndoDesc
    #nextRedoDesc
    #ro
    #checkOverflow

    constructor() {
        this.container = null

        this.#transport = new TransportControls()
        this.#patternNav = new PatternNav()
        this.#viewSwitch = new ViewSwitch()
        this.#overflow = new OverflowMenu()
        this.#nextUndoDesc = null
        this.#nextRedoDesc = null
    }

    // ── Read-only accessors on the sections ────────────────────────────────

    get startBtn() {
        return this.#transport.startBtn
    }

    get bpmToggle() {
        return this.#transport.bpmToggle
    }

    get bpmPanel() {
        return this.#transport.bpmPanel
    }

    get bpmSlider() {
        return this.#transport.bpmSlider
    }

    get bpmValue() {
        return this.#transport.bpmValue
    }

    get beatsSelect() {
        return this.#transport.beatsSelect
    }

    get patternSelect() {
        return this.#patternNav.patternSelect
    }

    get drumkitSelect() {
        return this.#patternNav.drumkitSelect
    }

    get prevPageBtn() {
        return this.#patternNav.prevPageBtn
    }

    get nextPageBtn() {
        return this.#patternNav.nextPageBtn
    }

    get pageLabel() {
        return this.#patternNav.pageLabel
    }

    get patLabel() {
        return this.#patternNav.patLabel
    }

    get kitLabel() {
        return this.#patternNav.kitLabel
    }

    get undoBtn() {
        return this.#viewSwitch.undoBtn
    }

    get redoBtn() {
        return this.#viewSwitch.redoBtn
    }

    get drumBtn() {
        return this.#viewSwitch.drumBtn
    }

    get bassBtn() {
        return this.#viewSwitch.bassBtn
    }

    get chordsBtn() {
        return this.#viewSwitch.chordsBtn
    }

    get synthBtn() {
        return this.#viewSwitch.synthBtn
    }

    get editBtn() {
        return this.#viewSwitch.editBtn
    }

    get prollBtn() {
        return this.#viewSwitch.prollBtn
    }

    get songBtn() {
        return this.#viewSwitch.songBtn
    }

    get toolsBtn() {
        return this.#overflow.toolsBtn
    }

    get aboutBtn() {
        return this.#overflow.aboutBtn
    }

    get settingsBtn() {
        return this.#overflow.settingsBtn
    }

    get patternNameMobile() {
        return this.#overflow.patternNameMobile
    }

    injectCSS() {
        injectUiCss()
    }

    /**
     * Idempotent: a second init() destroys the previous cycle first, so bus
     * handlers are never bound twice.
     */
    init() {
        this.#beginInit()
        this.injectCSS()
        this.createDOM()
        this.bindEvents()
        this.sync()
        this.#bindSyncEvents()
        this.#setupOverflowObserver()
        this.#life.listen(document, 'keydown', (e) => this.#handleKeyboard(e))
    }

    #beginInit() {
        if (this.#initialized) this.destroy()
        // Fresh signal per init cycle: destroy() aborted the previous one.
        this.#life.reset()
        this.#initialized = true
    }

    /**
     * Releases every listener, every bus sub, the resize observer and the
     * section lifecycles, then detaches the bar from the document.
     */
    destroy() {
        this.#life.destroy()
        this.#ro?.disconnect()
        this.#ro = null
        this.#transport.destroy()
        this.#patternNav.destroy()
        this.#viewSwitch.destroy()
        this.#overflow.destroy()
        this.container?.remove()
        this.container = null
        this.#initialized = false
    }

    #bindSyncEvents() {
        const sync = () => this.sync()
        this.#life.sub(playbackEvents, EVENTS.PLAYBACK_START, sync)
        this.#life.sub(playbackEvents, EVENTS.PLAYBACK_STOP, sync)
        this.#life.sub(playbackEvents, EVENTS.BPM_CHANGE, sync)
        this.#life.sub(playbackEvents, EVENTS.PATTERN_CHANGE, sync)
        this.#life.sub(playbackEvents, EVENTS.PATTERN_STRUCTURE_CHANGE, sync)
        this.#life.sub(playbackEvents, EVENTS.PATTERN_META_CHANGE, sync)
        this.#life.sub(playbackEvents, EVENTS.NOTE_CHANGE, sync)
        this.#life.sub(playbackEvents, EVENTS.TRACK_PARAM_CHANGE, sync)
        this.#life.sub(playbackEvents, EVENTS.DRUMKIT_CHANGE, sync)
        this.#life.sub(playbackEvents, EVENTS.HISTORY_CHANGE, (state) => {
            this.#nextUndoDesc = state?.nextUndoDesc ?? null
            this.#nextRedoDesc = state?.nextRedoDesc ?? null
            sync()
        })
    }

    /** Reads the model once, then hands each section what it renders. */
    sync() {
        const transport = serviceRegistry.transport
        const pat = appState.selectedPattern
        const history = serviceRegistry.history
        const tracks = pat ? getTracksArray(pat) : []

        this.#transport.sync({
            isRunning: transport?.isRunning ?? false,
            bpm: pat?.bpm ?? 120,
            beatCount: pat?.beatCount ?? 4,
        })

        const maxPage = pat ? maxPageFor(pat) : 0
        this.#patternNav.sync({
            pageLabel: pat ? `${appState.currentPage + 1}/${maxPage + 1}` : '1/1',
            atFirstPage: appState.currentPage === 0,
            atLastPage: !pat || appState.currentPage >= maxPage,
        })

        // Lit ⇔ PatternAutoGen would toggle OFF on click: the button reflects
        // `auto` (the runtime truth) with `_toolbarAuto` for older saved
        // patterns where the two flags could drift apart.
        const isAutoOn = (/** @type {any} */ t) => Boolean(t.auto || t._toolbarAuto)
        this.#viewSwitch.sync({
            canUndo: history?.canUndo ?? false,
            canRedo: history?.canRedo ?? false,
            nextUndoDesc: this.#nextUndoDesc,
            nextRedoDesc: this.#nextRedoDesc,
            gen: {
                drum: tracks.some((t) => isAutoOn(t) && DRUM_TYPES.has(detectTrackType(t.name))),
                bass: tracks.some((t) => isAutoOn(t) && detectTrackType(t.name) === 'BASS'),
                chords: tracks.some((t) => isAutoOn(t) && detectTrackType(t.name) === 'PIANO'),
            },
        })

        this.#overflow.sync({
            patternName: pat?.name ?? `Pattern ${appState.selectedPatternIdx + 1}`,
            hasPattern: Boolean(pat),
        })
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
        this.container.appendChild(this.#overflow.patternNameMobile)
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
        this.#life.listen(window, 'resize', check)
        this.#checkOverflow = check
        setTimeout(check, 0)
    }

    checkOverflow() {
        this.#checkOverflow?.()
    }
}
