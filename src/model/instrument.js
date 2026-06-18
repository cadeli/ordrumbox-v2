import { NOT_FOUND } from '../core/constants.js'
import { logger } from "../core/logger.js"

export default class Instrument {
    static NOT_FOUND = NOT_FOUND;

    constructor(data = {}) {
        this.id = data.id ?? (logger.warn('INST', 'id fallback', data.id, Instrument.NOT_FOUND), Instrument.NOT_FOUND);
        // Flexible type handling (boolean or string "true"/"false")
        this.drum = data.drum === true || data.drum === "true";
        this.pan = data.pan ?? (logger.warn('INST', 'pan fallback', data.pan, "0"), "0");
        this.name = data.name ?? (logger.warn('INST', 'name fallback', data.name, { syn: [] }), { syn: [] });
        this.subst = data.subst ?? (logger.warn('INST', 'subst fallback', data.subst, {}), {});
        this.midi = Array.isArray(data.midi) 
            ? data.midi.map(m => new Midi(m)) 
            : [];
    }

    toString() {
        let ret = ` key : ${this.id}`;
        ret += this.drum ? ",type: Drum" : ",type: Melo";
        ret += `, pan: ${this.pan}`;
        if (this.name && this.name.syn && this.name.syn.length > 0) {
            ret += `, syn: [${this.name.syn.join('|')}]`;
        }
        this.midi.forEach(m => {
            ret += `, [${m.name}${m.key ? ' key:'+m.key : ''}]`;
        });
        return ret;
    }
}

class Midi {
    constructor(data = {}) {
        this.ch = data.ch ?? (logger.warn('INST', 'ch fallback', data.ch, "10"), "10");
        this.name = data.name ?? (logger.warn('INST', 'name fallback', data.name, ""), "");
        this.key = data.key ?? (logger.warn('INST', 'key fallback', data.key, null), null);
        this.programm = data.programm ?? (logger.warn('INST', 'prog fallback', data.programm, null), null);
    }
}
