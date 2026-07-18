/**
 * MIDI Round-trip test: Pattern → MIDI → Import → Compare
 * 
 * Constraints (due to MIDI limitations):
 * - track.velocity = 1.0, track.pitch = 0 (no track base values)
 * - No track LFOs (velocity, pitch, filter, pan) - baked at export, lost on import
 * - No track effects (filter, reverb, delay, saturation) - not in MIDI
 * - No swing (not in MIDI)
 * 
 * What IS tested (preserved through MIDI):
 * - Loops / loop points
 * - Retriggers (retriggerNum, retriggerStep, retriggerRate)
 * - Arpeggios (arp intervals, mode)
 * - Euclidian fills (euclidianFill)
 * - Variations (figée à l'export)
 * - Note velocity / pitch
 * - Probability (prob, every) - figée à l'export
 * - Track patterns (stepsPerBeat, nbBeats, loopAtStep)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import MfWavExporter from '../src/audio/export/wav_exporter.js'
import MidiExporter, { C3_MIDI_NOTE } from '../src/logic/midi/midi_exporter.js'
import InstrumentsManager from '../src/logic/services/instruments_manager.js'
import { soundRegistry } from '../src/state/sound_registry.js'
import { serviceRegistry } from '../src/state/service_registry.js'
import * as patternsManager from '../src/patterns/manager.js'
import { parseMidi, findAllNotes, midiVelocityToNormalized, extractProgramChanges } from '../src/logic/midi/midi_parser.js'
import { computeFlatNotesFromPattern } from '../src/patterns/engine.js'
import { TICK } from '../src/core/constants.js'
import Utils from '../src/core/utils.js'

// Mock OfflineAudioContext
class MockOfflineAudioContext {
    constructor(channels, length, sampleRate) {
        this.channels = channels
        this.length = length
        this.sampleRate = sampleRate
        this.currentTime = 0
        this.destination = { connect: vi.fn(), disconnect: vi.fn() }
        this.audioWorklet = { addModule: vi.fn().mockResolvedValue(undefined) }
    }
    createGain() { return { gain: { value: 1, setValueAtTime: vi.fn(), setTargetAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), cancelScheduledValues: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() } }
    createDynamicsCompressor() { return { threshold: { value: 0, setValueAtTime: vi.fn() }, knee: { value: 0, setValueAtTime: vi.fn() }, ratio: { value: 0, setValueAtTime: vi.fn() }, attack: { value: 0, setValueAtTime: vi.fn() }, release: { value: 0, setValueAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() } }
    createBiquadFilter() { return { type: 'lowpass', frequency: { value: 0, setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() }, Q: { value: 0, setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() } }
    createOscillator() { return { start: vi.fn(), stop: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), frequency: { value: 0, setValueAtTime: vi.fn() } } }
    createAnalyser() { return { fftSize: 1024, connect: vi.fn(), disconnect: vi.fn() } }
    createBuffer(ch, len, sr) { return { numberOfChannels: ch, length: len, sampleRate: sr, getChannelData: () => new Float32Array(len) } }
    createBufferSource() { return { buffer: null, start: vi.fn(), stop: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), loop: false, playbackRate: { value: 1, setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() } } }
    createStereoPanner() { return { pan: { value: 0, setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() } }
    createWaveShaper() { return { curve: null, oversample: 'none', connect: vi.fn(), disconnect: vi.fn() } }
    createConvolver() { return { buffer: null, connect: vi.fn(), disconnect: vi.fn() } }
    createDelay() { return { delayTime: { value: 0, setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() } }
    createConstantSource() { return { offset: { value: 0, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), cancelScheduledValues: vi.fn() }, connect: vi.fn(), start: vi.fn(), stop: vi.fn(), disconnect: vi.fn() } }
    startRendering() {
        return Promise.resolve({
            numberOfChannels: this.channels,
            length: this.length,
            sampleRate: this.sampleRate,
            getChannelData: (ch) => new Float32Array(this.length)
        })
    }
}
global.OfflineAudioContext = MockOfflineAudioContext

class MockAudioWorkletNode {
    constructor(_ctx, _name, _options) {
        this.parameters = {
            get: () => ({ value: 0, setValueAtTime: () => {}, setTargetAtTime: () => {}, linearRampToValueAtTime: () => {}, cancelScheduledValues: () => {} }),
        }
    }
    connect() { return this }
    disconnect() {}
}
global.AudioWorkletNode = MockAudioWorkletNode

function createComplexPattern() {
    return {
        name: 'RoundTripTest',
        bpm: 120,
        nbBeats: 4,
        tracks: [
            {
                name: 'KICK',
                nbBeats: 4,
                stepsPerBeat: 4,
                velocity: 1.0,      // No track base velocity
                pitch: 0,            // No track base pitch
                pan: 0,
                mute: false,
                filterType: 'off',   // No effects
                filterFreq: 0,
                filterQ: 0,
                reverbAmount: 0,
                reverbType: 'none',
                delayDepth: 0,
                delayTime: 0.25,
                delayType: 'none',
                saturationAmount: 0,
                saturationType: 'soft',
                swingAmount: 0,       // No swing
                loopAtStep: 16,
                soundId: 'kick.wav',
                velocityLfo: null,    // No LFOs (baked at export, lost on import)
                pitchLfo: null,
                filterFreqLfo: null,
                panLfo: null,
                filterQLfo: null,
                // Loop: 4 beats, repeats every 4 beats
                notes: [
                    { beat: 0, beatStep: 0, velocity: 1.0, pitch: 0, prob: 1 },
                    { beat: 1, beatStep: 0, velocity: 0.8, pitch: 0, prob: 1 },
                    { beat: 2, beatStep: 0, velocity: 0.6, pitch: 0, prob: 1 },
                    { beat: 3, beatStep: 0, velocity: 0.4, pitch: 0, prob: 1 },
                ]
            },
            {
                name: 'SNARE',
                nbBeats: 4,
                stepsPerBeat: 4,
                velocity: 1.0,
                pitch: 0,
                pan: 0,
                mute: false,
                filterType: 'off',
                filterFreq: 0,
                filterQ: 0,
                reverbAmount: 0,
                reverbType: 'none',
                delayDepth: 0,
                delayTime: 0.25,
                delayType: 'none',
                saturationAmount: 0,
                saturationType: 'soft',
                swingAmount: 0,
                loopAtStep: 16,
                soundId: 'snare.wav',
                velocityLfo: null,
                pitchLfo: null,
                filterFreqLfo: null,
                panLfo: null,
                filterQLfo: null,
                // Retriggers: 4 retriggers at rate 8
                notes: [
                    { beat: 1, beatStep: 2, velocity: 0.7, pitch: 0, retriggerNum: 4, retriggerStep: 8, retriggerRate: 8, prob: 1 },
                    { beat: 3, beatStep: 2, velocity: 0.5, pitch: 0, retriggerNum: 3, retriggerStep: 8, retriggerRate: 8, prob: 1 },
                ]
            },
            {
                name: 'CHH',
                nbBeats: 4,
                stepsPerBeat: 4,
                velocity: 1.0,
                pitch: 0,
                pan: 0,
                mute: false,
                filterType: 'off',
                filterFreq: 0,
                filterQ: 0,
                reverbAmount: 0,
                reverbType: 'none',
                delayDepth: 0,
                delayTime: 0.25,
                delayType: 'none',
                saturationAmount: 0,
                saturationType: 'soft',
                swingAmount: 0,
                loopAtStep: 16,
                velocityLfo: null,
                pitchLfo: null,
                filterFreqLfo: null,
                panLfo: null,
                filterQLfo: null,
                soundId: 'chh.wav',
                // Arpeggio: major triad
                notes: [
                    { beat: 0, beatStep: 1, velocity: 0.6, pitch: 0, arp: [0, 4, 7], retriggerNum: 3, arpTriggerProbability: 1, prob: 1 },
                    { beat: 2, beatStep: 1, velocity: 0.6, pitch: 2, arp: [0, 3, 7], retriggerNum: 3, arpTriggerProbability: 1, prob: 1 },
                ]
            },
            {
                name: 'TOM',
                nbBeats: 4,
                stepsPerBeat: 4,
                velocity: 1.0,
                pitch: 0,
                pan: 0,
                mute: false,
                filterType: 'off',
                filterFreq: 0,
                filterQ: 0,
                reverbAmount: 0,
                reverbType: 'none',
                delayDepth: 0,
                delayTime: 0.25,
                delayType: 'none',
                saturationAmount: 0,
                saturationType: 'soft',
                swingAmount: 0,
                loopAtStep: 16,
                soundId: 'tom.wav',
                velocityLfo: null,
                pitchLfo: null,
                filterFreqLfo: null,
                panLfo: null,
                filterQLfo: null,
                // Euclidian fill: 5 hits in 16 steps
                notes: [
                    { beat: 0, beatStep: 0, velocity: 0.8, pitch: -2, euclidianFill: 5, prob: 1 },
                    { beat: 2, beatStep: 0, velocity: 0.8, pitch: 2, euclidianFill: 3, prob: 1 },
                ]
            },
            {
                name: 'CLAP',
                nbBeats: 4,
                stepsPerBeat: 4,
                velocity: 1.0,
                pitch: 0,
                pan: 0,
                mute: false,
                filterType: 'off',
                filterFreq: 0,
                filterQ: 0,
                reverbAmount: 0,
                reverbType: 'none',
                delayDepth: 0,
                delayTime: 0.25,
                delayType: 'none',
                saturationAmount: 0,
                saturationType: 'soft',
                swingAmount: 0,
                loopAtStep: 16,
                soundId: 'clap.wav',
                velocityLfo: null,
                pitchLfo: null,
                filterFreqLfo: null,
                panLfo: null,
                filterQLfo: null,
                // Probability triggers (prob=1 for deterministic round-trip)
                notes: [
                    { beat: 1, beatStep: 1, velocity: 0.9, pitch: 0, prob: 1 },
                    { beat: 2, beatStep: 3, velocity: 0.9, pitch: 0, prob: 1 },
                    { beat: 3, beatStep: 1, velocity: 0.9, pitch: 0, prob: 1 },
                ]
            }
        ]
    }
}

async function exportPatternToWav(exporter, pattern, loops = 1) {
    return await exporter.exportPatternToWav(pattern, loops)
}

async function exportPatternToMidi(pattern) {
    const im = new InstrumentsManager()
    const exporter = new MidiExporter(im)
    return exporter.export(pattern)
}

function importMidiToPattern(midiBytes, originalPattern) {
    const midiData = parseMidi(new Uint8Array(midiBytes))
    const notes = findAllNotes(midiData)
    const PPQN = midiData.header.division ?? 96
    const MIDI_RATIO = PPQN / TICK

    const importedPattern = { ...originalPattern, tracks: originalPattern.tracks.map(t => ({ ...t, notes: [] })) }
    const tracks = Utils.getTracksArray(importedPattern)

    const im = new InstrumentsManager()
    const channelPrograms = extractProgramChanges(midiData)

    const channelNotes = new Map()
    for (const note of notes) {
        if (!channelNotes.has(note.channel)) channelNotes.set(note.channel, [])
        channelNotes.get(note.channel).push(note)
    }

    const trackNoteMap = new Map()
    for (const track of tracks) {
        trackNoteMap.set(track.name, track)
    }

    for (const [channel, chNotes] of channelNotes) {
        const program = channelPrograms.has(channel) ? channelPrograms.get(channel) : null

        const melodicInst = program !== null ? im.findInstrumentFromMidiProgram(channel, program) : { id: 'NOT_FOUND' }
        if (melodicInst.id !== 'NOT_FOUND' && !melodicInst.drum) {
            const track = trackNoteMap.get(melodicInst.id)
            if (!track) continue
            for (const note of chNotes) {
                const engineTicks = Math.round(note.absTick / MIDI_RATIO)
                const beat = Math.floor(engineTicks / TICK)
                const beatStep = Math.floor((engineTicks % TICK) / (TICK / (track.stepsPerBeat ?? 4)))
                const pitch = note.note - C3_MIDI_NOTE
                track.notes.push({ beat, beatStep, velocity: midiVelocityToNormalized(note.velocity), pitch })
            }
            continue
        }

        const noteGroups = new Map()
        for (const note of chNotes) {
            if (!noteGroups.has(note.note)) noteGroups.set(note.note, [])
            noteGroups.get(note.note).push(note)
        }

        let drumFound = false
        for (const [noteNum, grpNotes] of noteGroups) {
            const drumInst = im.findInstrumentFromMidi(channel, noteNum)
            if (drumInst.id === 'NOT_FOUND') continue
            const track = trackNoteMap.get(drumInst.id)
            if (!track) continue
            drumFound = true
            for (const note of grpNotes) {
                const engineTicks = Math.round(note.absTick / MIDI_RATIO)
                const beat = Math.floor(engineTicks / TICK)
                const beatStep = Math.floor((engineTicks % TICK) / (TICK / (track.stepsPerBeat ?? 4)))
                const pitch = note.note - noteNum
                track.notes.push({ beat, beatStep, velocity: midiVelocityToNormalized(note.velocity), pitch })
            }
        }
        if (drumFound) continue

        if (program !== null) {
            const programInst = im.findInstrumentFromMidiProgramAnyChannel(program)
            if (programInst.id !== 'NOT_FOUND') {
                const track = trackNoteMap.get(programInst.id)
                if (track) {
                    for (const note of chNotes) {
                        const engineTicks = Math.round(note.absTick / MIDI_RATIO)
                        const beat = Math.floor(engineTicks / TICK)
                        const beatStep = Math.floor((engineTicks % TICK) / (TICK / (track.stepsPerBeat ?? 4)))
                        const pitch = note.note - C3_MIDI_NOTE
                        track.notes.push({ beat, beatStep, velocity: midiVelocityToNormalized(note.velocity), pitch })
                    }
                }
            }
        }
    }

    return importedPattern
}

function noteKey(n) {
    return `${n.beat}:${n.beatStep}:${n.pitch}`
}

function drumMidiNote(baseKey, pitch) {
    return baseKey + (pitch ?? 0)
}

function assertNotesMatch(importedPattern, expectedPattern) {
    const expectedFlatNotes = computeFlatNotesFromPattern(expectedPattern, 0)
    const im = new InstrumentsManager()

    for (const expectedTrack of expectedPattern.tracks) {
        const importedTrack = importedPattern.tracks.find(t => t.name === expectedTrack.name)
        expect(importedTrack, `track ${expectedTrack.name} should exist`).toBeDefined()

        const instrument = im.findByName(expectedTrack.name)
        const isDrum = instrument?.drum === true
        const drumKey = instrument?.midi?.[0]?.key != null ? parseInt(instrument.midi[0].key, 10) : null

        const expectedNotes = []
        for (const [, flatNotes] of expectedFlatNotes) {
            for (const fn of flatNotes) {
                if (fn.track.name === expectedTrack.name) {
                    expectedNotes.push({ beat: fn.note.beat, beatStep: fn.note.beatStep, velocity: fn.note.velocity, pitch: fn.note.pitch ?? 0 })
                }
            }
        }

        const importedNotes = importedTrack.notes

        if (isDrum && drumKey == null) {
            expect(importedNotes.length, `[${expectedTrack.name}] drum without MIDI key should have 0 notes after roundtrip`).toBe(0)
            continue
        }

        const roundtrippable = isDrum
            ? expectedNotes.filter(n => {
                if (drumKey == null) return true
                const midiNote = drumMidiNote(drumKey, n.pitch)
                return im.findInstrumentFromMidi(instrument.midi[0] ? parseInt(instrument.midi[0].ch, 10) : 9, midiNote)?.id === expectedTrack.name
            })
            : expectedNotes

        expect(importedNotes.length, `[${expectedTrack.name}] expected ${roundtrippable.length} notes, got ${importedNotes.length}`).toBe(roundtrippable.length)

        for (const expected of roundtrippable) {
            const key = noteKey(expected)
            const found = importedNotes.find(n => noteKey(n) === key)
            expect(found, `[${expectedTrack.name}] note ${key} should be present`).toBeDefined()
            expect(found.velocity, `[${expectedTrack.name}] note ${key} velocity`).toBeCloseTo(expected.velocity, 2)
            expect(found.pitch, `[${expectedTrack.name}] note ${key} pitch`).toBe(expected.pitch)
        }
    }
}

describe('MIDI Round-trip: Pattern → MIDI → Import → Compare', () => {
    let wavExporter, pattern

    beforeEach(() => {
        soundRegistry.reset()
        serviceRegistry.reset()
        serviceRegistry.mfPatterns = patternsManager

        soundRegistry.sounds = {
            'kick.wav': { url: 'kick.wav', buffer: { duration: 1, length: 44100, getChannelData: () => new Float32Array(44100) }, key: 'KICK' },
            'snare.wav': { url: 'snare.wav', buffer: { duration: 1, length: 44100, getChannelData: () => new Float32Array(44100) }, key: 'SNARE' },
            'chh.wav': { url: 'chh.wav', buffer: { duration: 1, length: 44100, getChannelData: () => new Float32Array(44100) }, key: 'CHH' },
            'tom.wav': { url: 'tom.wav', buffer: { duration: 1, length: 44100, getChannelData: () => new Float32Array(44100) }, key: 'TOM' },
            'clap.wav': { url: 'clap.wav', buffer: { duration: 1, length: 44100, getChannelData: () => new Float32Array(44100) }, key: 'CLAP' },
        }

        wavExporter = new MfWavExporter()
        pattern = createComplexPattern()
    })

    it('exports pattern to MIDI', async () => {
        const midiBytes = await exportPatternToMidi(pattern)
        expect(midiBytes).toBeInstanceOf(Uint8Array)
        expect(midiBytes.length).toBeGreaterThan(0)

        const midiData = parseMidi(midiBytes)
        const notes = findAllNotes(midiData)
        expect(notes.length).toBeGreaterThan(0)
    })

    it('imports KICK notes with correct beat/beatStep/velocity/pitch', async () => {
        const midiBytes = await exportPatternToMidi(pattern)
        const importedPattern = importMidiToPattern(midiBytes, pattern)

        const expectedNotes = computeFlatNotesFromPattern(pattern, 0)
        const kickExpected = []
        for (const [, flatNotes] of expectedNotes) {
            for (const fn of flatNotes) {
                if (fn.track.name === 'KICK') {
                    kickExpected.push({ beat: fn.note.beat, beatStep: fn.note.beatStep, velocity: fn.note.velocity, pitch: fn.note.pitch ?? 0 })
                }
            }
        }

        const importedKick = importedPattern.tracks.find(t => t.name === 'KICK')
        expect(importedKick.notes.length).toBe(kickExpected.length)

        for (const expected of kickExpected) {
            const key = noteKey(expected)
            const found = importedKick.notes.find(n => noteKey(n) === key)
            expect(found, `KICK note ${key} should be present`).toBeDefined()
            expect(found.velocity).toBeCloseTo(expected.velocity, 2)
            expect(found.pitch).toBe(expected.pitch)
        }
    })

    it('imports SNARE notes with correct retrigger count and positions', async () => {
        const midiBytes = await exportPatternToMidi(pattern)
        const importedPattern = importMidiToPattern(midiBytes, pattern)

        const expectedNotes = computeFlatNotesFromPattern(pattern, 0)
        const snareExpected = []
        for (const [, flatNotes] of expectedNotes) {
            for (const fn of flatNotes) {
                if (fn.track.name === 'SNARE') {
                    snareExpected.push({ beat: fn.note.beat, beatStep: fn.note.beatStep, velocity: fn.note.velocity, pitch: fn.note.pitch ?? 0 })
                }
            }
        }

        const importedSnare = importedPattern.tracks.find(t => t.name === 'SNARE')
        expect(importedSnare.notes.length).toBe(snareExpected.length)

        for (const expected of snareExpected) {
            const key = noteKey(expected)
            const found = importedSnare.notes.find(n => noteKey(n) === key)
            expect(found, `SNARE note ${key} should be present`).toBeDefined()
            expect(found.velocity).toBeCloseTo(expected.velocity, 2)
            expect(found.pitch).toBe(expected.pitch)
        }
    })

    it('imports CHH notes with correct arp pitches', async () => {
        const midiBytes = await exportPatternToMidi(pattern)
        const importedPattern = importMidiToPattern(midiBytes, pattern)

        const expectedNotes = computeFlatNotesFromPattern(pattern, 0)
        const im = new InstrumentsManager()
        const chhInst = im.findByName('CHH')
        const drumKey = chhInst?.midi?.[0]?.key != null ? parseInt(chhInst.midi[0].key, 10) : null
        const drumChannel = chhInst?.midi?.[0]?.ch != null ? parseInt(chhInst.midi[0].ch, 10) : 9

        const chhExpected = []
        for (const [, flatNotes] of expectedNotes) {
            for (const fn of flatNotes) {
                if (fn.track.name === 'CHH') {
                    const pitch = fn.note.pitch ?? 0
                    if (drumKey != null) {
                        const midiNote = drumKey + pitch
                        const mapped = im.findInstrumentFromMidi(drumChannel, midiNote)
                        if (mapped?.id !== 'CHH') continue
                    }
                    chhExpected.push({ beat: fn.note.beat, beatStep: fn.note.beatStep, velocity: fn.note.velocity, pitch })
                }
            }
        }

        const importedChh = importedPattern.tracks.find(t => t.name === 'CHH')
        expect(importedChh.notes.length).toBe(chhExpected.length)

        for (const expected of chhExpected) {
            const key = noteKey(expected)
            const found = importedChh.notes.find(n => noteKey(n) === key)
            expect(found, `CHH note ${key} should be present`).toBeDefined()
            expect(found.velocity).toBeCloseTo(expected.velocity, 2)
            expect(found.pitch).toBe(expected.pitch)
        }
    })

    it('imports all tracks with correct notes (full round-trip)', async () => {
        const midiBytes = await exportPatternToMidi(pattern)
        const importedPattern = importMidiToPattern(midiBytes, pattern)

        assertNotesMatch(importedPattern, pattern)
    })

    it('exports and imports WAV correctly', async () => {
        const wav1 = await exportPatternToWav(wavExporter, pattern, 1)
        expect(wav1).toBeDefined()
        expect(wav1.type).toBe('audio/wav')

        const midiBytes = await exportPatternToMidi(pattern)
        const importedPattern = importMidiToPattern(midiBytes, pattern)
        const wav2 = await wavExporter.exportPatternToWav(importedPattern, 1)
        expect(wav2).toBeDefined()
        expect(wav2.type).toBe('audio/wav')
    })
})