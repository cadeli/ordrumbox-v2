/**
 * LFO AudioWorkletProcessor source with multiple waveform shapes.
 *
 * Inlined as a string and loaded via Blob URL by WorkletLoader.
 * Generates an LFO signal at a configurable frequency with a choice of
 * waveform shapes. The output is a single-channel audio signal that can
 * be connected to any AudioParam (via the host's gain node).
 *
 * Waveforms:
 *   0 = sine
 *   1 = triangle
 *   2 = saw (rising)
 *   3 = square
 *   4 = sample-and-hold (random held per cycle)
 *
 * AudioParam layout:
 *   - port 0: output (mono, range -1..1 unless offset/gain applied)
 *   - parameter 0: freq (Hz, 0.01..20)
 *   - parameter 1: waveform (0..4)
 *   - parameter 2: phase (0..1, normalized)
 *   - parameter 3: bias (-1..1, DC offset added to output)
 */

const LFO_PROCESSOR_SOURCE = `
class LFOProcessor extends AudioWorkletProcessor {
    static get parameterDescriptors() {
        return [
            { name: 'freq',     defaultValue: 1,   minValue: 0.01, maxValue: 20,  automationRate: 'a-rate' },
            { name: 'waveform', defaultValue: 0,   minValue: 0,    maxValue: 4,   automationRate: 'k-rate' },
            { name: 'phase',    defaultValue: 0,   minValue: 0,    maxValue: 1,   automationRate: 'k-rate' },
            { name: 'bias',     defaultValue: 0,   minValue: -1,   maxValue: 1,   automationRate: 'k-rate' }
        ];
    }

    constructor() {
        super();
        this.phaseAccum = 0;
        this.lastSampHold = 0;
    }

    _shape(phase, waveform) {
        // phase in [0, 1)
        if (waveform < 0.5) {
            // sine
            return Math.sin(2 * Math.PI * phase);
        } else if (waveform < 1.5) {
            // triangle: ramps 0->1 then 1->-1->0
            if (phase < 0.25) return phase * 4;
            if (phase < 0.75) return 2 - phase * 4;
            return phase * 4 - 4;
        } else if (waveform < 2.5) {
            // saw (rising): -1 to +1 linearly
            return phase * 2 - 1;
        } else if (waveform < 3.5) {
            // square
            return phase < 0.5 ? 1 : -1;
        } else {
            // sample-and-hold: value held per cycle, changes on wrap
            return this.lastSampHold;
        }
    }

    process(inputs, outputs, parameters) {
        const output = outputs[0];
        if (!output || output.length === 0) return true;
        const outCh = output[0];

        const freqArr = parameters.freq;
        const waveform = parameters.waveform[0];
        const initPhase = parameters.phase[0];
        const bias = parameters.bias[0];
        const sr = sampleRate;

        // Initialize phase from initPhase if first call
        if (this.phaseAccum === 0 && initPhase > 0) {
            this.phaseAccum = initPhase;
        }

        const isSampHold = waveform >= 3.5;
        if (isSampHold && this.phaseAccum === 0) {
            this.lastSampHold = Math.random() * 2 - 1;
        }

        const frames = outCh.length;
        for (let i = 0; i < frames; i++) {
            const f = freqArr.length === frames ? freqArr[i] : freqArr[0];
            const prevPhase = this.phaseAccum;
            this.phaseAccum += f / sr;
            if (this.phaseAccum >= 1) {
                this.phaseAccum -= Math.floor(this.phaseAccum);
                if (isSampHold) this.lastSampHold = Math.random() * 2 - 1;
            }
            // Re-sample shape at the new phase
            const shaped = this._shape(this.phaseAccum, waveform);
            outCh[i] = shaped + bias;
        }
        return true;
    }
}

registerProcessor('lfo-processor', LFOProcessor);
`

export default LFO_PROCESSOR_SOURCE
