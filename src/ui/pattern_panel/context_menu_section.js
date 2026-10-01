// src/ui/pattern_panel/context_menu_section.js
// Right-click menus for the pattern grid: track menu and cell (notes) menu.

import ContextMenu from '../components/context_menu.js'
import Utils from '../../core/utils.js'
import { showToast } from '../../core/notify.js'
import { EVENTS } from '../../core/events.js'
import { notesLabel } from './labels.js'

export default class ContextMenuSection {
    #editor
    #contextMenu

    /** @param {import('../pattern_panel.js').default} editor */
    constructor(editor) {
        this.#editor = editor
        this.#contextMenu = new ContextMenu()
    }

    onContextMenu(e) {
        const trackEl = e.target.closest('.pp-track:not(.pp-master-track)')
        if (!trackEl) {
            this.#contextMenu.hide()
            return
        }
        const trackNameEl = trackEl.querySelector('.pp-track-name[data-track]')
        const trackIdx = parseInt(trackNameEl?.dataset.track, 10)
        if (isNaN(trackIdx)) return

        const cellEl = e.target.closest('.pp-cell')
        if (cellEl) {
            const beat = parseInt(cellEl.dataset.beat, 10)
            const beatStep = parseInt(cellEl.dataset.step, 10)
            if (!isNaN(beat) && !isNaN(beatStep)) {
                e.preventDefault()
                this.#showCellContextMenu(trackIdx, beat, beatStep, e.clientX, e.clientY)
                return
            }
        }

        e.preventDefault()
        this.#showContextMenu(trackIdx, e.clientX, e.clientY)
    }

    #showCellContextMenu(trackIdx, beat, beatStep, x, y) {
        this.#contextMenu.hide()
        const pattern = this.#editor.appState.patterns[this.#editor.appState.selectedPatternIdx]
        if (!pattern) return
        const tracks = Utils.getTracksArray(pattern)
        const track = tracks[trackIdx]
        if (!track) return

