// src/ui/pattern_panel/pointer_section.js
// Mouse interactions on the grid: click routing, volume sliders, hover tooltip.

import Utils from '../../core/utils.js'
import { EVENTS } from '../../core/events.js'
import { formatNoteTooltip } from '../components/ui_utils.js'

export default class PointerSection {
    #editor
    #tooltip = null

    /** @param {import('../pattern_panel.js').default} editor */
    constructor(editor) {
        this.#editor = editor
    }

    #ensureTooltip() {
        if (!this.#tooltip || !this.#editor.container.contains(this.#tooltip)) {
            if (this.#tooltip) this.#tooltip.remove()
            this.#tooltip = document.createElement('div')
            this.#tooltip.className = 'pp-tooltip'
            this.#tooltip.style.display = 'none'
            this.#editor.container.appendChild(this.#tooltip)
        }
    }

    onMouseOver(e) {
        const cell = e.target.closest('.pp-cell.filled')
        if (!cell) return
        const trackIdx = parseInt(cell.dataset.track, 10)
        const beat = parseInt(cell.dataset.beat, 10)
        const beatStep = parseInt(cell.dataset.step, 10)
        if (isNaN(trackIdx) || isNaN(beat) || isNaN(beatStep)) return

        const resolved = this.#resolveNotesAtStep(trackIdx, beat, beatStep)
        if (!resolved) return
        const { track, notesAtStep } = resolved
        if (notesAtStep.length === 0) return

        const sliceEl = e.target.closest('.pp-note-slice')
        const voiceIdx = sliceEl ? parseInt(sliceEl.dataset.voiceIdx, 10) : 0
        const note = notesAtStep[Math.min(voiceIdx, notesAtStep.length - 1)]

        const trackPitch = track.pitch ?? 0

        this.#ensureTooltip()
        this.#tooltip.textContent = formatNoteTooltip(note, trackPitch)
        this.#tooltip.style.display = 'block'

        const rect = (sliceEl ?? cell).getBoundingClientRect()
        const containerRect = this.#editor.container.getBoundingClientRect()
        this.#tooltip.style.left = `${rect.left - containerRect.left + rect.width / 2 - this.#tooltip.offsetWidth / 2}px`
        this.#tooltip.style.top = `${rect.top - containerRect.top - this.#tooltip.offsetHeight - 4}px`
    }

    onMouseOut(e) {
        const cell = e.target.closest('.pp-cell.filled')
        if (!cell) return
        if (this.#tooltip) this.#tooltip.style.display = 'none'
    }

    #resolveNotesAtStep(trackIdx, beat, beatStep) {
        const pattern = this.#editor.appState.patterns[this.#editor.appState.selectedPatternIdx]
        if (!pattern) return null
        const tracks = Utils.getTracksArray(pattern)
        const track = tracks[trackIdx]
        if (!track) return null
        const notesAtStep = Utils.notesAtStep(track, beat, beatStep)
        return { track, notesAtStep, pattern }
    }

