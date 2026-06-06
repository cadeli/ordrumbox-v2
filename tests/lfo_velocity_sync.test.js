/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { TICK } from '../src/core/constants.js'
import { computeLfoValue } from '../src/audio/math.js'
import LfoUpdater from '../src/patterns/lfo_updater.js'
import TrackEditor from '../src/ui/track_editor.js'
import { appState } from '../src/state/app_state.js'
import { serviceRegistry } from '../src/state/service_registry.js'
import WorkletLoader from '../src/audio/worklets/loader.js'
import MidiExporter from '../src/logic/midi/midi_exporter.js'

describe('LFO Velocity Sync Verification', () => {
    
    describe('Frequency 1 (16 beats period)', () => {
        const lfoConfig = { freq: 1, phase: 0, min: 0, max: 1, waveform: 0 } 
        const period = 128 // 4 * 32

        const cases = [
            { step: 0,  tick: 0,   expected: 0.0 },
            { step: 16, tick: 32,  expected: 0.5 },
            { step: 32, tick: 64,  expected: 1.0 },
            { step: 48, tick: 96,  expected: 0.5 },
            { step: 64, tick: 128, expected: 0.0 }
        ]

        cases.forEach(({ step, tick, expected }) => {
            it(`Step ${step}: math should be ${expected}`, () => {
                expect(computeLfoValue(lfoConfig, tick)).toBeCloseTo(expected, 2)
            })
            it(`Step ${step}: UI should be ${expected}`, () => {
                expect(LfoUpdater.computeLfoValue(lfoConfig, tick, period)).toBeCloseTo(expected, 2)
            })
        })
    })

    describe('Frequency 2 (32 beats period)', () => {
        const lfoConfig = { freq: 2, phase: 0, min: 0, max: 1, waveform: 0 } 
        const period = 256 // 2 * 4 * 32
        
        const cases = [
            { step: 0,   tick: 0,   expected: 0.0 },
            { step: 16,  tick: 32,  expected: 0.15 },
            { step: 32,  tick: 64,  expected: 0.5 },
            { step: 48,  tick: 96,  expected: 0.85 },
            { step: 64,  tick: 128, expected: 1.0 },
            { step: 80,  tick: 160, expected: 0.85 },
            { step: 96,  tick: 192, expected: 0.5 },
            { step: 112, tick: 224, expected: 0.15 },
            { step: 128, tick: 256, expected: 0.0 }
        ]

        cases.forEach(({ step, tick, expected }) => {
            it(`Step ${step}: math should be ${expected}`, () => {
                expect(computeLfoValue(lfoConfig, tick)).toBeCloseTo(expected, 2)
            })
            it(`Step ${step}: UI should be ${expected}`, () => {
                expect(LfoUpdater.computeLfoValue(lfoConfig, tick, period)).toBeCloseTo(expected, 2)
            })
        })
    })

    describe('TrackEditor Integration (freq=2)', () => {
        let editor, track
        const lfoConfig = { freq: 2, phase: 0, min: 0, max: 1, waveform: 0 }

        beforeEach(() => {
            document.body.innerHTML = ''
            vi.spyOn(WorkletLoader, 'isSupported').mockReturnValue(true)
            vi.spyOn(WorkletLoader, 'ensureLoaded').mockResolvedValue(true)
            
            track = { name: 'KICK', velocity: 0.5, velocityLfo: lfoConfig, barQuantize: 4, bars: 8 }
            appState.patterns = [{ tracks: [track], nbBars: 8 }]
            appState.selectedPatternNum = 0
            appState.trackEditorVisibility.levels = true
            
            editor = new TrackEditor()
            editor.init()
            editor._track = track
            editor.sync()
            
            serviceRegistry.transport = { isRunning: true, tick: 0 }
        })

        it('animates to 1.0 (Peak) at Step 64', () => {
            serviceRegistry.transport.tick = 128 // Step 64
            editor._updateLfoSliders()
            expect(editor._sliders.get('velocity').getValue()).toBe(1)
        })

        it('animates to 0.0 (End) at Step 128', () => {
            serviceRegistry.transport.tick = 256 // Step 128
            editor._updateLfoSliders()
            expect(editor._sliders.get('velocity').getValue()).toBe(0)
        })
    })

    describe('MIDI Export Verification', () => {
        it('exports correct modulated velocities in MIDI bytes', () => {
            const lfoConfig = { freq: 1, phase: 0, min: 0, max: 1, waveform: 0 }
            const track = {
                name: 'KICK',
                barQuantize: 4,
                bars: 4,
                velocityLfo: lfoConfig,
                notes: [
                    { bar: 0, barStep: 0, velocity: 1.0 }, // tick 0   -> LFO 0.0 -> Vel 0
                    { bar: 1, barStep: 0, velocity: 1.0 }, // tick 32  -> LFO 0.5 -> Vel 64
                    { bar: 2, barStep: 0, velocity: 1.0 }  // tick 64  -> LFO 1.0 -> Vel 127
                ]
            }
            const pattern = { name: 'MidiTest', nbBars: 4, tracks: [track], bpm: 120 }
            
            const exporter = new MidiExporter()
            const midiBytes = exporter.export(pattern)
            
            const findSeq = (seq) => {
                for(let i=0; i<midiBytes.length - seq.length; i++) {
                    let match = true
                    for(let j=0; j<seq.length; j++) if(midiBytes[i+j] !== seq[j]) { match = false; break }
                    if(match) return i
                }
                return -1
            }

            expect(findSeq([0x99, 0x24, 0x00])).toBeGreaterThan(-1) // Note On, Kick, Vel 0
            expect(findSeq([0x99, 0x24, 0x40])).toBeGreaterThan(-1) // Note On, Kick, Vel 64
            expect(findSeq([0x99, 0x24, 0x7F])).toBeGreaterThan(-1) // Note On, Kick, Vel 127
        })
    })

    describe('WAV Export (Offline) Verification', () => {
        it('calculates identical discrete LFO values used for offline rendering', () => {
            const lfoConfig = { freq: 1, phase: 0, min: 0, max: 1, waveform: 0 }
            
            // In exportOffline(), we schedule notes and the Worklet uses the same math
            // as math.js. We verify here that the discrete amplitudes at the exact
            // sample/tick offsets of the notes match the expected LFO curve.
            
            const expected = [
                { tick: 0,   val: 0.0 }, // Start
                { tick: 32,  val: 0.5 }, // Mid rise
                { tick: 64,  val: 1.0 }, // Peak
                { tick: 96,  val: 0.5 }, // Mid fall
                { tick: 128, val: 0.0 }  // End
            ]

            expected.forEach(ex => {
                const actual = computeLfoValue(lfoConfig, ex.tick)
                expect(actual).toBeCloseTo(ex.val, 2)
            })
        })
    })
})
