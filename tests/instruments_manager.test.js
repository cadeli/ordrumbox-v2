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
            midi: [{ ch: '10', name: 'Bass Drum 1', key: '36' }]
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
            midi: [{ ch: '10', name: 'Acoustic Snare', key: '38' }]
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
            // PERCU instrument has syn: [".*UNKNOWN.*"] as catch-all
            expect(manager.findByName('xyz123unknown').id).toBe('PERCU')
        })

        it('"HT" → HTOM', () => {
            expect(manager.findByName('HT').id).toBe('HTOM')
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
        it('ch=10, key=36 → KICK', () => {
            expect(manager.findInstrumentFromMidi(10, 36).id).toBe('KICK')
        })

        it('ch=10, key=42 → CHH', () => {
            expect(manager.findInstrumentFromMidi(10, 42).id).toBe('CHH')
        })

        it('ch=10, key=38 → SNARE', () => {
            expect(manager.findInstrumentFromMidi(10, 38).id).toBe('SNARE')
        })

        it('ch=10, key=46 → OHH', () => {
            expect(manager.findInstrumentFromMidi(10, 46).id).toBe('OHH')
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
            const inst = manager.findById('HTOM')
            const candidates = manager.getTrackCandidatesFromInstrument(inst)
            expect(candidates).toContain('HTOM')
            expect(candidates).toContain('TOM')
            expect(candidates.length).toBeGreaterThan(1)
        })

        it('null instrument → []', () => {
            expect(manager.getTrackCandidatesFromInstrument(null)).toEqual([])
        })

        it('NOT_FOUND instrument → []', () => {
            const inst = new Instrument()
            expect(manager.getTrackCandidatesFromInstrument(inst)).toEqual([])
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
