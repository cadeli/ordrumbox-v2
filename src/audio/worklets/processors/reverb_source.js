/**
 * Freeverb-style algorithmic reverb AudioWorkletProcessor source.
 *
 * Inlined as a string and loaded via Blob URL by WorkletLoader.
 * Implements 8 lowpass-feedback comb filters in parallel (4 per channel)
 * + 4 allpass filters in series for diffusion. Public-domain Freeverb
 * algorithm by Jezar Wakefield, adapted to AudioWorkletProcessor.
 *
 * AudioParam layout:
 *   - port 0: input (audio)
 *   - port 1: output (audio)
 *   - parameter 0: roomSize (0..1)
 *   - parameter 1: damping  (0..1)
 *   - parameter 2: width    (0..1) — stereo spread
 *   - parameter 3: mix      (0..1) — dry/wet
 *   - parameter 4: preDelay (0..0.1) — seconds
 */

const REVERB_PROCESSOR_SOURCE = `
// Freeverb comb-filter delay lengths (slightly detuned for stereo width)
const COMB_TUNINGS_L = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
const COMB_TUNINGS_R = [1139, 1211, 1300, 1379, 1445, 1514, 1580, 1640];
const ALLPASS_TUNINGS_L = [556, 441, 341, 225];
const ALLPASS_TUNINGS_R = [579, 464, 364, 248];
const STEREO_SPREAD = 23;
const FIXED_GAIN = 0.015;

class _Comb {
    constructor(delayLen) {
        this.buffer = new Float32Array(delayLen);
        this.bufIdx = 0;
        this.filterStore = 0;
    }
    process(input, damp1, damp2, feedback) {
        const output = this.buffer[this.bufIdx];
        this.filterStore = output * damp2 + this.filterStore * damp1;
        this.buffer[this.bufIdx] = input + this.filterStore * feedback;
        this.bufIdx = (this.bufIdx + 1) % this.buffer.length;
        return output;
    }
}

class _Allpass {
    constructor(delayLen) {
        this.buffer = new Float32Array(delayLen);
        this.bufIdx = 0;
    }
    process(input) {
        const bufout = this.buffer[this.bufIdx];
        const output = -input + bufout;
        this.buffer[this.bufIdx] = input + bufout * 0.5;
        this.bufIdx = (this.bufIdx + 1) % this.buffer.length;
        return output;
    }
}

class ReverbProcessor extends AudioWorkletProcessor {
    static get parameterDescriptors() {
        return [
            { name: 'roomSize', defaultValue: 0.7, minValue: 0, maxValue: 1,   automationRate: 'k-rate' },
            { name: 'damping',  defaultValue: 0.5, minValue: 0, maxValue: 1,   automationRate: 'k-rate' },
            { name: 'width',    defaultValue: 1.0, minValue: 0, maxValue: 1,   automationRate: 'k-rate' },
            { name: 'mix',      defaultValue: 1.0, minValue: 0, maxValue: 1,   automationRate: 'k-rate' },
            { name: 'preDelay', defaultValue: 0.02, minValue: 0, maxValue: 0.1, automationRate: 'k-rate' }
        ];
    }

    constructor() {
        super();
        this.combsL = COMB_TUNINGS_L.map(len => new _Comb(len));
        this.combsR = COMB_TUNINGS_R.map(len => new _Comb(len));
        this.allpassL = ALLPASS_TUNINGS_L.map(len => new _Allpass(len));
        this.allpassR = ALLPASS_TUNINGS_R.map(len => new _Allpass(len));
        this.preDelayBuffer = new Float32Array(Math.ceil(sampleRate * 0.1));
        this.preDelayIdx = 0;
    }

    process(inputs, outputs, parameters) {
        const input = inputs[0];
        const output = outputs[0];
        if (!input || input.length === 0) return true;

        const roomSize = parameters.roomSize[0];
        const damping = parameters.damping[0];
        const width = parameters.width[0];
        const mix = parameters.mix[0];
        const preDelayS = parameters.preDelay[0];

        const feedback = roomSize * 0.28 + 0.7;
        const damp1 = damping * 0.4;
        const damp2 = 1 - damp1;

        // Pre-delay index update: how many samples to delay
        const preDelaySamples = Math.min(this.preDelayBuffer.length - 1, Math.floor(preDelayS * sampleRate));
        const wet1 = width * 0.5 + 0.5;
        const wet2 = (1 - width) * 0.5;

        const inpL = input[0] || new Float32Array(128);
        const inpR = input[1] || inpL;
        const outL = output[0];
        const outR = output[1] || outL;
        const frames = inpL.length;

        for (let i = 0; i < frames; i++) {
            // Pre-delay (mono sum for simplicity).
            // Write first, then read at the preDelaySamples-delayed position,
            // then advance the write index.
            this.preDelayBuffer[this.preDelayIdx] = (inpL[i] + inpR[i]) * 0.5 * FIXED_GAIN;
            const preIdx = (this.preDelayIdx - preDelaySamples + this.preDelayBuffer.length) % this.preDelayBuffer.length;
            const delayed = this.preDelayBuffer[preIdx];
            this.preDelayIdx = (this.preDelayIdx + 1) % this.preDelayBuffer.length;

            // Comb filters in parallel
            let outLComb = 0, outRComb = 0;
            for (let c = 0; c < this.combsL.length; c++) {
                outLComb += this.combsL[c].process(delayed, damp1, damp2, feedback);
            }
            for (let c = 0; c < this.combsR.length; c++) {
                outRComb += this.combsR[c].process(delayed, damp1, damp2, feedback);
            }

            // Allpass filters in series
            for (let a = 0; a < this.allpassL.length; a++) {
                outLComb = this.allpassL[a].process(outLComb);
            }
            for (let a = 0; a < this.allpassR.length; a++) {
                outRComb = this.allpassR[a].process(outRComb);
            }

            // Stereo width + dry/wet mix
            const dryL = inpL[i];
            const dryR = inpR[i];
            outL[i] = dryL * (1 - mix) + (outLComb * wet1 + outRComb * wet2) * mix;
            outR[i] = dryR * (1 - mix) + (outRComb * wet1 + outLComb * wet2) * mix;
        }
        return true;
    }
}

registerProcessor('reverb-processor', ReverbProcessor);
`

export default REVERB_PROCESSOR_SOURCE
