export class SoundRegistry {
    static DEFAULTS = {
        sounds: {}, scales: {}, generatedSounds: {},
        drumkitList: [], drumkits: {}, leds: {},
    }

    constructor() { Object.assign(this, SoundRegistry.DEFAULTS) }

    reset() { Object.assign(this, SoundRegistry.DEFAULTS) }
}

export const soundRegistry = new SoundRegistry()
