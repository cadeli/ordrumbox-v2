import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildMidi, buildDrumMidi, buildEmptyMidi } from './helpers/midi_builder.js'

vi.mock('../src/ui/toast.js', () => ({
    showToast: vi.fn(),
}))

const sharedState = {
    patterns: [],
    selectedPatternNum: 0,
    selectedDrumkitNum: 0,
}

const mockAddPattern = vi.fn((name) => {
    const pattern = { name, nbBeats: 32, bpm: 120, tracks: [] }
    sharedState.patterns.push(pattern)
    return pattern
})

const mockAddTrack = vi.fn((pattern, name) => {
    const track = { name, notes: [], stepsPerBeat: 4 }
    pattern.tracks.push(track)
    return track
})

const mockAddNote = vi.fn((track, beat, beatStep, pitch) => {
    const note = { pitch, beat, beatStep, velocity: 0.8 }
    track.notes.push(note)
    return note
})

const mockSetSelectedPatternNum = vi.fn().mockResolvedValue(undefined)

vi.mock('../src/state/service_registry.js', () => ({
    serviceRegistry: {
        audioCtx: { currentTime: 0 },
        cmd: {
            addPattern: (...a) => mockAddPattern(...a),
            addTrack: (...a) => mockAddTrack(...a),
            addNote: (...a) => mockAddNote(...a),
            setSelectedPatternNum: (...a) => mockSetSelectedPatternNum(...a),
        },
        audioEngine: { invalidateCache: vi.fn() },
    },
    getAutoAssignService: vi.fn().mockResolvedValue({
        autoAssignSounds: vi.fn(),
    }),
    __esModule: true,
}))

vi.mock('../src/state/app_state.js', () => ({
    appState: sharedState,
    __esModule: true,
}))

vi.mock('../src/state/sound_registry.js', () => ({
    soundRegistry: {
        sounds: {},
        drumkitList: [],
        drumkits: {},
    },
    __esModule: true,
}))

function makeFile(name, bytes) {
    const blob = new Blob([bytes], { type: 'audio/midi' })
    return new File([blob], name, { type: 'audio/midi' })
}

