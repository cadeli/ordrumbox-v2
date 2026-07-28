export class SoundRegistry {
    static DEFAULTS = {
        sounds: {}, scales: {}, generatedSounds: {},
        drumkitList: [], drumkits: {}, leds: {},
        settings: { version: 1, sampleDirs: [], maxSampleDirs: 10 },
    }

    constructor() { Object.assign(this, SoundRegistry.DEFAULTS) }

    reset() { Object.assign(this, SoundRegistry.DEFAULTS) }
}

export const soundRegistry = new SoundRegistry()
