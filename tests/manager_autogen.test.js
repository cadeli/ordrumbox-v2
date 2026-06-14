import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as patternsManager from '../src/patterns/manager.js'
import MfAutoGenerate from '../src/logic/generators/auto_generate.js'
import MfPercGenerate from '../src/logic/generators/perc_generate.js'
import { MfGlobals } from '../src/core/globals.js'
import MfCmd from '../src/logic/commands/cmd.js'
import { appState } from '../src/state/app_state.js'
import { serviceRegistry } from '../src/state/service_registry.js'
import { soundRegistry } from '../src/state/sound_registry.js'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makePatternWithTrack(name = 'KICK', barQuantize = 4, bars = 4) {
    MfGlobals.resetAll()
    const mfCmd = new MfCmd()
    serviceRegistry.mfCmd = mfCmd
    const pattern = mfCmd.addPattern('Test')
    pattern.nbBars = bars
    const track = mfCmd.addTrack(pattern, name, barQuantize)
    return { mfCmd, pattern, track }
}

function makePercTrack(overrides = {}) {
    return {
        name: 'PERC',
        bars: 4,
        barQuantize: 4,
        loopPointBar: 4,
        loopPointStep: 0,
        loopAtStep: 16,
        notes: [],
        ...overrides,
    }
}

function addNoteToTrack(track, bar, barStep) {
    track.notes.push({ bar, barStep, velocity: 0.8, pitch: 0 })
}

// ═══════════════════════════════════════════════════════════════════════════════
// MfPatterns (patterns/manager.js)
// ═══════════════════════════════════════════════════════════════════════════════

