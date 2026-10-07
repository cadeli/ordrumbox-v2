// src/ui/select_lists.js — Shared fill + change handling for the pattern and
// drumkit <select> pairs that exist twice: the toolbar's PatternNav and the
// pattern settings panel used to duplicate this line by line.

import { appState } from '../state/app_state.js'
import { soundRegistry } from '../state/sound_registry.js'
import { serviceRegistry } from '../state/service_registry.js'
import { playbackEvents } from '../state/event_bus.js'
import { EVENTS } from '../core/events.js'

/**
 * Fill `select` with one option per item (value = index), then point it at
 * `selectedIndex` clamped to the option count — an out-of-range index shows
 * the last option instead of silently falling back to the first.
 * @param {HTMLSelectElement} select
 * @param {Array<{name?: string}>} items
 * @param {number} selectedIndex
 * @param {(item: {name?: string}, idx: number) => string} labelFor
 */
function fillSelect(select, items, selectedIndex, labelFor) {
    select.innerHTML = ''
    items.forEach((item, i) => {
        const opt = document.createElement('option')
        opt.value = String(i)
        opt.textContent = labelFor(item, i)
        select.appendChild(opt)
    })
    if (select.options.length > 0) {
        const idx = Math.min(selectedIndex, select.options.length - 1)
        select.selectedIndex = idx
    }
}

/**
 * Rebuild the pattern <select> from `appState.patterns`.
 * @param {HTMLSelectElement} select
 */
export function rebuildPatternSelect(select) {
    fillSelect(
        select,
        appState.patterns,
        appState.selectedPatternIdx,
        (pat, i) => pat.name ?? `Pattern ${i}`
    )
}

/**
 * Rebuild the drumkit <select> from `soundRegistry.drumkitList`.
 * @param {HTMLSelectElement} select
 */
export function rebuildDrumkitSelect(select) {
    fillSelect(
        select,
        soundRegistry.drumkitList,
        appState.selectedDrumkitIdx,
        (kit, i) => kit.name ?? `Kit ${i}`
    )
}

/**
 * "The user picked another pattern": switch the selection, restart the page
 * at 1 and refresh every panel — the same META + CHANGE batch as a page move
 * (page_nav.js). A plain switch changes no pattern list, so
 * PATTERN_STRUCTURE_CHANGE is deliberately not emitted (it used to be sent
 * by the settings panel but not by the toolbar).
 * @param {HTMLSelectElement} select
 */
export function onPatternSelectChange(select) {
    const num = parseInt(select.value, 10)
    if (isNaN(num)) return
    serviceRegistry.cmd.setSelectedPatternIdx(num)
    serviceRegistry.cmd.resetPage()
    playbackEvents.batch(() => {
        playbackEvents.emit(EVENTS.PATTERN_META_CHANGE)
        playbackEvents.emit(EVENTS.PATTERN_CHANGE)
    })
}

/**
 * "The user picked another drumkit" — the sample loading and the DRUMKIT_CHANGE
 * event live inside the command itself.
 * @param {HTMLSelectElement} select
 */
export function onDrumkitSelectChange(select) {
    const num = parseInt(select.value, 10)
    if (isNaN(num)) return
    serviceRegistry.cmd.setSelectedDrumkitIdx(num)
}
