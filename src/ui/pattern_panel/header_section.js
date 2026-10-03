// src/ui/pattern_panel/HeaderSection.js
// Pattern header: name, BPM/meta, page info, action buttons.

import { valueOrFallback } from '../../core/logger.js'
import { BEATS_PER_BAR } from '../../model/song_schema.js'

export default class HeaderSection {
    #editor

    /** @param {import('../pattern_panel.js').default} editor */
    constructor(editor) {
        this.#editor = editor
    }

    /**
     * @param {any} pattern
     * @param {number} currentPage
     * @returns {string} header HTML
     */
    render(pattern, currentPage) {
        const totalBeats = pattern.beatCount ?? 4
        // a measure is BEATS_PER_BAR beats of the time signature, NOT one step
        // group: dividing by stepsPerBeat made the number move when the user
        // changed the grid subdivision
        const totalMeasures = Math.ceil(totalBeats / BEATS_PER_BAR)

        return `<div class="pp-header">
            <div class="pp-actions">
                <button class="pp-action-btn" data-pp-action="new" title="New pattern">+</button>
                <button class="pp-action-btn" data-pp-action="delete" title="Delete pattern">✕</button>
                <button class="pp-action-btn" data-pp-action="clean" title="Clear all notes">⌫</button>
                <button class="pp-action-btn" data-pp-action="duplicate" title="Duplicate pattern">⧉</button>
                <button class="pp-action-btn" data-pp-action="rename" title="Rename pattern">✎</button>
                <button class="pp-action-btn" data-pp-action="save" title="Export Pattern">↓</button>
                <button class="pp-action-btn" data-pp-action="replace" title="Load / replace pattern">↑</button>
            </div>
            <span class="pp-name">${this.#editor.esc(valueOrFallback(pattern.name, 'Unnamed', 'PatternPanel', 'name fallback'))}</span>
            <span class="pp-meta">${pattern.bpm ?? 120} BPM · ${totalBeats} beats (${totalMeasures} measures) · Page ${currentPage + 1}</span>
        </div>`
    }
}
