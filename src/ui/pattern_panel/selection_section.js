// src/ui/pattern_panel/selection_section.js
// Track/note selection and shift-range selection for the pattern grid.

import Utils from '../../core/utils.js'
import { isMobileViewport } from '../../core/constants.js'
import { EVENTS } from '../../core/events.js'

export default class SelectionSection {
    #editor

    /** @param {import('../pattern_panel.js').default} editor */
    constructor(editor) {
        this.#editor = editor
    }

    selectTrack(trackIdx) {
        const track = this.#editor.resolveTrack(trackIdx)
        if (!track) return
        this.#editor.rangeAnchor = null
        this.#editor.focusRowIdx = trackIdx

        if (this.#editor.gridTrackIdx === trackIdx && !this.#editor.selectedNote) {
            if (isMobileViewport()) {
                this.#editor.playbackEvents.emit(EVENTS.TRACK_SELECT, { track, trackIdx })
            } else {
                this.#editor.clearSelection()
            }
        } else {
            this.#editor.selectedNote = null
            this.#editor.gridTrackIdx = trackIdx
            this.#editor.applySelection()
            this.#editor.playbackEvents.emit(EVENTS.TRACK_SELECT, { track, trackIdx })
            this.#editor.serviceRegistry.seq?.simpleBeep(trackIdx)
        }
    }

    ensureRangeAnchor() {
        if (this.#editor.rangeAnchor) return
        this.#editor.rangeAnchor = {
            trackIdx: this.#editor.focusRowIdx,
            beat: this.#editor.cursorBeat,
            beatStep: this.#editor.cursorBeatStep,
        }
    }

