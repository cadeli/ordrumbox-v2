// src/ui/tools_panel/pattern_section.js — Tools "Pattern" tab (Compact / Rnd).

import { appState } from '../../state/app_state.js'
import { playbackEvents } from '../../state/playback_events.js'
import { serviceRegistry } from '../../state/service_registry.js'
import Utils from '../../core/utils.js'

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
        const pattern = appState.patterns[appState.selectedPatternNum]
        if (!pattern || !pattern.tracks) return

        Utils.getTracksArray(pattern).forEach((track) => {
            serviceRegistry.cmd?.compactTrack(track)
        })

        serviceRegistry.audioEngine?.invalidateCache()
        playbackEvents.batch(() => {
            playbackEvents.emit('noteChange')
            playbackEvents.emit('patternChange')
        })
    }

    randomize() {
        const pattern = appState.patterns[appState.selectedPatternNum]
        if (!pattern) return
        const tracks = Utils.getTracksArray(pattern)
        for (const track of tracks) {
            serviceRegistry.cmd?.randomizeTrack(track, pattern)
        }
        serviceRegistry.audioEngine?.invalidateCache()
        playbackEvents.batch(() => {
            playbackEvents.emit('noteChange')
            playbackEvents.emit('patternChange')
        })
    }
}
