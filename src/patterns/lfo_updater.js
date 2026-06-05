import { computeLfoValueFromTick } from '../audio/math.js'

export default class LfoUpdater {
    /**
     * Proxies LFO value calculation to the shared helper in math.js.
     * Keeps the visualization in sync with the audio engine's new scaling.
     */
    static computeLfoValue(lfo, tick) {
        return computeLfoValueFromTick(lfo, tick)
    }
}
