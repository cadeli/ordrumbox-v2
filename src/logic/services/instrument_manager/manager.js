import Instrument from '../../../model/instrument.js'
import { logger } from '../../../core/logger.js'
import { GM_DRUM_KEY_BY_NAME, GM_PROGRAM_NUM_BY_NAME, GM_PROGRAM_NAMES } from './gm_names.js'
import { INSTRUMENTS_DATA } from './instruments_data.js'
import { countCommonWords } from './fuzzy_match.js'

export default class InstrumentsManager {
    static DATA = INSTRUMENTS_DATA

    constructor() {
        this.byId = new Map()
        this.matchers = []
        this.load(InstrumentsManager.DATA)
    }

    load(jsonData) {
        this.byId.clear()
        this.matchers = []
        if (!jsonData.instruments) return

        jsonData.instruments.forEach((obj) => {
            const inst = new Instrument(obj)

            for (const m of inst.midi) {
                if (m.key_based === true && m.key == null) {
                    const key = GM_DRUM_KEY_BY_NAME[m.name]
                    if (key != null) m.key = String(key)
                } else if (m.key_based === false && m.programm == null) {
                    const program = GM_PROGRAM_NUM_BY_NAME[m.name]
                    if (program != null) {
                        m.programm = String(program + 1)
                    }
                }
            }

            this.byId.set(inst.id.toUpperCase(), inst)

            if (inst.name && inst.name.syn) {
                inst.name.syn.forEach((syn) => {
                    try {
                        const pattern = new RegExp(`^${syn}$`, 'i')
                        this.matchers.push({ pattern, instrument: inst })
                    } catch {
                        logger.warn('Instrument', `Invalid regexp: ${syn}`)
                    }
                })
            }
        })
    }

    findById(id) {
        return this.byId.get(id.toUpperCase()) ?? new Instrument()
    }

    findByName(name) {
        for (const m of this.matchers) {
            if (m.pattern.test(name)) return m.instrument
        }
        logger.warn('Instrument', `findByName: no match for "${name}" — fallback: KICK`)
        return null
    }

    getAllIds() {
        return Object.fromEntries(this.byId)
    }

    findInstrumentFromFileName(fileName) {
        const normFileName = fileName.trim().toUpperCase()
        let instrument = this.byId.get(normFileName)
        if (instrument) return instrument

        for (const inst of this.byId.values()) {
            if (this.countCommonWords(inst.id, fileName) > 0) return inst
        }

        for (const inst of this.byId.values()) {
            const foundMidi = inst.midi.find((m) => this.countCommonWords(m.name, fileName) > 0)
            if (foundMidi) return inst
        }

        const words = fileName
            .toUpperCase()
            .split(/[^a-zA-Z0-9]+/)
            .filter((w) => w.length > 0)
        for (const word of words) {
            instrument = this.findByName(word)
            if (instrument) return instrument
        }

        return new Instrument()
    }

    findInstrumentFromMidi = (channel, noteNumber) => {
        const normalizedChannel = String(channel)
        const normalizedKey = String(noteNumber)

        for (const instrument of this.byId.values()) {
            const midiMatch = instrument.midi.find((midi) => {
                return String(midi.ch) === normalizedChannel && String(midi.key) === normalizedKey
            })
            if (midiMatch) {
                return instrument
            }
        }

        return new Instrument()
    }

    findInstrumentFromMidiProgram = (program) => {
        const normalizedProgram = String(program)
        const normalizedProgramShifted = String(Number(program) + 1)
        logger.debug('Instrument', `findInstrumentFromMidiProgram: program=${program}`)

        for (const instrument of this.byId.values()) {
            const midiMatch = instrument.midi.find((midi) => {
                return midi.programm != null && String(midi.programm) === normalizedProgramShifted
            })
            if (midiMatch) {
                logger.debug(
                    'Instrument',
                    `findInstrumentFromMidiProgram: program match program=${program} (+1=${normalizedProgramShifted}) → "${instrument.id}"`,
                )
                return instrument
            }
        }

        for (const instrument of this.byId.values()) {
            const midiMatch = instrument.midi.find((midi) => {
                return midi.programm != null && String(midi.programm) === normalizedProgram
            })
            if (midiMatch) {
                logger.debug(
                    'Instrument',
                    `findInstrumentFromMidiProgram: program match program=${program} (exact) → "${instrument.id}"`,
                )
                return instrument
            }
        }

        logger.debug('Instrument', `findInstrumentFromMidiProgram: no direct match, trying GM fallback`)
        return this.#findByProgramNumber(program)
    }

    #findByProgramNumber = (program) => {
        const p = Number(program)
        const gmName = GM_PROGRAM_NAMES[p]
        logger.debug('Instrument', `findByProgramNumber: program ${program} → "${gmName ?? '(none)'}"`)

        if (gmName) {
            const inst = this.findByName(gmName)
            if (inst) {
                logger.debug('Instrument', `findByProgramNumber: findByName("${gmName}") → "${inst.id}"`)
                return inst
            }
            for (const instrument of this.byId.values()) {
                if (instrument.midi.some((m) => m.name && m.name.toLowerCase() === gmName.toLowerCase())) {
                    logger.debug('Instrument', `findByProgramNumber: midi.name match "${gmName}" → "${instrument.id}"`)
                    return instrument
                }
            }
        }

        logger.warn('Instrument', `findByProgramNumber: no match for program ${program}`)
        return new Instrument()
    }

    getTrackCandidatesFromInstrument = (instrument) => {
        if (!instrument || instrument.id === Instrument.NOT_FOUND) {
            return []
        }

        const candidates = [instrument.id]
        if (instrument.subst) {
            Object.values(instrument.subst).forEach((candidate) => {
                if (candidate && !candidates.includes(candidate)) {
                    candidates.push(candidate)
                }
            })
        }

        return candidates
    }

    findTrackIndexFromMidi = (pattern, channel, noteNumber) => {
        const instrument = this.findInstrumentFromMidi(channel, noteNumber)
        if (!instrument || instrument.id === Instrument.NOT_FOUND) {
            return -1
        }

        const candidates = this.getTrackCandidatesFromInstrument(instrument)
        const tracks = pattern?.tracks ?? []
        for (let index = 0; index < tracks.length; index++) {
            const trackName = String(tracks[index]?.name ?? '')
                .trim()
                .toUpperCase()
            if (candidates.some((candidate) => trackName === String(candidate).trim().toUpperCase())) {
                return index
            }
        }

        return -1
    }

    countCommonWords(s1, s2) {
        return countCommonWords(s1, s2)
    }
}

/** Shared singleton — avoids regex re-compilation on every instantiation. */
export const instrumentsManager = new InstrumentsManager()
