import { MASTER_BUS_DEFAULTS, SESSION_DEFAULTS } from '../core/constants.js'

/**
 * One entry of soundRegistry.sounds: a loaded sample, or a synth preset. This is
 * the subset the track editor UI reads.
 * @typedef {object} SoundEntry
 * @property {string} [url]
 * @property {string} [key]
 * @property {string} [kitName]  drumkit this sample belongs to (one spelling only
 *   in the whole repo: it used to be written as `kit_name` while the UI read
 *   `kitName`, so the kit column of the sound section was empty for every real
 *   entry)
 * @property {string} [display_name]
 * @property {AudioBuffer} [buffer]
 * @property {number} [index] import order, set when added
 * @property {boolean} [isLoad] sample imported from a file
 * @property {boolean} [playStatus] playback state of the sample
 * @property {any} [decay]
 * @property {any} [duration]
 * @property {any} [gainDb]
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
            loaded: false,
            sampleDirs: [],
            maxSampleDirs: 10,
            colorScheme: 1,
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
