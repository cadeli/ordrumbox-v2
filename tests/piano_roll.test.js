/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { appState } from '../src/state/app_state.js'
import { playbackEvents } from '../src/state/playback_events.js'
import { serviceRegistry } from '../src/state/service_registry.js'
import { soundRegistry } from '../src/state/sound_registry.js'
import PianoRollPanel from '../src/ui/piano_roll_panel.js'

const TOTAL_KEYS = 97
const NOTE_HEIGHT = 14
const MIDI_MIN = 12
const MIDDLE_C = 60

const TEST_PATTERN = {
    nbBeats: 8,
    bpm: 120,
    tracks: [
        {
            name: 'KICK',
            nbBeats: 8,
            stepsPerBeat: 4,
            pitch: 0,
            notes: [
                { beat: 0, beatStep: 0, pitch: 0, velocity: 0.8 },
                { beat: 0, beatStep: 2, pitch: 0, velocity: 0.5 },
                { beat: 1, beatStep: 0, pitch: 0, velocity: 1.0 },
                { beat: 1, beatStep: 0, pitch: 4, velocity: 0.7 },
                { beat: 2, beatStep: 0, pitch: 0, velocity: 0.3 },
                { beat: 2, beatStep: 0, pitch: 7, velocity: 0.7 },
                { beat: 2, beatStep: 4, pitch: 0, velocity: 0.8, every: 2 },
                { beat: 2, beatStep: 8, pitch: 0, velocity: 0.8, prob: 0.5 },
                { beat: 3, beatStep: 0, pitch: 0, velocity: 0.8, retriggerNum: 3, rate: 8 },
                { beat: 3, beatStep: 0, pitch: 0, velocity: 0.8, retriggerNum: 3, rate: 8, arp: { intervals: [0, 4, 7], mode: 'up' } },
                { beat: 3, beatStep: 2, pitch: 0, velocity: 0.8, euclidianFill: 2 },
            ]
        }
    ]
}

function makeCmd() {
    return {
        addNote: vi.fn((track, beat, beatStep, pitch = 0) => {
            const note = { beat, beatStep, pitch, velocity: 0.8, every: 1, prob: 1 }
            track.notes.push(note)
            return note
        }),
        deleteNote: vi.fn((track, selNote) => {
            for (let i = track.notes.length - 1; i >= 0; i--) {
                const n = track.notes[i]
                if (n.beat === selNote.beat && n.beatStep === selNote.beatStep && (n.pitch ?? 0) === (selNote.pitch ?? 0)) {
                    track.notes.splice(i, 1)
                    return
                }
            }
        }),
    }
}

function noteRow(note, trackPitch = 0) {
    return MIDDLE_C + trackPitch + (note.pitch ?? 0) - MIDI_MIN
}

function rowToClickY(row) {
    return (TOTAL_KEYS - 1 - row) * NOTE_HEIGHT + NOTE_HEIGHT / 2
}

function stepToClickX(step, cellWidth) {
    return step * cellWidth + cellWidth / 2
}

