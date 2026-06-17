import { computeLfoValue } from '../audio/math.js'

const LFO_MAP = [
    { lfoKey: 'velocityLfo',   resultKey: 'velocity' },
    { lfoKey: 'panLfo',        resultKey: 'pan' },
    { lfoKey: 'pitchLfo',      resultKey: 'pitch' },
    { lfoKey: 'filterFreqLfo', resultKey: 'filterFreq' },
    { lfoKey: 'filterQLfo',    resultKey: 'filterQ' },
]

export function computeTrackLfoValues(track, tick, nbTicks, bpm) {
    const values = {}
    for (const { lfoKey, resultKey } of LFO_MAP) {
        const lfo = track[lfoKey]
        values[resultKey] = lfo ? computeLfoValue(lfo, tick, nbTicks, resultKey, null, bpm) : 0
    }
    return values
}