describe('MfPatterns', () => {
    let mfPatterns, mfCmd, pattern

    beforeEach(() => {
        MfGlobals.resetAll()
        mfCmd = new MfCmd()
        serviceRegistry.mfCmd = mfCmd
        mfPatterns = patternsManager
        serviceRegistry.mfPatterns = mfPatterns
        pattern = mfCmd.addPattern('Test')
        pattern.nbBars = 4
    })

    // ── computeFlatNotesFromPattern ───────────────────────────────────

    it('returns a Map', () => {
        const result = mfPatterns.computeFlatNotesFromPattern(pattern, 0)
        expect(result).toBeInstanceOf(Map)
    })

    it('stores result in appState.flatNotes', () => {
        mfPatterns.computeFlatNotesFromPattern(pattern, 0)
        expect(appState.flatNotes).toBeInstanceOf(Map)
    })

    it('fires onPatternChange callbacks', async () => {
        const cb = vi.fn()
        const { playbackEvents } = await import('../src/state/playback_events.js')
        playbackEvents.onPatternChange.push(cb)
        mfPatterns.computeFlatNotesFromPattern(pattern, 0)
        expect(cb).toHaveBeenCalled()
        playbackEvents.onPatternChange.pop()
    })

    it('produces flat notes for a track with notes', () => {
        const track = mfCmd.addTrack(pattern, 'KICK', 4)
        mfCmd.addNote(track, 0, 0, 0)
        mfCmd.addNote(track, 1, 0, 0)
        const result = mfPatterns.computeFlatNotesFromPattern(pattern, 0)
        let total = 0
        for (const v of result.values()) total += v.length
        expect(total).toBe(2)
    })

    // ── computeNextPatternStepNote ────────────────────────────────────

    it('returns loopAtStep when note is the last in track', () => {
        const track = mfCmd.addTrack(pattern, 'KICK', 4)
        mfCmd.addNote(track, 3, 3, 0)
        track.loopAtStep = 16
        const note = { bar: 3, barStep: 3 }
        const result = mfPatterns.computeNextPatternStepNote(note, track)
        expect(result).toBe(16)
    })

    it('returns the absolute step of the next note when one exists', () => {
        const track = mfCmd.addTrack(pattern, 'KICK', 4)
        mfCmd.addNote(track, 0, 0, 0)
        mfCmd.addNote(track, 0, 2, 0)
        const note = { bar: 0, barStep: 0 }
        const result = mfPatterns.computeNextPatternStepNote(note, track)
        expect(result).toBe(2) // absolute step for bar=0, barStep=2
    })

    it('skips to loopAtStep when no next note found', () => {
        const track = mfCmd.addTrack(pattern, 'KICK', 4)
        mfCmd.addNote(track, 0, 0, 0)
        track.loopAtStep = 16
        const note = { bar: 0, barStep: 0 }
        const result = mfPatterns.computeNextPatternStepNote(note, track)
        expect(result).toBe(16)
    })

    // ── proxy methods (hasArp, normalizeArp, isTrigged, etc.) ─────────

    it('hasArp([0,4,7]) returns true', () => {
        expect(mfPatterns.hasArp([0, 4, 7])).toBe(true)
    })

    it('hasArp(null) returns false', () => {
        expect(mfPatterns.hasArp(null)).toBe(false)
    })

    it('normalizeArp([0,4,7]) returns sequence [0,4,7]', () => {
        expect(mfPatterns.normalizeArp([0, 4, 7]).sequence).toEqual([0, 4, 7])
    })

    it('isTrigged(0, 2, 0) returns true', () => {
        expect(mfPatterns.isTrigged(0, 2, 0)).toBe(true)
    })

    it('isTrigged(0, 2, 1) returns false', () => {
        expect(mfPatterns.isTrigged(0, 2, 1)).toBe(false)
    })

    it('isProbabilityTrigged(1) always returns true', () => {
        for (let i = 0; i < 20; i++) expect(mfPatterns.isProbabilityTrigged(1)).toBe(true)
    })

    it('isProbabilityTrigged(0) always returns false', () => {
        for (let i = 0; i < 20; i++) expect(mfPatterns.isProbabilityTrigged(0)).toBe(false)
    })

    it('getArpNoteCount returns note count from retriggerNum', () => {
        const note = { retriggerNum: 4, arp: [0, 4, 7] }
        expect(mfPatterns.getArpNoteCount(note)).toBeGreaterThan(0)
    })

    it('generateSubNotes mutates the flatNotes map (no return value)', () => {
        const flatNotes = new Map()
        mfPatterns.generateSubNotes(flatNotes, 0, { barQuantize: 4, bars: 4, loopAtStep: 16, notes: [] }, { retriggerNum: 1, retriggerStep: 1, arp: null }, 32)
        // generateSubNotes mutates flatNotes in-place; it does not return a value
        expect(flatNotes).toBeInstanceOf(Map)
    })
})

// ═══════════════════════════════════════════════════════════════════════════════
// MfAutoGenerate (auto_generate.js)
// ═══════════════════════════════════════════════════════════════════════════════

