import { TICK } from '../core/constants.js'
import Utils from '../core/utils.js'

export default class LfoUpdater {
    static computeLfoValue(lfo, tick, ticksPer4Bars) {
        if (!lfo) return 0
        const baseTicks = ticksPer4Bars ?? TICK * 4
        const freq = Number(lfo.freq) * Number(lfo.freq / 4) * baseTicks
        const phase = lfo.phase * Utils.TWO_PI
        let ret = Math.sin((tick / freq) * Utils.TWO_PI + phase)
        ret = (ret + 1) / 2
        ret = (ret * (parseFloat(lfo.max) - parseFloat(lfo.min))) + parseFloat(lfo.min)
        return Math.floor(100 * ret) / 100
    }
}
