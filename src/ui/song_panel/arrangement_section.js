// src/ui/song_panel/arrangement_section.js
// Song arrangement grid, laid out like a DAW arrangement view:
//   - time runs LEFT TO RIGHT on the X axis, one cell per measure (the ruler);
//   - each pattern is a ROW, named in a frozen first column;
//   - each clip is a rectangle spanning its measures along X.
//
// Read-only for now: clips are placed and removed from the right-click menus,
// never dragged. The one thing the grid drives is the transport — clicking a
// measure in the ruler aims the cursor, which is where the next play starts.

import { appState } from '../../state/app_state.js'
import { songLengthMeasures, songBpm } from '../../model/song_schema.js'
import { MEASURE_WIDTH, CLIP_INSET, HEADER_HEIGHT, LABEL_WIDTH, ROW_HEIGHT } from './layout.js'
import { escapeHtml } from '../components/ui_utils.js'
import ContextMenu from '../components/context_menu.js'
import { serviceRegistry } from '../../state/service_registry.js'
import { showToast } from '../../core/notify.js'
import { TICK } from '../../core/constants.js'
import { songMeasureAtTick } from '../../logic/song_playback.js'
import { playbackEvents } from '../../state/event_bus.js'
import { EVENTS } from '../../core/events.js'
import { reportUserError } from '../../core/notify.js'

export default class ArrangementSection {
    #panel
    #root
    #listEl
    #titleEl
    #song
    #menu = new ContextMenu()
    /** The patterns the arrangement uses — one row each. */
    #rows = []
    /** @type {HTMLDivElement | null} */
    #cursorEl = null
    /** Ruler cells, indexed by the measure they number. */
    #measureHeads = []
    /** @type {number | null} */
    #rafId = null
    /** last px written, so the hot loop touches the DOM only when it moved */
    #prevCursorPx = -1
    /** measure the ruler currently highlights, -1 when none */
    #prevMeasure = -1
    /** whether the cursor is painted as parked (transport stopped) */
    #cursorIdle = false

