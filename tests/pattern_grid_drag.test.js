/**
 * @vitest-environment jsdom
 *
 * Drag editing in the pattern grid: up/down is the note velocity, left/right is
 * its pitch (which the grid cannot show — the gauge bubble is the readout), and
 * the click the browser sends at the end of a drag must not delete the note.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import PatternPanel from '../src/ui/pattern_panel.js'
import { appState } from '../src/state/app_state.js'
import { serviceRegistry } from '../src/state/service_registry.js'
import { resetNotePreviewThrottle } from '../src/ui/components/note_preview.js'

describe('Pattern grid note drag', () => {
    let panel

    beforeEach(() => {
        appState.reset()
        appState.patterns = [
            {
                name: 'Drag',
                beatCount: 2,
                bpm: 120,
                tracks: [
                    {
                        name: 'KICK',
                        beatCount: 2,
                        stepsPerBeat: 4,
                        pitch: 0,
                        notes: [
                            { beat: 0, beatStep: 0, pitch: 0, velocity: 0.8 },
                            { beat: 0, beatStep: 2, pitch: 3, velocity: 0.5 },
                        ],
                    },
                ],
            },
        ]
        appState.selectedPatternIdx = 0
        appState.selectedTrackIdx = 0
        appState.currentPage = 0

        serviceRegistry.transport = { isRunning: false, tick: 0 }
        serviceRegistry.seq = { simpleBeep: vi.fn() }
        resetNotePreviewThrottle()
        serviceRegistry.cmd = {
            addNote: vi.fn(),
            deleteNote: vi.fn((track, note) => {
                const i = track.notes.indexOf(note)
                if (i >= 0) track.notes.splice(i, 1)
            }),
            updateNote: vi.fn((track, note, updates) => Object.assign(note, updates)),
            updateTrack: vi.fn(),
        }

        document.body.innerHTML = ''
        panel = new PatternPanel()
        panel.init()
        panel.sync()
    })

    function track() {
        return appState.patterns[0].tracks[0]
    }

    function cell(beat = 0, step = 0) {
        return panel.container.querySelector(`.pp-cell[data-track="0"][data-beat="${beat}"][data-step="${step}"]`)
    }

    function slice(beat = 0, step = 0, voiceIdx = 0) {
        return cell(beat, step).querySelector(`.pp-note-slice[data-voice-idx="${voiceIdx}"]`)
    }

    function gauge() {
        return panel.container.querySelector('.pp-tooltip-gauge')
    }

    /** The hover bubble (.pp-tooltip without the gauge modifier). */
    function hoverTooltip() {
        return panel.container.querySelector('.pp-tooltip:not(.pp-tooltip-gauge)')
    }

    function gaugeArc() {
        return panel.container.querySelector('.pp-gauge-arc')
    }

    /** Arc sweep in degrees, 0..270 (a knob clone). */
    function arcDeg() {
        return parseFloat(gaugeArc().style.getPropertyValue('--arc-deg'))
    }

    /** Presses a cell's slice, drags by (dx, dy) px, then sends the trailing click. */
    function drag(target, dx, dy, { click = true } = {}) {
        const start = { x: 200, y: 200 }
        target.dispatchEvent(
            new MouseEvent('mousedown', {
                button: 0,
                clientX: start.x,
                clientY: start.y,
                bubbles: true,
                cancelable: true,
            }),
        )
        window.dispatchEvent(
            new MouseEvent('mousemove', {
                clientX: start.x + dx,
                clientY: start.y + dy,
                bubbles: true,
                cancelable: true,
            }),
        )
        window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
        if (click) target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    }

    it('dragging up raises the velocity of the note under the pointer', () => {
        const note = track().notes[0]
        drag(slice(), 0, -40)
        expect(note.velocity).toBe(1)
        expect(Number(slice().style.opacity)).toBeCloseTo(0.25 + 0.75, 2)
    })

    it('dragging down lowers the velocity', () => {
        const note = track().notes[0]
        drag(slice(), 0, 40)
        expect(note.velocity).toBe(0.6)
    })

    it('dragging right transposes up, dragging left down', () => {
        const note = track().notes[1]
        drag(slice(0, 2), 24, 0)
        expect(note.pitch).toBe(5)
        drag(slice(0, 2), -12, 0)
        expect(note.pitch).toBe(4)
    })

    it('locks the axis so a diagonal edits one parameter only', () => {
        const note = track().notes[0]
        drag(slice(), 30, -60) // vertical dominates
        expect(note.velocity).toBeGreaterThan(0.8)
        expect(note.pitch).toBe(0)

        drag(slice(), 60, -30) // horizontal dominates, 60px = 5 semitones
        expect(note.pitch).toBe(5)
        expect(note.velocity).toBeGreaterThan(0.8)
    })

    it('ignores a press that does not move', () => {
        const note = track().notes[0]
        drag(slice(), 1, -1)
        expect(note.velocity).toBe(0.8)
        expect(serviceRegistry.cmd.updateNote).not.toHaveBeenCalled()
    })

    it('starts nothing on an empty cell', () => {
        drag(cell(1, 0), 0, -40)
        expect(serviceRegistry.cmd.updateNote).not.toHaveBeenCalled()
    })

    it('edits the voice under the pointer in a multi-note cell', () => {
        const [, second] = track().notes
        const extra = { beat: 0, beatStep: 2, pitch: 7, velocity: 0.5 }
        track().notes.push(extra)
        panel.sync()

        drag(slice(0, 2, 1), 24, 0)
        expect(extra.pitch).toBe(9)
        expect(second.pitch).toBe(3)
    })

    it('shows the gauge while dragging, with the edited value', () => {
        drag(slice(), 0, -40)
        expect(gauge().textContent).toBe('C4  MIDI 60\nvel:1 ▲')
        expect(gauge().style.display).toBe('block')
    })

    it('shows the new pitch in the gauge', () => {
        drag(slice(0, 2), 24, 0)
        expect(gauge().textContent).toBe('F4  MIDI 65\npitch:+5 ▲')
    })

    it('previews the note while dragging, so the edit is audible', () => {
        const note = track().notes[0]
        resetNotePreviewThrottle()
        drag(slice(), 0, -40, { click: false }) // the trailing click previews too
        expect(serviceRegistry.seq.simpleBeep).toHaveBeenCalledWith(0, note)
    })

    it('does not preview when the press did not move', () => {
        drag(slice(), 1, -1, { click: false })
        expect(serviceRegistry.seq.simpleBeep).not.toHaveBeenCalled()
    })

    it('does not delete the note the drag ended on', () => {
        drag(slice(), 0, -40)
        expect(track().notes).toHaveLength(2)
        expect(panel.selectedNote).toBe(track().notes[0])
        expect(serviceRegistry.cmd.deleteNote).not.toHaveBeenCalled()
    })

    it('keeps a plain click selecting, then deleting the note', () => {
        const cellEl = cell()
        const note = track().notes[0] // captured before the delete mock splices the array
        cellEl.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
        expect(panel.selectedNote).toBe(note)
        expect(serviceRegistry.cmd.deleteNote).not.toHaveBeenCalled()

        cellEl.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
        expect(serviceRegistry.cmd.deleteNote).toHaveBeenCalledWith(track(), note)
    })

    describe('shift+arrow nudge', () => {
        function pressKey(key, opts = {}) {
            panel.container.dispatchEvent(
                new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...opts }),
            )
        }

        /** Clicks a cell, the way a user picks a note before nudging it. */
        function pick(beat = 0, step = 0) {
            cell(beat, step).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
        }

        it('raises the velocity of the picked note with Shift+ArrowUp', () => {
            const note = track().notes[0]
            pick()
            pressKey('ArrowUp', { shiftKey: true })
            expect(note.velocity).toBe(0.85)
            expect(panel.cursorBeatStep).toBe(0) // the cursor did not move
            expect(panel.rangeAnchor).toBeNull()
        })

        it('lowers the velocity with Shift+ArrowDown', () => {
            const note = track().notes[0]
            pick()
            pressKey('ArrowDown', { shiftKey: true })
            expect(note.velocity).toBe(0.75)
        })

        it('transposes with Shift+ArrowRight / Shift+ArrowLeft', () => {
            const note = track().notes[1]
            pick(0, 2)
            pressKey('ArrowRight', { shiftKey: true })
            expect(note.pitch).toBe(4)
            pressKey('ArrowLeft', { shiftKey: true })
            expect(note.pitch).toBe(3)
            expect(panel.cursorBeatStep).toBe(2)
        })

        it('shows the gauge over the cell', () => {
            pick()
            pressKey('ArrowUp', { shiftKey: true })
            expect(gauge().textContent).toBe('C4  MIDI 60\nvel:0.85 ▲')
            expect(gauge().style.display).toBe('block')
        })

        it('keeps the selection on the note it edited', () => {
            const note = track().notes[0]
            pick()
            pressKey('ArrowUp', { shiftKey: true })
            expect(panel.selectedNote).toBe(note)
            expect(cell().classList.contains('selected')).toBe(true)
        })

        it('previews the note so the nudge is audible', () => {
            const note = track().notes[0]
            pick()
            resetNotePreviewThrottle()
            serviceRegistry.seq.simpleBeep.mockClear()
            pressKey('ArrowUp', { shiftKey: true })
            expect(serviceRegistry.seq.simpleBeep).toHaveBeenCalledWith(0, note)
        })

        it('does nothing without a picked note, and lets the cursor move', () => {
            panel.cursorStep = 4
            panel.cursorBeat = 0
            panel.cursorBeatStep = 1
            panel.focusRowIdx = 0
            pressKey('ArrowRight', { shiftKey: true })
            expect(serviceRegistry.cmd.updateNote).not.toHaveBeenCalled()
            expect(panel.cursorBeatStep).toBe(2) // range selection, as before
            expect(panel.rangeAnchor).not.toBeNull()
        })

        it('a plain arrow gives Shift+Arrow back to range selection', () => {
            const note = track().notes[0]
            pick()
            pressKey('ArrowRight') // the cursor walks away: the pick is over
            expect(panel.selectedByPointer).toBe(false)

            pressKey('ArrowLeft', { shiftKey: true })
            expect(note.velocity).toBe(0.8)
            expect(panel.rangeAnchor).not.toBeNull()
        })

        it('treats a note reached with the arrows as range selection, not a pick', () => {
            const note = track().notes[0]
            panel.focusRowIdx = 0
            panel.cursorBeat = 0
            panel.cursorBeatStep = 0
            pressKey('ArrowUp') // lands on the filled cell (0, 0)
            expect(panel.selectedNote).toBe(note)
            expect(panel.selectedByPointer).toBe(false)

            pressKey('ArrowUp', { shiftKey: true })
            expect(note.velocity).toBe(0.8)
            expect(panel.rangeAnchor).not.toBeNull()
        })
    })

    it('fills the arc proportionally to the velocity', () => {
        vi.useFakeTimers()
        try {
            drag(slice(), 0, -20, { click: false }) // 0.8 + 0.1
            expect(arcDeg()).toBeCloseTo(0.9 * 270, 0)
            drag(slice(), 0, 20, { click: false }) // back to 0.8
            expect(arcDeg()).toBeCloseTo(0.8 * 270, 0)
        } finally {
            vi.useRealTimers()
        }
    })

    it('places the pitch on the arc, at the note position in the keyboard', () => {
        drag(slice(0, 2), 0, 0, { click: false })
        drag(slice(0, 2), 12, 0, { click: false }) // pitch 3 -> 4
        // pitch 4 of the -48..+48 range: (4 + 48) / 96
        expect(arcDeg()).toBeCloseTo(((4 + 48) / 96) * 270, 0)
    })

    it('hides the note hover tooltip while the gauge is up', () => {
        slice().dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
        expect(hoverTooltip().style.display).toBe('block')

        drag(slice(), 0, -20, { click: false })
        expect(hoverTooltip().style.display).toBe('none')
    })

    it('never opens the hover tooltip while the gauge is up', () => {
        drag(slice(), 0, -20, { click: false })
        cell().dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
        const el = hoverTooltip()
        expect(el === null || el.style.display === 'none').toBe(true)
    })

    it('brings the hover tooltip back once the gauge is gone', () => {
        vi.useFakeTimers()
        try {
            drag(slice(), 0, -20, { click: false })
            vi.advanceTimersByTime(700 + 150)
            expect(gauge().style.display).toBe('none')

            cell().dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
            expect(hoverTooltip().style.display).toBe('block')
        } finally {
            vi.useRealTimers()
        }
    })

    it('rings the edited cell while the gauge is up, and drops the ring after', () => {
        vi.useFakeTimers()
        try {
            drag(slice(), 0, -20, { click: false })
            expect(cell().classList.contains('pp-gauge-anchor')).toBe(true)
            vi.advanceTimersByTime(700 + 150)
            expect(gauge().style.display).toBe('none')
            expect(cell().classList.contains('pp-gauge-anchor')).toBe(false)
        } finally {
            vi.useRealTimers()
        }
    })

    it('drops a running gesture when the panel is destroyed', () => {
        const note = track().notes[0]
        slice().dispatchEvent(
            new MouseEvent('mousedown', { button: 0, clientX: 200, clientY: 200, bubbles: true }),
        )
        panel.destroy()
        window.dispatchEvent(new MouseEvent('mousemove', { clientX: 200, clientY: 140, bubbles: true }))
        expect(note.velocity).toBe(0.8)
    })
})