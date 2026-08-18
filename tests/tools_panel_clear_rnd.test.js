/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { appState } from '../src/state/app_state.js'
import { playbackEvents } from '../src/state/playback_events.js'
import { serviceRegistry } from '../src/state/service_registry.js'
import { soundRegistry } from '../src/state/sound_registry.js'
import ToolsPanel from '../src/ui/tools_panel.js'
import MfCmd from '../src/logic/commands/cmd.js'

describe('ToolsPanel — Clear / Rnd buttons', () => {
    let toolsPanel

    const TEST_PATTERN = {
        name: 'Test', nbBeats: 2, bpm: 120,
        tracks: [
            { name: 'KICK', notes: [], nbBeats: 2, stepsPerBeat: 4, loopAtStep: 8 },
            { name: 'SNARE', notes: [], nbBeats: 2, stepsPerBeat: 4, loopAtStep: 8 },
        ]
    }

    beforeEach(() => {
        global.window.innerWidth = 1200
        global.window.innerHeight = 800

        appState.reset()
        soundRegistry.reset()
        serviceRegistry.reset()

        appState.patterns = [structuredClone(TEST_PATTERN)]
        appState.selectedPatternNum = 0

        serviceRegistry.cmd = new MfCmd()

        document.body.innerHTML = ''

        toolsPanel = new ToolsPanel()
        toolsPanel.init()
        playbackEvents.dispatchToolsToggle(true)
    })

    function addNotes(count) {
        const pattern = appState.patterns[0]
        const tracks = pattern.tracks
        for (let i = 0; i < count; i++) {
            const track = tracks[i % tracks.length]
            const beat = i % (track.nbBeats ?? 4)
            const beatStep = i % (track.stepsPerBeat ?? 4)
            serviceRegistry.cmd.addNote(track, beat, beatStep, 0)
        }
    }

    describe('Clear button removed from tools panel', () => {
        it('Clear button is not present in the pattern tab (moved to pattern panel toolbar)', () => {
            const btn = toolsPanel.container.querySelector('#tp-clear')
            expect(btn).toBeNull()
        })

        it('Name input is not present in the pattern tab (moved to pattern panel toolbar)', () => {
            const input = toolsPanel.container.querySelector('#tp-pattern-name')
            expect(input).toBeNull()
        })
    })

    describe('Rnd button', () => {
        it('is present in the pattern tab', () => {
            const btn = toolsPanel.container.querySelector('#tp-rnd')
            expect(btn).not.toBeNull()
            expect(btn.textContent).toBe('Rnd')
        })

        it('adds notes to every track', () => {
            toolsPanel.container.querySelector('#tp-rnd').click()

            const pattern = appState.patterns[0]
            for (const track of pattern.tracks) {
                expect(track.notes.length).toBeGreaterThan(0)
            }
        })

        it('places notes at valid beat/beatStep positions', () => {
            toolsPanel.container.querySelector('#tp-rnd').click()

            const pattern = appState.patterns[0]
            for (const track of pattern.tracks) {
                const stepsPerBeat = track.stepsPerBeat ?? 4
                const beats = track.nbBeats ?? 4
                for (const note of track.notes) {
                    expect(note.beat).toBeGreaterThanOrEqual(0)
                    expect(note.beat).toBeLessThan(beats)
                    expect(note.beatStep).toBeGreaterThanOrEqual(0)
                    expect(note.beatStep).toBeLessThan(stepsPerBeat)
                }
            }
        })

        it('does not place two notes at the same step', () => {
            toolsPanel.container.querySelector('#tp-rnd').click()

            const pattern = appState.patterns[0]
            for (const track of pattern.tracks) {
                const positions = track.notes.map(n => `${n.beat}:${n.beatStep}`)
                expect(new Set(positions).size).toBe(positions.length)
            }
        })

        it('sets velocity between 0.5 and 1.0', () => {
            toolsPanel.container.querySelector('#tp-rnd').click()

            const pattern = appState.patterns[0]
            for (const track of pattern.tracks) {
                for (const note of track.notes) {
                    expect(note.velocity).toBeGreaterThanOrEqual(0.5)
                    expect(note.velocity).toBeLessThanOrEqual(1.0)
                }
            }
        })

        it('dispatches patternChange', () => {
            const spy = vi.fn()
            playbackEvents.onPatternChange.push(spy)

            toolsPanel.container.querySelector('#tp-rnd').click()
            expect(spy).toHaveBeenCalled()
        })

        it('is a no-op when no pattern exists', () => {
            appState.patterns = []
            appState.selectedPatternNum = -1
            toolsPanel.container.querySelector('#tp-rnd').click()
        })
    })
})
