import { NOT_FOUND } from '../core/constants.js'

export default class Instrument {
    static NOT_FOUND = NOT_FOUND;

    constructor(data = {}) {
        this.id = data.id || Instrument.NOT_FOUND;
        // Flexible type handling (boolean or string "true"/"false")
        this.drum = data.drum === true || data.drum === "true";
        this.pan = data.pan || "0";
        this.name = data.name || { syn: [] };
        this.subst = data.subst || {};
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
        this.ch = data.ch || "10";
        this.name = data.name || "";
        this.key = data.key || null;
        this.programm = data.programm || null;
    }
}