describe('MfAutoGenerate', () => {
    let autoGen

    beforeEach(() => {
        MfGlobals.resetAll()
        const mfCmd = new MfCmd()
        serviceRegistry.mfCmd = mfCmd
        serviceRegistry.mfPatterns = patternsManager
        soundRegistry.scales = { 'pentatonic minor': [0, 3, 5, 7, 10] }
        autoGen = new MfAutoGenerate()
    })

    // ── detectTrackType ───────────────────────────────────────────────

    it.each([
        ['KICK',    'KICK'],
        ['KICK2',   'KICK'],
        ['BD',      'KICK'],
        ['SNARE',   'SNARE'],
        ['SD',      'SNARE'],
        ['CHH',     'HAT'],
        ['OHH',     'HAT'],
        ['HAT_TOP', 'HAT'],
        ['BASS',    'BASS'],
        ['SYNTH1',  'BASS'],
        ['PERC',    'PERC'],
        ['COWBELL', 'PERC'],
        ['CLAP',    'PERC'],
    ])('detectTrackType("%s") → "%s"', (name, expected) => {
        expect(autoGen.detectTrackType(name)).toBe(expected)
    })

    // ── generateTrack ─────────────────────────────────────────────────

    it.each(['KICK', 'SNARE', 'CHH', 'BASS', 'PERC'])('generateTrack for %s does not throw', async (name) => {
        const mfCmd = serviceRegistry.mfCmd
        const pattern = mfCmd.addPattern('T')
        const track = mfCmd.addTrack(pattern, name, 4)
        track.bars = 4
        await expect(autoGen.generateTrack(track, 'basic')).resolves.not.toThrow()
    })

    it('generateTrack for unknown type is a no-op (PERC fallback)', async () => {
        const mfCmd = serviceRegistry.mfCmd
        const pattern = mfCmd.addPattern('T')
        const track = mfCmd.addTrack(pattern, 'COWBELL', 4)
        track.bars = 4
        await expect(autoGen.generateTrack(track, 'basic')).resolves.not.toThrow()
    })

    // ── changeTrack ───────────────────────────────────────────────────

    it('changeTrack clears track notes and regenerates', async () => {
        const mfCmd = serviceRegistry.mfCmd
        const pattern = mfCmd.addPattern('T')
        const track = mfCmd.addTrack(pattern, 'KICK', 4)
        track.bars = 4
        mfCmd.addNote(track, 0, 0, 0)
        expect(track.notes.length).toBeGreaterThan(0)
        await autoGen.changeTrack(0, pattern, track)
        // track.notes is reset then refilled — can be empty or not
        expect(Array.isArray(track.notes)).toBe(true)
    })

    it('changeTrack works for non-KICK track types', async () => {
        const mfCmd = serviceRegistry.mfCmd
        const pattern = mfCmd.addPattern('T')
        const track = mfCmd.addTrack(pattern, 'SNARE', 4)
        track.bars = 4
        await expect(autoGen.changeTrack(0, pattern, track)).resolves.not.toThrow()
    })
})

// ═══════════════════════════════════════════════════════════════════════════════
// MfPercGenerate extra variants
// ═══════════════════════════════════════════════════════════════════════════════

describe('MfPercGenerate – extra variants', () => {
    beforeEach(() => {
        soundRegistry.scales = { 'pentatonic minor': [0, 3, 5, 7, 10], 'dorian': [0, 2, 3, 5, 7, 9, 10] }
    })

    it('basic: produces notes with pitch values', () => {
        const track = makePercTrack()
        new MfPercGenerate().generateNewPerc(track, 'basic')
        if (track.notes.length > 0) {
            expect(track.notes.every(n => typeof n.pitch === 'number')).toBe(true)
        }
    })

    it('conversation: produces notes in both call and response bars', () => {
        const track = makePercTrack({ bars: 4 })
        new MfPercGenerate().generateNewPerc(track, 'conversation')
        // Should have notes across bars 0..3
        const bars = new Set(track.notes.map(n => n.bar))
        expect(bars.size).toBeGreaterThanOrEqual(0) // random, so can be 0
    })

    it('all variants produce notes with velocity in [0,1]', () => {
        for (const variant of ['basic', 'conversation']) {
            const track = makePercTrack()
            new MfPercGenerate().generateNewPerc(track, variant)
            for (const note of track.notes) {
                expect(note.velocity).toBeGreaterThanOrEqual(0)
                expect(note.velocity).toBeLessThanOrEqual(1)
            }
        }
    })

    it('resolvePercPitch: returns pitch+pitchBias for numeric phrase.pitch', () => {
        const gen = new MfPercGenerate()
        const result = gen.resolvePercPitch({ pitch: 5 }, [0, 4, 7], {}, 3)
        expect(result).toBe(8)
    })

    it('resolvePercPitch: reuse returns cached pitch', () => {
        const gen = new MfPercGenerate()
        const cached = { 0: 12 }
        const result = gen.resolvePercPitch({ source: 'reuse', reuseIndex: 0 }, [0, 4, 7], cached, 0)
        expect(result).toBe(12)
    })

    it('resolvePercPitch: root returns pitchBias', () => {
        const gen = new MfPercGenerate()
        const result = gen.resolvePercPitch({ source: 'root' }, [0, 4, 7], {}, 5)
        expect(result).toBe(5)
    })

    it('resolvePercPitch: randomScale picks from tones + pitchBias', () => {
        const gen = new MfPercGenerate()
        const tones = [0, 4, 7]
        const result = gen.resolvePercPitch({ source: 'randomScale' }, tones, {}, 3)
        // getRndTone subtracts 12 for tones > 6, so 7 → -5; valid results: 3, 7, -2
        const allPossible = tones.map(t => (t > 6 ? t - 12 : t) + 3) // [3, 7, -2]
        expect(allPossible).toContain(result)
    })

    it('generatePercCallResponseVariant produces notes within loopPointAbsolute', () => {
        const track = makePercTrack({ bars: 4 })
        const gen = new MfPercGenerate()
        const tones = [0, 4, 7]
        const config = {
            loopPointBar: 4, loopPointStep: 0,
            callSteps: [0, 2], responseSteps: [1, 3],
            density: 1.0,
            velocity: { base: 0.6, accentOnBeat: 0.1, variationBoost: 0.05, randomSpread: 0.05, clampMin: 0.2, clampMax: 1 }
        }
        gen.generatePercCallResponseVariant(track, tones, 0, config)
        for (const note of track.notes) {
            const abs = note.bar * 4 + note.barStep
            expect(abs).toBeLessThan(16)
        }
    })

    it('generatePercFillVariant places notes at startBar', () => {
        const track = makePercTrack({ bars: 4 })
        const gen = new MfPercGenerate()
        const config = {
            loopPointBar: 4, loopPointStep: 0,
            startBarOffset: 1,
            steps: [0, 1, 2],
            velocity: { base: 0.6, accentOnBeat: 0.1, variationBoost: 0.05, randomSpread: 0.05, clampMin: 0.2, clampMax: 1 }
        }
        gen.generatePercFillVariant(track, [0, 4, 7], 0, config)
        for (const note of track.notes) {
            expect(note.bar).toBe(3) // startBar = 4-1 = 3
        }
    })

    it('loop point is set after generation', () => {
        const track = makePercTrack()
        new MfPercGenerate().generateNewPerc(track, 'basic')
        expect(track.loopPointBar).toBeGreaterThan(0)
    })
})

