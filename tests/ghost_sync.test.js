/**
 * @vitest-environment jsdom
 *
 * The euclidean / retrigger ghosts must always land on the steps the audio
 * engine actually plays: grid, piano roll and pattern engine all share the
 * same pass-scoped step resolver (patterns/step_resolver.js).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import PatternPanel from '../src/ui/pattern_panel.js'
import PianoRollPanel from '../src/ui/piano_roll_panel.js'
import { recomputeFlatNotes } from '../src/patterns/engine.js'
import { TICK } from '../src/core/constants.js'
import { appState } from '../src/state/app_state.js'
import { serviceRegistry } from '../src/state/service_registry.js'
import { soundRegistry } from '../src/state/sound_registry.js'

vi.mock('../src/core/notify.js', () => ({ showToast: vi.fn() }))

const NB_BEATS = 4
const STEPS_PER_BEAT = 4
const LOOP_AT_STEP = 6

const makeNote = (beat, beatStep, opts = {}) => ({
    beat,
    beatStep,
    pitch: 0,
    velocity: 1,
    every: 1,
    prob: 1,
    retriggerNum: 1,
    rate: 1,
    arp: null,
    arpTriggerProbability: 1,
    euclidianFill: 0,
    ...opts,
})

function makePattern(notes) {
    return {
        name: 'Ghost sync',
        nbBeats: NB_BEATS,
        bpm: 120,
        tracks: [
            {
                name: 'KICK',
                nbBeats: NB_BEATS,
                stepsPerBeat: STEPS_PER_BEAT,
                loopAtStep: LOOP_AT_STEP,
                notes,
            },
        ],
    }
}

function engineSteps(pattern) {
    const flatNotes = recomputeFlatNotes(structuredClone(pattern))
    const steps = new Set()
    for (const tick of flatNotes.keys()) {
        steps.add((tick * STEPS_PER_BEAT) / TICK)
    }
    return [...steps].sort((a, b) => a - b)
}

function cellSteps(panel, matches) {
    const steps = new Set()
    panel.container.querySelectorAll('.pp-cell').forEach((cell) => {
        if (matches(cell)) steps.add(Number(cell.dataset.beat) * STEPS_PER_BEAT + Number(cell.dataset.step))
    })
    return [...steps].sort((a, b) => a - b)
}

const gridGhostSteps = (panel) => cellSteps(panel, (cell) => Boolean(cell.querySelector('.pp-ghost')))
const gridNoteSteps = (panel) => cellSteps(panel, (cell) => cell.classList.contains('filled'))
const gridGhostCount = (panel) => panel.container.querySelectorAll('.pp-cell .pp-ghost').length

function domSteps(panel, selector) {
    const steps = new Set()
    panel.container.querySelectorAll(selector).forEach((el) => {
        steps.add(Math.round(parseInt(el.style.left, 10) / panel.cellWidth))
    })
    return [...steps].sort((a, b) => a - b)
}

const pianoGhostSteps = (panel) => domSteps(panel, '.pp-pr-ghost')
const pianoNoteSteps = (panel) => domSteps(panel, '.pp-pr-note')
const pianoGhostCount = (panel) => panel.container.querySelectorAll('.pp-pr-ghost').length

function makeCmd() {
    return {
        addNote: vi.fn((track, beat, beatStep, pitch = 0) => {
            const note = { beat, beatStep, pitch, velocity: 0.8, every: 1, prob: 1 }
            track.notes.push(note)
            return note
        }),
        deleteNote: vi.fn(),
        cleanTrack: vi.fn(),
        setCurrentPage: vi.fn(),
        resetPage: vi.fn(),
    }
}

function boot(pattern, { withPiano = true } = {}) {
    appState.reset()
    soundRegistry.reset()
    serviceRegistry.reset()
    serviceRegistry.transport = { isRunning: false, tick: 0 }
    serviceRegistry.cmd = makeCmd()
    serviceRegistry.audioEngine = { sound: { play: vi.fn() } }
    document.body.innerHTML = ''
    global.window.innerWidth = 1200
    global.window.innerHeight = 800

    appState.patterns = [structuredClone(pattern)]
    appState.selectedPatternNum = 0
    appState.selectedTrackNum = 0

    const grid = new PatternPanel()
    grid.init()
    let piano = null
    if (withPiano) {
        piano = new PianoRollPanel()
        piano.init()
        piano.show()
    }
    return { grid, piano }
}

describe('ghost sync — grid, piano roll and engine agree', () => {
    let pattern

    beforeEach(() => {
        pattern = makePattern([
            makeNote(0, 0, { euclidianFill: 3 }),
            makeNote(2, 2),
            makeNote(3, 0, { retriggerNum: 3, rate: 8 }),
        ])
    })

    it('renders the same steps as the engine (euclid span clamped by the loop point)', () => {
        const { grid, piano } = boot(pattern)
        const engine = engineSteps(pattern)

        const ui = [...new Set([...gridGhostSteps(grid), ...gridNoteSteps(grid)])].sort((a, b) => a - b)
        const pianoUi = [...new Set([...pianoGhostSteps(piano), ...pianoNoteSteps(piano)])].sort((a, b) => a - b)

        // euclid fill of 3 over [0, loopAtStep[ (6 steps) => steps 0, 2, 4
        expect(engine).toEqual([0, 2, 4, 10, 12, 13, 14])
        expect(ui).toEqual(engine)
        expect(pianoUi).toEqual(engine)
    })

    it('keeps the same span when notes are stored as a map', () => {
        const mapPattern = makePattern({
            '0:0': makeNote(0, 0, { euclidianFill: 3 }),
            '2:2': makeNote(2, 2),
            '3:0': makeNote(3, 0, { retriggerNum: 3, rate: 8 }),
        })
        const { grid } = boot(mapPattern, { withPiano: false })

        const ui = [...new Set([...gridGhostSteps(grid), ...gridNoteSteps(grid)])].sort((a, b) => a - b)
        expect(ui).toEqual(engineSteps(mapPattern))
    })

    it('clamps the arp ghost count like the engine (retriggerNum > 16)', () => {
        const arpPattern = makePattern([makeNote(0, 0, { retriggerNum: 20, arp: { intervals: [0, 4, 7] } })])
        const { grid, piano } = boot(arpPattern)

        const engineCount = engineSteps(arpPattern).length
        expect(engineCount).toBe(16)
        expect(gridGhostCount(grid)).toBe(engineCount - 1)
        expect(pianoGhostCount(piano)).toBe(engineCount - 1)
    })

    it('exposes identical ghost steps in the grid and in the piano roll', () => {
        const { grid, piano } = boot(pattern)
        expect(pianoGhostSteps(piano)).toEqual(gridGhostSteps(grid))
        expect(pianoNoteSteps(piano)).toEqual(gridNoteSteps(grid))
    })
})
