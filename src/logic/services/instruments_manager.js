import Instrument  from '../../model/instrument.js'

export default class InstrumentsManager {
    static DATA = {
        "instruments": [
            { "midi": [{ "ch": "10", "name": "Bass Drum 1", "key": "36" }], "subst": { "id1": "KICK" }, "name": { "syn": [".*KICK.*", ".*KCK.*", ".*KIK.*", "KD", ".*BD.*", "ACC.*BD", "D.*BASS", "BASS.*DRUM", "SINUS"], "adj_height": "", "adj_open": "", "adj_style": "ACCOUSTIC" }, "id": "KICK", "drum": true, "pan": "0" },
            { "midi": [{ "ch": "10", "name": "Acoustic Snare", "key": "38" }], "subst": { "id1": "SNARE" }, "name": { "syn": ["SN", ".*SNAR.*", ".*SD.*", "SN", "SNR", "ACC AC", "AC", ".*BRUSH.*"], "adj_style": "ACCOUSTIC" }, "id": "SNARE", "drum": true, "pan": "3" },
            { "midi": [{ "ch": "10", "name": "Open Hi-Hat", "key": "46" }], "subst": { "id1": "CHH" }, "name": { "syn": [".*OHAT.*", ".*OHH.*", ".*OHT.*", ".*HHO.*", ".*OPHAT.*", "OH"], "adj_open": "OPEN" }, "id": "OHH", "drum": true, "pan": "-4" },
            { "midi": [{ "ch": "10", "name": "Closed Hi-Hat", "key": "42" }], "subst": { "id1": "SNARE" }, "name": { "syn": [".*HAT.*", ".*CHT.*", ".*HHC.*", "CHAT", ".*HH.*", ".*CHH.*", "CH"], "adj_open": "CLOSE" }, "id": "CHH", "drum": true, "pan": "2" },
            { "midi": [{ "ch": "10", "name": "Open Hi Conga", "key": "63" }], "subst": { "id1": "CONGAS", "id2": "HTOM", "id3": "TOM" }, "name": { "syn": [".*HCONGA.*", ".*CONGA.*HIGH.*", "HC"], "adj_pitch": "HIGH" }, "id": "HCONGAS", "drum": true, "pan": "3" },
            { "midi": [{ "ch": "10", "name": "Low Conga", "key": "64" }], "subst": { "id1": "CONGAS", "id2": "LTOM", "id3": "TOM" }, "name": { "syn": ["LCONGA.*", ".*CONGA.*LOW.*", "LC"], "adj_pitch": "LOW" }, "id": "LCONGAS", "drum": true, "pan": "-3" },
            { "midi": [{ "ch": "10", "name": "Hand Clap", "key": "39" }], "subst": { "id1": "SNARE" }, "name": { "syn": [".*CLAP.*", ".*CLP.*", "CP", ".*HAND.*"] }, "id": "CLAP", "drum": true, "pan": "2" },
            { "subst": { "id1": "RIDE" }, "midi": [{ "ch": "10", "name": "Cowbell", "key": "56" }], "name": { "syn": ["CB", ".*COW.*", ".*AGOGO.*", ".*BELL.*"] }, "id": "COWBELL", "drum": true, "pan": "2" },
            { "subst": { "id1": "CYM" }, "midi": [{ "ch": "10", "name": "Crash Cymbal 1", "key": "49" }], "name": { "syn": [".*CYMBAL.*", ".*CYM.*", "CY", ".*CRASH.*", ".*PLASH.*"] }, "id": "CRASH", "drum": true, "pan": "-8" },
            { "midi": [{ "ch": "2", "name": "Acoustic Bass", "programm": "33" }], "subst": { "id1": "HTOM" }, "name": { "syn": [".*\\sBASS"] }, "id": "BASS", "drum": "false", "pan": "0" },
            { "subst": { "id1": "PIANO", "id2": "SYNTH", "id3": "TOM" }, "midi": [{ "ch": "4", "name": "Percursive Organ", "programm": "18" }], "name": { "syn": [".*MELO.*"] }, "id": "MELO", "drum": "false", "pan": "1" },
            { "midi": [{ "ch": "10", "name": "Side Stick", "key": "37" }], "subst": { "id1": "SNARE" }, "name": { "syn": [".*RIM.*", ".*WOOD.*", "WOOD BLOCK", "WOODBLOCK", "BLOCK", "STICK", "STIK", "CLI.*", "CL", ".*STICK.*", ".*SIDE.*", ".*RS.*"] }, "id": "RIMSHOT", "drum": true, "pan": "-2" },
            { "subst": { "id1": "SNARE" }, "midi": [{ "ch": "10", "name": "High Floor Tom", "key": "43" }], "name": { "syn": [".*BEEP.*", ".*BIP.*", ".*ZAP.*", ".*POP.*", ".*SHOT.*"] }, "id": "HIT", "drum": true, "pan": "5" },
            { "midi": [{ "ch": "10", "name": "High Tom", "key": "50" }], "subst": { "id1": "TOM" }, "name": { "syn": ["HT", ".*HITOM.*", ".*HTOM.*", ".*TOMH.*", ".*TOM.*HI.*"], "adj_pitch": "HIGH" }, "id": "HTOM", "drum": true, "pan": "7" },
            { "midi": [{ "ch": "10", "name": "Low Tom", "key": "45" }, { "ch": "10", "name": "Low Floor Tom", "key": "41" }], "subst": { "id1": "TOM" }, "name": { "syn": [".*LTOM.*", "LT.*", ".*LOWTOM.*", ".*TOMLOW.*", ".*TOM.*LO.*"], "adj_pitch": "LOW" }, "id": "LTOM", "drum": true, "pan": "2" },
            { "midi": [{ "ch": "10", "name": "Hi-Mid Tom", "key": "48" }], "subst": { "id1": "TOM" }, "name": { "syn": ["MTOM.*", "MT", "DRUM"], "adj_pitch": "MEDIUM" }, "id": "MTOM", "drum": true, "pan": "4" },
            { "midi": [{ "ch": "4", "name": "Synth Voice", "programm": "5" }], "subst": { "id1": "HIT" }, "name": { "syn": ["RAZ", ".*RAZOR.*"] }, "id": "RAZOR", "drum": true, "pan": "5" },
            { "subst": { "id1": "HCONGAS" }, "midi": [{ "ch": "10", "name": "Cabasa", "key": "69" }], "name": { "syn": ["CABASA"] }, "id": "CABA", "drum": true, "pan": "5" },
            { "subst": { "id1": "HCONGAS" }, "midi": [{ "ch": "10", "name": "Mute Hi Conga", "key": "62" }], "name": { "syn": [".*CLOSEDCONGA.*"], "adj_pitch": "HIGH" }, "id": "CHCONGAS", "drum": true, "pan": "3" },
            { "subst": { "id1": "SYNTH", "id2": "MELO" }, "midi": [{ "ch": "3", "name": "SynthBrass 1", "programm": "63" }], "name": { "syn": ["BRASS"] }, "id": "BRASS", "drum": "false", "pan": "0" },
            { "subst": { "id1": "MELO", "id2": "MTOM", "id3": "HTOM" }, "midi": [{ "ch": "1", "name": "Acoustic Grand Piano", "programm": "1" }], "name": { "syn": ["RHODE"] }, "id": "PIANO", "drum": "false", "pan": "0" },
            { "subst": { "id1": "SNARE" }, "midi": [{ "ch": "10", "name": "High Timbale", "key": "65" }], "id": "HTIMBAL", "drum": true, "pan": "8" },
            { "subst": { "id1": "SNARE" }, "midi": [{ "ch": "10", "name": "Low Bongo", "key": "61" }], "id": "LBONGOS", "drum": true, "pan": "6" },
            { "subst": { "id1": "SNARE" }, "midi": [{ "ch": "10", "name": "Electric Snare", "key": "40" }], "id": "LOOP", "drum": "false", "pan": "0" },
            { "subst": { "id1": "SNARE" }, "midi": [{ "ch": "10", "name": "Low Timbale", "key": "66" }], "id": "LTIMBAL", "drum": true, "pan": "0" },
            { "subst": { "id1": "CHH" }, "midi": [{ "ch": "10", "name": "Maracas", "key": "70" }], "name": { "syn": ["MARA", "MA"] }, "id": "MARACAS", "drum": true, "pan": "8" },
            { "subst": { "id1": "CYM", "id2": "CHH" }, "midi": [{ "ch": "10", "name": "Ride Cymbal 1", "key": "51" }], "name": { "syn": [".*RID.*"] }, "id": "RIDE", "drum": true, "pan": "7" },
            { "subst": { "id1": "PIANO" }, "midi": [{ "ch": "4", "name": "Soprano Sax", "programm": "65" }], "name": { "syn": ["saxophone", "saxo", ".*SAX.*"] }, "id": "SAX", "drum": true, "pan": "7" },
            { "subst": { "id1": "BASS" }, "midi": [{ "ch": "4", "name": "Distortion Guitar", "programm": "31" }], "name": { "syn": ["Guitar*", "E.GUIT"] }, "id": "GUITAR", "drum": "false", "pan": "7" },
            { "midi": [{ "ch": "10", "name": "Castenets", "key": "85" }], "subst": { "id1": "RIMSHOT" }, "name": { "syn": ["CAST"] }, "id": "CASTENET", "drum": true, "pan": "8" },
            { "midi": [{ "ch": "10", "name": "Low Wood Block", "key": "77" }], "subst": { "id1": "RIMSHOT" }, "name": { "syn": ["WOOD", "WOOD BLOCK", "BLOCK"] }, "id": "LWOODBLOCK", "drum": true, "pan": "2" },
            { "midi": [{ "ch": "10", "name": "High Woodblock", "key": "76" }], "subst": { "id1": "LWOODBLOCK", "id2": "RIMSHOT" }, "name": { "syn": ["HWOOD"] }, "id": "HWOODBLOCK", "drum": true, "pan": "-2" },
            { "midi": [{ "ch": "10", "name": "Shaker", "key": "82" }], "subst": { "id1": "MARACAS", "id2": "RIMSHOT", "id3": "COWBELL" }, "name": { "syn": [".*SHAKE.*", ".*SHACK.*"] }, "id": "SHAKER", "drum": true, "pan": "0" },
            { "midi": [{ "ch": "10", "name": "Tambourine", "key": "54" }], "subst": { "id1": "OHH" }, "name": { "syn": [".*TAMB.*"] }, "id": "TAMBOURINE", "drum": true, "pan": "-2" },
            { "subst": { "id1": "TAMBOURINE", "id2": "RIMSHOT", "id3": "SNARE" }, "name": { "syn": [".*TRI.*"] }, "midi": [{ "ch": "10", "name": "Open Triangle", "key": "81" }, { "ch": "10", "name": "Mute Triangle", "key": "80" }], "id": "TRIANGLE", "drum": true, "pan": "5" },
            { "name": { "syn": [".*UNKNOWN.*"] }, "midi": [{ "ch": "10", "name": "High Floor Tom", "key": "43" }, { "ch": "10", "name": "High Agogo", "key": "67" }, { "ch": "10", "name": "Low Agogo", "key": "68" }, { "ch": "10", "name": "Low-Mid Tom", "key": "47" }, { "ch": "10", "name": "Long Whistle", "key": "72" }, { "ch": "10", "name": "Short Guiro", "key": "73" }, { "ch": "10", "name": "Long Guiro", "key": "74" }, { "ch": "10", "name": "Clave", "key": "75" }, { "ch": "10", "name": "Chinese Cymbal", "key": "52" }, { "ch": "10", "name": "Hi Wood Block", "key": "76" }, { "ch": "10", "name": "Ride Bell", "key": "53" }, { "ch": "10", "name": "Mute Cuica", "key": "78" }, { "ch": "10", "name": "Splash Cymbal", "key": "55" }, { "ch": "10", "name": "Open Cuica", "key": "79" }, { "ch": "10", "name": "Vibraslap", "key": "58" }], "id": "PERCU", "drum": "false", "pan": "0" },
            { "subst": { "id1": "PIANO", "id2": "MELO", "id3": "HTOM" }, "midi": [{ "ch": "4", "name": "Synth Voice", "programm": "5" }], "id": "REED", "drum": "false", "pan": "0" },
            { "subst": { "id1": "PIANO", "id2": "MELO", "id3": "HTOM" }, "midi": [{ "ch": "4", "name": "Synth Voice", "programm": "5" }], "id": "CROMAPERC", "drum": "false", "pan": "0" },
            { "subst": { "id1": "PIANO", "id2": "MELO", "id3": "HTOM" }, "midi": [{ "ch": "4", "name": "Synth Voice", "programm": "5" }], "id": "PIPE", "drum": "false", "pan": "0" },
            { "subst": { "id1": "PIANO", "id2": "MELO", "id3": "HTOM" }, "midi": [{ "ch": "4", "name": "Synth Voice", "programm": "5" }], "id": "ORGAN", "drum": "false", "pan": "0" },
            { "subst": { "id1": "PIANO", "id2": "MELO", "id3": "HTOM" }, "name": { "syn": [".*SYNTH.*"] }, "midi": [{ "ch": "4", "name": "Synth Voice", "programm": "5" }], "id": "SYNTHLEAD", "drum": "false", "pan": "0" },
            { "subst": { "id1": "SHORTBRASS", "id2": "BRASS", "id3": "MELO" }, "midi": [{ "ch": "4", "name": "Synth Voice", "programm": "5" }], "name": { "syn": [".*LONG.*BRASS.*"] }, "id": "LONGBRASS", "drum": "false", "pan": "0" },
            { "subst": { "id1": "LONGBRASS", "id2": "BRASS", "id3": "MELO" }, "midi": [{ "ch": "4", "name": "Synth Voice", "programm": "5" }], "name": { "syn": [".*SHORT.*BRASS.*"] }, "id": "SHORTBRASS", "drum": "false", "pan": "0" },
            { "midi": [{ "ch": "10", "name": "Closed Hi-Hat", "key": "44" }], "subst": { "id1": "CHH" }, "name": { "syn": ["PEDAL", "CPEDAL"] }, "id": "CHHK", "drum": true, "pan": "0" },
            { "subst": { "id1": "SNARE", "id2": "HTOM", "id3": "CHH" }, "midi": [{ "ch": "4", "name": "Synth Voice", "programm": "5" }], "id": "TAMB", "drum": true, "pan": "0" },
            { "subst": { "id1": "HTOM", "id2": "MTOM", "id3": "CHH" }, "midi": [{ "ch": "4", "name": "Synth Voice", "programm": "5" }], "name": { "syn": [".*TOM.*"] }, "id": "TOM", "drum": true, "pan": "2" },
            { "subst": { "id1": "HCONGAS" }, "midi": [{ "ch": "4", "name": "Synth Voice", "programm": "5" }], "id": "OHCONGAS", "drum": true, "pan": "0" },
            { "subst": { "id1": "BASS", "id2": "RIMSHOT", "id3": "HTOM" }, "midi": [{ "ch": "4", "name": "Synth Voice", "programm": "5" }], "id": "ETHNIC", "drum": "false", "pan": "0" },
            { "subst": { "id1": "HIT", "id2": "CRASH", "id3": "RIMSHOT" }, "midi": [{ "ch": "4", "name": "Synth Voice", "programm": "5" }], "id": "VIBRA", "drum": true, "pan": "0" },
            { "subst": { "id1": "MARACAS", "id3": "HIT", "id2": "RIMSHOT" }, "midi": [{ "ch": "4", "name": "Synth Voice", "programm": "5" }], "name": { "syn": [".*WHISL.*"] }, "id": "WHISTLE", "drum": true, "pan": "0" },
            { "subst": { "id1": "HCONGAS", "id2": "HTOM", "id3": "TOM" }, "name": { "syn": [".*CON.*", ".*CNG.*", ".*PER.*", "MC"] }, "midi": [{ "ch": "4", "name": "Synth Voice", "programm": "5" }], "id": "CONGAS", "drum": true, "pan": "0" },
            { "subst": { "id1": "HCONGAS", "id2": "CONGAS", "id3": "RIMSHOT" }, "name": { "syn": [".*BNG.*", ".*BONG.*"] }, "midi": [{ "ch": "4", "name": "Synth Voice", "programm": "5" }], "id": "BONGOS", "drum": true, "pan": "0" },
            { "subst": { "id1": "HCONGAS", "id2": "CONGAS", "id3": "RIMSHOT" }, "midi": [{ "ch": "10", "name": "Hi Bongo", "key": "60" }], "name": { "adj_pitch": "HIGH" }, "id": "HBONGOS", "drum": true, "pan": "0" },
            { "subst": { "id1": "LTOM", "id2": "CRASH", "id3": "SNARE" }, "midi": [{ "ch": "4", "name": "Synth Voice", "programm": "5" }], "name": { "syn": ["TIMBALE"] }, "id": "TIMBAL", "drum": true, "pan": "0" },
            { "subst": { "id1": "HIT", "id2": "CRASH", "id3": "RIMSHOT" }, "midi": [{ "ch": "4", "name": "Synth Voice", "programm": "5" }], "id": "SYNTHPAD", "drum": true, "pan": "0" },
            { "subst": { "id1": "HIT", "id2": "CRASH", "id3": "RIMSHOT" }, "midi": [{ "ch": "4", "name": "Synth Voice", "programm": "5" }], "id": "SYNTHEFFECT", "drum": true, "pan": "0" },
            { "subst": { "id1": "BRASS", "id2": "PIANO", "id3": "MELO" }, "midi": [{ "ch": "4", "name": "Synth Voice", "programm": "5" }], "id": "STRINGS", "drum": "false", "pan": "0" },
            { "subst": { "id1": "BRASS", "id2": "PIANO", "id3": "MELO" }, "midi": [{ "ch": "4", "name": "Synth Voice", "programm": "5" }], "id": "ENSEMBLE", "drum": "false", "pan": "0" },
            { "subst": { "id1": "HCONGAS", "id2": "HTOM", "id3": "RIMSHOT" }, "midi": [{ "ch": "4", "name": "Synth Voice", "programm": "5" }], "id": "PERCUSSIVE", "drum": true, "pan": "0" },
            { "subst": { "id1": "CRASH", "id2": "HIT", "id3": "SCRATCH" }, "name": { "syn": [".*FX.*", ".*SOUND.*", ".*SND.*"] }, "midi": [{ "ch": "4", "name": "Synth Voice", "programm": "5" }], "id": "SOUNDEFFECT", "drum": true, "pan": "0" },
            { "subst": { "id1": "SOUNDEFFECT", "id2": "HIT", "id3": "CRASH" }, "name": { "syn": [".*SCRATCH.*"] }, "midi": [{ "ch": "4", "name": "Synth Voice", "programm": "5" }], "id": "SCRATCH", "drum": true, "pan": "0" }
        ]
    };

