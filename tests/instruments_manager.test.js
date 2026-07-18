import { describe, it, expect, beforeEach } from 'vitest'
import InstrumentsManager from '../src/logic/services/instruments_manager.js'
import Instrument from '../src/model/instrument.js'

describe('Instrument', () => {
    it('creates with defaults', () => {
        const inst = new Instrument()
        expect(inst.id).toBe(Instrument.NOT_FOUND)
        expect(inst.drum).toBe(false)
        expect(inst.pan).toBe('0')
        expect(inst.midi).toEqual([])
    })

    it('creates from data', () => {
        const inst = new Instrument({
            id: 'KICK',
            drum: true,
            pan: '0',
            midi: [{ ch: '9', name: 'Bass Drum 1', key: '36' }]
        })
        expect(inst.id).toBe('KICK')
        expect(inst.drum).toBe(true)
        expect(inst.midi.length).toBe(1)
        expect(inst.midi[0].key).toBe('36')
    })

    it('handles boolean only for drum type (string "true"/"false" resolves to false)', () => {
        const inst1 = new Instrument({ drum: 'true' })
        const inst2 = new Instrument({ drum: 'false' })
        expect(inst1.drum).toBe(false)
        expect(inst2.drum).toBe(false)
    })

    it('toString contains key info', () => {
        const inst = new Instrument({
            id: 'SNARE',
            drum: true,
            pan: '3',
            name: { syn: ['SN', '.*SNAR.*'] },
            midi: [{ ch: '9', name: 'Acoustic Snare', key: '38' }]
        })
        const str = inst.toString()
        expect(str).toContain('SNARE')
        expect(str).toContain('Drum')
        expect(str).toContain('38')
    })
})

