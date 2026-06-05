import { computeLfoValue } from '../audio/math.js'

export default class LfoUpdater {
    /**
     * Proxies LFO value calculation to the shared helper in math.js.
     * Called by the visual to display the LFO contribution.
     * Returns 0 when LFO is null/undefined (caller decides replace vs add).
     *
     * @param {Object|null} lfo
     * @param {number} tick
     * @param {number} nbTicks
     * @param {string|null} controlKey  Optional: 'filterFreq' or 'filterQ' for normalization
     */
    static computeLfoValue(lfo, tick, nbTicks, controlKey) {
        return computeLfoValue(lfo, tick, nbTicks, controlKey)
    }
}
