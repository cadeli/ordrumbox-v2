import { playbackEvents } from '../state/event_bus.js'
import { logger } from '../core/logger.js'
import { EVENTS } from '../core/events.js'
import { Lifecycle } from '../core/lifecycle.js'

export default class MobileTabBar {
    #currentTab
    #isSwitching
    /** Owns the click listener and every bus sub — released by destroy(). */
    #life = new Lifecycle()
    #initialized = false

    constructor() {
        this.container = null
        this.#currentTab = 'seq'
        this.#isSwitching = false
    }

    /**
     * Idempotent: a second init() tears down the previous bar first, so the
     * document never carries two of them and handlers are never bound twice.
     */
    init() {
        this.#beginInit()
        this.#createDOM()
        this.#bindEvents()
        this.#subscribeEvents()
        this.#updateActive()
    }

    #beginInit() {
        if (this.#initialized) this.destroy()
        // Fresh signal per init cycle: destroy() aborted the previous one.
        this.#life.reset()
        this.#initialized = true
    }

    /** Releases every listener and detaches the bar from the document. */
    destroy() {
        this.#life.destroy()
        this.container?.remove()
        this.container = null
        this.#initialized = false
    }

    #createDOM() {
        this.container = document.createElement('div')
        this.container.id = 'mobile-tab-bar'

        const tabs = [
            { id: 'seq', label: 'Sequencer' },
            { id: 'track', label: 'Track' },
            { id: 'synth', label: 'Synth' },
            { id: 'master', label: 'Master' },
        ]

        tabs.forEach((tab) => {
            const btn = document.createElement('button')
            btn.className = 'mtb-btn'
            btn.dataset.tab = tab.id
            btn.textContent = tab.label
            this.container.appendChild(btn)
        })

        document.body.appendChild(this.container)
    }

    #bindEvents() {
        this.#life.listen(this.container, 'click', (e) => {
            const btn = /** @type {Element} */ (e.target).closest('.mtb-btn')
            if (!btn) return
            const tab = /** @type {HTMLElement} */ (btn).dataset.tab
            this.#onTabClick(tab)
        })
    }

    #subscribeEvents() {
        const tabMap = {
            [EVENTS.MOBILE_SEQ_TOGGLE]: 'seq',
            [EVENTS.MOBILE_TRACK_TOGGLE]: 'track',
            [EVENTS.SYNTH_TOGGLE]: 'synth',
            [EVENTS.EDIT_TOGGLE]: 'track',
            [EVENTS.MASTER_TOGGLE]: 'master',
        }
        for (const [event, tab] of Object.entries(tabMap)) {
            this.#life.sub(playbackEvents, event, (arg) => {
                if (!this.#isSwitching) {
                    if (event === EVENTS.MASTER_TOGGLE && arg === false) return
                    this.#currentTab = tab
                    this.#updateActive()
                }
            })
        }
    }

    #onTabClick(tab) {
        if (tab === this.#currentTab) return

        this.#isSwitching = true
        this.#currentTab = tab

        try {
            const dispatchMap = {
                seq: () => playbackEvents.emit(EVENTS.MOBILE_SEQ_TOGGLE),
                track: () => playbackEvents.emit(EVENTS.MOBILE_TRACK_TOGGLE),
                synth: () => playbackEvents.emit(EVENTS.SYNTH_TOGGLE),
                master: () => playbackEvents.emit(EVENTS.MASTER_TOGGLE, true),
            }
            dispatchMap[tab]?.()
        } finally {
            this.#isSwitching = false
        }

        this.#updateActive()
        logger.debug('MobileTabBar', `Switched to tab: ${tab}`)
    }

    #updateActive() {
        this.container?.querySelectorAll('.mtb-btn').forEach((btn) => {
            btn.classList.toggle('active', /** @type {HTMLElement} */ (btn).dataset.tab === this.#currentTab)
        })
    }
}