    constructor() {
        this.byId = new Map();
        this.matchers = [];
        this.load(InstrumentsManager.DATA);
    }

    load(jsonData) {
        this.byId.clear();
        this.matchers = [];
        if (!jsonData.instruments) return;

        jsonData.instruments.forEach(obj => {
            const inst = new Instrument(obj);
            this.byId.set(inst.id.toUpperCase(), inst);

            if (inst.name && inst.name.syn) {
                inst.name.syn.forEach(syn => {
                    try {
                        const pattern = new RegExp(`^${syn}$`, 'i');
                        this.matchers.push({ pattern, instrument: inst });
                    } catch (e) {
                        console.warn(`Regexp invalide: ${syn}`);
                    }
                });
            }
        });
    }


    findById(id) {
        return this.byId.get(id.toUpperCase()) || new Instrument();
    }

    findByName(name) {
        for (const m of this.matchers) {
            if (m.pattern.test(name)) return m.instrument;
        }
        return null;
    }

    getAllIds() {
        return Object.fromEntries(this.byId);
    }


    findInstrumentFromFileName(fileName) {
        const normFileName = fileName.trim().toUpperCase();
        let instrument = this.byId.get(normFileName);
        if (instrument) return instrument;

        for (const inst of this.byId.values()) {
            if (this.countCommonWords(inst.id, fileName) > 0) return inst;
        }

        for (const inst of this.byId.values()) {
            const foundMidi = inst.midi.find(m => this.countCommonWords(m.name, fileName) > 0);
            if (foundMidi) return inst;
        }

        const words = fileName.toUpperCase().split(/[^a-zA-Z0-9]+/).filter(w => w.length > 0);
        for (const word of words) {
            instrument = this.findByName(word);
            if (instrument) return instrument;
        }

        return new Instrument();
    }

