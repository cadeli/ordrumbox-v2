import { playbackEvents } from '../state/playback_events.js'
import { appState } from '../state/app_state.js'
import { isMobileViewport } from '../core/constants.js'
import { logger } from '../core/logger.js'

export default class MobileTabBar {
    constructor() {
        this.container = null
        this._currentTab = 'seq'
        this._isSwitching = false
    }

    init() {
        this._createDOM()
        this._bindEvents()
        this._subscribeEvents()
        this._updateActive()
    }

    _createDOM() {
        this.container = document.createElement('div')
        this.container.id = 'mobile-tab-bar'

        const tabs = [
            { id: 'seq', label: 'Sequencer', icon: '🎵' },
            { id: 'track', label: 'Track', icon: '🎸' },
            { id: 'synth', label: 'Synth', icon: 'synth' },
            { id: 'tools', label: 'Tools', icon: '⚙' },
        ]

        tabs.forEach(tab => {
            const btn = document.createElement('button')
            btn.className = 'mtb-btn'
            btn.dataset.tab = tab.id
            btn.innerHTML = `<i>${tab.icon}</i><span>${tab.label}</span>`
            this.container.appendChild(btn)
        })

        document.body.appendChild(this.container)
    }

    _bindEvents() {
        this.container.addEventListener('click', (e) => {
            const btn = e.target.closest('.mtb-btn')
            if (!btn) return
            const tab = btn.dataset.tab
            this._onTabClick(tab)
        })
    }

    _subscribeEvents() {
        const tabMap = {
            mobileSeqToggle: 'seq',
            mobileTrackToggle: 'track',
            synthToggle: 'synth',
            editToggle: 'track',
            toolsToggle: 'tools',
        }
        for (const [event, tab] of Object.entries(tabMap)) {
            const onKey = 'on' + event.charAt(0).toUpperCase() + event.slice(1)
            playbackEvents[onKey].push(() => {
                if (!this._isSwitching) {
                    this._currentTab = tab
                    this._updateActive()
                }
            })
        }
    }

    _onTabClick(tab) {
        if (tab === this._currentTab) return

        this._isSwitching = true
        this._currentTab = tab

        try {
            const dispatchMap = {
                seq: () => playbackEvents.dispatchMobileSeqToggle(),
                track: () => playbackEvents.dispatchMobileTrackToggle(),
                synth: () => playbackEvents.dispatchSynthToggle(),
                tools: () => playbackEvents.dispatchToolsToggle(true),
            }
            dispatchMap[tab]?.()
        } finally {
            this._isSwitching = false
        }

        this._updateActive()
        logger.debug('MobileTabBar', `Switched to tab: ${tab}`)
    }

    _updateActive() {
        this.container?.querySelectorAll('.mtb-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === this._currentTab)
        })
    }

    isVisible() {
        return isMobileViewport()
    }
}
