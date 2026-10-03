// src/ui/pattern_panel/clipboard_section.js
// Step/track clipboard: copy & paste operations triggered by keyboard
// shortcuts (Ctrl+C/V) and by the track/cell context menus.

import { showToast } from '../../core/notify.js'
import { EVENTS } from '../../core/events.js'
import { notesLabel, stepLabel } from './labels.js'

export default class ClipboardSection {
    #editor

    /** Clipboard payload: { type: 'step', notes } | { type: 'track', track } | null */
    clipboard = null

    /** @param {import('../pattern_panel.js').default} editor */
    constructor(editor) {
        this.#editor = editor
    }

    copyStep(tracks) {
        const editor = this.#editor
        const track = tracks[editor.focusRowIdx]
        if (!track) return
        const notes = (track.notes ?? [])
            .filter((n) => n.beat === editor.cursorBeat && n.beatStep === editor.cursorBeatStep)
            .map((n) => ({ ...n }))
        this.clipboard = { type: 'step', notes }
        const at = stepLabel(editor.cursorBeat, editor.cursorBeatStep)
        showToast(
            notes.length > 0
                ? `Copied ${notesLabel(notes.length)} — ${track.name} @ ${at}`
                : `Copied empty step — ${track.name} @ ${at}`,
            'success',
        )
    }

    copyTrack(tracks) {
        const editor = this.#editor
        const idx =
            editor.gridTrackIdx !== -1
                ? editor.gridTrackIdx
                : editor.focusRowIdx !== -1
                  ? editor.focusRowIdx
                  : (editor.appState.selectedTrackIdx ?? -1)
        const track = tracks[idx]
        if (!track) return
        const noteCount = (track.notes ?? []).length
        this.clipboard = { type: 'track', track: structuredClone(track) }
        showToast(`Copied track "${track.name}" (${notesLabel(noteCount)})`, 'success')
    }

    pasteClipboard(pattern, tracks) {
        const editor = this.#editor
        if (!this.clipboard) {
            showToast('Clipboard is empty', 'info')
            return
        }
        if (this.clipboard.type === 'track') {
            this.pasteTrack(pattern, tracks)
            return
        }
        if (editor.focusRowIdx === -1) {
            editor.focusRowIdx = 0
            editor.cursorBeat = 0
            editor.cursorBeatStep = 0
        }
        const track = tracks[editor.focusRowIdx]
        if (!track) return
        const notes = this.clipboard.notes ?? []
        editor.serviceRegistry.cmd.pasteStepNotes(track, editor.cursorBeat, editor.cursorBeatStep, notes)
        editor.updateTrackCellsInPlace(editor.focusRowIdx, track, pattern)
        editor.applySelection()
        editor.playbackEvents.emit(EVENTS.PATTERN_CHANGE, [track])
        const at = stepLabel(editor.cursorBeat, editor.cursorBeatStep)
        showToast(
            notes.length > 0
                ? `Pasted ${notesLabel(notes.length)} — ${track.name} @ ${at}`
                : `Pasted empty step — ${track.name} @ ${at}`,
            'success',
        )
    }

    pasteTrack(pattern, tracks) {
        const editor = this.#editor
        if (!this.clipboard || this.clipboard.type !== 'track') return
        const insertAfter =
            editor.focusRowIdx !== -1
                ? editor.focusRowIdx
                : editor.gridTrackIdx !== -1
                  ? editor.gridTrackIdx
                  : tracks.length - 1
        const clone = editor.serviceRegistry.cmd.pasteTrack(pattern, insertAfter + 1, this.clipboard.track)
        if (!clone) return
        editor.emitStructureChange()
        const noteCount = (clone.notes ?? []).length
        showToast(`Pasted track "${clone.name}" (${notesLabel(noteCount)})`, 'success')
    }
}
