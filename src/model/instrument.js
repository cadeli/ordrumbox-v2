import { NOT_FOUND } from '../core/constants.js'

/**
 * An instrument (drum or melodic) resolved from the kit data, with its GM
 * MIDI mappings.
 */
export default class Instrument {
    static NOT_FOUND = NOT_FOUND

    /**
     * @param {{id?: string, drum?: boolean, pan?: number, synonyms?: string[], subst?: object, midi?: object[]}} [data]
     */
    constructor(data = {}) {
        this.id = data.id ?? Instrument.NOT_FOUND
        this.drum = data.drum === true
        // number, like every other pan in the app (track.pan is -1..1); it was the
        // string '0', so `inst.pan < 0` worked by accident and `inst.pan + 1`
        // concatenated. Only toString() reads it.
        this.pan = data.pan ?? 0
        /** Sound-name synonyms (some are regex patterns) that resolve to this
         *  instrument. NOT a display name — the id is the name. */
        this.synonyms = data.synonyms ?? []
        this.subst = data.subst ?? {}
        this.midi = Array.isArray(data.midi) ? data.midi.map((m) => new Midi(m)) : []
    }

    toString() {
        let ret = ` key : ${this.id}`
        ret += this.drum ? ',type: Drum' : ',type: Melo'
        ret += `, pan: ${this.pan}`
        if (this.synonyms.length > 0) {
            ret += `, synonyms: [${this.synonyms.join('|')}]`
        }
        this.midi.forEach((m) => {
            ret += `, [${m.name}${m.key ? ' key:' + m.key : ''}]`
        })
        return ret
    }
}

/** A General MIDI mapping attached to an instrument. */
class Midi {
    /**
     * @param {{id?: string, drum?: boolean, pan?: number, synonyms?: string[], subst?: object, midi?: object[]}} [data]
     */
    /**
     * @param {{channel?: number, name?: string, key?: number | null, program?: number | null, keyBased?: any}} [data]
     */
    constructor(data = {}) {
        this.channel = data.channel ?? 9
        this.name = data.name ?? ''
        this.key = data.key ?? null
        this.program = data.program ?? null
        this.keyBased = data.keyBased ?? null
    }
}
