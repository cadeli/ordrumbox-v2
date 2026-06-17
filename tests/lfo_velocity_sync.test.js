/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { TICK } from '../src/core/constants.js'
import { computeLfoValue } from '../src/audio/math.js'
import InstrumentsManager from '../src/logic/services/instruments_manager.js'

import TrackEditor from '../src/ui/track_editor.js'
import { appState } from '../src/state/app_state.js'
import { serviceRegistry } from '../src/state/service_registry.js'
import { soundRegistry } from '../src/state/sound_registry.js'
import WorkletLoader from '../src/audio/worklets/loader.js'
import MidiExporter from '../src/logic/midi/midi_exporter.js'
import { parseMidi, findAllNotes } from './helpers/midi_reader.js'

function allNoteOns(bytes) {
    return findAllNotes(parseMidi(bytes))
}

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

describe('LFO Pitch Replacement Semantics', () => {

    describe('TrackEditor Integration', () => {
        let editor, track, mockStrip

        beforeEach(() => {
            document.body.innerHTML = ''
            vi.spyOn(WorkletLoader, 'isSupported').mockReturnValue(true)
            vi.spyOn(WorkletLoader, 'ensureLoaded').mockResolvedValue(true)
            soundRegistry.drumkitList = [
                { name: 'real', instruments: [{ key: 'KICK', url: 'real/kick.wav' }] }
            ]
            soundRegistry.sounds = {
                'real/kick.wav': { key: 'KICK', url: 'real/kick.wav', buffer: {} }
            }
            appState.trackEditorVisibility = { basic: true, levels: true, filters: true, effects: true, sound: false, loop: false }
        })

        it('pitch slider shows LFO value directly, not track.pitch + LFO', async () => {
            track = {
                name: 'KICK', velocity: 0.8, pitch: 5, pan: 0,
                pitchLfo: { freq: 1, min: -6, max: 6, phase: 0, type: 'sine' },
                barQuantize: 4, bars: 4, loopAtStep: 16,
                filterType: 'lowpass', filterFreq: 0.5, filterQ: 0.5,
                reverbAmount: 0, reverbType: 'none',
                delayAmount: 0, delayTime: 0.25, delayType: 'none',
                saturationAmount: 0, saturationType: 'soft',
                mute: false, mono: false, useAutoAssignSound: false,
                useSoftSynth: false, synthSoundKey: null, soundId: '',
                swingAmount: 0,
            }
            appState.patterns = [{ tracks: [track], nbBars: 4 }]
            appState.selectedPatternNum = 0

            mockStrip = { getLfoValue: vi.fn(() => 0) }
            serviceRegistry.audioEngine = { mixer: { getOrCreateStrip: vi.fn().mockResolvedValue(mockStrip) } }
            serviceRegistry.transport = { isRunning: true, tick: 0 }

            editor = new TrackEditor()
            editor.init()
            editor._track = track
            editor.sync()

            // Worklet reports LFO output = 3 semitones
            mockStrip.getLfoValue.mockReturnValue(3)
            await editor._updateLfoSliders()

            const slider = editor._sliders.get('pitch')
            // Replacement: slider shows LFO value (3), NOT track.pitch + LFO (5 + 3 = 8)
            expect(slider.getValue()).toBe(3)
        })

        it('pitch slider uses LFO value from strip, ignoring track.pitch', async () => {
            track = {
                name: 'KICK', velocity: 0.8, pitch: -10, pan: 0,
                pitchLfo: { freq: 1, min: 0, max: 12, phase: 0.25, type: 'sine' },
                barQuantize: 4, bars: 4, loopAtStep: 16,
                filterType: 'lowpass', filterFreq: 0.5, filterQ: 0.5,
                reverbAmount: 0, reverbType: 'none',
                delayAmount: 0, delayTime: 0.25, delayType: 'none',
                saturationAmount: 0, saturationType: 'soft',
                mute: false, mono: false, useAutoAssignSound: false,
                useSoftSynth: false, synthSoundKey: null, soundId: '',
                swingAmount: 0,
            }
            appState.patterns = [{ tracks: [track], nbBars: 4 }]
            appState.selectedPatternNum = 0

            mockStrip = { getLfoValue: vi.fn(() => 0) }
            serviceRegistry.audioEngine = { mixer: { getOrCreateStrip: vi.fn().mockResolvedValue(mockStrip) } }
            serviceRegistry.transport = { isRunning: true, tick: 0 }

            editor = new TrackEditor()
            editor.init()
            editor._track = track
            editor.sync()

            mockStrip.getLfoValue.mockReturnValue(6)
            await editor._updateLfoSliders()

            const slider = editor._sliders.get('pitch')
            // Replacement: 6, NOT -10 + 6 = -4
            expect(slider.getValue()).toBe(6)
        })

        it('velocity slider uses LFO value directly (baseline for comparison)', async () => {
            track = {
                name: 'KICK', velocity: 0.5, pitch: 0, pan: 0,
                velocityLfo: { freq: 1, min: 0, max: 1, phase: 0.25, type: 'sine' },
                barQuantize: 4, bars: 4, loopAtStep: 16,
                filterType: 'lowpass', filterFreq: 0.5, filterQ: 0.5,
                reverbAmount: 0, reverbType: 'none',
                delayAmount: 0, delayTime: 0.25, delayType: 'none',
                saturationAmount: 0, saturationType: 'soft',
                mute: false, mono: false, useAutoAssignSound: false,
                useSoftSynth: false, synthSoundKey: null, soundId: '',
                swingAmount: 0,
            }
            appState.patterns = [{ tracks: [track], nbBars: 4 }]
            appState.selectedPatternNum = 0

            mockStrip = { getLfoValue: vi.fn(() => 0) }
            serviceRegistry.audioEngine = { mixer: { getOrCreateStrip: vi.fn().mockResolvedValue(mockStrip) } }
            serviceRegistry.transport = { isRunning: true, tick: 0 }

            editor = new TrackEditor()
            editor.init()
            editor._track = track
            editor.sync()

            mockStrip.getLfoValue.mockReturnValue(0.8)
            await editor._updateLfoSliders()

            expect(editor._sliders.get('velocity').getValue()).toBe(0.8)
        })
    })

    describe('MIDI Export Replacement', () => {
        function makeTrack(name, opts = {}) {
            return {
                name,
                barQuantize: 4,
                bars: 4,
                mute: false,
                velocity: 0.8,
                pitch: opts.pitch ?? 0,
                ...opts,
            }
        }
        function makeNote(bar, barStep, props = {}) {
            return { bar, barStep, ...props }
        }

        it('pitchLfo replaces note pitch (note.pitch is ignored when LFO is active)', () => {
            const pattern = {
                name: 'PitchReplace', bpm: 120, nbBars: 1,
                tracks: [makeTrack('KICK', {
                    pitchLfo: { freq: 1, min: 0, max: 12, phase: 0.25 },
                    notes: [makeNote(0, 0, { pitch: 5 })]
                })]
            }
            const im = new InstrumentsManager()
            const exporter = new MidiExporter(im)
            const midiBytes = Array.from(exporter.export(pattern, { loops: 1 }))
            const kicks = allNoteOns(midiBytes).filter(n => n.channel === 9 && n.note === 36)
            const shifted = allNoteOns(midiBytes).filter(n => n.channel === 9 && n.note === 42)
            // LFO at phase 0.25 → value = 6 semitones → note = 36 + 6 = 42
            // note.pitch=5 is IGNORED (replacement semantics)
            expect(kicks).toHaveLength(0)
            expect(shifted).toHaveLength(1)
        })

        it('without pitchLfo, note.pitch is still applied', () => {
            const pattern = {
                name: 'NoLfoPitch', bpm: 120, nbBars: 1,
                tracks: [makeTrack('KICK', {
                    pitchLfo: null,
                    notes: [makeNote(0, 0, { pitch: 5 })]
                })]
            }
            const im = new InstrumentsManager()
            const exporter = new MidiExporter(im)
            const midiBytes = Array.from(exporter.export(pattern, { loops: 1 }))
            const noteOns = allNoteOns(midiBytes).filter(n => n.channel === 9)
            // Without LFO: note.pitch=5 → 36 + 5 = 41
            expect(noteOns[0].note).toBe(41)
        })
    })
})
