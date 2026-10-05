// src/ui/pattern_panel/keyboard_section.js
// Keyboard navigation and note editing for the pattern grid:
// cursor movement (arrows), copy/paste shortcuts, Enter/Delete on a cell,
// and Shift+Arrow note nudges (velocity up/down, pitch left/right).

import { getTracksArray } from '../../core/tracks.js'
import { BEATS_PER_PAGE } from '../../core/constants.js'
import { EVENTS } from '../../core/events.js'
import { emitNotesChanged } from '../../state/playback_events.js'
import { applyNoteNudge } from '../components/note_nudge.js'

export default class KeyboardSection {
    #editor

    /** @param {import('../pattern_panel.js').default} editor */
    constructor(editor) {
        this.#editor = editor
    }

    onFocus() {
        if (this.#editor.focusRowIdx === -1) {
            const pattern = this.#editor.appState.selectedPattern
            if (!pattern) return
            const tracks = getTracksArray(pattern)
            if (tracks.length === 0) return
            this.#editor.focusRowIdx = 0
            this.#editor.cursorBeat = 0
            this.#editor.cursorBeatStep = 0
            this.#editor.applySelection()
        }
    }

    onKeyDown(e) {
        const pattern = this.#editor.appState.selectedPattern
        if (!pattern) return
        const tracks = getTracksArray(pattern)
        if (tracks.length === 0) return

        const target = e.target
        const isEditable =
            target &&
            (target.tagName === 'TEXTAREA' ||
                target.isContentEditable ||
                (target.tagName === 'INPUT' && /^(text|search|password|email|url|tel)$/i.test(target.type ?? 'text')))
        if (isEditable) return

        const isMod = e.ctrlKey || e.metaKey
        const keyC = e.key === 'c' || e.key === 'C' || e.code === 'KeyC'
        const keyV = e.key === 'v' || e.key === 'V' || e.code === 'KeyV'

        if (isMod && keyC) {
            e.preventDefault()
            if (e.shiftKey) this.#editor.clipboardSection.copyTrack(tracks)
            else if (this.#editor.focusRowIdx !== -1) this.#editor.clipboardSection.copyStep(tracks)
            else this.#editor.clipboardSection.copyTrack(tracks)
            return
        }
        if (isMod && keyV) {
            e.preventDefault()
            if (e.shiftKey) this.#editor.clipboardSection.pasteTrack(pattern, tracks)
            else this.#editor.clipboardSection.pasteClipboard(pattern, tracks)
            return
        }
        if (isMod) return

        if (e.key === 'Escape') {
            e.preventDefault()
            this.#editor.focusRowIdx = -1
            this.#editor.selectedNote = null
            this.#editor.gridTrackIdx = -1
            this.#editor.selectedByPointer = false
            this.#editor.rangeAnchor = null
            this.#editor.applySelection()
            return
        }

        if (this.#editor.focusRowIdx === -1) {
            this.#editor.focusRowIdx = 0
            this.#editor.cursorBeat = 0
            this.#editor.cursorBeatStep = 0
        }

        const isArrow = e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown'
        if (isArrow) {
            // Shift+Arrow has two meanings, told apart by what the cursor is on:
            // a note the mouse picked is nudged (velocity / pitch), anything
            // else keeps extending the range selection for a range delete.
            if (e.shiftKey && this.#nudgeSelectedNote(e.key.slice(5))) {
                e.preventDefault()
                return
            }
            if (e.shiftKey) this.#editor.selection.ensureRangeAnchor()
            else this.#editor.rangeAnchor = null
        }

        const stepsPerBeat = tracks[this.#editor.focusRowIdx]?.stepsPerBeat ?? 4
        const beatCount = pattern.beatCount ?? 4

        switch (e.key) {
            case 'ArrowRight':
                e.preventDefault()
                this.#editor.cursorBeatStep++
                if (this.#editor.cursorBeatStep >= stepsPerBeat) {
                    this.#editor.cursorBeatStep = 0
                    this.#editor.cursorBeat++
                    if (this.#editor.cursorBeat >= beatCount) {
                        this.#editor.cursorBeat = 0
                    }
                }
                break
            case 'ArrowLeft':
                e.preventDefault()
                this.#editor.cursorBeatStep--
                if (this.#editor.cursorBeatStep < 0) {
                    this.#editor.cursorBeatStep = stepsPerBeat - 1
                    this.#editor.cursorBeat--
                    if (this.#editor.cursorBeat < 0) {
                        this.#editor.cursorBeat = beatCount - 1
                    }
                }
                break
            case 'ArrowUp':
                e.preventDefault()
                if (this.#editor.focusRowIdx > 0) this.#editor.focusRowIdx--
                break
            case 'ArrowDown':
                e.preventDefault()
                if (this.#editor.focusRowIdx < tracks.length - 1) this.#editor.focusRowIdx++
                break
            case 'Enter':
                e.preventDefault()
                {
                    const track = tracks[this.#editor.focusRowIdx]
                    if (!track) return
                    this.handleNoteEnter(track)
                    break
                }
            case 'Delete':
            case 'Backspace':
                e.preventDefault()
                if (this.#editor.rangeAnchor) this.#editor.selection.handleRangeDelete(tracks, pattern)
                else this.handleNoteDelete(tracks)
                return
            default:
                return
        }

        const track = tracks[this.#editor.focusRowIdx]
        if (!track) return

        const startBeat = this.#editor.appState.currentPage * BEATS_PER_PAGE
        if (this.#editor.cursorBeat < startBeat || this.#editor.cursorBeat >= startBeat + BEATS_PER_PAGE) {
            this.#editor.serviceRegistry.cmd.setCurrentPage(Math.floor(this.#editor.cursorBeat / BEATS_PER_PAGE))
            this.#editor.sync()
        }

        const note = (track.notes ?? []).find(
            (n) => n.beat === this.#editor.cursorBeat && n.beatStep === this.#editor.cursorBeatStep,
        )
        this.#editor.selectedNote = note ?? null
        // The cursor walked here: this note was not picked, so Shift+Arrow on it
        // is still range selection.
        this.#editor.selectedByPointer = false
        this.#editor.gridTrackIdx = this.#editor.focusRowIdx
        this.#editor.applySelection()
        if (note) {
            this.#editor.playbackEvents.emit(EVENTS.NOTE_SELECT, {
                track,
                trackIdx: this.#editor.focusRowIdx,
                note,
                pos: this.#editor.cursorBeat * stepsPerBeat + this.#editor.cursorBeatStep,
                beat: this.#editor.cursorBeat,
                beatStep: this.#editor.cursorBeatStep,
            })
            this.#editor.serviceRegistry.seq?.simpleBeep(this.#editor.focusRowIdx, note)
        } else {
            this.#editor.playbackEvents.emit(EVENTS.NOTE_SELECT, {
                track,
                trackIdx: this.#editor.focusRowIdx,
                note: null,
                beat: this.#editor.cursorBeat,
                beatStep: this.#editor.cursorBeatStep,
            })
        }
    }

    /**
     * One Shift+Arrow step on the note the pointer picked: Up/Down velocity,
     * Left/Right pitch. No-op (false) when there is nothing picked to edit, or
     * when a range selection is being extended.
     *
     * @param {string} dir - 'Left' | 'Right' | 'Up' | 'Down'
     * @returns {boolean} whether the note was edited
     */
    #nudgeSelectedNote(dir) {
        if (this.#editor.rangeAnchor !== null) return false
        const note = this.#editor.selectedNote
        const trackIdx = this.#editor.gridTrackIdx
        if (!note || !this.#editor.selectedByPointer || trackIdx < 0) return false
        const track = this.#editor.resolveTrack(trackIdx)
        if (!track || !(track.notes ?? []).includes(note)) return false

        const { key, changed, trackPitch, dir: nudgeDir } = applyNoteNudge({
            registry: this.#editor.serviceRegistry,
            track,
            trackIdx,
            note,
            dir,
        })
        if (changed) {
            // Repaint the slice now instead of waiting for the NOTE_CHANGE sync.
            this.#editor.updateTrackCellsInPlace(trackIdx, track, this.#editor.appState.selectedPattern)
            this.#editor.applySelection()
            emitNotesChanged(track)
        }
        this.#editor.gauge.show({ note, trackIdx, trackPitch, label: key, dir: nudgeDir })
        return true
    }

    handleNoteEnter(track) {
        if (!track) return
        const pattern = this.#editor.appState.selectedPattern
        if (!pattern) return

        const cell = this.#editor.cellMap.get(
            `${this.#editor.focusRowIdx}:${this.#editor.cursorBeat}:${this.#editor.cursorBeatStep}`,
        )
        if (cell) {
            const notesAtStep = (track.notes ?? []).filter(
                (n) => n.beat === this.#editor.cursorBeat && n.beatStep === this.#editor.cursorBeatStep,
            )
            if (notesAtStep.length > 0) {
                const note = notesAtStep[0]
                if (this.#editor.selectedNote === note && this.#editor.gridTrackIdx === this.#editor.focusRowIdx) {
                    this.#editor.serviceRegistry.cmd.deleteNote(track, note)
                    this.#editor.clearSelection()
                    this.#editor.updateTrackCellsInPlace(this.#editor.focusRowIdx, track, pattern)
                } else {
                    this.#editor.selectedNote = note
                    this.#editor.gridTrackIdx = this.#editor.focusRowIdx
                    this.#editor.applySelection()
                    const pos = this.#editor.cursorBeat * (track.stepsPerBeat ?? 4) + this.#editor.cursorBeatStep
                    this.#editor.playbackEvents.emit(EVENTS.NOTE_SELECT, {
                        track,
                        trackIdx: this.#editor.focusRowIdx,
                        note,
                        pos,
                        beat: this.#editor.cursorBeat,
                        beatStep: this.#editor.cursorBeatStep,
                    })
                    this.#editor.serviceRegistry.seq?.simpleBeep(this.#editor.focusRowIdx, note)
                }
            } else {
                const newNote = this.#editor.serviceRegistry.cmd.addNote(
                    track,
                    this.#editor.cursorBeat,
                    this.#editor.cursorBeatStep,
                )
                this.#editor.selectedNote = newNote
                this.#editor.gridTrackIdx = this.#editor.focusRowIdx
                this.#editor.updateTrackCellsInPlace(this.#editor.focusRowIdx, track, pattern)
                this.#editor.applySelection()

                const pos = this.#editor.cursorBeat * (track.stepsPerBeat ?? 4) + this.#editor.cursorBeatStep
                this.#editor.playbackEvents.emit(EVENTS.NOTE_SELECT, {
                    track,
                    trackIdx: this.#editor.focusRowIdx,
                    note: newNote,
                    pos,
                    beat: this.#editor.cursorBeat,
                    beatStep: this.#editor.cursorBeatStep,
                })
                this.#editor.serviceRegistry.seq?.simpleBeep(this.#editor.focusRowIdx, newNote)
            }
        }
    }

    handleNoteDelete(tracks) {
        const track = tracks[this.#editor.focusRowIdx]
        if (!track) return
        const pattern = this.#editor.appState.selectedPattern
        if (!pattern) return

        const notesAtStep = (track.notes ?? []).filter(
            (n) => n.beat === this.#editor.cursorBeat && n.beatStep === this.#editor.cursorBeatStep,
        )
        if (notesAtStep.length > 0) {
            for (const note of notesAtStep) {
                this.#editor.serviceRegistry.cmd.deleteNote(track, note)
            }
            this.#editor.updateTrackCellsInPlace(this.#editor.focusRowIdx, track, pattern)
        }
        this.#editor.clearSelection()
    }
}