        const canPasteNotes = this.#editor.clipboard?.type === 'step' && (this.#editor.clipboard.notes?.length ?? 0) > 0
        const notesAtStep = (track.notes ?? []).filter((n) => n.beat === beat && n.beatStep === beatStep)
        const header = `${track.name ?? 'Track'} @ ${beat + 1}.${beatStep + 1}`
        const actions = [
            { label: 'Copy notes', run: () => this.#menuCopyNotes(tracks, trackIdx, beat, beatStep) },
            {
                label: 'Paste notes',
                disabled: !canPasteNotes,
                run: () => this.#menuPasteNotes(pattern, tracks, trackIdx, beat, beatStep),
            },
            {
                label: 'Delete note',
                disabled: notesAtStep.length === 0,
                run: () => this.#menuDeleteNote(pattern, tracks, trackIdx, beat, beatStep),
            },
            { label: 'Add rnd note', run: () => this.#menuAddRndNote(pattern, tracks, trackIdx, beat, beatStep) },
        ]
        this.#contextMenu.show(header, actions, x, y)
    }

    #showContextMenu(trackIdx, x, y) {
        this.#contextMenu.hide()
        const pattern = this.#editor.appState.patterns[this.#editor.appState.selectedPatternIdx]
        if (!pattern) return
        const tracks = Utils.getTracksArray(pattern)
        const track = tracks[trackIdx]
        if (!track) return

        const canPasteTrack = this.#editor.clipboard?.type === 'track'
        const actions = [
            { label: 'Copy track', run: () => this.#menuCopyTrack(tracks, trackIdx) },
            {
                label: 'Paste tracks',
                disabled: !canPasteTrack,
                run: () => this.#menuPasteTrack(pattern, tracks, trackIdx),
            },
            { label: 'Duplicate track', run: () => this.#menuDuplicateTrack(pattern, tracks, trackIdx) },
            { label: 'Delete track', run: () => this.#menuDeleteTrack(pattern, tracks, trackIdx) },
            { label: 'Randomize', run: () => this.#menuRandomizeTrack(track, pattern) },
            { label: 'Clear notes', run: () => this.#menuClearTrackNotes(track, pattern, trackIdx) },
        ]
        this.#contextMenu.show(track.name ?? 'Track', actions, x, y)
    }

    #menuCopyTrack(tracks, trackIdx) {
        this.#editor.selectedTrackIdx = trackIdx
        this.#editor.cursorTrackIdx = trackIdx
        this.#editor.clipboardSection.copyTrack(tracks)
    }

    #menuPasteTrack(pattern, tracks, trackIdx) {
        if (!this.#editor.clipboard || this.#editor.clipboard.type !== 'track') {
            showToast('Clipboard does not contain a track', 'info')
            return
        }
        this.#editor.cursorTrackIdx = trackIdx
        this.#editor.clipboardSection.pasteTrack(pattern, tracks)
    }

    #menuDuplicateTrack(pattern, tracks, trackIdx) {
        const source = tracks[trackIdx]
        if (!source) return
        const clone = this.#editor.serviceRegistry.cmd.pasteTrack(pattern, trackIdx + 1, source)
        if (!clone) return
        this.#editor.emitStructureChange()
        showToast(`Duplicated track as "${clone.name}"`, 'success')
    }

    #menuDeleteTrack(pattern, tracks, trackIdx) {
        if (tracks.length <= 1) {
            showToast('Cannot delete the last track', 'warning')
            return
        }
        this.#editor.serviceRegistry.cmd.removeTrack(pattern, trackIdx)
        this.#editor.selectedTrackIdx = -1
        this.#editor.rangeAnchor = null
        if (this.#editor.cursorTrackIdx === trackIdx) this.#editor.cursorTrackIdx = -1
        else if (this.#editor.cursorTrackIdx > trackIdx) this.#editor.cursorTrackIdx--
        this.#editor.emitStructureChange()
        showToast('Track deleted', 'success')
    }

    #menuRandomizeTrack(track, pattern) {
        this.#editor.serviceRegistry.cmd.randomizeTrack(track, pattern)
        this.#editor.serviceRegistry.audioEngine?.invalidateCache()
        this.#editor.markTrackDataDirty()
        this.#editor.playbackEvents.batch(() => {
            this.#editor.playbackEvents.emit(EVENTS.NOTE_CHANGE)
            this.#editor.playbackEvents.emit(EVENTS.PATTERN_CHANGE)
        })
        this.#editor.requestSync()
        showToast(`Randomized "${track.name}"`, 'success')
    }

