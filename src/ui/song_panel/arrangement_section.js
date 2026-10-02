// @ts-check
// src/ui/song_panel/arrangement_section.js
// Song arrangement grid: one column per pattern, one row per measure, one
// rectangle per clip.
//
// Read-only for now — playback of an arrangement is not implemented, so nothing
// here drives the transport. It shows the arrangement and lets it be picked.

import { appState } from '../../state/app_state.js'
import { songLengthBars, songBpm } from '../../model/song_schema.js'
import { escapeHtml } from '../components/ui_utils.js'

/** Width of one pattern column, in px. */
const COL_WIDTH = 74
/** Width of the bar-number gutter, in px. */
const GUTTER_WIDTH = 40
/** Height of one measure row, in px. */
const ROW_HEIGHT = 16
/** Header height, in px. */
const HEADER_HEIGHT = 44

export default class ArrangementSection {
    #root
    #listEl
    #titleEl
    #song
    /** Pattern ids that at least one clip uses — the columns worth showing. */
    #columns = []

    /**
     * @param {HTMLElement} root container to render into
     * @param {HTMLElement} titleEl element showing the current song name
     * @param {HTMLElement} listEl scrollable container for the grid
     */
    constructor(root, titleEl, listEl) {
        this.#root = root
        this.#titleEl = titleEl
        this.#listEl = listEl
    }

    sync() {
        this.#song = appState.songs?.[appState.selectedSongIdx] ?? null
        this.#columns = this.#computeColumns()
        this.render()
    }

    /**
     * Columns are the patterns actually used by the arrangement. Showing all 40
     * library patterns would leave a grid that is 95% empty and forces
     * horizontal scrolling for nothing.
     */
    #computeColumns() {
        const used = new Set((this.#song?.clips ?? []).map((c) => c.pattern))
        const columns = []
        for (const pattern of appState.patterns ?? []) {
            if (pattern?.id && used.has(pattern.id)) columns.push(pattern)
        }
        // A clip whose pattern is missing from the library still gets a column,
        // otherwise the arrangement would silently hide part of itself.
        for (const id of used) {
            if (!columns.some((p) => p.id === id)) columns.push({ id, name: id, _orphan: true })
        }
        return columns
    }

    #columnIndex(id) {
        return this.#columns.findIndex((p) => p.id === id)
    }

    render() {
        const song = this.#song
        if (this.#titleEl) {
            this.#titleEl.textContent = song ? song.name : ''
        }

        if (!song) {
            this.#listEl.innerHTML = '<div class="sa-empty">No arrangement — this song has no clips yet.</div>'
            this.#root?.classList.remove('sa-has-song')
            return
        }
        this.#root?.classList.add('sa-has-song')

        const totalBars = Math.max(1, songLengthBars(song))
        const colCount = this.#columns.length
        const gridWidth = GUTTER_WIDTH + colCount * COL_WIDTH
        const gridHeight = HEADER_HEIGHT + totalBars * ROW_HEIGHT

        // Header: a column per pattern, rotated so long names stay readable.
        const headerCells = this.#columns
            .map(
                (p) =>
                    `<div class="sa-col-head${p._orphan ? ' sa-orphan' : ''}" style="width:${COL_WIDTH}px">` +
                    `<span class="sa-col-name" title="${escapeHtml(p.name ?? p.id)}">${escapeHtml(p.name ?? p.id)}</span>` +
                    `</div>`,
            )
            .join('')

        // Body: one row per measure. Rows are a plain background; the clips are
        // absolutely-positioned rectangles over it, so the node count follows the
        // clip count and not (columns x bars).
        const rows = []
        for (let bar = 0; bar < totalBars; bar++) {
            const label = bar % 4 === 0 ? String(bar + 1) : ''
            rows.push(
                `<div class="sa-row${bar % 4 === 0 ? ' sa-row-beat' : ''}" style="top:${HEADER_HEIGHT + bar * ROW_HEIGHT}px;height:${ROW_HEIGHT}px">` +
                    `<span class="sa-bar-label">${label}</span>` +
                    '</div>',
            )
        }

        const clips = (song.clips ?? [])
            .map((clip) => {
                const col = this.#columnIndex(clip.pattern)
                if (col < 0) return ''
                // The rectangle's HEIGHT is the duration: a 4-bar clip covers
                // four rows. A clip can also last a fraction of a bar (a 3-beat
                // pattern is 0.75), so the height is not rounded to a row.
                const height = Math.max(3, clip.bars * ROW_HEIGHT)
                const left = GUTTER_WIDTH + col * COL_WIDTH
                const top = HEADER_HEIGHT + clip.startBar * ROW_HEIGHT
                const width = COL_WIDTH - 4
                return (
                    `<div class="sa-clip${clip.bars > 1 ? ' sa-clip-long' : ''}" ` +
                    `style="left:${left}px;top:${top}px;width:${width}px;height:${height}px" ` +
                    `data-pattern="${escapeHtml(clip.pattern)}" ` +
                    `data-start-bar="${clip.startBar}" ` +
                    `data-bars="${clip.bars}" ` +
                    `title="${escapeHtml(clip.pattern)} — bar ${clip.startBar + 1}, ${clip.bars} bar(s)"></div>`
                )
            })
            .join('')

        this.#listEl.innerHTML =
            `<div class="sa-grid" style="width:${gridWidth}px;height:${gridHeight}px">` +
            `<div class="sa-header" style="width:${gridWidth}px;height:${HEADER_HEIGHT}px">${headerCells}</div>` +
            `<div class="sa-body" style="top:${HEADER_HEIGHT}px;height:${totalBars * ROW_HEIGHT}px;width:${gridWidth - GUTTER_WIDTH}px;left:${GUTTER_WIDTH}px">` +
            rows.join('') +
            clips +
            '</div>' +
            '</div>'

        this.#listEl.dataset.totalBars = String(totalBars)
        this.#listEl.dataset.bpm = String(songBpm(song))
    }

    /** Clip rectangles, as plain data — used by the tests. */
    clipRects() {
        const out = []
        for (const clip of this.#song?.clips ?? []) {
            const col = this.#columnIndex(clip.pattern)
            if (col < 0) continue
            out.push({ pattern: clip.pattern, column: col, startBar: clip.startBar, bars: clip.bars })
        }
        return out
    }
}
