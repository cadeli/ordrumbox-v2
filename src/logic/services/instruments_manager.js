import Instrument  from '../../model/instrument.js'
import { logger } from '../../core/logger.js'

export const GM_DRUM_NAMES = {
    35: 'Acoustic Bass Drum', 36: 'Bass Drum 1', 37: 'Side Stick', 38: 'Acoustic Snare',
    39: 'Hand Clap', 40: 'Electric Snare', 41: 'Low Floor Tom', 42: 'Closed Hi-Hat',
    43: 'High Floor Tom', 44: 'Pedal Hi-Hat', 45: 'Low Tom', 46: 'Open Hi-Hat',
    47: 'Low-Mid Tom', 48: 'Hi-Mid Tom', 49: 'Crash Cymbal 1', 50: 'High Tom',
    51: 'Ride Cymbal 1', 52: 'Chinese Cymbal', 53: 'Ride Bell', 54: 'Tambourine',
    55: 'Splash Cymbal', 56: 'Cowbell', 57: 'Crash Cymbal 2', 58: 'Vibraslap',
    59: 'Ride Cymbal 2', 60: 'Hi Bongo', 61: 'Low Bongo', 62: 'Mute Hi Conga',
    63: 'Open Hi Conga', 64: 'Low Conga', 65: 'High Timbale', 66: 'Low Timbale',
    67: 'High Agogo', 68: 'Low Agogo', 69: 'Cabasa', 70: 'Maracas',
    71: 'Short Whistle', 72: 'Long Whistle', 73: 'Short Guiro', 74: 'Long Guiro',
    75: 'Claves', 76: 'Hi Wood Block', 77: 'Low Wood Block', 78: 'Mute Cuica',
    79: 'Open Cuica', 80: 'Mute Triangle', 81: 'Open Triangle'
}

export const GM_PROGRAM_NAMES = {
    0: 'Acoustic Grand Piano', 1: 'Bright Acoustic Piano', 2: 'Electric Grand Piano',
    3: 'Honky-tonk Piano', 4: 'Electric Piano 1', 5: 'Electric Piano 2',
    6: 'Harpsichord', 7: 'Clavinet', 8: 'Celesta', 9: 'Glockenspiel',
    10: 'Music Box', 11: 'Vibraphone', 12: 'Marimba', 13: 'Xylophone',
    14: 'Tubular Bells', 15: 'Dulcimer', 16: 'Drawbar Organ', 17: 'Percussive Organ',
    18: 'Rock Organ', 19: 'Church Organ', 20: 'Reed Organ', 21: 'Accordion',
    22: 'Harmonica', 23: 'Tango Accordion', 24: 'Acoustic Guitar (nylon)',
    25: 'Acoustic Guitar (steel)', 26: 'Electric Guitar (jazz)', 27: 'Electric Guitar (clean)',
    28: 'Electric Guitar (muted)', 29: 'Overdriven Guitar', 30: 'Distortion Guitar',
    31: 'Guitar Harmonics', 32: 'Acoustic Bass', 33: 'Electric Bass (finger)',
    34: 'Electric Bass (pick)', 35: 'Fretless Bass', 36: 'Slap Bass 1',
    37: 'Slap Bass 2', 38: 'Synth Bass 1', 39: 'Synth Bass 2',
    40: 'Violin', 41: 'Viola', 42: 'Cello', 43: 'Contrabass',
    44: 'Tremolo Strings', 45: 'Pizzicato Strings', 46: 'Orchestral Harp',
    47: 'Timpani', 48: 'String Ensemble 1', 49: 'String Ensemble 2',
    50: 'Synth Strings 1', 51: 'Synth Strings 2', 52: 'Choir Aahs',
    53: 'Voice Oohs', 54: 'Synth Choir', 55: 'Orchestra Hit',
    56: 'Trumpet', 57: 'Trombone', 58: 'Tuba', 59: 'Muted Trumpet',
    60: 'French Horn', 61: 'Brass Section', 62: 'Synth Brass 1',
    63: 'Synth Brass 2', 64: 'Soprano Sax', 65: 'Alto Sax',
    66: 'Tenor Sax', 67: 'Baritone Sax', 68: 'Oboe', 69: 'English Horn',
    70: 'Bassoon', 71: 'Clarinet', 72: 'Piccolo', 73: 'Flute',
    74: 'Recorder', 75: 'Pan Flute', 76: 'Blown Bottle', 77: 'Shakuhachi',
    78: 'Whistle', 79: 'Ocarina', 80: 'Lead 1 (square)', 81: 'Lead 2 (sawtooth)',
    82: 'Lead 3 (calliope)', 83: 'Lead 4 (chiff)', 84: 'Lead 5 (charang)',
    85: 'Lead 6 (voice)', 86: 'Lead 7 (fifths)', 87: 'Lead 8 (bass + lead)',
    88: 'Pad 1 (new age)', 89: 'Pad 2 (warm)', 90: 'Pad 3 (polysynth)',
    91: 'Pad 4 (choir)', 92: 'Pad 5 (bowed)', 93: 'Pad 6 (metallic)',
    94: 'Pad 7 (halo)', 95: 'Pad 8 (sweep)', 96: 'FX 1 (rain)',
    97: 'FX 2 (soundtrack)', 98: 'FX 3 (crystal)', 99: 'FX 4 (atmosphere)',
    100: 'FX 5 (brightness)', 101: 'FX 6 (goblins)', 102: 'FX 7 (echoes)',
    103: 'FX 8 (sci-fi)', 104: 'Sitar', 105: 'Banjo', 106: 'Shamisen',
    107: 'Koto', 108: 'Kalimba', 109: 'Bagpipe', 110: 'Fiddle',
    111: 'Shanai', 112: 'Tinkle Bell', 113: 'Agogo', 114: 'Steel Drums',
    115: 'Woodblock', 116: 'Taiko Drum', 117: 'Melodic Tom', 118: 'Synth Drum',
    119: 'Reverse Cymbal', 120: 'Guitar Fret Noise', 121: 'Breath Noise',
    122: 'Seashore', 123: 'Bird Tweet', 124: 'Telephone Ring', 125: 'Helicopter',
    126: 'Applause', 127: 'Gunshot'
}

