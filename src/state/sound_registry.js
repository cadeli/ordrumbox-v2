import { MASTER_BUS_DEFAULTS, SESSION_DEFAULTS } from '../core/constants.js'

/**
 * Une entree de soundRegistry.sounds : un echantillon charge, ou un preset
 * synth. Le sous-ensemble lu par l'UI track editor.
 * @typedef {object} SoundEntry
 * @property {string} [url]
 * @property {string} [key]
 * @property {string} [kitName]
 * @property {string} [display_name]
 * @property {AudioBuffer} [buffer]
 * @property {number} [index] ordre d'import, pose a l'ajout
 * @property {boolean} [isLoad] echantillon importe depuis un fichier
 * @property {boolean} [playStatus] etat de lecture du sample
 * @property {any} [decay]
 * @property {any} [duration]
 * @property {any} [gainDb]
 * @property {any} [kit_name]
 * @property {any} [peakDb]
 * @property {any} [rootMidi]
 * @property {any} [tune]
 */

class SoundRegistry {
    static DEFAULTS = {
        sounds: {},
        scales: {},
        generatedSounds: {},
        drumkitList: [],
        drumkits: {},
        leds: {},
        settings: {
            version: 1,
            loaded: false,
            sampleDirs: [],
            maxSampleDirs: 10,
            master: MASTER_BUS_DEFAULTS,
            session: SESSION_DEFAULTS,
        },
    }

    constructor() {
        Object.assign(this, SoundRegistry.DEFAULTS)
        this.settings = structuredClone(SoundRegistry.DEFAULTS.settings)
    }

    reset() {
        /** @type {Record<string, SoundEntry>} */
        this.sounds = {}
        this.scales = {}
        this.generatedSounds = {}
        this.drumkitList = []
        this.drumkits = {}
        this.leds = {}
        this.settings = structuredClone(SoundRegistry.DEFAULTS.settings)
    }
}

export const soundRegistry = new SoundRegistry()