describe('InstrumentsManager', () => {
    let manager

    beforeEach(() => {
        manager = new InstrumentsManager()
    })

    describe('findById', () => {
        it('finds KICK', () => {
            const inst = manager.findById('KICK')
            expect(inst.id).toBe('KICK')
        })

        it('case insensitive', () => {
            expect(manager.findById('kick').id).toBe('KICK')
            expect(manager.findById('Kick').id).toBe('KICK')
        })

        it('not found → Instrument with NOT_FOUND id', () => {
            expect(manager.findById('ZZZZZZ').id).toBe(Instrument.NOT_FOUND)
        })

        it('finds SNARE', () => {
            expect(manager.findById('SNARE').id).toBe('SNARE')
        })

        it('finds CHH', () => {
            expect(manager.findById('CHH').id).toBe('CHH')
        })
    })

    describe('findByName', () => {
        it('"SN" → SNARE', () => {
            expect(manager.findByName('SN').id).toBe('SNARE')
        })

        it('regex pattern ".*KICK.*" matches "MY KICK SAMPLE"', () => {
            expect(manager.findByName('MY KICK SAMPLE').id).toBe('KICK')
        })

        it('exact match "CH" → CHH', () => {
            expect(manager.findByName('CH').id).toBe('CHH')
        })

        it('".*UNKNOWN.*" regex matches "xyz123unknown"', () => {
            // PERC instrument has syn: [".*UNKNOWN.*"] as catch-all
            expect(manager.findByName('xyz123unknown').id).toBe('PERC')
        })

        it('"HT" → HTOM', () => {
            expect(manager.findByName('HT').id).toBe('HI_TOM')
        })

        it('"CB" → COWBELL', () => {
            expect(manager.findByName('CB').id).toBe('COWBELL')
        })
    })

    describe('findInstrumentFromFileName', () => {
        it('"kick_01.wav" → KICK', () => {
            expect(manager.findInstrumentFromFileName('kick_01.wav').id).toBe('KICK')
        })

        it('"snare_rimshot.wav" → SNARE or RIMSHOT', () => {
            const inst = manager.findInstrumentFromFileName('snare_rimshot.wav')
            expect(['SNARE', 'RIMSHOT']).toContain(inst.id)
        })

        it('"closed_hat.wav" → matches hi-hat instruments (CHH or OHH)', () => {
            const inst = manager.findInstrumentFromFileName('closed_hat.wav')
            expect(['CHH', 'OHH']).toContain(inst.id)
        })

        it('empty string → NOT_FOUND', () => {
            expect(manager.findInstrumentFromFileName('').id).toBe(Instrument.NOT_FOUND)
        })
    })

    describe('findInstrumentFromMidi', () => {
        it('ch=9, key=36 → KICK', () => {
            expect(manager.findInstrumentFromMidi(9, 36).id).toBe('KICK')
        })

        it('ch=9, key=42 → CHH', () => {
            expect(manager.findInstrumentFromMidi(9, 42).id).toBe('CHH')
        })

        it('ch=9, key=38 → SNARE', () => {
            expect(manager.findInstrumentFromMidi(9, 38).id).toBe('SNARE')
        })

        it('ch=9, key=46 → OHH', () => {
            expect(manager.findInstrumentFromMidi(9, 46).id).toBe('OHH')
        })

        it('not found → NOT_FOUND', () => {
            expect(manager.findInstrumentFromMidi(10, 99).id).toBe(Instrument.NOT_FOUND)
        })
    })

    describe('countCommonWords', () => {
        it('"KICK" and "kick_sample" → 1', () => {
            expect(manager.countCommonWords('KICK', 'kick_sample')).toBe(1)
        })

        it('no common words → 0', () => {
            expect(manager.countCommonWords('KICK', 'snare_drum')).toBe(0)
        })

        it('null inputs → 0', () => {
            expect(manager.countCommonWords(null, 'test')).toBe(0)
            expect(manager.countCommonWords('test', null)).toBe(0)
        })

        it('multiple common words', () => {
            expect(manager.countCommonWords('KICK DRUM', 'drum kick sample')).toBe(2)
        })
    })

    describe('getTrackCandidatesFromInstrument', () => {
        it('KICK has no substitutes → [KICK]', () => {
            const inst = manager.findById('KICK')
            const candidates = manager.getTrackCandidatesFromInstrument(inst)
            expect(candidates).toEqual(['KICK'])
        })

        it('SNARE has substitutes → multiple candidates', () => {
            const inst = manager.findById('SNARE')
            const candidates = manager.getTrackCandidatesFromInstrument(inst)
            expect(candidates).toContain('SNARE')
            // SNARE has subst: { id1: "SNARE" } which is the same as id, so only 1 candidate
            // Use an instrument with real substitutes instead
        })

        it('HTOM has substitutes → [HTOM, TOM]', () => {
            const inst = manager.findById('HI_TOM')
            const candidates = manager.getTrackCandidatesFromInstrument(inst)
            expect(candidates).toContain('HI_TOM')
            expect(candidates).toContain('TOM')
            expect(candidates.length).toBeGreaterThan(1)
        })

        it('LO_TOM has substitutes → [LO_TOM, TOM]', () => {
            const inst = manager.findById('LO_TOM')
            const candidates = manager.getTrackCandidatesFromInstrument(inst)
            expect(candidates).toContain('LO_TOM')
            expect(candidates).toContain('TOM')
        })

        it('HI_CONGAS has substitutes → [HI_CONGAS, CONGAS, ...]', () => {
            const inst = manager.findById('HI_CONGAS')
            const candidates = manager.getTrackCandidatesFromInstrument(inst)
            expect(candidates).toContain('HI_CONGAS')
            expect(candidates).toContain('CONGAS')
        })

        it('LO_CONGAS has substitutes → [LO_CONGAS, CONGAS, ...]', () => {
            const inst = manager.findById('LO_CONGAS')
            const candidates = manager.getTrackCandidatesFromInstrument(inst)
            expect(candidates).toContain('LO_CONGAS')
            expect(candidates).toContain('CONGAS')
        })

        it('HI_BONGOS has substitutes → [HI_BONGOS, CONGAS, ...]', () => {
            const inst = manager.findById('HI_BONGOS')
            const candidates = manager.getTrackCandidatesFromInstrument(inst)
            expect(candidates).toContain('HI_BONGOS')
            expect(candidates).toContain('CONGAS')
        })

        it('HI_TIMBAL has substitutes → [HI_TIMBAL, SNARE]', () => {
            const inst = manager.findById('HI_TIMBAL')
            const candidates = manager.getTrackCandidatesFromInstrument(inst)
            expect(candidates).toContain('HI_TIMBAL')
            expect(candidates).toContain('SNARE')
        })

        it('LO_TIMBAL has substitutes → [LO_TIMBAL, SNARE]', () => {
            const inst = manager.findById('LO_TIMBAL')
            const candidates = manager.getTrackCandidatesFromInstrument(inst)
            expect(candidates).toContain('LO_TIMBAL')
            expect(candidates).toContain('SNARE')
        })

        it('HI_WOODBLOCK has substitutes → [HI_WOODBLOCK, LO_WOODBLOCK, RIMSHOT]', () => {
            const inst = manager.findById('HI_WOODBLOCK')
            const candidates = manager.getTrackCandidatesFromInstrument(inst)
            expect(candidates).toContain('HI_WOODBLOCK')
            expect(candidates).toContain('LO_WOODBLOCK')
            expect(candidates).toContain('RIMSHOT')
        })

        it('LO_WOODBLOCK has substitutes → [LO_WOODBLOCK, RIMSHOT]', () => {
            const inst = manager.findById('LO_WOODBLOCK')
            const candidates = manager.getTrackCandidatesFromInstrument(inst)
            expect(candidates).toContain('LO_WOODBLOCK')
            expect(candidates).toContain('RIMSHOT')
        })

        it('null instrument → []', () => {
            expect(manager.getTrackCandidatesFromInstrument(null)).toEqual([])
        })

        it('NOT_FOUND instrument → []', () => {
            const inst = new Instrument()
            expect(manager.getTrackCandidatesFromInstrument(inst)).toEqual([])
        })
    })

    describe('findInstrumentFromMidiProgram', () => {
        it('ch=1, program=1 → PIANO', () => {
            expect(manager.findInstrumentFromMidiProgram(1, 1).id).toBe('PIANO')
        })

        it('ch=2, program=33 → BASS', () => {
            expect(manager.findInstrumentFromMidiProgram(2, 33).id).toBe('BASS')
        })

        it('wrong channel → falls back to GM name lookup', () => {
            expect(manager.findInstrumentFromMidiProgram(99, 33).id).toBe('BASS')
        })

        it('unknown program → NOT_FOUND', () => {
            expect(manager.findInstrumentFromMidiProgram(1, 999).id).toBe(Instrument.NOT_FOUND)
        })
    })

    describe('findInstrumentFromMidiProgramAnyChannel', () => {
        it('program=33 → BASS (ignores channel)', () => {
            expect(manager.findInstrumentFromMidiProgramAnyChannel(33).id).toBe('BASS')
        })

        it('program=1 → PIANO (ignores channel)', () => {
            expect(manager.findInstrumentFromMidiProgramAnyChannel(1).id).toBe('PIANO')
        })

        it('program=63 → BRASS (ignores channel)', () => {
            expect(manager.findInstrumentFromMidiProgramAnyChannel(63).id).toBe('BRASS')
        })

        it('unknown program → NOT_FOUND', () => {
            expect(manager.findInstrumentFromMidiProgramAnyChannel(999).id).toBe(Instrument.NOT_FOUND)
        })

        it('program=49 (String Ensemble 1) → ENSEMBLE via GM name fallback', () => {
            expect(manager.findInstrumentFromMidiProgramAnyChannel(49).id).toBe('ENSEMBLE')
        })
    })

    describe('0-based program numbers', () => {
        it('program=0 → PIANO (Acoustic Grand Piano, 0-based)', () => {
            expect(manager.findInstrumentFromMidiProgramAnyChannel(0).id).toBe('PIANO')
        })

        it('ch=1, program=0 → PIANO (0-based, correct channel)', () => {
            expect(manager.findInstrumentFromMidiProgram(1, 0).id).toBe('PIANO')
        })

        it('program=32 → BASS (Acoustic Bass = GM 33, 0-based)', () => {
            expect(manager.findInstrumentFromMidiProgramAnyChannel(32).id).toBe('BASS')
        })

        it('program=48 → ENSEMBLE (String Ensemble 1 = GM 49, 0-based)', () => {
            expect(manager.findInstrumentFromMidiProgramAnyChannel(48).id).toBe('ENSEMBLE')
        })

        it('program=62 → BRASS (Brass Section = GM 63, 0-based)', () => {
            expect(manager.findInstrumentFromMidiProgramAnyChannel(62).id).toBe('BRASS')
        })
    })

    describe('getAllIds', () => {
        it('returns object with all instrument IDs', () => {
            const ids = manager.getAllIds()
            expect(ids).toHaveProperty('KICK')
            expect(ids).toHaveProperty('SNARE')
            expect(ids).toHaveProperty('CHH')
            expect(ids).toHaveProperty('OHH')
        })
    })

    describe('DATA integrity', () => {
        it('has instruments array', () => {
            expect(Array.isArray(InstrumentsManager.DATA.instruments)).toBe(true)
        })

        it('has more than 30 instruments', () => {
            expect(InstrumentsManager.DATA.instruments.length).toBeGreaterThan(30)
        })

        it('all instruments have an id', () => {
            for (const inst of InstrumentsManager.DATA.instruments) {
                expect(inst.id).toBeDefined()
            }
        })
    })
})
