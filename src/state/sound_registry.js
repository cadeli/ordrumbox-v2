export class SoundRegistry {
    static DEFAULTS = {
        sounds: {}, scales: {}, generatedSounds: {},
        drumkitList: [], drumkits: {}, leds: {},
        settings: {
            version: 1, sampleDirs: [], maxSampleDirs: 10,
            master: {
                volume: 1, preGain: 0, lowcut: 35, hicut: 18500,
                compBypass: false, threshold: -18, ratio: 8, attack: 0.002,
                release: 0.08, knee: 3, makeup: 8,
            },
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