    findInstrumentFromMidi = (channel, noteNumber) => {
        const normalizedChannel = String(channel);
        const normalizedKey = String(noteNumber);

        for (const instrument of this.byId.values()) {
            const midiMatch = instrument.midi.find((midi) => {
                return String(midi.ch) === normalizedChannel && String(midi.key) === normalizedKey;
            });
            if (midiMatch) {
                return instrument;
            }
        }

        return new Instrument();
    }

    getTrackCandidatesFromInstrument = (instrument) => {
        if (!instrument || instrument.id === Instrument.NOT_FOUND) {
            return [];
        }

        const candidates = [instrument.id];
        if (instrument.subst) {
            Object.values(instrument.subst).forEach((candidate) => {
                if (candidate && !candidates.includes(candidate)) {
                    candidates.push(candidate);
                }
            });
        }

        return candidates;
    }

    findTrackIndexFromMidi = (pattern, channel, noteNumber) => {
        const instrument = this.findInstrumentFromMidi(channel, noteNumber);
        if (!instrument || instrument.id === Instrument.NOT_FOUND) {
            return -1;
        }

        const candidates = this.getTrackCandidatesFromInstrument(instrument);
        const tracks = pattern?.tracks ?? [];
        for (let index = 0; index < tracks.length; index++) {
            const trackName = String(tracks[index]?.name ?? '').trim().toUpperCase();
            if (candidates.some((candidate) => trackName === String(candidate).trim().toUpperCase())) {
                return index;
            }
        }

        return -1;
    }

    countCommonWords(s1, s2) {
        if (!s1 || !s2) return 0;
        const getWords = (s) => new Set(s.toUpperCase().split(/[^a-zA-Z0-9]+/).filter(w => w.length > 0));
        const words1 = getWords(s1);
        const words2 = getWords(s2);
        let common = 0;
        for (const word of words1) { if (words2.has(word)) common++; }
        return common;
    }
}
