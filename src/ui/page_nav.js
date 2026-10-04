// src/ui/page_nav.js — Shared page navigation for pattern panels.

import { appState } from '../state/app_state.js'
import { serviceRegistry } from '../state/service_registry.js'
import { playbackEvents } from '../state/playback_events.js'
import { PATTERN_DEFAULTS } from '../model/pattern_schema.js'
import { EVENTS } from '../core/events.js'
import { BEATS_PER_PAGE } from '../core/constants.js'

/**
 * Number of pages a pattern spans. A page is BEATS_PER_PAGE beats — the same
 * unit every renderer uses (pattern_panel slices [page*4, page*4+4) beats).
 *
 * Three variants of this formula existed (ceil(beatCount*spb/16) in page_nav /
 * toolbar / pattern_settings_panel, ceil(beatCount/4) in the piano roll); the
 * steps-based one shrank the beats per page as stepsPerBeat grew, so at
 * stepsPerBeat=8 the toolbar offered twice as many pages as the grid could
 * render.
 * @param {{beatCount?: number}} [pattern]
 * @returns {number} page count (>= 1)
 */
export function pageCountFor(pattern) {
    const beatCount = pattern?.beatCount ?? PATTERN_DEFAULTS.beatCount
    return Math.max(1, Math.ceil(beatCount / BEATS_PER_PAGE))
}

/** @param {object} [pattern] @returns {number} last valid page index */
export function maxPageFor(pattern) {
    return pageCountFor(pattern) - 1
}

/**
 * Navigate to the previous page of steps.
 */
export function prevPage() {
    if (appState.currentPage > 0) {
        serviceRegistry.cmd?.setCurrentPage(appState.currentPage - 1)
        playbackEvents.batch(() => {
            playbackEvents.emit(EVENTS.PATTERN_META_CHANGE)
            playbackEvents.emit(EVENTS.PATTERN_CHANGE)
        })
    }
}

/**
 * Navigate to the next page of steps.
 */
export function nextPage() {
    const pattern = appState.selectedPattern
    if (!pattern) return
    const maxPage = maxPageFor(pattern)
    if (appState.currentPage < maxPage) {
        serviceRegistry.cmd?.setCurrentPage(appState.currentPage + 1)
        playbackEvents.batch(() => {
            playbackEvents.emit(EVENTS.PATTERN_META_CHANGE)
            playbackEvents.emit(EVENTS.PATTERN_CHANGE)
        })
    }
}
