export class SoundRegistry {
    constructor() {
        this.sounds = {}
        this.scales = {}
        this.generatedSounds = {}
        this.drumkitList = []
        this.drumkits = {}
        this.leds = {}
    }

    reset() {
        this.sounds = {}
        this.scales = {}
        this.generatedSounds = {}
        this.drumkitList = []
        this.drumkits = {}
        this.leds = {}
    }
}

export const soundRegistry = new SoundRegistry()
