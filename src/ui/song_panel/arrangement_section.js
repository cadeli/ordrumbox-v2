// src/ui/song_panel/arrangement_section.js
// Song arrangement grid, laid out like a DAW arrangement view:
//   - time runs LEFT TO RIGHT on the X axis, one cell per measure (the ruler);
//   - each pattern is a ROW, named in a frozen first column;
//   - each clip is a rectangle spanning its bars along X.
//
// Read-only for now: clips are placed and removed from the right-click menus,
// never dragged. The one thing the grid drives is the transport — clicking a
// measure in the ruler aims the cursor, which is where the next play starts.

import { appState } from '../../state/app_state.js'
import { songLengthBars, songBpm } from '../../model/song_schema.js'
import { BAR_WIDTH, CLIP_INSET, HEADER_HEIGHT, LABEL_WIDTH, ROW_HEIGHT } from './layout.js'
import { escapeHtml } from '../components/ui_utils.js'
import ContextMenu from '../components/context_menu.js'
import { serviceRegistry } from '../../state/service_registry.js'
import { showToast } from '../../core/notify.js'
import { TICK } from '../../core/constants.js'
import { songBarAtTick } from '../../logic/song_playback.js'
import { playbackEvents } from '../../state/playback_events.js'
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
    #playheadEl = null
    /** Ruler cells, indexed by the measure they number. */
    #barHeads = []
    /** @type {number | null} */
    #rafId = null
    /** last px written, so the hot loop touches the DOM only when it moved */
    #prevPlayheadPx = -1
    /** measure the ruler currently highlights, -1 when none */
    #prevBar = -1
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
        this.#panel.listen(this.#listEl, 'contextmenu', (e) => this.#onContextMenu(e))
        this.#panel.listen(this.#listEl, 'click', (e) => this.#onGridClick(e))

        this.#panel.sub(playbackEvents, EVENTS.PLAYBACK_START, () => this.startPlayhead())
        this.#panel.sub(playbackEvents, EVENTS.PLAYBACK_STOP, () => this.stopPlayhead())
        // Leaving the view must not leave a loop running on a hidden panel, and
        // coming back must not resume a stale position.
        this.#panel.sub(playbackEvents, EVENTS.VIEW_CHANGED, () => {
            if (appState.currentView === 'song') this.startPlayhead()
            else this.stopPlayhead()
        })
    }

    /** Closes the menu; called by the host panel's onDestroy. */
    dispose() {
        this.#menu.hide()
        this.stopPlayhead()
    }

    /**
     * Position of the transport inside the arrangement, in bars, fractional.
     *
     * The transport keeps counting past the end of the arrangement (the song
     * wraps inside resolveSongSources), so the value is wrapped on the loop
     * length to stay inside the grid.
     * @returns {number}
     */
    #transportBar() {
        return songBarAtTick(this.#song, serviceRegistry.seq?.tick, TICK)
    }

    /**
     * Measure the cursor sits on: where the transport is while it runs, and the
     * measure the next play starts from once it is stopped.
     * @returns {number}
     */
    #cursorBar() {
        const bar = serviceRegistry.transport?.isRunning
            ? this.#transportBar()
            : (serviceRegistry.seq?.songCursorBar ?? 0)
        // The running position already wraps on the loop length, but a parked
        // cursor aimed on a longer arrangement must not be drawn off this grid.
        return Math.min(bar, Math.max(0, songLengthBars(this.#song) - 1))
    }

    /**
     * Playhead animation, driven by rAF while the transport runs.
     *
     * Position is polled rather than pushed: the player publishes it per tick,
     * but the visual belongs to the frame rate, and the arrangement view is not
     * the only thing redrawing on playback.
     */
    startPlayhead() {
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

    stopPlayhead() {
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
        if (!this.#playheadEl) return
        try {
            this.#updatePlayhead()
        } catch (err) {
            reportUserError('SongPanel.playhead', 'Song playhead stopped updating', { cause: err })
            this.#hidePlayhead()
        }
    }

    #updatePlayhead() {
        const el = this.#playheadEl
        if (!el) return
        const bar = this.#cursorBar()
        const px = Math.round(bar * BAR_WIDTH)
        if (px !== this.#prevPlayheadPx) {
            this.#prevPlayheadPx = px
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
        this.#markRulerBar(Math.floor(bar))
    }

    /**
     * Highlights the measure number under the cursor, so its position is
     * readable in the ruler instead of only as a line across the rows.
     * @param {number} bar
     */
    #markRulerBar(bar) {
        if (bar === this.#prevBar) return
        this.#barHeads[this.#prevBar]?.classList.remove('sa-bar-current')
        this.#barHeads[bar]?.classList.add('sa-bar-current')
        this.#prevBar = bar
    }

    #hidePlayhead() {
        this.#prevPlayheadPx = -1
        this.#markRulerBar(-1)
        if (this.#playheadEl) this.#playheadEl.style.display = 'none'
    }

    /**
     * Left click on the ruler aims the arrangement cursor at that measure;
     * pressing play then starts there. Nothing else in the grid takes a left
     * click — the clips are edited from the right-click menu.
     * @param {MouseEvent} e
     */
    #onGridClick(e) {
        const target = e.target instanceof Element ? e.target : null
        const headEl = /** @type {HTMLElement | null} */ (target?.closest('.sa-bar-head'))
        if (!headEl || !this.#song) return
        const bar = Number(headEl.dataset.bar)
        if (!Number.isInteger(bar) || bar < 0) return
        serviceRegistry.seq?.setSongCursor(bar)
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
            `${label} — bar ${clip.startBar + 1}, ${clip.bars} bar(s)`,
            [
                {
                    label: 'Next',
                    run: () => {
                        serviceRegistry.cmd.repeatPatternAtBar(clip.startBar)
                        this.sync()
                        showToast(`"${label}" repeated at bar ${clip.startBar + clip.bars + 1}`, 'success')
                    },
                },
                {
                    label: 'Delete',
                    run: () => {
                        serviceRegistry.cmd.removeSongClips([index])
                        this.sync()
                        showToast(`Removed "${label}" at bar ${clip.startBar + 1}`, 'success')
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
     * the arrangement loop length, so the bar matches what is playing.
     */
    #playheadBar() {
        return Math.floor(this.#transportBar())
    }

    /** Pattern name: place it in the arrangement, or remove every clip using it. */
    #showRowMenu(nameEl, x, y) {
        const patternId = nameEl.dataset.pattern
        const indices = (this.#song.clips ?? []).map((c, i) => (c.pattern === patternId ? i : -1)).filter((i) => i >= 0)
        const label = this.#patternName(patternId)
        const startBar = this.#playheadBar()
        this.#menu.show(
            `${label} — ${indices.length} clip(s)`,
            [
                {
                    label: `Add at bar ${startBar + 1}`,
                    run: () => {
                        serviceRegistry.cmd.addPatternAtBar(patternId, startBar)
                        this.sync()
                        showToast(`"${label}" added at bar ${startBar + 1}`, 'success')
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
        const startBar = Math.max(0, Math.floor((e.clientX - rect.left) / BAR_WIDTH))
        this.#menu.show(
            `Add "${pattern.name ?? pattern.id}" at bar ${startBar + 1}`,
            [
                {
                    label: 'Add here',
                    run: () => {
                        serviceRegistry.cmd.addPatternAtBar(pattern.id, startBar)
                        this.sync()
                        showToast(`"${pattern.name ?? pattern.id}" added at bar ${startBar + 1}`, 'success')
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
            this.#playheadEl = null
            this.#barHeads = []
            this.#prevBar = -1
            return
        }
        this.#root?.classList.add('sa-has-song')

        const totalBars = Math.max(1, songLengthBars(song))
        const rowCount = this.#rows.length
        const gridWidth = LABEL_WIDTH + totalBars * BAR_WIDTH
        const gridHeight = HEADER_HEIGHT + rowCount * ROW_HEIGHT

        // Ruler: one measure per cell, numbered, running along X. data-bar is
        // both what a click aims the cursor at and what the cursor highlights.
        const ruler = Array.from({ length: totalBars }, (_, bar) => {
            const marked = bar % 4 === 0
            return `<div class="sa-bar-head${marked ? ' sa-bar-major' : ''}" data-bar="${bar}" style="left:${LABEL_WIDTH + bar * BAR_WIDTH}px;width:${BAR_WIDTH}px">${bar + 1}</div>`
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
                // a bar (a 3-beat pattern is 0.75), so it is not rounded to a cell.
                // CLIP_INSET on each side keeps neighbouring clips apart.
                const width = Math.max(4, clip.bars * BAR_WIDTH - CLIP_INSET)
                return (
                    `<div class="sa-clip${clip.bars > 1 ? ' sa-clip-long' : ''}" ` +
                    `style="left:${clip.startBar * BAR_WIDTH}px;top:${index * ROW_HEIGHT + CLIP_INSET / 2}px;` +
                    `width:${width}px;height:${ROW_HEIGHT - 2 * CLIP_INSET}px" ` +
                    `data-pattern="${escapeHtml(clip.pattern)}" ` +
                    `data-index="${clipIdx}" ` +
                    `data-start-bar="${clip.startBar}" ` +
                    `data-bars="${clip.bars}" ` +
                    `title="${escapeHtml(clip.pattern)} — bar ${clip.startBar + 1}, ${clip.bars} bar(s)"></div>`
                )
            })
            .join('')

        this.#listEl.innerHTML =
            `<div class="sa-grid" style="width:${gridWidth}px;height:${gridHeight}px">` +
            `<div class="sa-header" style="width:${gridWidth}px;height:${HEADER_HEIGHT}px">${ruler}</div>` +
            `<div class="sa-body" style="left:${LABEL_WIDTH}px;top:${HEADER_HEIGHT}px;` +
            `width:${totalBars * BAR_WIDTH}px;height:${rowCount * ROW_HEIGHT}px">` +
            rows +
            clips +
            '<div class="sa-playhead" style="display:none"></div>' +
            '</div>' +
            '</div>'

        // innerHTML was just rebuilt, so the references to the old nodes are dead.
        this.#playheadEl = this.#listEl.querySelector('.sa-playhead')
        this.#barHeads = [...this.#listEl.querySelectorAll('.sa-bar-head')]
        this.#prevPlayheadPx = -1
        this.#prevBar = -1
        this.#listEl.dataset.totalBars = String(totalBars)
        this.#listEl.dataset.bpm = String(songBpm(song))
        // A re-render happens with no playhead loop running too (the arrangement
        // was edited while stopped), so the cursor is painted again here.
        this.#paintCursor()
    }

    /** Clip rectangles, as plain data — used by the tests. */
    clipRects() {
        const out = []
        for (const clip of this.#song?.clips ?? []) {
            const row = this.#rowIdx(clip.pattern)
            if (row < 0) continue
            out.push({ pattern: clip.pattern, row, startBar: clip.startBar, bars: clip.bars })
        }
        return out
    }
}
