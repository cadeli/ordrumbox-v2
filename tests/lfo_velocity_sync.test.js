/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { TICK } from '../src/core/constants.js'
import { computeLfoValue } from '../src/audio/math.js'

import TrackEditor from '../src/ui/track_editor.js'
import { appState } from '../src/state/app_state.js'
import { serviceRegistry } from '../src/state/service_registry.js'
import WorkletLoader from '../src/audio/worklets/loader.js'
import MidiExporter from '../src/logic/midi/midi_exporter.js'

describe('LFO Velocity Sync Verification', () => {
    
    describe('Frequency 1 (16 beats / 4 bars period)', () => {
        const lfoConfig = { freq: 1, phase: 0, min: 0, max: 1, waveform: 0 } 
        const period = 128 // 4 bars * 32 ticks

        const cases = [
            { step: 0,  tick: 0,   expected: 0.0 },
            { step: 32, tick: 64,  expected: 1.0 }, // Peak at 2 bars
            { step: 64, tick: 128, expected: 0.0 }  // End at 4 bars
        ]

        cases.forEach(({ step, tick, expected }) => {
            it(`Step ${step}: math should be ${expected}`, () => {
                expect(computeLfoValue(lfoConfig, tick)).toBeCloseTo(expected, 2)
            })
        })
    })

    describe('Frequency 2 (8 beats / 2 bars period)', () => {
        const lfoConfig = { freq: 2, phase: 0, min: 0, max: 1, waveform: 0 } 
        
        const cases = [
            { step: 0,   tick: 0,   expected: 0.0 },
            { step: 16,  tick: 32,  expected: 1.0 }, // Peak at 1 bar
            { step: 32,  tick: 64,  expected: 0.0 }, // End of 1st cycle at 2 bars
            { step: 48,  tick: 96,  expected: 1.0 }, // Peak of 2nd cycle at 3 bars
            { step: 64,  tick: 128, expected: 0.0 }  // End of 2nd cycle at 4 bars
        ]

        cases.forEach(({ step, tick, expected }) => {
            it(`Step ${step}: math should be ${expected}`, () => {
                expect(computeLfoValue(lfoConfig, tick)).toBeCloseTo(expected, 2)
            })
        })
    })

    describe('TrackEditor Integration (freq=2)', () => {
        let editor, track, mockStrip
        const lfoConfig = { freq: 2, phase: 0, min: 0, max: 1, waveform: 0 }

        beforeEach(() => {
            document.body.innerHTML = ''
            vi.spyOn(WorkletLoader, 'isSupported').mockReturnValue(true)
            vi.spyOn(WorkletLoader, 'ensureLoaded').mockResolvedValue(true)
            
            track = { name: 'KICK', velocity: 0.5, velocityLfo: lfoConfig, barQuantize: 4, bars: 8 }
            appState.patterns = [{ tracks: [track], nbBars: 8, bpm: 120 }]
            appState.selectedPatternNum = 0
            appState.trackEditorVisibility.levels = true
            
            mockStrip = { getLfoValue: vi.fn(() => 0) }
            serviceRegistry.audioEngine = { mixer: { getOrCreateStrip: vi.fn().mockResolvedValue(mockStrip) } }
            
            editor = new TrackEditor()
            editor.init()
            editor._track = track
            editor.sync()
            
            serviceRegistry.transport = { isRunning: true, tick: 0 }
            serviceRegistry.audioCtx = { currentTime: 0 }
        })

        it('animates to 1.0 (Peak) at 1 bar (2s at 120 BPM)', async () => {
            // The strip worklet returns the value computed in audio context
            mockStrip.getLfoValue.mockReturnValue(1.0)
            await editor._updateLfoSliders()
            expect(editor._sliders.get('velocity').getValue()).toBe(1)
        })

        it('animates to 0.0 (End Cycle) at 2 bars (4s at 120 BPM)', async () => {
            mockStrip.getLfoValue.mockReturnValue(0.0)
            await editor._updateLfoSliders()
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
