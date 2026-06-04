/**
 * Delay AudioWorkletProcessor source with saturation in the feedback loop.
 *
 * Inlined as a string and loaded via Blob URL by WorkletLoader.
 * Features:
 *   - Two delay lines (L/R) for ping-pong mode
 *   - Saturation in the feedback loop (soft, hard, tape)
 *   - Lowpass filter in the feedback loop
 *   - Stereo width control
 *   - Cross-feedback between L/R for pingpong
 *
 * AudioParam layout:
 *   - port 0: input (audio, stereo)
 *   - port 1: output (audio, stereo)
 *   - parameter 0: timeL (seconds) — a-rate
 *   - parameter 1: timeR (seconds) — a-rate
 *   - parameter 2: feedback (0..1)
 *   - parameter 3: mix (0..1)
 *   - parameter 4: filter (Hz, 20..20000)
 *   - parameter 5: saturation (0..1)
 *   - parameter 6: saturationType (0=soft, 1=hard, 2=tape)
 *   - parameter 7: mode (0=slap, 1=tape, 2=pingpong)
 *   - parameter 8: width (0..1)
 */

const DELAY_PROCESSOR_SOURCE = `
class _DelayLine {
    constructor(maxSeconds) {
        this.buffer = new Float32Array(Math.ceil(maxSeconds * 48000));
        this.writeIdx = 0;
        this.lastOut = 0;
    }
    read(delaySamples) {
        const len = this.buffer.length;
        const readIdx = ((this.writeIdx - delaySamples) % len + len) % len;
        return this.buffer[readIdx | 0];
    }
    write(sample) {
        this.buffer[this.writeIdx] = sample;
        this.writeIdx = (this.writeIdx + 1) % this.buffer.length;
    }
}

class DelayProcessor extends AudioWorkletProcessor {
    static get parameterDescriptors() {
        return [
            { name: 'timeL', defaultValue: 0.25, minValue: 0, maxValue: 2,  automationRate: 'a-rate' },
            { name: 'timeR', defaultValue: 0.25, minValue: 0, maxValue: 2,  automationRate: 'a-rate' },
            { name: 'feedback', defaultValue: 0.3, minValue: 0, maxValue: 0.99, automationRate: 'k-rate' },
            { name: 'mix', defaultValue: 1, minValue: 0, maxValue: 1,  automationRate: 'k-rate' },
            { name: 'filter', defaultValue: 5000, minValue: 20, maxValue: 20000, automationRate: 'k-rate' },
            { name: 'saturation', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
            { name: 'saturationType', defaultValue: 0, minValue: 0, maxValue: 2, automationRate: 'k-rate' },
            { name: 'mode', defaultValue: 0, minValue: 0, maxValue: 2, automationRate: 'k-rate' },
            { name: 'width', defaultValue: 1, minValue: 0, maxValue: 1, automationRate: 'k-rate' }
        ];
    }

    constructor() {
        super();
        this.lineL = new _DelayLine(2.0);
        this.lineR = new _DelayLine(2.0);
        this.filterL = 0;
        this.filterR = 0;
    }

    _shape(x, sat, typeIdx) {
        if (sat <= 0) return x;
        const driven = x * (1 + sat * 4);
        let y;
        if (typeIdx < 0.5)        y = Math.tanh(driven);
        else if (typeIdx < 1.5)   y = Math.max(-1, Math.min(1, driven));
        else                       y = Math.atan(driven) * 2 / Math.PI;
        // Mix dry/wet by sat amount
        return x * (1 - sat) + y * sat;
    }

    _lowpass(input, prev, cutoff) {
        // Simple 1-pole lowpass
        const coef = Math.min(1, cutoff / (cutoff + 1));
        return prev + coef * (input - prev);
    }

    process(inputs, outputs, parameters) {
        const input = inputs[0];
        const output = outputs[0];
        if (!input || input.length === 0) return true;

        const inpL = input[0] || new Float32Array(128);
        const inpR = input[1] || inpL;
        const outL = output[0];
        const outR = output[1] || outL;
        const frames = inpL.length;

        const fb = parameters.feedback[0];
        const mix = parameters.mix[0];
        const filterCut = parameters.filter[0];
        const sat = parameters.saturation[0];
        const satType = parameters.saturationType[0];
        const mode = parameters.mode[0];
        const width = parameters.width[0];
        const tL = parameters.timeL;
        const tR = parameters.timeR;
        const sr = sampleRate;

        const isPingPong = mode >= 1.5;
        const isStereo = input.length > 1;

        for (let i = 0; i < frames; i++) {
            // Current delay times (a-rate)
            const dLSamples = Math.min(this.lineL.buffer.length - 1, tL[i] * sr);
            const dRSamples = Math.min(this.lineR.buffer.length - 1, tR[i] * sr);

            // Read delayed samples
            const dL = this.lineL.read(dLSamples);
            const dR = this.lineR.read(dRSamples);

            // Apply feedback path: read → filter → saturate → multiply by feedback
            const filtL = this._lowpass(dL, this.filterL, filterCut);
            const filtR = this._lowpass(dR, this.filterR, filterCut);
            const satL = this._shape(filtL * fb, sat, satType);
            const satR = this._shape(filtR * fb, sat, satType);
            this.filterL = filtL;
            this.filterR = filtR;

            // Write input + feedback to delay lines
            // Slap/tape: same channel. Pingpong: cross-channel.
            let inL = inpL[i];
            let inR = isStereo ? inpR[i] : inpL[i];
            if (isPingPong) {
                // Cross: L line gets input + R echo, R line gets L echo
                this.lineL.write(inL + satR);
                this.lineR.write(inR + satL);
            } else {
                this.lineL.write(inL + satL);
                this.lineR.write(inR + satR);
            }

            // Stereo width: blend between mono and stereo
            const mid = (dL + dR) * 0.5;
            const wetL = dL * width + mid * (1 - width);
            const wetR = dR * width + mid * (1 - width);

            // Dry/wet mix
            outL[i] = inL * (1 - mix) + wetL * mix;
            outR[i] = inR * (1 - mix) + wetR * mix;
        }
        return true;
    }
}

registerProcessor('delay', DelayProcessor);
`

export default DELAY_PROCESSOR_SOURCE
