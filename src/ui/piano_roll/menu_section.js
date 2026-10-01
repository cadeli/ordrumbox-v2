// src/ui/piano_roll/menu_section.js
// Right-click menus of the piano roll: keyboard menu, grid menu and note actions.

import { appState } from '../../state/app_state.js'
import { serviceRegistry } from '../../state/service_registry.js'
import { playbackEvents } from '../../state/playback_events.js'
import { EVENTS } from '../../core/events.js'
import { showToast } from '../../core/notify.js'
import ContextMenu from '../components/context_menu.js'
import { getSequence, buildSequenceNotes } from '../../logic/composition.js'
import { MIDDLE_C, MIDI_MIN, midiName } from './constants.js'
import { pointToCell, findNoteAt } from './hit_test.js'

export default class MenuSection {
    #editor
    #contextMenu = new ContextMenu()
    #sequenceIdx = 0

    /** @param {import('../piano_roll_panel.js').default} editor */
    constructor(editor) {
        this.#editor = editor
    }

    onContextMenu(e) {
        const track = this.#editor.track
        const cmd = serviceRegistry.cmd
        if (!track || !cmd) return

        const keyEl = e.target.closest('.pp-pr-key')
        if (keyEl) {
            e.preventDefault()
            const midi = parseInt(keyEl.dataset.midi, 10)
            const relativePitch = Number.isFinite(midi) ? midi - MIDDLE_C - (track.pitch ?? 0) : 0
            this.#showKeyboardContextMenu(relativePitch, midiName(midi), e.clientX, e.clientY)
            return
        }

        const gridEl = e.target.closest('#pp-piano-grid')
        if (!gridEl) {
            this.#contextMenu.hide()
            return
        }
        e.preventDefault()

        const cell = pointToCell(e, gridEl, this.#editor.cellWidth, this.#editor.pageInfo())
        if (!cell) return
        const { beat, beatStep, row } = cell
        const clickedMidi = MIDI_MIN + row
        const relativePitch = clickedMidi - MIDDLE_C - (track.pitch ?? 0)
        const hit = findNoteAt(track, beat, beatStep, clickedMidi)

        this.#showGridContextMenu({ beat, beatStep, relativePitch, hit }, e.clientX, e.clientY)
    }

    #showKeyboardContextMenu(tonic, keyLabel, x, y) {
        this.#contextMenu.hide()
        const track = this.#editor.track
        if (!track) return
        const sequence = getSequence(this.#sequenceIdx)
        const header = `${track.name ?? 'Track'} — ${keyLabel} ${sequence?.name ?? ''}`.trim()
        const actions = [
            { label: 'Clear all', run: () => this.#menuClearAll() },
            { label: 'Add sequence', run: () => this.#menuAddSequence(tonic) },
        ]
        this.#contextMenu.show(header, actions, x, y)
    }

    #showGridContextMenu(ctx, x, y) {
        this.#contextMenu.hide()
        const track = this.#editor.track
        if (!track) return
        const { beat, beatStep, relativePitch, hit } = ctx
        const header = `${track.name ?? 'Track'} @ ${beat + 1}.${beatStep + 1}`
        const actions = [
            {
                label: 'Add note',
                disabled: Boolean(hit),
                run: () => this.#menuAddNote(beat, beatStep, relativePitch),
            },
            {
                label: 'Delete note',
                disabled: !hit,
                run: () => this.#menuDeleteNote(hit, beat, beatStep),
            },
            {
                label: 'Add minor chord',
                run: () => this.#menuAddChord(beat, beatStep, relativePitch, [0, 3, 7], 'minor'),
            },
            {
                label: 'Add major chord',
                run: () => this.#menuAddChord(beat, beatStep, relativePitch, [0, 4, 7], 'major'),
            },
        ]
        this.#contextMenu.show(header, actions, x, y)
    }

    #menuAddNote(beat, beatStep, relativePitch) {
        const track = this.#editor.track
        const cmd = serviceRegistry.cmd
        if (!track || !cmd) return
        const newNote = cmd.addNote(track, beat, beatStep, relativePitch)
        this.#editor.selectedNote = newNote
        this.#editor.cursorStep = beat * (track.stepsPerBeat ?? 4) + beatStep
        this.#editor.cursorRow = MIDDLE_C + (track.pitch ?? 0) + relativePitch - MIDI_MIN
        this.#editor.applySelection()
        playbackEvents.batch(() => {
            playbackEvents.emit(EVENTS.NOTE_CHANGE, [track])
            playbackEvents.emit(EVENTS.PATTERN_CHANGE, [track])
            playbackEvents.emit(EVENTS.TRACK_SELECT, { track, trackIdx: this.#editor.trackIdx })
            playbackEvents.emit(EVENTS.NOTE_SELECT, {
                track,
                trackIdx: this.#editor.trackIdx,
                note: newNote,
                beat,
                beatStep,
            })
        })
        serviceRegistry.seq?.simpleBeep(this.#editor.trackIdx, newNote)
        showToast(`Added note (pitch ${relativePitch}) — ${track.name} @ beat ${beat + 1}.${beatStep + 1}`, 'success')
    }

    #menuDeleteNote(hit, beat, beatStep) {
        const track = this.#editor.track
        const cmd = serviceRegistry.cmd
        if (!track || !cmd || !hit) return
        cmd.deleteNote(track, hit)
        if (this.#editor.selectedNote === hit) this.#editor.clearSelection()
        else this.#editor.applySelection()
        playbackEvents.batch(() => {
            playbackEvents.emit(EVENTS.NOTE_CHANGE, [track])
            playbackEvents.emit(EVENTS.PATTERN_CHANGE, [track])
        })
        showToast(`Deleted note — ${track.name} @ beat ${beat + 1}.${beatStep + 1}`, 'success')
    }

    #menuAddChord(beat, beatStep, rootPitch, intervals, quality) {
        const track = this.#editor.track
        const cmd = serviceRegistry.cmd
        if (!track || !cmd) return
        const existing = new Set(
            (track.notes ?? []).filter((n) => n.beat === beat && n.beatStep === beatStep).map((n) => n.pitch ?? 0),
        )
        const added = []
        for (const interval of intervals) {
            const pitch = rootPitch + interval
            if (existing.has(pitch)) continue
            added.push(cmd.addNote(track, beat, beatStep, pitch))
        }
        if (added.length === 0) {
            showToast('Chord already present', 'info')
            return
        }
        this.#editor.selectedNote = added[0]
        this.#editor.cursorStep = beat * (track.stepsPerBeat ?? 4) + beatStep
        this.#editor.cursorRow = MIDDLE_C + (track.pitch ?? 0) + rootPitch - MIDI_MIN
        this.#editor.applySelection()
        playbackEvents.batch(() => {
            playbackEvents.emit(EVENTS.NOTE_CHANGE, [track])
            playbackEvents.emit(EVENTS.PATTERN_CHANGE, [track])
            playbackEvents.emit(EVENTS.TRACK_SELECT, { track, trackIdx: this.#editor.trackIdx })
            playbackEvents.emit(EVENTS.NOTE_SELECT, {
                track,
                trackIdx: this.#editor.trackIdx,
                note: this.#editor.selectedNote,
                beat,
                beatStep,
            })
        })
        showToast(
            `Added ${quality} chord (${added.length} note${added.length === 1 ? '' : 's'}) — ${track.name} @ beat ${beat + 1}.${beatStep + 1}`,
            'success',
        )
    }

    #menuClearAll() {
        const track = this.#editor.track
        const cmd = serviceRegistry.cmd
        if (!track || !cmd) return
        const count = (track.notes ?? []).length
        if (count === 0) {
            showToast('No notes to clear', 'info')
            return
        }
        cmd.cleanTrack(track)
        this.#editor.clearSelection()
        playbackEvents.batch(() => {
            playbackEvents.emit(EVENTS.NOTE_CHANGE, [track])
            playbackEvents.emit(EVENTS.PATTERN_CHANGE, [track])
        })
        showToast(`Cleared notes on "${track.name}"`, 'success')
    }

    #menuAddSequence(tonic) {
        const track = this.#editor.track
        const cmd = serviceRegistry.cmd
        const pattern = appState.patterns[appState.selectedPatternIdx]
        if (!track || !cmd || !pattern) return

        const sequence = getSequence(this.#sequenceIdx)
        if (!sequence) return
        const beatCount = pattern.nbBeats ?? track.nbBeats ?? 4
        const planned = buildSequenceNotes(sequence, tonic, beatCount)
        if (planned.length === 0) return

        const hadNotes = (track.notes ?? []).length > 0
        if (hadNotes) cmd.cleanTrack(track)

        let addedCount = 0
        let firstNote = null
        for (const { beat, beatStep, pitch } of planned) {
            const note = cmd.addNote(track, beat, beatStep, pitch)
            if (!firstNote) firstNote = note
            addedCount++
        }

        this.#sequenceIdx++
        if (addedCount === 0) return

        this.#editor.selectedNote = firstNote
        this.#editor.cursorStep = 0
        this.#editor.cursorRow = MIDDLE_C + (track.pitch ?? 0) + tonic - MIDI_MIN
        this.#editor.applySelection()
        playbackEvents.batch(() => {
            playbackEvents.emit(EVENTS.NOTE_CHANGE, [track])
            playbackEvents.emit(EVENTS.PATTERN_CHANGE, [track])
            playbackEvents.emit(EVENTS.TRACK_SELECT, { track, trackIdx: this.#editor.trackIdx })
            if (firstNote) {
                playbackEvents.emit(EVENTS.NOTE_SELECT, {
                    track,
                    trackIdx: this.#editor.trackIdx,
                    note: firstNote,
                    beat: firstNote.beat,
                    beatStep: firstNote.beatStep ?? 0,
                })
            }
        })
        showToast(
            `Replaced with sequence "${sequence.name}" (${addedCount} note${addedCount === 1 ? '' : 's'}, 1 chord/measure) — ${track.name}`,
            'success',
        )
    }

    hide() {
        this.#contextMenu.hide()
    }
}