    #fracPos(track, beat, beatStep) {
        const spb = track?.stepsPerBeat ?? 4
        return beat + beatStep / spb
    }

    #getRangeInfo(tracks) {
        if (!this.#editor.rangeAnchor || this.#editor.focusRowIdx === -1) return null
        const a = this.#editor.rangeAnchor
        const tA = tracks[a.trackIdx]
        const tC = tracks[this.#editor.focusRowIdx]
        if (!tA || !tC) return null
        const fracA = this.#fracPos(tA, a.beat, a.beatStep)
        const fracC = this.#fracPos(tC, this.#editor.cursorBeat, this.#editor.cursorBeatStep)
        if (fracA === fracC && a.trackIdx === this.#editor.focusRowIdx) return null
        return {
            trackMin: Math.min(a.trackIdx, this.#editor.focusRowIdx),
            trackMax: Math.max(a.trackIdx, this.#editor.focusRowIdx),
            fracMin: Math.min(fracA, fracC),
            fracMax: Math.max(fracA, fracC),
        }
    }

    #cellInInfoRange(trackIdx, beat, beatStep, track, info) {
        if (trackIdx < info.trackMin || trackIdx > info.trackMax) return false
        const frac = this.#fracPos(track, beat, beatStep)
        const eps = 1e-9
        return frac >= info.fracMin - eps && frac <= info.fracMax + eps
    }

    handleRangeDelete(tracks, pattern) {
        const info = this.#getRangeInfo(tracks)
        this.#editor.rangeAnchor = null
        if (!info) {
            this.#editor.keyboard.handleNoteDelete(tracks)
            return
        }
        for (let t = info.trackMin; t <= info.trackMax; t++) {
            const track = tracks[t]
            if (!track) continue
            const notes = [...(track.notes ?? [])]
            for (const note of notes) {
                if (this.#cellInInfoRange(t, note.beat, note.beatStep, track, info)) {
                    this.#editor.serviceRegistry.cmd.deleteNote(track, note)
                }
            }
            this.#editor.updateTrackCellsInPlace(t, track, pattern)
        }
        this.#editor.selectedNote = null
        this.#editor.gridTrackIdx = this.#editor.focusRowIdx
        this.#editor.applySelection()
    }

    #applyRangeClasses(tracks) {
        const info = this.#getRangeInfo(tracks)
        if (!info) return
        for (const [key, cell] of this.#editor.cellMap) {
            const parts = key.split(':')
            const tIdx = Number(parts[0])
            const beat = Number(parts[1])
            const step = Number(parts[2])
            const track = tracks[tIdx]
            if (!track) continue
            if (this.#cellInInfoRange(tIdx, beat, step, track, info)) cell.classList.add('pp-range')
        }
    }

    clearSelection() {
        this.#editor.selectedNote = null
        this.#editor.gridTrackIdx = -1
        this.#editor.rangeAnchor = null
        const selected = this.#editor.container.querySelectorAll(
            '.pp-cell.selected, .pp-track-name.selected, .pp-track.pp-selected, .pp-note-slice.selected, .pp-cell.pp-range',
        )
        selected.forEach((el) => el.classList.remove('selected', 'pp-selected', 'pp-range'))
        this.#editor.playbackEvents.batch(() => {
            this.#editor.playbackEvents.emit(EVENTS.NOTE_SELECT, null)
            this.#editor.playbackEvents.emit(EVENTS.TRACK_SELECT, null)
        })
    }

    applySelection() {
        const selected = this.#editor.container.querySelectorAll(
            '.pp-cell.selected, .pp-track-name.selected, .pp-cell.cursor, .pp-note-slice.selected, .pp-track.pp-selected, .pp-cell.pp-range',
        )
        selected.forEach((el) => el.classList.remove('selected', 'cursor', 'pp-selected', 'pp-range'))

        const pattern = this.#editor.appState.patterns[this.#editor.appState.selectedPatternIdx]
        const tracks = pattern ? Utils.getTracksArray(pattern) : []
        if (this.#editor.rangeAnchor && tracks.length > 0) this.#applyRangeClasses(tracks)

        const currentTrackIdx = this.#editor.effectiveTrackIdx

        if (this.#editor.gridTrackIdx !== -1) {
            if (this.#editor.selectedNote) {
                const trackIdx = this.#editor.gridTrackIdx
                const beat = this.#editor.selectedNote.beat
                const step = this.#editor.selectedNote.beatStep
                const sel = this.#editor.cellMap.get(`${trackIdx}:${beat}:${step}`)
                if (sel) {
                    sel.classList.add('selected')
                    const slices = sel.querySelectorAll('.pp-note-slice')
                    if (slices.length > 0) {
                        const notes = (
                            this.#editor.appState.patterns[this.#editor.appState.selectedPatternIdx]
                                ? (Utils.getTracksArray(
                                      this.#editor.appState.patterns[this.#editor.appState.selectedPatternIdx],
                                  )?.[trackIdx]?.notes ?? [])
                                : []
                        ).filter((n) => n.beat === beat && n.beatStep === step)
                        const idx = notes.indexOf(this.#editor.selectedNote)
                        if (idx >= 0 && idx < slices.length) slices[idx].classList.add('selected')
                    }
                }
            } else if (this.#editor.focusRowIdx !== -1) {
                const sel = this.#editor.cellMap.get(
                    `${this.#editor.focusRowIdx}:${this.#editor.cursorBeat}:${this.#editor.cursorBeatStep}`,
                )
                if (sel) sel.classList.add('cursor')
                const trackSel = this.#editor.container.querySelector(
                    `.pp-track-name[data-track="${this.#editor.focusRowIdx}"]`,
                )
                if (trackSel) trackSel.classList.add('selected')
            } else {
                const sel = this.#editor.container.querySelector(
                    `.pp-track-name[data-track="${this.#editor.gridTrackIdx}"]`,
                )
                if (sel) sel.classList.add('selected')
            }
        }

        if (currentTrackIdx !== -1) {
            const trackSel = this.#editor.container.querySelector(`.pp-track-name[data-track="${currentTrackIdx}"]`)
            if (trackSel) trackSel.classList.add('selected')
            const trackEl = trackSel?.closest('.pp-track')
            if (trackEl) trackEl.classList.add('pp-selected')
        }
    }
}
