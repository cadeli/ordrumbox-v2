/**
 * Saturation AudioWorkletProcessor source.
 *
 * Inlined as a string and loaded via Blob URL by WorkletLoader.
 * Replaces WaveShaperNode with custom DSP that supports:
 *   - type: 'soft' | 'hard' | 'tape'
 *   - drive: 1..7 (gain multiplier)
 *   - mix: 0..1 (dry/wet)
 *   - output: 0.5..1 (output gain compensation)
 *
 * AudioParam layout:
 *   - port 0: input (audio)
 *   - port 1: output (audio)
 *   - parameter 0: drive (k-rate)
 *   - parameter 1: mix (k-rate)
 *   - parameter 2: output (k-rate)
 *   - parameter 3: type index (k-rate, 0=soft, 1=hard, 2=tape)
 */

const SATURATION_PROCESSOR_SOURCE = `
class SaturationProcessor extends AudioWorkletProcessor {
    static get parameterDescriptors() {
        return [
            { name: 'drive', defaultValue: 1, minValue: 1, maxValue: 7, automationRate: 'k-rate' },
            { name: 'mix',   defaultValue: 1, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
            { name: 'output',defaultValue: 1, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
            { name: 'type',  defaultValue: 0, minValue: 0, maxValue: 2, automationRate: 'k-rate' }
        ];
    }

    _shape(x, typeIdx) {
        if (typeIdx < 0.5) {
            // soft: tanh
            return Math.tanh(x);
        } else if (typeIdx < 1.5) {
            // hard: linear clip
            if (x > 1) return 1;
            if (x < -1) return -1;
            return x;
        } else {
            // tape: atan
            return Math.atan(x);
        }
    }

    process(inputs, outputs, parameters) {
        const input = inputs[0];
        const output = outputs[0];
        if (!input || input.length === 0) return true;

        const drive = parameters.drive[0];
        const mix = parameters.mix[0];
        const outGain = parameters.output[0];
        const typeIdx = parameters.type[0];

        for (let ch = 0; ch < input.length; ch++) {
            const inp = input[ch];
            const out = output[ch];
            if (!out) continue;
            for (let i = 0; i < inp.length; i++) {
                const dry = inp[i];
                const shaped = this._shape(dry * drive, typeIdx);
                out[i] = (dry * (1 - mix) + shaped * mix) * outGain;
            }
        }
        return true;
    }
}

registerProcessor('saturation-processor', SaturationProcessor);
`

export default SATURATION_PROCESSOR_SOURCE
