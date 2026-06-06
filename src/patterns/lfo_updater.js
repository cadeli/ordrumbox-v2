import { computeLfoValue } from '../audio/math.js'

export default class LfoUpdater {
    /**
     * Proxies LFO value calculation to the shared helper in math.js.
     * 
     * @param {Object} lfo         LFO configuration
     * @param {number} tick        Current transport tick
     * @param {number} nbTicks     Pattern duration in ticks
     * @param {string} controlKey  Optional key to handle specific normalizations (e.g. 'filterFreq')
     */
    static computeLfoValue(lfo, tick, nbTicks, controlKey = null) {
        return computeLfoValue(lfo, tick, nbTicks, controlKey)
    }
}