describe('PianoRollPanel', () => {
    let panel

    beforeEach(() => {
        appState.reset()
        soundRegistry.reset()
        serviceRegistry.reset()

        appState.patterns = [structuredClone(TEST_PATTERN)]
        appState.selectedPatternNum = 0
        appState.selectedTrackNum = 0

        serviceRegistry.transport = { isRunning: false, tick: 0 }
        serviceRegistry.cmd = makeCmd()
        serviceRegistry.audioEngine = { sound: { play: vi.fn() } }

        document.body.innerHTML = ''
        global.window.innerWidth = 1200
        global.window.innerHeight = 800

        panel = new PianoRollPanel()
        panel.init()
        panel.show()
    })

    function getTrack() {
        return appState.patterns[0].tracks[0]
    }

    function getGrid() {
        return panel.container.querySelector('#pp-piano-grid')
    }

    function getNotes() {
        return getGrid()?.querySelectorAll('.pp-pr-note') ?? []
    }

    function getGhosts() {
        return getGrid()?.querySelectorAll('.pp-pr-ghost') ?? []
    }

    function clickGrid(cellX, cellY) {
        const grid = getGrid()
        grid.dispatchEvent(new MouseEvent('click', {
            clientX: cellX, clientY: cellY, bubbles: true, cancelable: true
        }))
    }

    function clickNoteAtStepPitch(step, pitch) {
        const track = getTrack()
        const row = noteRow({ pitch }, track.pitch ?? 0)
        clickGrid(stepToClickX(step, panel._cellWidth), rowToClickY(row))
    }

    function pressKey(key) {
        panel._onKeyDown(new KeyboardEvent('keydown', {
            key, bubbles: true, cancelable: true
        }))
    }

    describe('grid width fills available space', () => {
        it('grid width equals visible steps times cell width', () => {
            const grid = getGrid()
            const track = getTrack()
            const pageSteps = 4 * track.stepsPerBeat
            const expected = pageSteps * panel._cellWidth
            expect(parseFloat(grid.style.width)).toBeCloseTo(expected, 0)
        })

        it('cell width fills available space', () => {
            const scrollEl = panel.container.querySelector('#pp-piano-scroll')
            Object.defineProperty(scrollEl, 'clientWidth', { value: 800, configurable: true })
            panel._measureCellWidth()
            const available = 800 - 80
            expect(panel._cellWidth).toBe(Math.max(16, available / (4 * 4)))
        })
    })

    describe('4-beat paging', () => {
        it('shows page nav when pattern has more than 4 beats', () => {
            const nav = panel.container.querySelector('#pp-pr-page-nav')
            expect(nav.style.display).not.toBe('none')
        })

        it('displays correct page count', () => {
            const info = panel.container.querySelector('#pp-pr-page-info')
            expect(info.textContent).toBe('1/2')
        })

        it('navigates to next page', () => {
            panel._nextPage()
            const info = panel.container.querySelector('#pp-pr-page-info')
            expect(info.textContent).toBe('2/2')
        })

        it('does not go past last page', () => {
            panel._nextPage()
            panel._nextPage()
            const info = panel.container.querySelector('#pp-pr-page-info')
            expect(info.textContent).toBe('2/2')
        })

        it('navigates to previous page', () => {
            panel._nextPage()
            panel._prevPage()
            const info = panel.container.querySelector('#pp-pr-page-info')
            expect(info.textContent).toBe('1/2')
        })

        it('does not go before first page', () => {
            panel._prevPage()
            const info = panel.container.querySelector('#pp-pr-page-info')
            expect(info.textContent).toBe('1/2')
        })

        it('only shows notes on current page', () => {
            const notes = getNotes()
            const track = getTrack()
            const stepsPerBeat = track.stepsPerBeat
            for (const n of notes) {
                const idx = parseInt(n.dataset.note, 10)
                const note = track.notes[idx]
                const step = (note.beat ?? 0) * stepsPerBeat + (note.beatStep ?? 0)
                expect(step).toBeLessThan(4 * stepsPerBeat)
            }
        })

        it('shows different notes after page switch', () => {
            panel._nextPage()
            const notes = getNotes()
            const track = getTrack()
            const stepsPerBeat = track.stepsPerBeat
            for (const n of notes) {
                const idx = parseInt(n.dataset.note, 10)
                const note = track.notes[idx]
                const step = (note.beat ?? 0) * stepsPerBeat + (note.beatStep ?? 0)
                expect(step).toBeGreaterThanOrEqual(4 * stepsPerBeat)
            }
        })
    })

    describe('note selection', () => {
        it('selects a note on click', () => {
            const track = getTrack()
            const note = track.notes[0]
            const step = note.beat * track.stepsPerBeat + note.beatStep
            clickNoteAtStepPitch(step, note.pitch ?? 0)
            expect(panel._selNote).toBe(note)
        })

        it('applies selected class to clicked note', () => {
            const track = getTrack()
            const note = track.notes[0]
            const step = note.beat * track.stepsPerBeat + note.beatStep
            clickNoteAtStepPitch(step, note.pitch ?? 0)
            const selected = getGrid().querySelector('.pp-pr-note.selected')
            expect(selected).not.toBeNull()
        })

        it('deletes note when clicking on already selected note', () => {
            const track = getTrack()
            const note = track.notes[0]
            const step = note.beat * track.stepsPerBeat + note.beatStep
            clickNoteAtStepPitch(step, note.pitch ?? 0)
            expect(panel._selNote).toBe(note)

            clickNoteAtStepPitch(step, note.pitch ?? 0)
            expect(panel._selNote).toBeNull()
            expect(track.notes).not.toContain(note)
        })

        it('clears selection on hide', () => {
            const track = getTrack()
            const note = track.notes[0]
            panel._selNote = note
            panel.hide()
            expect(panel._selNote).toBeNull()
        })
    })

    describe('chord support (add note on different pitch at same step)', () => {
        it('adds a note at a different pitch on an occupied step', () => {
            const track = getTrack()
            const initialCount = track.notes.length
            const step = 1 * track.stepsPerBeat + 0
            clickNoteAtStepPitch(step, 7)

            expect(track.notes.length).toBe(initialCount + 1)
            const added = track.notes[track.notes.length - 1]
            expect(added.beat).toBe(1)
            expect(added.beatStep).toBe(0)
            expect(added.pitch).toBe(7)
        })

        it('adds a note on an empty step', () => {
            const track = getTrack()
            const initialCount = track.notes.length
            const step = 7 * track.stepsPerBeat + 0
            clickNoteAtStepPitch(step, 0)

            expect(track.notes.length).toBe(initialCount + 1)
        })
    })

    describe('note labels and tooltips', () => {
        it('sets title tooltip with note name on each note', () => {
            const notes = getNotes()
            for (const n of notes) {
                expect(n.title).toMatch(/^[A-G]#?\d+\s+MIDI\s+\d+/)
            }
        })

        it('sets probability label when prob < 1', () => {
            const track = getTrack()
            const probNote = track.notes.find(n => (n.prob ?? 1) < 1)
            if (!probNote) return
            const step = probNote.beat * track.stepsPerBeat + probNote.beatStep
            if (step >= 4 * track.stepsPerBeat) return

            const notes = getNotes()
            const matching = Array.from(notes).find(n => {
                const idx = parseInt(n.dataset.note, 10)
                return track.notes[idx] === probNote
            })
            expect(matching).toBeDefined()
            expect(matching.classList.contains('pp-pr-trig-rand')).toBe(true)
            expect(matching.dataset.trig).toBe(String(Math.round(probNote.prob * 10)))
        })

        it('sets every label when every > 1', () => {
            const track = getTrack()
            const everyNote = track.notes.find(n => (n.every ?? 1) > 1)
            if (!everyNote) return
            const step = everyNote.beat * track.stepsPerBeat + everyNote.beatStep
            if (step >= 4 * track.stepsPerBeat) return

            const notes = getNotes()
            const matching = Array.from(notes).find(n => {
                const idx = parseInt(n.dataset.note, 10)
                return track.notes[idx] === everyNote
            })
            expect(matching).toBeDefined()
            expect(matching.classList.contains('pp-pr-trig-fixed')).toBe(true)
            expect(matching.dataset.trig).toBe(String(everyNote.every))
        })
    })

    describe('velocity opacity', () => {
        it('applies opacity based on velocity', () => {
            const track = getTrack()
            const notes = getNotes()
            for (const n of notes) {
                const idx = parseInt(n.dataset.note, 10)
                const note = track.notes[idx]
                const vel = note.velocity ?? 0.8
                const expected = (0.25 + vel * 0.75).toFixed(2)
                expect(parseFloat(n.style.opacity)).toBeCloseTo(parseFloat(expected), 2)
            }
        })
    })

    describe('ghost notes', () => {
        it('renders retrigger ghost markers', () => {
            const ghosts = getGhosts()
            const retriggerGhosts = Array.from(ghosts).filter(g =>
                g.classList.contains('pp-pr-ghost-retrigger')
            )
            expect(retriggerGhosts.length).toBeGreaterThan(0)
        })

        it('renders euclidian ghost markers', () => {
            const ghosts = getGhosts()
            const euclidianGhosts = Array.from(ghosts).filter(g =>
                g.classList.contains('pp-pr-ghost-euclidian')
            )
            expect(euclidianGhosts.length).toBeGreaterThan(0)
        })

        it('ghosts for arp notes have pitch offset (different row than parent)', () => {
            const track = getTrack()
            const arpNote = track.notes.find(n => n.arp && (n.retriggerNum ?? 1) > 1)
            if (!arpNote) return
            const step = arpNote.beat * track.stepsPerBeat + arpNote.beatStep
            if (step >= 4 * track.stepsPerBeat) return

            const ghosts = getGhosts()
            const parentRow = noteRow(arpNote, track.pitch ?? 0)
            const nonParentGhosts = Array.from(ghosts).filter(g => {
                const bottom = parseInt(g.style.bottom, 10)
                const ghostRow = bottom / NOTE_HEIGHT
                return Math.abs(ghostRow - parentRow) > 0.5
            })
            expect(nonParentGhosts.length).toBeGreaterThan(0)
        })
    })

    describe('keyboard navigation', () => {
        it('ArrowRight moves cursor step forward', () => {
            panel._cursorStep = 0
            panel._cursorRow = 48
            pressKey('ArrowRight')
            expect(panel._cursorStep).toBe(1)
        })

        it('ArrowLeft moves cursor step backward', () => {
            panel._cursorStep = 5
            panel._cursorRow = 48
            pressKey('ArrowLeft')
            expect(panel._cursorStep).toBe(4)
        })

        it('ArrowUp moves cursor pitch up', () => {
            panel._cursorStep = 0
            panel._cursorRow = 48
            pressKey('ArrowUp')
            expect(panel._cursorRow).toBe(49)
        })

        it('ArrowDown moves cursor pitch down', () => {
            panel._cursorStep = 0
            panel._cursorRow = 48
            pressKey('ArrowDown')
            expect(panel._cursorRow).toBe(47)
        })

        it('ArrowRight wraps to start at end of pattern', () => {
            const track = getTrack()
            const totalSteps = track.nbBeats * track.stepsPerBeat
            panel._cursorStep = totalSteps - 1
            panel._cursorRow = 48
            pressKey('ArrowRight')
            expect(panel._cursorStep).toBe(0)
        })

        it('Enter creates a note at cursor on empty step', () => {
            const track = getTrack()
            const initialCount = track.notes.length
            panel._cursorStep = 3
            panel._cursorRow = 60 - MIDI_MIN
            pressKey('Enter')
            expect(track.notes.length).toBe(initialCount + 1)
        })

        it('Enter selects note when cursor is on a note', () => {
            const track = getTrack()
            const note = track.notes[0]
            const spb = track.stepsPerBeat
            panel._cursorStep = note.beat * spb + note.beatStep
            panel._cursorRow = noteRow(note, track.pitch ?? 0)
            pressKey('Enter')
            expect(panel._selNote).toBe(note)
        })

        it('Enter deletes note when cursor is on already selected note', () => {
            const track = getTrack()
            const note = track.notes[0]
            const spb = track.stepsPerBeat
            panel._cursorStep = note.beat * spb + note.beatStep
            panel._cursorRow = noteRow(note, track.pitch ?? 0)

            pressKey('Enter')
            expect(panel._selNote).toBe(note)

            pressKey('Enter')
            expect(panel._selNote).toBeNull()
            expect(track.notes).not.toContain(note)
        })

        it('Delete removes selected note', () => {
            const track = getTrack()
            const note = track.notes[0]
            panel._selNote = note
            pressKey('Delete')
            expect(panel._selNote).toBeNull()
            expect(track.notes).not.toContain(note)
        })

        it('Backspace removes selected note', () => {
            const track = getTrack()
            const note = track.notes[0]
            panel._selNote = note
            pressKey('Backspace')
            expect(panel._selNote).toBeNull()
            expect(track.notes).not.toContain(note)
        })
    })

    describe('note editor integration', () => {
        it('dispatches noteSelect when a note is clicked', () => {
            const listener = vi.fn()
            playbackEvents.on("noteSelect", listener)

            const track = getTrack()
            const note = track.notes[0]
            const step = note.beat * track.stepsPerBeat + note.beatStep
            clickNoteAtStepPitch(step, note.pitch ?? 0)

            expect(listener).toHaveBeenCalled()
            const data = listener.mock.calls[0][0]
            expect(data.note).toBe(note)
            expect(data.track).toBe(track)
        })

        it('dispatches noteSelect(null) on clearSelection', () => {
            const listener = vi.fn()
            playbackEvents.on("noteSelect", listener)
            panel._clearSelection()
            expect(listener).toHaveBeenCalledWith(null)
        })
    })

    describe('playhead', () => {
        it('creates playhead element', () => {
            panel._ensurePlayhead()
            const playhead = panel.container.querySelector('.pp-pr-playhead')
            expect(playhead).not.toBeNull()
        })

        it('playhead is hidden by default', () => {
            panel._ensurePlayhead()
            const playhead = panel.container.querySelector('.pp-pr-playhead')
            expect(playhead.style.display).toBe('none')
        })
    })

    describe('note illumination', () => {
        function getPlayingNotes() {
            return getGrid()?.querySelectorAll('.pp-pr-note.playing') ?? []
        }

        it('illuminates a note when absStep matches its base position', () => {
            const track = getTrack()
            const note = track.notes[0]
            const step = (note.beat ?? 0) * track.stepsPerBeat + (note.beatStep ?? 0)
            panel._illuminateStep(step, 1)
            expect(getPlayingNotes().length).toBeGreaterThan(0)
        })

        it('does not illuminate when absStep does not match any note', () => {
            panel._illuminateStep(999, 1)
            expect(getPlayingNotes().length).toBe(0)
        })

        it('clears previous illumination when step changes', () => {
            const track = getTrack()
            const note0 = track.notes[0]
            const step0 = (note0.beat ?? 0) * track.stepsPerBeat + (note0.beatStep ?? 0)
            panel._illuminateStep(step0, 1)
            expect(getPlayingNotes().length).toBeGreaterThan(0)

            panel._illuminateStep(999, 2)
            expect(getPlayingNotes().length).toBe(0)
        })

        it('illuminates retrigger sub-notes at their positions', () => {
            const track = getTrack()
            const retrigNote = track.notes.find(n => (n.retriggerNum ?? 1) > 1 && !(n.arp && (n.retriggerNum ?? 1) > 1))
            if (!retrigNote) return
            const spb = track.stepsPerBeat
            const basePos = (retrigNote.beat ?? 0) * spb + (retrigNote.beatStep ?? 0)
            if (basePos >= 4 * spb) return

            const subs = panel._getSubPositions(retrigNote, track, (track.nbBeats ?? 4) * spb)
            if (subs.length === 0) return
            const subPos = subs[0].pos
            if (subPos >= 4 * spb) return

            panel._illuminateStep(subPos, 42)
            expect(getPlayingNotes().length).toBeGreaterThan(0)
        })

        it('does not illuminate notes beyond loopAtStep', () => {
            const track = getTrack()
            track.loopAtStep = 4
            panel._sync()

            const noteBeyond = track.notes.find(n => {
                const step = (n.beat ?? 0) * track.stepsPerBeat + (n.beatStep ?? 0)
                return step >= 4
            })
            if (!noteBeyond) return

            const step = (noteBeyond.beat ?? 0) * track.stepsPerBeat + (noteBeyond.beatStep ?? 0)
            panel._illuminateStep(step, 10)
            const playing = Array.from(getPlayingNotes()).filter(el => {
                const idx = parseInt(el.dataset.note, 10)
                return track.notes[idx] === noteBeyond
            })
            expect(playing.length).toBe(0)
        })

        it('re-illuminates notes on loop repeat (rawTick changes, same absStep)', () => {
            const track = getTrack()
            const note = track.notes[0]
            const step = (note.beat ?? 0) * track.stepsPerBeat + (note.beatStep ?? 0)

            panel._illuminateStep(step, 100)
            expect(getPlayingNotes().length).toBeGreaterThan(0)

            panel._illuminateStep(step, 200)
            expect(getPlayingNotes().length).toBeGreaterThan(0)
        })

        it('skips illumination if rawTick has not changed', () => {
            const track = getTrack()
            const note = track.notes[0]
            const step = (note.beat ?? 0) * track.stepsPerBeat + (note.beatStep ?? 0)

            panel._illuminateStep(step, 50)
            const count1 = getPlayingNotes().length

            panel._illuminateStep(step, 50)
            expect(getPlayingNotes().length).toBe(count1)
        })

        it('clearIllumination removes all playing classes', () => {
            const track = getTrack()
            const note = track.notes[0]
            const step = (note.beat ?? 0) * track.stepsPerBeat + (note.beatStep ?? 0)
            panel._illuminateStep(step, 1)
            expect(getPlayingNotes().length).toBeGreaterThan(0)

            panel._clearIllumination()
            expect(getPlayingNotes().length).toBe(0)
        })

        it('illuminates notes at loop-repeated positions (absStep % loopAtStep === basePos)', () => {
            const track = getTrack()
            const spb = track.stepsPerBeat
            track.loopAtStep = 2 * spb
            panel._sync()
            const note = track.notes[0]
            const basePos = (note.beat ?? 0) * spb + (note.beatStep ?? 0)
            if (basePos >= track.loopAtStep) return

            const repeatedStep = basePos + track.loopAtStep
            panel._illuminateStep(repeatedStep, 77)
            const playing = Array.from(getPlayingNotes()).filter(el => {
                const idx = parseInt(el.dataset.note, 10)
                return track.notes[idx] === note
            })
            expect(playing.length).toBe(1)
        })

        it('does not illuminate notes beyond loopAtStep even with modulo match', () => {
            const track = getTrack()
            const spb = track.stepsPerBeat
            track.loopAtStep = 2 * spb
            panel._sync()
            const noteOutside = track.notes.find(n => {
                const step = (n.beat ?? 0) * spb + (n.beatStep ?? 0)
                return step >= track.loopAtStep
            })
            if (!noteOutside) return
            const step = (noteOutside.beat ?? 0) * spb + (noteOutside.beatStep ?? 0)
            panel._illuminateStep(step, 88)
            const playing = Array.from(getPlayingNotes()).filter(el => {
                const idx = parseInt(el.dataset.note, 10)
                return track.notes[idx] === noteOutside
            })
            expect(playing.length).toBe(0)
        })
    })

    describe('loop point lines', () => {
        it('renders a loop point line when loopAtStep is on current page', () => {
            const track = getTrack()
            track.loopAtStep = 8
            panel._sync()
            const lp = getGrid()?.querySelector('.pp-pr-loop-point')
            expect(lp).not.toBeNull()
        })

        it('does not render loop point line when loopAtStep is off page', () => {
            const track = getTrack()
            track.loopAtStep = 32
            panel._sync()
            const lp = getGrid()?.querySelector('.pp-pr-loop-point')
            expect(lp).toBeNull()
        })

        it('loop point line has correct position', () => {
            const track = getTrack()
            const spb = track.stepsPerBeat
            const loopStep = 2 * spb
            track.loopAtStep = loopStep
            panel._sync()
            const lp = getGrid()?.querySelector('.pp-pr-loop-point')
            expect(lp).not.toBeNull()
            const expectedX = loopStep * panel._cellWidth
            expect(parseFloat(lp.style.left)).toBeCloseTo(expectedX, 0)
        })

        it('loop point line spans full grid height', () => {
            const track = getTrack()
            track.loopAtStep = 8
            panel._sync()
            const lp = getGrid()?.querySelector('.pp-pr-loop-point')
            expect(lp).not.toBeNull()
            const expectedHeight = TOTAL_KEYS * NOTE_HEIGHT
            expect(parseFloat(lp.style.height)).toBe(expectedHeight)
        })
    })

    describe('async pattern load (grid populates after patternStructureChange)', () => {
        it('re-resolves track and renders grid when patterns load after show()', () => {
            appState.patterns = []
            appState.selectedPatternNum = 0
            appState.selectedTrackNum = 0

            panel.hide()
            panel._track = null
            panel._trackIdx = -1
            panel.show()

            expect(panel._track).toBeNull()
            expect(panel._gridDirty).toBe(false)

            appState.patterns = [structuredClone(TEST_PATTERN)]
            appState.selectedPatternNum = 0
            appState.selectedTrackNum = 0
            playbackEvents.emit("patternStructureChange")

            expect(panel._track).not.toBeNull()
            expect(panel._trackIdx).toBe(0)
            const notes = panel.container.querySelectorAll('.pp-pr-note')
            expect(notes.length).toBeGreaterThan(0)
        })

        it('show() resolves track immediately so grid renders on first sync()', () => {
            expect(panel._track).not.toBeNull()
            expect(panel.container.querySelectorAll('.pp-pr-col').length).toBeGreaterThan(0)
            expect(panel.container.querySelectorAll('.pp-pr-note').length).toBeGreaterThan(0)
        })

        it('does not override CSS position with secondary-slot top', () => {
            expect(panel.container.classList.contains('workspace-panel')).toBe(true)
            expect(panel.container.style.top || '').not.toBe('518px')
        })
    })
})