    /**
     * @param {import('../song_panel.js').default} panel host, for listen/dispose
     * @param {HTMLElement} root container to render into
     * @param {HTMLElement} titleEl element showing the current song name
     * @param {HTMLElement} listEl scrollable container for the grid
     */
    constructor(panel, root, titleEl, listEl) {
        this.#panel = panel
        this.#root = root
        this.#titleEl = titleEl
        this.#listEl = listEl
        // Delegated so it survives every re-render of the grid.
        this.#panel.listen(this.#listEl, 'contextmenu', (e) => this.#onContextMenu(/** @type {MouseEvent} */ (e)))
        this.#panel.listen(this.#listEl, 'click', (e) => this.#onGridClick(/** @type {MouseEvent} */ (e)))

        this.#panel.sub(playbackEvents, EVENTS.PLAYBACK_START, () => this.startCursorLoop())
        this.#panel.sub(playbackEvents, EVENTS.PLAYBACK_STOP, () => this.stopCursorLoop())
        // Leaving the view must not leave a loop running on a hidden panel, and
        // coming back must not resume a stale position.
        this.#panel.sub(playbackEvents, EVENTS.VIEW_CHANGED, () => {
            if (appState.currentView === 'song') this.startCursorLoop()
            else this.stopCursorLoop()
        })
    }

    /** Closes the menu; called by the host panel's onDestroy. */
    dispose() {
        this.#menu.hide()
        this.stopCursorLoop()
    }

    /**
     * Position of the transport inside the arrangement, in measures, fractional.
     *
     * The transport keeps counting past the end of the arrangement (the song
     * wraps inside resolveSongSources), so the value is wrapped on the loop
     * length to stay inside the grid.
     * @returns {number}
     */
    #transportBar() {
        return songMeasureAtTick(this.#song, serviceRegistry.seq?.tick, TICK)
    }

    /**
     * Measure the cursor sits on: where the transport is while it runs, and the
     * measure the next play starts from once it is stopped.
     * @returns {number}
     */
    #cursorMeasure() {
        const measure = serviceRegistry.transport?.isRunning
            ? this.#transportBar()
            : (serviceRegistry.seq?.songCursorMeasure ?? 0)
        // The running position already wraps on the loop length, but a parked
        // cursor aimed on a longer arrangement must not be drawn off this grid.
        return Math.min(measure, Math.max(0, songLengthMeasures(this.#song) - 1))
    }

    /**
     * Cursor animation, driven by rAF while the transport runs.
     *
     * Position is polled rather than pushed: the player publishes it per tick,
     * but the visual belongs to the frame rate, and the arrangement view is not
     * the only thing redrawing on playback.
     */
    startCursorLoop() {
        if (this.#rafId) return
        const loop = () => {
            this.#rafId = null
            // Stops on its own once the transport does, so a STOP event that
            // never arrives (panel torn down mid-play) cannot leak the loop.
            const running = !!serviceRegistry.transport?.isRunning && !!this.#song
            this.#paintCursor()
            if (running) this.#rafId = requestAnimationFrame(loop)
        }
        this.#rafId = requestAnimationFrame(loop)
    }

    stopCursorLoop() {
        if (this.#rafId) {
            cancelAnimationFrame(this.#rafId)
            this.#rafId = null
        }
        // The cursor does not vanish with the playback: it stays on the measure
        // the next play will start from.
        this.#paintCursor()
    }

    /** Paints the cursor once, reporting a failure instead of swallowing it. */
    #paintCursor() {
        if (!this.#cursorEl) return
        try {
            this.#updateCursor()
        } catch (err) {
            reportUserError('SongPanel.cursor', 'Song cursor stopped updating', { cause: err })
            this.#hideCursor()
        }
    }

    #updateCursor() {
        const el = this.#cursorEl
        if (!el) return
        const measure = this.#cursorMeasure()
        const px = Math.round(measure * MEASURE_WIDTH)
        if (px !== this.#prevCursorPx) {
            this.#prevCursorPx = px
            el.style.display = ''
            el.style.transform = `translateX(${px}px)`
        }
        // Parked reads differently from running: a stopped cursor marks where
        // play will start, it is not a measure sounding.
        const idle = !serviceRegistry.transport?.isRunning
        if (idle !== this.#cursorIdle) {
            this.#cursorIdle = idle
            el.classList.toggle('sa-cursor-idle', idle)
        }
        this.#markRulerMeasure(Math.floor(measure))
    }

    /**
     * Highlights the measure number under the cursor, so its position is
     * readable in the ruler instead of only as a line across the rows.
     * @param {number} measure
     */
    #markRulerMeasure(measure) {
        if (measure === this.#prevMeasure) return
        this.#measureHeads[this.#prevMeasure]?.classList.remove('sa-measure-current')
        this.#measureHeads[measure]?.classList.add('sa-measure-current')
        this.#prevMeasure = measure
    }

    #hideCursor() {
        this.#prevCursorPx = -1
        this.#markRulerMeasure(-1)
        if (this.#cursorEl) this.#cursorEl.style.display = 'none'
    }

    /**
     * Left click on the ruler aims the arrangement cursor at that measure;
     * pressing play then starts there. Nothing else in the grid takes a left
     * click — the clips are edited from the right-click menu.
     * @param {MouseEvent} e
     */
    #onGridClick(e) {
        const target = e.target instanceof Element ? e.target : null
        const headEl = /** @type {HTMLElement | null} */ (target?.closest('.sa-measure-head'))
        if (!headEl || !this.#song) return
        const measure = Number(headEl.dataset.measure)
        if (!Number.isInteger(measure) || measure < 0) return
        serviceRegistry.seq?.setSongCursor(measure)
        // Repaint now: while the transport runs the rAF loop would follow on the
        // next frame, and stopped there is no loop at all.
        this.#paintCursor()
    }

    /**
     * One right-click target decides the menu: a clip, a pattern name, or the
     * bare grid (which offers to add a clip where the pointer is).
     * @param {MouseEvent} e
     */
    #onContextMenu(e) {
        const target = e.target instanceof Element ? e.target : null
        if (!target || !this.#song) return
        const clipEl = target.closest('.sa-clip')
        const nameEl = target.closest('.sa-row-name')

        if (clipEl) {
            e.preventDefault()
            this.#showClipMenu(clipEl, e.clientX, e.clientY)
            return
        }
        if (nameEl) {
            e.preventDefault()
            this.#showRowMenu(nameEl, e.clientX, e.clientY)
            return
        }
        if (target.closest('.sa-grid')) {
            e.preventDefault()
            this.#showGridMenu(e)
        }
    }

    #patternName(patternId) {
        return this.#rows.find((p) => p.id === patternId)?.name ?? patternId
    }

    /** Clip: remove it, or repeat the same pattern right after it. */
    #showClipMenu(clipEl, x, y) {
        const index = Number(clipEl.dataset.index)
        const clip = this.#song.clips?.[index]
        if (!clip) return
        const label = this.#patternName(clip.pattern)
        this.#menu.show(
            `${label} — measure ${clip.startMeasure + 1}, ${clip.measureCount} measure(s)`,
            [
                {
                    label: 'Next',
                    run: () => {
                        serviceRegistry.cmd.repeatPatternAtMeasure(clip.startMeasure)
                        this.sync()
                        showToast(
                            `"${label}" repeated at measure ${clip.startMeasure + clip.measureCount + 1}`,
                            'success',
                        )
                    },
                },
                {
                    label: 'Delete',
                    run: () => {
                        serviceRegistry.cmd.removeSongClips([index])
                        this.sync()
                        showToast(`Removed "${label}" at measure ${clip.startMeasure + 1}`, 'success')
                    },
                },
            ],
            x,
            y,
        )
    }

    /**
     * Measure a right-click on a pattern name inserts at.
     *
     * The name column is frozen: there is no measure under the pointer there, so
     * the playhead is the only position the user can actually aim at. Wrapped on
     * the arrangement loop length, so the measure matches what is playing.
     */
    #playheadMeasure() {
        return Math.floor(this.#transportBar())
    }

    /** Pattern name: place it in the arrangement, or remove every clip using it. */
    #showRowMenu(nameEl, x, y) {
        const patternId = nameEl.dataset.pattern
        const indices = (this.#song.clips ?? []).map((c, i) => (c.pattern === patternId ? i : -1)).filter((i) => i >= 0)
        const label = this.#patternName(patternId)
        const startMeasure = this.#playheadMeasure()
        this.#menu.show(
            `${label} — ${indices.length} clip(s)`,
            [
                {
                    label: `Add at measure ${startMeasure + 1}`,
                    run: () => {
                        serviceRegistry.cmd.addPatternAtMeasure(patternId, startMeasure)
                        this.sync()
                        showToast(`"${label}" added at measure ${startMeasure + 1}`, 'success')
                    },
                },
                {
                    label: 'Delete row',
                    disabled: indices.length === 0,
                    run: () => {
                        // one command, so the whole row is a single undo step
                        serviceRegistry.cmd.removePatternClips(patternId)
                        this.sync()
                        showToast(`Removed "${label}" from the arrangement`, 'success')
                    },
                },
            ],
            x,
            y,
        )
    }

    /** Bare grid: add the row's pattern at the measure under the pointer. */
    #showGridMenu(e) {
        const body = this.#listEl.querySelector('.sa-body')
        if (!body) return
        const rect = body.getBoundingClientRect()
        const row = Math.floor((e.clientY - rect.top) / ROW_HEIGHT)
        const pattern = this.#rows[row]
        if (!pattern) return
        // floor, not round: clicking a cell must place the clip in THAT cell
        const startMeasure = Math.max(0, Math.floor((e.clientX - rect.left) / MEASURE_WIDTH))
        this.#menu.show(
            `Add "${pattern.name ?? pattern.id}" at measure ${startMeasure + 1}`,
            [
                {
                    label: 'Add here',
                    run: () => {
                        serviceRegistry.cmd.addPatternAtMeasure(pattern.id, startMeasure)
                        this.sync()
                        showToast(`"${pattern.name ?? pattern.id}" added at measure ${startMeasure + 1}`, 'success')
                    },
                },
            ],
            e.clientX,
            e.clientY,
        )
    }

    sync() {
        this.#song = appState.songs?.[appState.selectedSongIdx] ?? null
        this.#rows = this.#computeRows()
        this.render()
    }

    /**
     * Rows are the patterns actually used by the arrangement. Listing all 40
     * library patterns would leave a grid that is 95% empty rows.
     */
    #computeRows() {
        const used = new Set((this.#song?.clips ?? []).map((c) => c.pattern))
        const rows = []
        for (const pattern of appState.patterns ?? []) {
            if (pattern?.id && used.has(pattern.id)) rows.push(pattern)
        }
        // A clip whose pattern is missing from the library still gets a row,
        // otherwise the arrangement would silently hide part of itself.
        for (const id of used) {
            if (!rows.some((p) => p.id === id)) rows.push({ id, name: id, _orphan: true })
        }
        return rows
    }

    #rowIdx(id) {
        return this.#rows.findIndex((p) => p.id === id)
    }

    render() {
        const song = this.#song
        if (this.#titleEl) this.#titleEl.textContent = song ? song.name : ''

        if (!song) {
            this.#listEl.innerHTML = '<div class="sa-empty">No arrangement — this song has no clips yet.</div>'
            this.#root?.classList.remove('sa-has-song')
            this.#cursorEl = null
            this.#measureHeads = []
            this.#prevMeasure = -1
            return
        }
        this.#root?.classList.add('sa-has-song')

        const totalMeasures = Math.max(1, songLengthMeasures(song))
        const rowCount = this.#rows.length
        const gridWidth = LABEL_WIDTH + totalMeasures * MEASURE_WIDTH
        const gridHeight = HEADER_HEIGHT + rowCount * ROW_HEIGHT

        // Ruler: one measure per cell, numbered, running along X. data-measure is
        // both what a click aims the cursor at and what the cursor highlights.
        const ruler = Array.from({ length: totalMeasures }, (_, measure) => {
            const marked = measure % 4 === 0
            return `<div class="sa-measure-head${marked ? ' sa-measure-major' : ''}" data-measure="${measure}" style="left:${LABEL_WIDTH + measure * MEASURE_WIDTH}px;width:${MEASURE_WIDTH}px">${measure + 1}</div>`
        }).join('')

        // One row per pattern. The name lives in the frozen first column, so it
        // is pulled left out of the scrolling body.
        const rows = this.#rows
            .map(
                (p, index) =>
                    `<div class="sa-row" style="top:${index * ROW_HEIGHT}px;height:${ROW_HEIGHT}px">` +
                    `<div class="sa-row-name${p._orphan ? ' sa-orphan' : ''}" data-pattern="${escapeHtml(p.id)}" style="left:${-LABEL_WIDTH}px;width:${LABEL_WIDTH}px" title="${escapeHtml(p.name ?? p.id)}">` +
                    `<span>${escapeHtml(p.name ?? p.id)}</span></div>` +
                    '</div>',
            )
            .join('')

        const clips = (song.clips ?? [])
            .map((clip, clipIdx) => {
                const index = this.#rowIdx(clip.pattern)
                if (index < 0) return ''
                // Width along X is the duration; a clip may last a fraction of
                // a measure (a 3-beat pattern is 0.75), so it is not rounded to a cell.
                // CLIP_INSET on each side keeps neighbouring clips apart.
                const width = Math.max(4, clip.measureCount * MEASURE_WIDTH - CLIP_INSET)
                return (
                    `<div class="sa-clip${clip.measureCount > 1 ? ' sa-clip-long' : ''}" ` +
                    `style="left:${clip.startMeasure * MEASURE_WIDTH}px;top:${index * ROW_HEIGHT + CLIP_INSET / 2}px;` +
                    `width:${width}px;height:${ROW_HEIGHT - 2 * CLIP_INSET}px" ` +
                    `data-pattern="${escapeHtml(clip.pattern)}" ` +
                    `data-index="${clipIdx}" ` +
                    `data-start-measure="${clip.startMeasure}" ` +
                    `data-measure-count="${clip.measureCount}" ` +
                    `title="${escapeHtml(clip.pattern)} — measure ${clip.startMeasure + 1}, ${clip.measureCount} measure(s)"></div>`
                )
            })
            .join('')

        this.#listEl.innerHTML =
            `<div class="sa-grid" style="width:${gridWidth}px;height:${gridHeight}px">` +
            `<div class="sa-header" style="width:${gridWidth}px;height:${HEADER_HEIGHT}px">${ruler}</div>` +
            `<div class="sa-body" style="left:${LABEL_WIDTH}px;top:${HEADER_HEIGHT}px;` +
            `width:${totalMeasures * MEASURE_WIDTH}px;height:${rowCount * ROW_HEIGHT}px">` +
            rows +
            clips +
            '<div class="sa-cursor" style="display:none"></div>' +
            '</div>' +
            '</div>'

        // innerHTML was just rebuilt, so the references to the old nodes are dead.
        this.#cursorEl = this.#listEl.querySelector('.sa-cursor')
        this.#measureHeads = [...this.#listEl.querySelectorAll('.sa-measure-head')]
        this.#prevCursorPx = -1
        this.#prevMeasure = -1
        this.#listEl.dataset.totalMeasures = String(totalMeasures)
        this.#listEl.dataset.bpm = String(songBpm(song))
        // A re-render happens with no cursor loop running too (the arrangement
        // was edited while stopped), so the cursor is painted again here.
        this.#paintCursor()
    }

    /** Clip rectangles, as plain data — used by the tests. */
    clipRects() {
        const out = []
        for (const clip of this.#song?.clips ?? []) {
            const row = this.#rowIdx(clip.pattern)
            if (row < 0) continue
            out.push({ pattern: clip.pattern, row, startMeasure: clip.startMeasure, measureCount: clip.measureCount })
        }
        return out
    }
}
