/**
 * State Variable Filter AudioWorkletProcessor source.
 *
 * Inlined as a string and loaded via Blob URL by WorkletLoader.
 * Implements a TPT (topology-preserving transform) state variable filter
 * with multimode output (lowpass, highpass, bandpass, notch).
 *
 * AudioParam layout:
 *   - port 0: input (audio)
 *   - port 1: output (audio)
 *   - parameter 0: cutoff (Hz, 20..20000) — a-rate
 *   - parameter 1: Q (0.1..20) — k-rate
 *   - parameter 2: mode (0=LP, 1=HP, 2=BP, 3=Notch) — k-rate
 */

const FILTER_PROCESSOR_SOURCE = `
class FilterProcessor extends AudioWorkletProcessor {
    static get parameterDescriptors() {
        return [
            { name: 'cutoff', defaultValue: 1000, minValue: 20, maxValue: 20000, automationRate: 'a-rate' },
            { name: 'q',      defaultValue: 0.7,  minValue: 0.1, maxValue: 20,   automationRate: 'k-rate' },
            { name: 'mode',   defaultValue: 0,    minValue: 0,   maxValue: 3,     automationRate: 'k-rate' }
        ];
    }

    constructor() {
        super();
        this.z1 = 0;
        this.z2 = 0;
    }

    process(inputs, outputs, parameters) {
        const input = inputs[0];
        const output = outputs[0];
        if (!input || input.length === 0) return true;

        const sr = sampleRate;
        const cutoff = parameters.cutoff;
        const q = parameters.q[0];
        const mode = parameters.mode[0];

        for (let ch = 0; ch < input.length; ch++) {
            const inp = input[ch];
            const out = output[ch];
            if (!out) continue;
            const cArr = (cutoff.length === inp.length) ? cutoff : null;
            for (let i = 0; i < inp.length; i++) {
                const f = cArr ? cArr[i] : cutoff[0];
                // TPT frequency warping for stable behavior at high cutoffs
                const wd = 2 * Math.PI * (f / sr);
                const wa = 2 * sr * Math.tan(wd * 0.5);
                const g = wa * 0.5;
                const k = 1 / q;
                const a1 = 1 / (1 + g * (g + k));
                const a2 = g * a1;
                const a3 = g * a2;
                const x = inp[i];
                // TPT state variable filter equations
                const v3 = x - this.z2;
                const v1 = a1 * this.z1 + a2 * v3;
                const v2 = this.z2 + a2 * this.z1 + a3 * v3;
                this.z1 = 2 * v1 - this.z1;
                this.z2 = 2 * v2 - this.z2;
                // Multimode output
                const m = mode;
                let y;
                if (m < 0.5)        y = v2;            // lowpass
                else if (m < 1.5)   y = v3 - v1 * k;   // highpass
                else if (m < 2.5)   y = v1;            // bandpass
                else                y = v3 - v1 * k + v2; // notch (approx)
                out[i] = y;
            }
        }
        return true;
    }
}

registerProcessor('filter', FilterProcessor);
`

export default FILTER_PROCESSOR_SOURCE
