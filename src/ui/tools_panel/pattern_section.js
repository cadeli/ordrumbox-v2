// src/ui/tools_panel/pattern_section.js — Tools "Pattern" tab (Compact / Rnd).

import { appState } from '../../state/app_state.js'
import { playbackEvents } from '../../state/event_bus.js'
import { getTracksArray } from '../../core/tracks.js'
import { EVENTS } from '../../core/events.js'

export default class PatternSection {
    #panel

    /** @param {import('../tools_panel.js').default} panel */
    constructor(panel) {
        this.#panel = panel
    }

    html() {
        return `
            <div class="ne-tab-panel" data-tab-panel="pattern">
                <div class="ne-row">
                    <button class="ne-btn" id="tp-compact" title="Detect repeating note patterns and add loop points to minimize notes">Compact Tracks</button>
                </div>
                <div class="ne-row">
                    <button class="ne-btn" id="tp-rnd" title="Write random notes into each track of the current pattern">Rnd</button>
                </div>
            </div>
        `
    }

    bind() {
        const root = this.#panel.container
        root.querySelector('#tp-compact').addEventListener('click', () => this.compact())
        root.querySelector('#tp-rnd').addEventListener('click', () => this.randomize())
    }

    compact() {
        const pattern = appState.selectedPattern
        if (!pattern || !pattern.tracks) return

        getTracksArray(pattern).forEach((track) => {
            this.#panel.serviceRegistry.cmd?.compactTrack(track)
        })

        this.#panel.serviceRegistry.audioEngine?.invalidateCache()
        playbackEvents.batch(() => {
            playbackEvents.emit(EVENTS.NOTE_CHANGE)
            playbackEvents.emit(EVENTS.PATTERN_CHANGE)
        })
    }

    randomize() {
        const pattern = appState.selectedPattern
        if (!pattern) return
        const tracks = getTracksArray(pattern)
        for (const track of tracks) {
            this.#panel.serviceRegistry.cmd?.randomizeTrack(track, pattern)
        }
        this.#panel.serviceRegistry.audioEngine?.invalidateCache()
        playbackEvents.batch(() => {
            playbackEvents.emit(EVENTS.NOTE_CHANGE)
            playbackEvents.emit(EVENTS.PATTERN_CHANGE)
        })
    }
}
