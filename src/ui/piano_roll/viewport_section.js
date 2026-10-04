// src/ui/piano_roll/viewport_section.js
// Piano roll paging, cell-width measurement and page navigation UI.

import { appState } from '../../state/app_state.js'
import { serviceRegistry } from '../../state/service_registry.js'
import { playbackEvents } from '../../state/playback_events.js'
import { clamp } from '../../core/numbers.js'
import { EVENTS } from '../../core/events.js'
import { BEATS_PER_PAGE } from '../../core/constants.js'
import { KEYS_COLUMN_WIDTH, MIDI_MIN, MIN_CELL_WIDTH, MIDDLE_C, NOTE_HEIGHT, TOTAL_KEYS } from './constants.js'

export default class ViewportSection {
    #editor

    /** @param {import('../piano_roll_panel.js').default} editor */
    constructor(editor) {
        this.#editor = editor
    }

    onResize() {
        const prev = this.#editor.cellWidth
        this.measureCellWidth()
        if (this.#editor.cellWidth !== prev) {
            this.#editor.gridDirty = true
            this.#editor.sync()
        }
    }

    measureCellWidth() {
        const scrollEl = this.#editor.container.querySelector('#pp-piano-scroll')
        if (!scrollEl || !this.#editor.track) {
            this.#editor.cellWidth = 24
            return
        }
        const pageSteps = BEATS_PER_PAGE * (this.#editor.track.stepsPerBeat ?? 4)
        this.#editor.cellWidth = Math.max(MIN_CELL_WIDTH, (scrollEl.clientWidth - KEYS_COLUMN_WIDTH) / pageSteps)
    }

    updatePageInfo() {
        const nav = this.#editor.container.querySelector('#pp-pr-page-nav')
        const info = this.#editor.container.querySelector('#pp-pr-page-info')
        if (!info || !nav) return
        const total = this.#totalPages()
        if (total <= 1) {
            nav.style.display = 'none'
            return
        }
        nav.style.display = 'flex'
        info.textContent = `${appState.currentPage + 1}/${total}`
        const prev = this.#editor.container.querySelector('#pp-pr-prev')
        const next = this.#editor.container.querySelector('#pp-pr-next')
        if (prev) prev.disabled = appState.currentPage <= 0
        if (next) next.disabled = appState.currentPage >= total - 1
    }

    #totalPages() {
        if (!this.#editor.track) return 1
        const beatCount = appState.selectedPattern?.beatCount ?? 4
        return Math.max(1, Math.ceil(beatCount / BEATS_PER_PAGE))
    }

    clampPage() {
        serviceRegistry.cmd.setCurrentPage(clamp(appState.currentPage, 0, this.#totalPages() - 1))
    }

    prevPage() {
        if (appState.currentPage <= 0) return
        serviceRegistry.cmd.setCurrentPage(appState.currentPage - 1)
        playbackEvents.batch(() => {
            playbackEvents.emit(EVENTS.PATTERN_META_CHANGE)
            playbackEvents.emit(EVENTS.PATTERN_CHANGE)
        })
    }

    nextPage() {
        if (appState.currentPage >= this.#totalPages() - 1) return
        serviceRegistry.cmd.setCurrentPage(appState.currentPage + 1)
        playbackEvents.batch(() => {
            playbackEvents.emit(EVENTS.PATTERN_META_CHANGE)
            playbackEvents.emit(EVENTS.PATTERN_CHANGE)
        })
    }

    onWheel(e) {
        if (!this.#editor.isVisible || !e.shiftKey) return
        if (e.deltaY > 0 || e.deltaX > 0) this.nextPage()
        else if (e.deltaY < 0 || e.deltaX < 0) this.prevPage()
        e.preventDefault()
    }

    scrollToTrackCenter() {
        const scrollEl = this.#editor.container.querySelector('#pp-piano-scroll')
        if (!scrollEl) return
        const row = MIDDLE_C + (this.#editor.track?.pitch ?? 0) - MIDI_MIN
        scrollEl.scrollTop = Math.max(0, (TOTAL_KEYS - 1 - row) * NOTE_HEIGHT - scrollEl.clientHeight / 2)
    }
}
