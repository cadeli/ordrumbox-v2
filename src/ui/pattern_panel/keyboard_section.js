// src/ui/pattern_panel/keyboard_section.js
// Keyboard navigation and note editing for the pattern grid:
// cursor movement (arrows), copy/paste shortcuts, Enter/Delete on a cell.

import Utils from '../../core/utils.js'
import { BEATS_PER_PAGE } from '../../core/constants.js'
import { EVENTS } from '../../core/events.js'

export default class KeyboardSection {
    #editor

    /** @param {import('../pattern_panel.js').default} editor */
    constructor(editor) {
        this.#editor = editor
    }

    onFocus() {
        if (this.#editor.cursorTrackIdx === -1) {
            const pattern = this.#editor.appState.patterns[this.#editor.appState.selectedPatternIdx]
            if (!pattern) return
            const tracks = Utils.getTracksArray(pattern)
            if (tracks.length === 0) return
            this.#editor.cursorTrackIdx = 0
            this.#editor.cursorBeat = 0
            this.#editor.cursorBeatStep = 0
            this.#editor.applySelection()
        }
    }

    onKeyDown(e) {
        const pattern = this.#editor.appState.patterns[this.#editor.appState.selectedPatternIdx]
        if (!pattern) return
        const tracks = Utils.getTracksArray(pattern)
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
            else if (this.#editor.cursorTrackIdx !== -1) this.#editor.clipboardSection.copyStep(tracks)
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
            this.#editor.cursorTrackIdx = -1
            this.#editor.selectedNote = null
            this.#editor.selectedTrackIdx = -1
            this.#editor.rangeAnchor = null
            this.#editor.applySelection()
            return
        }

        if (this.#editor.cursorTrackIdx === -1) {
            this.#editor.cursorTrackIdx = 0
            this.#editor.cursorBeat = 0
            this.#editor.cursorBeatStep = 0
        }

        const isArrow = e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown'
        if (isArrow) {
            if (e.shiftKey) this.#editor.selection.ensureRangeAnchor()
            else this.#editor.rangeAnchor = null
        }

        const stepsPerBeat = tracks[this.#editor.cursorTrackIdx]?.stepsPerBeat ?? 4
        const nbBeats = pattern.nbBeats ?? 4

        switch (e.key) {
            case 'ArrowRight':
                e.preventDefault()
                this.#editor.cursorBeatStep++
                if (this.#editor.cursorBeatStep >= stepsPerBeat) {
                    this.#editor.cursorBeatStep = 0
                    this.#editor.cursorBeat++
                    if (this.#editor.cursorBeat >= nbBeats) {
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
                        this.#editor.cursorBeat = nbBeats - 1
                    }
                }
                break
            case 'ArrowUp':
                e.preventDefault()
                if (this.#editor.cursorTrackIdx > 0) this.#editor.cursorTrackIdx--
                break
            case 'ArrowDown':
                e.preventDefault()
                if (this.#editor.cursorTrackIdx < tracks.length - 1) this.#editor.cursorTrackIdx++
                break
            case 'Enter':
                e.preventDefault()
                {
                    const track = tracks[this.#editor.cursorTrackIdx]
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

        const track = tracks[this.#editor.cursorTrackIdx]
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
        this.#editor.selectedTrackIdx = this.#editor.cursorTrackIdx
        this.#editor.applySelection()
        if (note) {
            this.#editor.playbackEvents.emit(EVENTS.NOTE_SELECT, {
                track,
                trackIdx: this.#editor.cursorTrackIdx,
                note,
                pos: this.#editor.cursorBeat * stepsPerBeat + this.#editor.cursorBeatStep,
                beat: this.#editor.cursorBeat,
                beatStep: this.#editor.cursorBeatStep,
            })
            this.#editor.serviceRegistry.seq?.simpleBeep(this.#editor.cursorTrackIdx, note)
        } else {
            this.#editor.playbackEvents.emit(EVENTS.NOTE_SELECT, {
                track,
                trackIdx: this.#editor.cursorTrackIdx,
                note: null,
                beat: this.#editor.cursorBeat,
                beatStep: this.#editor.cursorBeatStep,
            })
        }
    }

    handleNoteEnter(track) {
        if (!track) return
        const pattern = this.#editor.appState.patterns[this.#editor.appState.selectedPatternIdx]
        if (!pattern) return

        const cell = this.#editor.cellMap.get(
            `${this.#editor.cursorTrackIdx}:${this.#editor.cursorBeat}:${this.#editor.cursorBeatStep}`,
        )
        if (cell) {
            const notesAtStep = (track.notes ?? []).filter(
                (n) => n.beat === this.#editor.cursorBeat && n.beatStep === this.#editor.cursorBeatStep,
            )
            if (notesAtStep.length > 0) {
                const note = notesAtStep[0]
                if (
                    this.#editor.selectedNote === note &&
                    this.#editor.selectedTrackIdx === this.#editor.cursorTrackIdx
                ) {
                    this.#editor.serviceRegistry.cmd.deleteNote(track, note)
                    this.#editor.clearSelection()
                    this.#editor.updateTrackCellsInPlace(this.#editor.cursorTrackIdx, track, pattern)
                } else {
                    this.#editor.selectedNote = note
                    this.#editor.selectedTrackIdx = this.#editor.cursorTrackIdx
                    this.#editor.applySelection()
                    const pos = this.#editor.cursorBeat * (track.stepsPerBeat ?? 4) + this.#editor.cursorBeatStep
                    this.#editor.playbackEvents.emit(EVENTS.NOTE_SELECT, {
                        track,
                        trackIdx: this.#editor.cursorTrackIdx,
                        note,
                        pos,
                        beat: this.#editor.cursorBeat,
                        beatStep: this.#editor.cursorBeatStep,
                    })
                    this.#editor.serviceRegistry.seq?.simpleBeep(this.#editor.cursorTrackIdx, note)
                }
            } else {
                const newNote = this.#editor.serviceRegistry.cmd.addNote(
                    track,
                    this.#editor.cursorBeat,
                    this.#editor.cursorBeatStep,
                )
                this.#editor.selectedNote = newNote
                this.#editor.selectedTrackIdx = this.#editor.cursorTrackIdx
                this.#editor.updateTrackCellsInPlace(this.#editor.cursorTrackIdx, track, pattern)
                this.#editor.applySelection()

                const pos = this.#editor.cursorBeat * (track.stepsPerBeat ?? 4) + this.#editor.cursorBeatStep
                this.#editor.playbackEvents.emit(EVENTS.NOTE_SELECT, {
                    track,
                    trackIdx: this.#editor.cursorTrackIdx,
                    note: newNote,
                    pos,
                    beat: this.#editor.cursorBeat,
                    beatStep: this.#editor.cursorBeatStep,
                })
                this.#editor.serviceRegistry.seq?.simpleBeep(this.#editor.cursorTrackIdx, newNote)
            }
        }
    }

    handleNoteDelete(tracks) {
        const track = tracks[this.#editor.cursorTrackIdx]
        if (!track) return
        const pattern = this.#editor.appState.patterns[this.#editor.appState.selectedPatternIdx]
        if (!pattern) return

        const notesAtStep = (track.notes ?? []).filter(
            (n) => n.beat === this.#editor.cursorBeat && n.beatStep === this.#editor.cursorBeatStep,
        )
        if (notesAtStep.length > 0) {
            for (const note of notesAtStep) {
                this.#editor.serviceRegistry.cmd.deleteNote(track, note)
            }
            this.#editor.updateTrackCellsInPlace(this.#editor.cursorTrackIdx, track, pattern)
        }
        this.#editor.clearSelection()
    }
}
