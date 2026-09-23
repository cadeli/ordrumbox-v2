import { playbackEvents } from '../state/playback_events.js'
import { isMobileViewport } from '../core/constants.js'
import { logger } from '../core/logger.js'

export default class MobileTabBar {
    #currentTab
    #isSwitching

    constructor() {
        this.container = null
        this.#currentTab = 'seq'
        this.#isSwitching = false
    }

    init() {
        this.#createDOM()
        this.#bindEvents()
        this.#subscribeEvents()
        this.#updateActive()
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
            btn.innerHTML = `<span>${tab.label}</span>`
            this.container.appendChild(btn)
        })

        document.body.appendChild(this.container)
    }

    #bindEvents() {
        this.container.addEventListener('click', (e) => {
            const btn = e.target.closest('.mtb-btn')
            if (!btn) return
            const tab = btn.dataset.tab
            this.#onTabClick(tab)
        })
    }

    #subscribeEvents() {
        const tabMap = {
            mobileSeqToggle: 'seq',
            mobileTrackToggle: 'track',
            synthToggle: 'synth',
            editToggle: 'track',
            masterToggle: 'master',
        }
        for (const [event, tab] of Object.entries(tabMap)) {
            playbackEvents.on(event, (arg) => {
                if (!this.#isSwitching) {
                    if (event === 'masterToggle' && arg === false) return
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
                seq: () => playbackEvents.emit('mobileSeqToggle'),
                track: () => playbackEvents.emit('mobileTrackToggle'),
                synth: () => playbackEvents.emit('synthToggle'),
                master: () => playbackEvents.emit('masterToggle', true),
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
            btn.classList.toggle('active', btn.dataset.tab === this.#currentTab)
        })
    }

    isVisible() {
        return isMobileViewport()
    }
}