    #toggleTrackProp(idx, prop) {
        const track = this.#editor.resolveTrack(idx)
        if (!track) return
        const newVal = track[prop] !== true
        this.#editor.serviceRegistry.cmd?.updateTrack(
            track,
            { [prop]: newVal },
            {
                desc: `${prop} on ${track.name}`,
            },
        )

        const trackEl = this.#editor.container
            .querySelector(`.pp-track-name[data-track="${idx}"]`)
            ?.closest('.pp-track')
        if (trackEl) {
            if (prop === 'mute') {
                trackEl.classList.toggle('pp-muted', newVal)
                const divider = trackEl.querySelector('.pp-divider')
                divider?.classList.toggle('muted', newVal)
            } else if (prop === 'solo') {
                const solo = trackEl.querySelector('.pp-solo')
                solo?.classList.toggle('active', newVal)
            }
        }
        this.#editor.playbackEvents.batch(() => {
            this.#editor.playbackEvents.emit(EVENTS.TRACK_PARAM_CHANGE, track)
            this.#editor.playbackEvents.emit(EVENTS.PATTERN_CHANGE)
        })
    }

    onClick(e) {
        this.#editor.rangeAnchor = null

        const actionBtn = e.target.closest('.pp-action-btn')
        if (actionBtn) {
            this.#editor.actions.run(actionBtn.dataset.ppAction)
            return
        }

        const masterTrackEl = e.target.closest('.pp-master-track')
        if (masterTrackEl) {
            this.#editor.playbackEvents.emit(EVENTS.MASTER_TOGGLE, true)
            return
        }

        const trackEl = e.target.closest('.pp-track')
        if (
            trackEl &&
            !e.target.closest('.pp-track-name') &&
            !e.target.closest('.pp-divider') &&
            !e.target.closest('.pp-solo') &&
            !e.target.closest('.pp-cell') &&
            !e.target.closest('.pp-volume')
        ) {
            const trackIdx = parseInt(trackEl.querySelector('.pp-track-name')?.dataset.track, 10)
            if (isNaN(trackIdx)) return
            this.#editor.selection.selectTrack(trackIdx)
            return
        }

        const trackNameEl = e.target.closest('.pp-track-name')
        if (trackNameEl) {
            const trackIdx = parseInt(trackNameEl.dataset.track, 10)
            if (isNaN(trackIdx)) return
            this.#editor.selection.selectTrack(trackIdx)
            return
        }

        const dividerEl = e.target.closest('.pp-divider')
        if (dividerEl) {
            const trackIdx = parseInt(dividerEl.dataset.track, 10)
            if (isNaN(trackIdx)) return
            this.#toggleTrackProp(trackIdx, 'mute')
            return
        }

        const soloEl = e.target.closest('.pp-solo')
        if (soloEl) {
            const trackIdx = parseInt(soloEl.dataset.track, 10)
            if (isNaN(trackIdx)) return
            this.#toggleTrackProp(trackIdx, 'solo')
            return
        }

        if (e.target.closest('#pp-add-track')) {
            const pattern = this.#editor.appState.patterns[this.#editor.appState.selectedPatternIdx]
            if (!pattern) return
            const trackNum = Utils.getTracksArray(pattern).length + 1
            this.#editor.serviceRegistry.cmd?.addTrack(pattern, `T${trackNum}`)
            this.#editor.emitStructureChange()
            return
        }

        if (e.target.closest('#pp-delete-track')) {
            const pattern = this.#editor.appState.patterns[this.#editor.appState.selectedPatternIdx]
            if (!pattern) return
            const tracks = Utils.getTracksArray(pattern)
            if (tracks.length <= 1) return
            const trackIdx = this.#editor.effectiveTrackIdx
            if (trackIdx < 0 || trackIdx >= tracks.length) return
            this.#editor.serviceRegistry.cmd?.removeTrack(pattern, trackIdx)
            this.#editor.gridTrackIdx = -1
            this.#editor.emitStructureChange()
            return
        }

        const cell = e.target.closest('.pp-cell')
        if (!cell) return
        const trackIdx = parseInt(cell.dataset.track, 10)
        const beat = parseInt(cell.dataset.beat, 10)
        const beatStep = parseInt(cell.dataset.step, 10)
        if (isNaN(trackIdx) || isNaN(beat) || isNaN(beatStep)) return

        this.#editor.focusRowIdx = trackIdx
        this.#editor.cursorBeat = beat
        this.#editor.cursorBeatStep = beatStep

        const resolved = this.#resolveNotesAtStep(trackIdx, beat, beatStep)
        if (!resolved) return
        const { track, notesAtStep, pattern } = resolved

        if (notesAtStep.length > 0) {
            const sliceEl = e.target.closest('.pp-note-slice')
            const voiceIdx = sliceEl ? parseInt(sliceEl.dataset.voiceIdx, 10) : 0
            const note = notesAtStep[Math.min(voiceIdx, notesAtStep.length - 1)]

            if (this.#editor.selectedNote === note && this.#editor.gridTrackIdx === trackIdx) {
                this.#editor.serviceRegistry.cmd.deleteNote(track, note)
                this.#editor.clearSelection()
                this.#editor.updateTrackCellsInPlace(trackIdx, track, pattern)
            } else {
                this.#editor.selectedNote = note
                this.#editor.gridTrackIdx = trackIdx
                this.#editor.applySelection()
                const pos = Utils.getNoteAbsoluteStep({ beat, beatStep }, track.stepsPerBeat ?? 4)
                this.#editor.playbackEvents.batch(() => {
                    this.#editor.playbackEvents.emit(EVENTS.TRACK_SELECT, { track, trackIdx })
                    this.#editor.playbackEvents.emit(EVENTS.NOTE_SELECT, { track, trackIdx, note, pos, beat, beatStep })
                })
                this.#editor.serviceRegistry.seq?.simpleBeep(trackIdx, note)
            }
            return
        }

        const newNote = this.#editor.serviceRegistry.cmd.addNote(track, beat, beatStep)
        this.#editor.selectedNote = newNote
        this.#editor.gridTrackIdx = trackIdx
        this.#editor.updateTrackCellsInPlace(trackIdx, track, pattern)
        this.#editor.applySelection()

        const pos = Utils.getNoteAbsoluteStep({ beat, beatStep }, track.stepsPerBeat ?? 4)
        this.#editor.playbackEvents.batch(() => {
            this.#editor.playbackEvents.emit(EVENTS.TRACK_SELECT, { track, trackIdx })
            this.#editor.playbackEvents.emit(EVENTS.NOTE_SELECT, {
                track,
                trackIdx,
                note: newNote,
                pos,
                beat,
                beatStep,
            })
        })

        this.#editor.serviceRegistry.seq?.simpleBeep(trackIdx, newNote)
    }

    onInput(e) {
        const volSlider = e.target.closest('.pp-volume')
        if (volSlider) {
            const trackIdx = parseInt(volSlider.dataset.track, 10)
            if (isNaN(trackIdx)) return
            const pattern = this.#editor.appState.patterns[this.#editor.appState.selectedPatternIdx]
            const tracks = Utils.getTracksArray(pattern)
            const track = tracks[trackIdx]
            if (!track) return
            track.velocity = parseFloat(volSlider.value)
            this.#editor.serviceRegistry.audioEngine?.syncTrack(track)
        }
        const masterSlider = e.target.closest('.pp-master-volume')
        if (masterSlider) {
            const value = parseFloat(masterSlider.value)
            this.#editor.serviceRegistry.audioEngine?.mixer?.setMasterBus({ master: value })
        }
    }
}
