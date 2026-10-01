import { MASTER_BUS_DEFAULTS, SESSION_DEFAULTS } from '../core/constants.js'

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