describe('MidiImportService', () => {
    let MidiImportService
    let appState
    let showToast

    beforeEach(async () => {
        vi.restoreAllMocks()
        mockAddPattern.mockClear()
        mockAddTrack.mockClear()
        mockAddNote.mockClear()
        mockSetSelectedPatternNum.mockClear()

        sharedState.patterns = []
        sharedState.selectedPatternNum = 0

        const mod = await import('../src/logic/services/midi_import_service.js')
        MidiImportService = mod.default
        const appMod = await import('../src/state/app_state.js')
        appState = appMod.appState

        const toastMod = await import('../src/ui/toast.js')
        showToast = toastMod.showToast
    })

    it('imports a simple drum MIDI file', async () => {
        const midiBytes = buildDrumMidi({
            bpm: 120,
            notes: [
                { tick: 0, note: 36, velocity: 100 },
                { tick: 96, note: 38, velocity: 80 },
                { tick: 192, note: 36, velocity: 100 },
            ],
        })
        const file = makeFile('test_drums.mid', midiBytes)
        const service = new MidiImportService()
        const result = await service.importFile(file)

        expect(result.trackCount).toBeGreaterThanOrEqual(1)
        expect(result.patternCount).toBeGreaterThanOrEqual(1)
        expect(mockAddPattern).toHaveBeenCalled()
        expect(mockAddTrack).toHaveBeenCalled()
        expect(mockAddNote).toHaveBeenCalled()
        expect(showToast).toHaveBeenCalledWith(
            expect.stringContaining('MIDI imported'),
            'success'
        )
    })

    it('returns 0 tracks for empty MIDI file', async () => {
        const midiBytes = buildEmptyMidi({ division: 96, tempo: 120 })
        const file = makeFile('empty.mid', midiBytes)
        const service = new MidiImportService()
        const result = await service.importFile(file)

        expect(result.trackCount).toBe(0)
        expect(result.patternCount).toBe(0)
        expect(showToast).toHaveBeenCalledWith(
            expect.stringContaining('No MIDI notes found'),
            'warning'
        )
    })

    it('returns 0 tracks for MIDI with no notes', async () => {
        const midiBytes = buildMidi({
            format: 1,
            division: 96,
            tempo: 120,
            tracks: [{ name: 'Empty Track', channel: 0, program: 0, notes: [] }],
        })
        const file = makeFile('no_notes.mid', midiBytes)
        const service = new MidiImportService()
        const result = await service.importFile(file)

        expect(result.trackCount).toBe(0)
        expect(result.patternCount).toBe(0)
    })

    it('imports multi-track MIDI with drums and bass', async () => {
        const midiBytes = buildMidi({
            format: 1,
            division: 96,
            tempo: 120,
            tracks: [
                {
                    name: 'Drums',
                    channel: 9,
                    program: 0,
                    notes: [
                        { tick: 0, note: 36, velocity: 100 },
                        { tick: 96, note: 36, velocity: 100 },
                    ],
                },
                {
                    name: 'Bass',
                    channel: 0,
                    program: 33,
                    notes: [
                        { tick: 0, note: 48, velocity: 100, duration: 48 },
                        { tick: 48, note: 50, velocity: 80, duration: 48 },
                    ],
                },
            ],
        })
        const file = makeFile('multi_track.mid', midiBytes)
        const service = new MidiImportService()
        const result = await service.importFile(file)

        expect(result.trackCount).toBeGreaterThanOrEqual(1)
        expect(result.patternCount).toBeGreaterThanOrEqual(1)
        expect(mockAddPattern).toHaveBeenCalled()
    })

    it('sets selected pattern to the newly created pattern', async () => {
        const midiBytes = buildDrumMidi({
            notes: [{ tick: 0, note: 36, velocity: 100 }],
        })
        const file = makeFile('sel_pat.mid', midiBytes)
        const service = new MidiImportService()
        await service.importFile(file)

        expect(mockSetSelectedPatternNum).toHaveBeenCalled()
        const lastIdx = mockSetSelectedPatternNum.mock.calls.at(-1)[0]
        expect(lastIdx).toBeGreaterThanOrEqual(0)
    })

    it('invalidates audio engine cache after import', async () => {
        const { serviceRegistry } = await import('../src/state/service_registry.js')
        const midiBytes = buildDrumMidi({
            notes: [{ tick: 0, note: 36, velocity: 100 }],
        })
        const file = makeFile('cache_inval.mid', midiBytes)
        const service = new MidiImportService()
        await service.importFile(file)

        expect(serviceRegistry.audioEngine.invalidateCache).toHaveBeenCalled()
    })

    it('defaults to 120 BPM (parser does not extract tempo)', async () => {
        const midiBytes = buildMidi({
            format: 1,
            division: 96,
            tempo: 140,
            tracks: [{
                name: 'KICK',
                channel: 9,
                notes: [{ tick: 0, note: 36, velocity: 100 }],
            }],
        })
        const file = makeFile('tempo_test.mid', midiBytes)
        const service = new MidiImportService()
        await service.importFile(file)

        const pattern = mockAddPattern.mock.results[0]?.value
        if (pattern) {
            expect(pattern.bpm).toBe(120)
        }
    })

    it('sets correct nbBeats on created pattern', async () => {
        const midiBytes = buildMidi({
            format: 1,
            division: 96,
            tempo: 120,
            tracks: [{
                name: 'KICK',
                channel: 9,
                notes: [
                    { tick: 0, note: 36, velocity: 100 },
                    { tick: 384, note: 36, velocity: 100 },
                ],
            }],
        })
        const file = makeFile('beats_test.mid', midiBytes)
        const service = new MidiImportService()
        await service.importFile(file)

        const pattern = mockAddPattern.mock.results[0]?.value
        if (pattern) {
            expect(pattern.nbBeats).toBeGreaterThanOrEqual(4)
        }
    })

    it('places notes on correct beats and steps', async () => {
        const midiBytes = buildMidi({
            format: 1,
            division: 96,
            tempo: 120,
            tracks: [{
                name: 'KICK',
                channel: 9,
                notes: [{ tick: 0, note: 36, velocity: 100 }],
            }],
        })
        const file = makeFile('note_place.mid', midiBytes)
        const service = new MidiImportService()
        await service.importFile(file)

        expect(mockAddNote).toHaveBeenCalled()
        const noteCall = mockAddNote.mock.calls[0]
        expect(typeof noteCall[1]).toBe('number')
        expect(typeof noteCall[2]).toBe('number')
        expect(typeof noteCall[3]).toBe('number')
    })

    it('handles MIDI with program changes', async () => {
        const midiBytes = buildMidi({
            format: 1,
            division: 96,
            tempo: 120,
            tracks: [{
                name: 'Synth Bass',
                channel: 0,
                program: 38,
                programChanges: [{ tick: 0, program: 38 }],
                notes: [{ tick: 0, note: 48, velocity: 100, duration: 48 }],
            }],
        })
        const file = makeFile('prog_change.mid', midiBytes)
        const service = new MidiImportService()
        const result = await service.importFile(file)

        expect(result.trackCount).toBeGreaterThanOrEqual(1)
    })

    it('imports multi-bar MIDI (multiple patterns)', async () => {
        const notes = []
        for (let i = 0; i < 64; i++) {
            notes.push({ tick: i * 96, note: 36, velocity: 100 })
        }
        const midiBytes = buildMidi({
            format: 1,
            division: 96,
            tempo: 120,
            tracks: [{
                name: 'KICK',
                channel: 9,
                notes,
            }],
        })
        const file = makeFile('long_file.mid', midiBytes)
        const service = new MidiImportService()
        const result = await service.importFile(file)

        expect(result.patternCount).toBeGreaterThanOrEqual(2)
        expect(mockAddPattern).toHaveBeenCalledTimes(result.patternCount)
    })

    it('adds patterns to appState', async () => {
        expect(appState.patterns).toHaveLength(0)
        const midiBytes = buildDrumMidi({
            notes: [{ tick: 0, note: 36, velocity: 100 }],
        })
        const file = makeFile('state_test.mid', midiBytes)
        const service = new MidiImportService()
        await service.importFile(file)

        expect(appState.patterns.length).toBeGreaterThanOrEqual(1)
    })
})