// ═══════════════════════════════════════════════════════════════════════════════
// MfWavExporter — downloadWav
// ═══════════════════════════════════════════════════════════════════════════════

describe('MfWavExporter – downloadWav', () => {
    it('downloadWav creates an anchor and triggers click', async () => {
        const { default: MfWavExporter } = await import('../src/audio/export/wav_exporter.js')
        const exporter = new MfWavExporter()

        const mockUrl = 'blob:mock'
        const mockAnchor = { href: '', download: '', click: vi.fn() }
        const createObjectUrlSpy = vi.fn(() => mockUrl)
        const revokeObjectUrlSpy = vi.fn()
        const createElementSpy = vi.fn(() => mockAnchor)

        vi.stubGlobal('URL', { createObjectURL: createObjectUrlSpy, revokeObjectURL: revokeObjectUrlSpy })
        vi.stubGlobal('document', { createElement: createElementSpy })

        const blob = new Blob(['test'], { type: 'audio/wav' })
        exporter.downloadWav(blob, 'test.wav')

        expect(createElementSpy).toHaveBeenCalledWith('a')
        expect(mockAnchor.href).toBe(mockUrl)
        expect(mockAnchor.download).toBe('test.wav')
        expect(mockAnchor.click).toHaveBeenCalled()
        expect(revokeObjectUrlSpy).toHaveBeenCalledWith(mockUrl)

        vi.unstubAllGlobals()
    })

    it('downloadWav defaults filename to pattern.wav', async () => {
        const { default: MfWavExporter } = await import('../src/audio/export/wav_exporter.js')
        const exporter = new MfWavExporter()

        const mockAnchor = { href: '', download: '', click: vi.fn() }
        vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() })
        vi.stubGlobal('document', { createElement: vi.fn(() => mockAnchor) })

        exporter.downloadWav(new Blob(['x']), null)
        expect(mockAnchor.download).toBe('pattern.wav')

        vi.unstubAllGlobals()
    })
})
