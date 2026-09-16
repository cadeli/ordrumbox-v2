// src/core/page_nav.js — Shared page navigation for pattern panels.

import { appState } from '../state/app_state.js'
import { playbackEvents } from '../state/playback_events.js'
import Utils from './utils.js'

/**
 * Navigate to the previous page of steps.
 */
export function prevPage() {
    if (appState.currentPage > 0) {
        appState.currentPage--
        playbackEvents.batch(() => {
            playbackEvents.emit('patternMetaChange')
            playbackEvents.emit('patternChange')
        })
    }
}

/**
 * Navigate to the next page of steps.
 */
export function nextPage() {
    const pattern = appState.patterns[appState.selectedPatternNum]
    if (!pattern) return
    const stepsPerBeat = Utils.getTracksArray(pattern)[0]?.stepsPerBeat ?? 4
    const totalSteps = (pattern.nbBeats ?? 4) * stepsPerBeat
    const maxPage = Math.ceil(totalSteps / 16) - 1
    if (appState.currentPage < maxPage) {
        appState.currentPage++
        playbackEvents.batch(() => {
            playbackEvents.emit('patternMetaChange')
            playbackEvents.emit('patternChange')
        })
    }
}