/** Reverse map: drum GM name → MIDI note number */
export const GM_DRUM_KEY_BY_NAME = Object.fromEntries(
    Object.entries(GM_DRUM_NAMES).map(([k, v]) => [v, Number(k)])
)

/** Reverse map: melodic GM name → 0-indexed program number */
export const GM_PROGRAM_NUM_BY_NAME = Object.fromEntries(
    Object.entries(GM_PROGRAM_NAMES).map(([k, v]) => [v, Number(k)])
)

export default class InstrumentsManager {
    static DATA = {
        "instruments": [
            { "id": "BASS", "midi": [{ "name": "Acoustic Bass", "key_based": false }], "subst": { "id1": "HI_TOM" }, "name": { "syn": [".*BASS.*"] }, "drum": false, "pan": "0" },
            { "id": "BONGOS", "midi": [{ "name": "Synth Voice", "key_based": false }], "subst": { "id1": "HI_CONGAS", "id2": "CONGAS", "id3": "RIMSHOT" }, "name": { "syn": [".*BNG.*", ".*BONG.*"] }, "drum": true, "pan": "0" },
            { "id": "BRASS", "midi": [{ "name": "Synth Brass 1", "key_based": false }], "subst": { "id1": "SYNTH", "id2": "MELO", "id2": "ORGAN" }, "name": { "syn": [".*BRASS.*", ".*TRUMPET.*", ".*TROMBONE.*", ".*TUBA.*", ".*FRENCH.*HORN.*", ".*HORN.*"] }, "drum": false, "pan": "0" },
            { "id": "CABA", "midi": [{ "name": "Cabasa", "key_based": true }], "subst": { "id1": "HI_CONGAS" }, "name": { "syn": ["CABASA"] }, "drum": true, "pan": "5" },
            { "id": "CASTENET", "midi": [{ "name": "Claves", "key_based": true }], "subst": { "id1": "CLAP" }, "name": { "syn": ["CAST"] }, "drum": true, "pan": "8" },
            { "id": "CLAVES", "midi": [{ "name": "Claves", "key_based": true }], "subst": { "id1": "RIMSHOT", "id2": "CLAP" }, "name": { "syn": [".*CLAVE.*", ".*CLAV.*"] }, "drum": true, "pan": "5" },
            { "id": "OHH", "midi": [{ "name": "Open Hi-Hat", "key_based": true }], "subst": { "id1": "CHH" }, "name": { "syn": [".*OHAT.*", ".*OHH.*", ".*OHT.*", ".*HHO.*", ".*OPHAT.*", "OH"], "adj_open": "OPEN" }, "drum": true, "pan": "-4" },
            { "id": "CHH", "midi": [{ "name": "Closed Hi-Hat", "key_based": true }], "subst": { "id1": "SNARE" }, "name": { "syn": [".*HAT.*", ".*CHT.*", ".*HHC.*", "CHAT", ".*HH.*", ".*CHH.*", "CH"], "adj_open": "CLOSE" }, "drum": true, "pan": "2" },
            { "id": "CHHK", "midi": [{ "name": "Closed Hi-Hat", "key_based": true }], "subst": { "id1": "CHH" }, "name": { "syn": ["PEDAL", "CPEDAL"] }, "drum": true, "pan": "0" },
            { "id": "CHI_CONGAS", "midi": [{ "name": "Mute Hi Conga", "key_based": true }], "subst": { "id1": "HI_CONGAS" }, "name": { "syn": [".*CLOSEDCONGA.*"], "adj_pitch": "HIGH" }, "drum": true, "pan": "3" },
            { "id": "CLAP", "midi": [{ "name": "Hand Clap", "key_based": true }], "subst": { "id1": "SNARE" }, "name": { "syn": [".*CLAP.*", ".*CLP.*", "CP", ".*HAND.*", ".*SNAP.*"] }, "drum": true, "pan": "2" },
            { "id": "CONGAS", "midi": [{ "name": "Synth Voice", "key_based": false }], "subst": { "id1": "HI_CONGAS", "id2": "HI_TOM", "id3": "TOM" }, "name": { "syn": [".*CON.*", ".*CNG.*", ".*PER.*", "MC"] }, "drum": true, "pan": "0" },
            { "id": "COWBELL", "midi": [{ "name": "Cowbell", "key_based": true }], "subst": { "id1": "RIDE" }, "name": { "syn": ["CB", ".*COW.*", ".*AGOGO.*", ".*BELL.*"] }, "drum": true, "pan": "2" },
            { "id": "CRASH", "midi": [{ "name": "Crash Cymbal 1", "key_based": true }], "subst": { "id1": "CYM" }, "name": { "syn": [".*CYMBAL.*", ".*CYM.*", "CY", ".*CRASH.*", ".*PLASH.*", ".*CHINA.*", ".*CHOKE.*"] }, "drum": true, "pan": "-8" },
            { "id": "CROMAPERC", "midi": [{ "name": "Synth Voice", "key_based": false }], "subst": { "id1": "PIANO", "id2": "MELO", "id3": "HI_TOM" }, "name": { "syn": [".*CROMA.*", ".*CHROMATIC.*", ".*CELESTA.*", ".*GLOCK.*", ".*MUSIC.*BOX.*", ".*VIBRAPHONE.*", ".*VIBES.*", ".*MARIMBA.*", ".*XYLO.*", ".*TUBULAR.*BELL.*", ".*DULCIMER.*"] }, "drum": false, "pan": "0" },
            { "id": "CYM", "drum": true, "pan": "0", "subst": { "id1": "CRASH" } },
            { "id": "ENSEMBLE", "midi": [{ "name": "Synth Voice", "key_based": false }], "subst": { "id1": "BRASS", "id2": "PIANO", "id3": "MELO" }, "name": { "syn": [".*ENSEM.*", ".*CHOIR.*", ".*VOIC.*", ".*ORCHESTRA.*HIT.*", ".*ORCH.*HIT.*"] }, "drum": false, "pan": "0" },
            { "id": "ETHNIC", "midi": [{ "name": "Synth Voice", "key_based": false }], "subst": { "id1": "BASS", "id2": "RIMSHOT", "id3": "HI_TOM" }, "name": { "syn": [".*ETHN.*", ".*SITAR.*", ".*BANJO.*", ".*SHAMISEN.*", ".*KOTO.*", ".*KALIMBA.*", ".*BAGPIPE.*", ".*FIDDLE.*", ".*SHANAI.*"] }, "drum": false, "pan": "0" },
            { "id": "GUITAR", "midi": [{ "name": "Distortion Guitar", "key_based": false }], "subst": { "id1": "BASS" }, "name": { "syn": [".*GUITAR.*", ".*GTR.*", "E.GUIT"] }, "drum": false, "pan": "7" },
            { "id": "GUIRO", "midi": [{ "name": "Short Guiro", "key_based": true }, { "name": "Long Guiro", "key_based": true }], "subst": { "id1": "MARACAS", "id2": "SHAKER" }, "name": { "syn": [".*GUIRO.*", ".*GURO.*"] }, "drum": true, "pan": "0" },
            { "id": "CUICA", "midi": [{ "name": "Mute Cuica", "key_based": true }, { "name": "Open Cuica", "key_based": true }], "subst": { "id1": "CONGAS", "id2": "HI_TOM" }, "name": { "syn": [".*CUICA.*", ".*CUCA.*"] }, "drum": true, "pan": "0" },
            { "id": "HI_BONGOS", "midi": [{ "name": "Hi Bongo", "key_based": true }], "subst": { "id1": "HI_CONGAS", "id2": "CONGAS", "id3": "RIMSHOT" }, "name": { "syn": [".*HBONGO.*", ".*HIGH.*BONGO.*"], "adj_pitch": "HIGH" }, "drum": true, "pan": "0" },
            { "id": "HI_CONGAS", "midi": [{ "name": "Open Hi Conga", "key_based": true }], "subst": { "id1": "CONGAS", "id2": "HI_TOM", "id3": "TOM" }, "name": { "syn": [".*HCONGA.*", ".*CONGA.*HIGH.*", "HC"], "adj_pitch": "HIGH" }, "drum": true, "pan": "3" },
            { "id": "HI_TIMBAL", "midi": [{ "name": "High Timbale", "key_based": true }], "subst": { "id1": "SNARE" }, "name": { "syn": [".*HI_TIMBAL.*", ".*HIGH.*TIMBAL.*"] }, "drum": true, "pan": "8" },
            { "id": "HI_TOM", "midi": [{ "name": "High Tom", "key_based": true }], "subst": { "id1": "TOM" }, "name": { "syn": ["HT", ".*HITOM.*", ".*HTOM.*", ".*TOMH.*", ".*TOM.*HI.*", ".*HI_TOM.*"], "adj_pitch": "HIGH" }, "drum": true, "pan": "7" },
            { "id": "HI_WOODBLOCK", "midi": [{ "name": "Hi Wood Block", "key_based": true }], "subst": { "id1": "LO_WOODBLOCK", "id2": "RIMSHOT" }, "name": { "syn": ["HWOOD"] }, "drum": true, "pan": "-2" },
            { "id": "HIT", "midi": [{ "name": "High Floor Tom", "key_based": true }], "subst": { "id1": "SNARE" }, "name": { "syn": [".*BEEP.*", ".*BIP.*", ".*ZAP.*", ".*POP.*", ".*SHOT.*", ".*LASER.*", ".*GUN.*"] }, "drum": true, "pan": "5" },
            { "id": "KICK", "midi": [{ "name": "Bass Drum 1", "key_based": true }], "subst": { "id1": "KICK" }, "name": { "syn": [".*KICK.*", ".*KCK.*", ".*KIK.*", "KD", ".*BD.*", "ACC.*BD", "D.*BASS", "BASS.*DRUM", "SINUS"], "adj_height": "", "adj_open": "", "adj_style": "ACCOUSTIC" }, "drum": true, "pan": "0" },
            { "id": "LO_BONGOS", "midi": [{ "name": "Low Bongo", "key_based": true }], "subst": { "id1": "SNARE" }, "name": { "syn": [".*LBONGO.*"] }, "drum": true, "pan": "6" },
            { "id": "LO_CONGAS", "midi": [{ "name": "Low Conga", "key_based": true }], "subst": { "id1": "CONGAS", "id2": "LO_TOM", "id3": "TOM" }, "name": { "syn": ["LCONGA.*", ".*CONGA.*LOW.*", "LC"], "adj_pitch": "LOW" }, "drum": true, "pan": "-3" },
            { "id": "LO_TIMBAL", "midi": [{ "name": "Low Timbale", "key_based": true }], "subst": { "id1": "SNARE" }, "name": { "syn": [".*LO_TIMBAL.*", ".*LOW.*TIMBAL.*"] }, "drum": true, "pan": "0" },
            { "id": "LO_TOM", "midi": [{ "name": "Low Tom", "key_based": true }, { "name": "Low Floor Tom", "key_based": true }], "subst": { "id1": "TOM" }, "name": { "syn": [".*LTOM.*", "LT.*", ".*LOWTOM.*", ".*TOMLOW.*", ".*TOM.*LO.*", ".*LO_TOM.*"], "adj_pitch": "LOW" }, "drum": true, "pan": "2" },
            { "id": "LO_WOODBLOCK", "midi": [{ "name": "Low Wood Block", "key_based": true }], "subst": { "id1": "RIMSHOT" }, "name": { "syn": ["WOOD", "WOOD BLOCK", "BLOCK"] }, "drum": true, "pan": "2" },
            { "id": "LONGBRASS", "midi": [{ "name": "Synth Voice", "key_based": false }], "subst": { "id1": "SHORTBRASS", "id2": "BRASS", "id3": "MELO" }, "name": { "syn": [".*LONG.*BRASS.*"] }, "drum": false, "pan": "0" },
            { "id": "LOOP", "midi": [{ "name": "Electric Snare", "key_based": true }], "subst": { "id1": "SNARE" }, "name": { "syn": [".*LOOP.*"] }, "drum": false, "pan": "0" },
            { "id": "MARACAS", "midi": [{ "name": "Maracas", "key_based": true }], "subst": { "id1": "CHH" }, "name": { "syn": ["MARA", "MA", ".*MARACAS?.*", ".*MARACA.*"] }, "drum": true, "pan": "8" },
            { "id": "MELO", "midi": [{ "name": "Percussive Organ", "key_based": false }], "subst": { "id1": "PIANO", "id2": "SYNTH", "id3": "TOM" }, "name": { "syn": [".*MELO.*", ".*MELODIC.*"] }, "drum": false, "pan": "1" },
            { "id": "MTOM", "midi": [{ "name": "Hi-Mid Tom", "key_based": true }], "subst": { "id1": "TOM" }, "name": { "syn": ["MTOM.*", "MT", "DRUM"], "adj_pitch": "MEDIUM" }, "drum": true, "pan": "4" },
            { "id": "OHH", "midi": [{ "name": "Open Hi-Hat", "key_based": true }], "subst": { "id1": "CHH" }, "name": { "syn": [".*OHAT.*", ".*OHH.*", ".*OHT.*", ".*HHO.*", ".*OPHAT.*", "OH"], "adj_open": "OPEN" }, "drum": true, "pan": "-4" },
            { "id": "OHI_CONGAS", "midi": [{ "name": "Synth Voice", "key_based": false }], "subst": { "id1": "HI_CONGAS" }, "name": { "syn": [".*OHCONGA.*", ".*OPEN.*CONGA.*"] }, "drum": true, "pan": "0" },
            { "id": "ORGAN", "midi": [{ "name": "Synth Voice", "key_based": false }], "subst": { "id1": "PIANO", "id2": "MELO", "id3": "HI_TOM" }, "name": { "syn": [".*ORGAN.*", ".*ACCORDION.*", ".*HARMONICA.*", ".*TANGO.*"] }, "drum": false, "pan": "0" },
            { "id": "PERC", "midi": [{ "name": "High Floor Tom", "key_based": true }, { "name": "High Agogo", "key_based": true }, { "name": "Low Agogo", "key_based": true }, { "name": "Low-Mid Tom", "key_based": true }, { "name": "Long Whistle", "key_based": true }, { "name": "Short Guiro", "key_based": true }, { "name": "Long Guiro", "key_based": true }, { "name": "Claves", "key_based": true }, { "name": "Chinese Cymbal", "key_based": true }, { "name": "Hi Wood Block", "key_based": true }, { "name": "Ride Bell", "key_based": true }, { "name": "Mute Cuica", "key_based": true }, { "name": "Splash Cymbal", "key_based": true }, { "name": "Open Cuica", "key_based": true }, { "name": "Vibraslap", "key_based": true }], "subst": { "id1": "CONGAS" }, "name": { "syn": [".*UNKNOWN.*"] }, "drum": false, "pan": "0" },
            { "id": "PERCUSSIVE", "midi": [{ "name": "Synth Voice", "key_based": false }], "subst": { "id1": "HI_CONGAS", "id2": "HI_TOM", "id3": "RIMSHOT" }, "name": { "syn": [".*PERCUSS.*", ".*STEEL.*DRUM.*", ".*TAIKO.*", ".*MELODIC.*TOM.*", ".*SYNTH.*DRUM.*"] }, "drum": true, "pan": "0" },
            { "id": "PIANO", "midi": [{ "name": "Acoustic Grand Piano", "key_based": false }], "subst": { "id1": "MELO", "id2": "MTOM", "id3": "HI_TOM" }, "name": { "syn": ["RHODE", ".*PIANO.*", ".*GRAND.*", ".*HONKY.*", ".*HARPSICHORD.*", ".*CLAVINET.*"] }, "drum": false, "pan": "0" },
            { "id": "PIPE", "midi": [{ "name": "Synth Voice", "key_based": false }], "subst": { "id1": "PIANO", "id2": "MELO", "id3": "HI_TOM" }, "name": { "syn": [".*PIPE.*", ".*FLUTE.*", ".*PICCOLO.*", ".*RECORDER.*", ".*PAN.*FLUTE.*", ".*PANFLUTE.*", ".*SHAKUHACHI.*", ".*OCARINA.*", ".*BLOWN.*BOTTLE.*"] }, "drum": false, "pan": "0" },
            { "id": "RAZOR", "midi": [{ "name": "Synth Voice", "key_based": false }], "subst": { "id1": "HIT" }, "name": { "syn": ["RAZ", ".*RAZOR.*"] }, "drum": true, "pan": "5" },
            { "id": "REED", "midi": [{ "name": "Synth Voice", "key_based": false }], "subst": { "id1": "PIANO", "id2": "MELO", "id3": "HI_TOM" }, "name": { "syn": [".*REED.*", ".*OBOE.*", ".*CLARINET.*", ".*BASSOON.*", ".*ENGLISH.*HORN.*"] }, "drum": false, "pan": "0" },
            { "id": "RIDE", "midi": [{ "name": "Ride Cymbal 1", "key_based": true }], "subst": { "id1": "CYM", "id2": "CHH" }, "name": { "syn": [".*RID.*"] }, "drum": true, "pan": "7" },
            { "id": "RIMSHOT", "midi": [{ "name": "Side Stick", "key_based": true }], "subst": { "id1": "SNARE" }, "name": { "syn": [".*RIM.*", ".*WOOD.*", "WOOD BLOCK", "WOODBLOCK", "BLOCK", "STICK", "STIK", "CLI.*", "CL", ".*STICK.*", ".*SIDE.*", ".*RS.*"] }, "drum": true, "pan": "-2" },
            { "id": "SAX", "midi": [{ "name": "Soprano Sax", "key_based": false }], "subst": { "id1": "PIANO" }, "name": { "syn": ["saxophone", "saxo", ".*SAX.*"] }, "drum": true, "pan": "7" },
            { "id": "SCRATCH", "midi": [{ "name": "Synth Voice", "key_based": false }], "subst": { "id1": "SOUNDEFFECT", "id2": "HIT", "id3": "CRASH" }, "name": { "syn": [".*SCRATCH.*"] }, "drum": true, "pan": "0" },
            { "id": "SHAKER", "midi": [{ "name": "Maracas", "key_based": true }], "subst": { "id1": "MARACAS", "id2": "RIMSHOT", "id3": "COWBELL" }, "name": { "syn": [".*SHAKE.*", ".*SHACK.*"] }, "drum": true, "pan": "0" },
            { "id": "SHORTBRASS", "midi": [{ "name": "Synth Voice", "key_based": false }], "subst": { "id1": "LONGBRASS", "id2": "BRASS", "id3": "MELO" }, "name": { "syn": [".*SHORT.*BRASS.*"] }, "drum": false, "pan": "0" },
            { "id": "SNARE", "midi": [{ "name": "Acoustic Snare", "key_based": true }], "subst": { "id1": "SNARE" }, "name": { "syn": ["SN", ".*SNAR.*", ".*SD.*", "SN", "SNR", "ACC AC", "AC", ".*BRUSH.*"], "adj_style": "ACCOUSTIC" }, "drum": true, "pan": "3" },
            { "id": "SOUNDEFFECT", "midi": [{ "name": "Synth Voice", "key_based": false }], "subst": { "id1": "CRASH", "id2": "HIT", "id3": "SCRATCH" }, "name": { "syn": [".*FX.*", ".*SOUND.*", ".*SND.*", ".*VINYL.*", ".*CRACKL.*", ".*RISER.*", ".*IMPACT.*", ".*DOWNLIFT.*", ".*FOLEY.*", ".*SEASHORE.*", ".*BIRD.*", ".*APPLAUSE.*", ".*HELICOPTER.*", ".*TELEPHONE.*", ".*GUNSHOT.*", ".*REVERSE.*", ".*BREATH.*", ".*FRET.*NOISE.*", ".*RAIN.*", ".*SOUNDTRACK.*", ".*CRYSTAL.*", ".*ATMOS.*", ".*BRIGHT.*", ".*GOBLIN.*", ".*ECHO.*", ".*SCI.*FI.*"] }, "drum": true, "pan": "0" },
            { "id": "STRINGS", "midi": [{ "name": "Synth Voice", "key_based": false }], "subst": { "id1": "BRASS", "id2": "PIANO", "id3": "MELO" }, "name": { "syn": [".*STRING.*", ".*VIOLIN.*", ".*VIOLA.*", ".*CELLO.*", ".*CONTRABASS.*", ".*HARP.*", ".*TIMPANI.*", ".*PIZZICATO.*", ".*TREMOLO.*"] }, "drum": false, "pan": "0" },
            { "id": "SYNTH", "drum": false, "pan": "0", "subst": { "id1": "MELO" } },
            { "id": "SYNTHEFFECT", "midi": [{ "name": "Synth Voice", "key_based": false }], "subst": { "id1": "HIT", "id2": "CRASH", "id3": "RIMSHOT" }, "name": { "syn": [".*SYNTH.*EFFECT.*", ".*FX.*"] }, "drum": true, "pan": "0" },
            { "id": "SYNTHLEAD", "midi": [{ "name": "Synth Voice", "key_based": false }], "subst": { "id1": "PIANO", "id2": "MELO", "id3": "HI_TOM" }, "name": { "syn": [".*SYNTH.*", ".*LEAD.*", ".*SQUARE.*", ".*SAW.*", ".*CALLIOPE.*", ".*CHIFF.*", ".*CHARANG.*", ".*FIFTHS.*"] }, "drum": false, "pan": "0" },
            { "id": "SYNTHPAD", "midi": [{ "name": "Synth Voice", "key_based": false }], "subst": { "id1": "HIT", "id2": "CRASH", "id3": "RIMSHOT" }, "name": { "syn": [".*SYNTH.*PAD.*", ".*PAD.*", ".*NEW.*AGE.*", ".*WARM.*", ".*BOWED.*", ".*METALLIC.*", ".*HALO.*", ".*SWEEP.*"] }, "drum": true, "pan": "0" },
            { "id": "TAMB", "midi": [{ "name": "Synth Voice", "key_based": false }], "subst": { "id1": "SNARE", "id2": "HI_TOM", "id3": "CHH" }, "name": { "syn": [".*TAMB.*"] }, "drum": true, "pan": "0" },
            { "id": "TAMBOURINE", "midi": [{ "name": "Tambourine", "key_based": true }], "subst": { "id1": "OHH" }, "name": { "syn": [".*TAMB.*"] }, "drum": true, "pan": "-2" },
            { "id": "TIMBAL", "midi": [{ "name": "Synth Voice", "key_based": false }], "subst": { "id1": "LO_TOM", "id2": "CRASH", "id3": "SNARE" }, "name": { "syn": [".*TIMBAL.*", "TIMBALE"] }, "drum": true, "pan": "0" },
            { "id": "TOM", "midi": [{ "name": "Hi-Mid Tom", "key_based": true }], "subst": { "id1": "HI_TOM", "id2": "MTOM", "id3": "CHH" }, "name": { "syn": [".*TOM.*"] }, "drum": true, "pan": "2" },
            { "id": "TRIANGLE", "midi": [{ "name": "Open Triangle", "key_based": true }, { "name": "Mute Triangle", "key_based": true }], "subst": { "id1": "TAMBOURINE", "id2": "RIMSHOT", "id3": "SNARE" }, "name": { "syn": [".*TRI.*"] }, "drum": true, "pan": "5" },
            { "id": "VIBRA", "midi": [{ "name": "Synth Voice", "key_based": false }], "subst": { "id1": "HIT", "id2": "CRASH", "id3": "RIMSHOT" }, "name": { "syn": [".*VIBRA.*"] }, "drum": true, "pan": "0" },
            { "id": "WHISTLE", "midi": [{ "name": "Synth Voice", "key_based": false }], "subst": { "id1": "MARACAS", "id2": "RIMSHOT", "id3": "HIT" }, "name": { "syn": [".*WHISTL.*"] }, "drum": true, "pan": "0" }
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
        logger.warn('Instrument', `findByName: no match for "${name}" — fallback: KICK`)
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

    findInstrumentFromMidiProgram = (channel, program) => {
        const normalizedChannel = String(channel);
        const normalizedProgram = String(program);
        const normalizedProgramShifted = String(Number(program) + 1);
        logger.warn('Instrument', `findInstrumentFromMidiProgram: ch${channel} program=${program}`)

        for (const instrument of this.byId.values()) {
            const midiMatch = instrument.midi.find((midi) => {
                return midi.programm != null &&
                    (String(midi.programm) === normalizedProgramShifted);
            });
            if (midiMatch) {
                logger.warn('Instrument', `findInstrumentFromMidiProgram: program match ch${channel} program=${program} (+1=${normalizedProgramShifted}) → "${instrument.id}"`)
                return instrument;
            }
        }

        for (const instrument of this.byId.values()) {
            const midiMatch = instrument.midi.find((midi) => {
                return midi.programm != null &&
                    (String(midi.programm) === normalizedProgram);
            });
            if (midiMatch) {
                logger.warn('Instrument', `findInstrumentFromMidiProgram: program match ch${channel} program=${program} (exact) → "${instrument.id}"`)
                return instrument;
            }
        }

        logger.warn('Instrument', `findInstrumentFromMidiProgram: no direct match, trying GM fallback`)
        return this._findByProgramNumber(program);
    }

    findInstrumentFromMidiProgramAnyChannel = (program) => {
        const normalizedProgram = String(program);
        const normalizedProgramShifted = String(Number(program) + 1);
        logger.warn('Instrument', `findInstrumentFromMidiProgramAnyChannel: program=${program}`)

        for (const instrument of this.byId.values()) {
            const midiMatch = instrument.midi.find((midi) => {
                return midi.programm != null &&
                    (String(midi.programm) === normalizedProgramShifted);
            });
            if (midiMatch) {
                logger.warn('Instrument', `findInstrumentFromMidiProgramAnyChannel: direct match program=${program} (+1=${normalizedProgramShifted}) → "${instrument.id}"`)
                return instrument;
            }
        }

        for (const instrument of this.byId.values()) {
            const midiMatch = instrument.midi.find((midi) => {
                return midi.programm != null &&
                    (String(midi.programm) === normalizedProgram);
            });
            if (midiMatch) {
                logger.warn('Instrument', `findInstrumentFromMidiProgramAnyChannel: direct match program=${program} (exact) → "${instrument.id}"`)
                return instrument;
            }
        }

        logger.warn('Instrument', `findInstrumentFromMidiProgramAnyChannel: no direct match, trying GM fallback`)
        return this._findByProgramNumber(program);
    }

    _findByProgramNumber = (program) => {
        const p = Number(program)
        const gmName = GM_PROGRAM_NAMES[p]
        logger.warn('Instrument', `findByProgramNumber: program ${program} → "${gmName ?? '(none)'}"`)

        if (gmName) {
            const inst = this.findByName(gmName)
            if (inst) {
                logger.warn('Instrument', `findByProgramNumber: findByName("${gmName}") → "${inst.id}"`)
                return inst
            }
            for (const instrument of this.byId.values()) {
                if (instrument.midi.some(m => m.name && m.name.toLowerCase() === gmName.toLowerCase())) {
                    logger.warn('Instrument', `findByProgramNumber: midi.name match "${gmName}" → "${instrument.id}"`)
                    return instrument
                }
            }
        }

        logger.warn('Instrument', `findByProgramNumber: no match for program ${program}`)
        return new Instrument()
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
