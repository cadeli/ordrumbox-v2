// src/ui/pattern_panel/HeaderSection.js
// Pattern header: name, BPM/meta, page info, action buttons.

import Utils from '../../core/utils.js'
import { nameOr } from '../../core/logger.js'

export default class HeaderSection {
    /** @param {import('./pattern_panel.js').default} editor */
    constructor(editor) { this._editor = editor }

    /**
     * @param {object} pattern
     * @param {number} currentPage
     * @returns {string} header HTML
     */
    render(pattern, currentPage) {
        const tracks = Utils.getTracksArray(pattern)
        const totalBeats = pattern.nbBeats ?? 4
        const firstStepsPerBeat = tracks[0]?.stepsPerBeat ?? 4
        const totalMeasures = Math.ceil(totalBeats / firstStepsPerBeat)

        return `<div class="pp-header">
            <div class="pp-actions">
                <button class="pp-action-btn" data-pp-action="delete" title="Delete pattern">✕</button>
                <button class="pp-action-btn" data-pp-action="clean" title="Clear all notes">⌫</button>
                <button class="pp-action-btn" data-pp-action="duplicate" title="Duplicate pattern">⧉</button>
                <button class="pp-action-btn" data-pp-action="rename" title="Rename pattern">✎</button>
                <button class="pp-action-btn" data-pp-action="save" title="Export Pattern">↓</button>
                <button class="pp-action-btn" data-pp-action="replace" title="Load / replace pattern">↑</button>
            </div>
            <span class="pp-name">${this._editor.esc(nameOr(pattern.name, 'Unnamed', 'PatternPanel', 'name fallback'))}</span>
            <span class="pp-meta">${pattern.bpm ?? 120} BPM · ${totalBeats} beats (${totalMeasures} measures) · Page ${currentPage + 1}</span>
        </div>`
    }
}