    #menuClearTrackNotes(track, pattern, trackIdx) {
        this.#editor.serviceRegistry.cmd.cleanTrack(track)
        this.#editor.updateTrackCellsInPlace(trackIdx, track, pattern)
        this.#editor.playbackEvents.batch(() => {
            this.#editor.playbackEvents.emit(EVENTS.NOTE_CHANGE)
            this.#editor.playbackEvents.emit(EVENTS.PATTERN_CHANGE)
        })
        showToast(`Cleared notes on "${track.name}"`, 'success')
    }

    #menuCopyNotes(tracks, trackIdx, beat, beatStep) {
        const track = tracks[trackIdx]
        if (!track) return
        const notes = (track.notes ?? [])
            .filter((n) => n.beat === beat && n.beatStep === beatStep)
            .map((n) => ({ ...n }))
        this.#editor.clipboard = { type: 'step', notes }
        this.#editor.cursorTrackIdx = trackIdx
        this.#editor.cursorBeat = beat
        this.#editor.cursorBeatStep = beatStep
        const stepLabel = `beat ${beat + 1}.${beatStep + 1}`
        showToast(
            notes.length > 0
                ? `Copied ${notesLabel(notes.length)} — ${track.name} @ ${stepLabel}`
                : `Copied empty step — ${track.name} @ ${stepLabel}`,
            'success',
        )
    }

    #menuPasteNotes(pattern, tracks, trackIdx, beat, beatStep) {
        if (
            !this.#editor.clipboard ||
            this.#editor.clipboard.type !== 'step' ||
            (this.#editor.clipboard.notes?.length ?? 0) === 0
        ) {
            showToast('Clipboard has no notes', 'info')
            return
        }
        const track = tracks[trackIdx]
        if (!track) return
        const notes = this.#editor.clipboard.notes
        this.#editor.serviceRegistry.cmd.pasteStepNotes(track, beat, beatStep, notes)
        this.#editor.cursorTrackIdx = trackIdx
        this.#editor.cursorBeat = beat
        this.#editor.cursorBeatStep = beatStep
        this.#editor.updateTrackCellsInPlace(trackIdx, track, pattern)
        this.#editor.applySelection()
        this.#editor.playbackEvents.emit(EVENTS.PATTERN_CHANGE, [track])
        const stepLabel = `beat ${beat + 1}.${beatStep + 1}`
        showToast(`Pasted ${notesLabel(notes.length)} — ${track.name} @ ${stepLabel}`, 'success')
    }

    #menuDeleteNote(pattern, tracks, trackIdx, beat, beatStep) {
        const track = tracks[trackIdx]
        if (!track) return
        const notes = (track.notes ?? []).filter((n) => n.beat === beat && n.beatStep === beatStep)
        if (notes.length === 0) {
            showToast('No note to delete', 'info')
            return
        }
        for (const note of [...notes]) {
            this.#editor.serviceRegistry.cmd.deleteNote(track, note)
        }
        this.#editor.cursorTrackIdx = trackIdx
        this.#editor.cursorBeat = beat
        this.#editor.cursorBeatStep = beatStep
        if (this.#editor.selectedNote && notes.includes(this.#editor.selectedNote)) {
            this.#editor.selectedNote = null
            this.#editor.selectedTrackIdx = -1
        }
        this.#editor.updateTrackCellsInPlace(trackIdx, track, pattern)
        this.#editor.applySelection()
        this.#editor.playbackEvents.batch(() => {
            this.#editor.playbackEvents.emit(EVENTS.NOTE_CHANGE)
            this.#editor.playbackEvents.emit(EVENTS.PATTERN_CHANGE, [track])
        })
        const stepLabel = `beat ${beat + 1}.${beatStep + 1}`
        showToast(`Deleted ${notesLabel(notes.length)} — ${track.name} @ ${stepLabel}`, 'success')
    }

    #menuAddRndNote(pattern, tracks, trackIdx, beat, beatStep) {
        const track = tracks[trackIdx]
        if (!track) return
        const range = Math.max(1, track.pitch_range ?? 12)
        const pitch = Math.floor(Math.random() * (range * 2 + 1)) - range
        const note = this.#editor.serviceRegistry.cmd.addNote(track, beat, beatStep, pitch)
        this.#editor.cursorTrackIdx = trackIdx
        this.#editor.cursorBeat = beat
        this.#editor.cursorBeatStep = beatStep
        this.#editor.selectedNote = note ?? null
        this.#editor.selectedTrackIdx = trackIdx
        this.#editor.updateTrackCellsInPlace(trackIdx, track, pattern)
        this.#editor.applySelection()
        this.#editor.playbackEvents.batch(() => {
            this.#editor.playbackEvents.emit(EVENTS.NOTE_CHANGE)
            this.#editor.playbackEvents.emit(EVENTS.PATTERN_CHANGE, [track])
        })
        this.#editor.serviceRegistry.seq?.simpleBeep(trackIdx, note)
        showToast(`Added note (pitch ${pitch}) — ${track.name} @ beat ${beat + 1}.${beatStep + 1}`, 'success')
    }

    destroy() {
        this.#contextMenu.hide()
    }
}
