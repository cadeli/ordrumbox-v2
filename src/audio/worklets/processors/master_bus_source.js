/**
 * Master Bus AudioWorkletProcessor source.
 *
 * Inlined as a string and loaded via Blob URL by WorkletLoader.
 * Replaces the native DynamicsCompressor + cascaded BiquadFilters
 * + master GainNode in MfMixer with a unified, low-latency DSP chain:
 *
 *   input  ->  pre-gain  ->  compressor  ->  highpass (~35Hz)  ->  lowpass (~18500Hz)
 *          ->  master gain  ->  output
 *
 * AudioParam layout:
 *   - port 0: input (stereo or mono)
 *   - port 1: output (stereo)
 *   - parameter 0:  compThreshold (dB, -60..0)
 *   - parameter 1:  compRatio     (1..20)
 *   - parameter 2:  compKnee      (dB, 0..40)
 *   - parameter 3:  compAttack    (s, 0.001..1)
 *   - parameter 4:  compRelease   (s, 0.01..1)
 *   - parameter 5:  compMakeup    (dB, 0..24)
 *   - parameter 6:  lowcut        (Hz, 10..500)
 *   - parameter 7:  hicut         (Hz, 1000..22000)
 *   - parameter 8:  master        (linear, 0..2)
 *   - parameter 9:  bypass        (0 = active, 1 = bypassed)
 *   - parameter 10: preGain       (dB, -20..+20)
 */

const MASTER_BUS_PROCESSOR_SOURCE = `
class MasterBusProcessor extends AudioWorkletProcessor {
    static get parameterDescriptors() {
        return [
            { name: 'compThreshold', defaultValue: -18,  minValue: -60, maxValue: 0,    automationRate: 'k-rate' },
            { name: 'compRatio',     defaultValue: 8,    minValue: 1,   maxValue: 20,   automationRate: 'k-rate' },
            { name: 'compKnee',      defaultValue: 3,    minValue: 0,   maxValue: 40,   automationRate: 'k-rate' },
            { name: 'compAttack',    defaultValue: 0.002, minValue: 0.001, maxValue: 1, automationRate: 'k-rate' },
            { name: 'compRelease',   defaultValue: 0.08,  minValue: 0.01,  maxValue: 1, automationRate: 'k-rate' },
            { name: 'compMakeup',    defaultValue: 8,    minValue: 0,   maxValue: 24,  automationRate: 'k-rate' },
            { name: 'lowcut',        defaultValue: 35,   minValue: 10,  maxValue: 500, automationRate: 'a-rate' },
            { name: 'hicut',         defaultValue: 18500, minValue: 1000, maxValue: 22000, automationRate: 'a-rate' },
            { name: 'master',        defaultValue: 1.0,  minValue: 0,   maxValue: 2,   automationRate: 'a-rate' },
            { name: 'bypass',        defaultValue: 0,    minValue: 0,   maxValue: 1,   automationRate: 'k-rate' },
            { name: 'preGain',       defaultValue: 0,    minValue: -20, maxValue: 20,  automationRate: 'k-rate' }
        ];
    }

    constructor() {
        super();
        this.envDb = 0;
        this._hpStateL = { y: 0, xPrev: 0 };
        this._hpStateR = { y: 0, xPrev: 0 };
        this._lpStateL = { y: 0 };
        this._lpStateR = { y: 0 };
    }

    _highpass(st, x, freq, sr) {
        if (freq <= 0) return x;
        const fClamped = Math.max(0.1, Math.min(freq, sr * 0.45));
        const RC = 1 / (2 * Math.PI * fClamped);
        const dt = 1 / sr;
        const a = RC / (RC + dt);
        st.y = a * (st.y + x - st.xPrev);
        st.xPrev = x;
        return st.y;
    }

    _lowpass(st, x, freq, sr) {
        if (freq >= sr * 0.49) return x;
        const fClamped = Math.max(0.1, Math.min(freq, sr * 0.45));
        const RC = 1 / (2 * Math.PI * fClamped);
        const dt = 1 / sr;
        const a = dt / (RC + dt);
        st.y = a * x + (1 - a) * st.y;
        return st.y;
    }

    _computeGainReduction(inputDb, threshold, ratio, knee) {
        const overDb = inputDb - threshold;
        if (overDb <= 0) return 0;

        if (knee > 0 && overDb < knee) {
            const t = overDb / knee;
            return overDb * (1 - 1 / ratio) * t * t * 0.5;
        }
        return overDb * (1 - 1 / ratio);
    }

    process(inputs, outputs, parameters) {
        const input = inputs[0];
        const output = outputs[0];
        if (!input || input.length === 0 || !output || output.length === 0) return true;

        const sr = sampleRate;
        const threshold = parameters.compThreshold[0];
        const ratio     = Math.max(1, parameters.compRatio[0]);
        const knee      = parameters.compKnee[0];
        const attack    = Math.max(0.0001, parameters.compAttack[0]);
        const release   = Math.max(0.001, parameters.compRelease[0]);
        const makeup    = parameters.compMakeup[0];
        const bypass    = parameters.bypass[0];
        const makeUpLin = Math.pow(10, makeup / 20);
        const preGainLin = Math.pow(10, parameters.preGain[0] / 20);

        const lowcut  = parameters.lowcut[0];
        const hicut   = parameters.hicut[0];
        const masterV = parameters.master[0];

        const inL = input[0];
        const inR = input.length > 1 ? input[1] : inL;
        const outL = output[0];
        const outR = output.length > 1 ? output[1] : outL;
        const frames = inL.length;

        const attCoeff = Math.exp(-1 / (attack * sr));
        const relCoeff = Math.exp(-1 / (release * sr));

        for (let i = 0; i < frames; i++) {
            let xL = inL[i];
            let xR = inR[i];

            if (bypass < 0.5) {
                // Pre-gain drives the compressor
                xL *= preGainLin;
                xR *= preGainLin;

                // Compressor
                const peak = Math.max(Math.abs(xL), Math.abs(xR));
                const peakDb = peak > 1e-10 ? 20 * Math.log10(peak) : -100;

                const gainRedDb = this._computeGainReduction(peakDb, threshold, ratio, knee);
                const targetEnv = -gainRedDb;

                const coeff = (targetEnv < this.envDb) ? attCoeff : relCoeff;
                this.envDb = coeff * this.envDb + (1 - coeff) * targetEnv;

                const compLin = Math.pow(10, this.envDb / 20);
                xL *= compLin * makeUpLin;
                xR *= compLin * makeUpLin;

                // HPF (lowcut) after compressor
                xL = this._highpass(this._hpStateL, xL, lowcut, sr);
                xR = this._highpass(this._hpStateR, xR, lowcut, sr);

                // LPF (hicut)
                xL = this._lowpass(this._lpStateL, xL, hicut, sr);
                xR = this._lowpass(this._lpStateR, xR, hicut, sr);
            }

            outL[i] = xL * masterV;
            outR[i] = xR * masterV;
        }
        return true;
    }
}

registerProcessor('master-bus', MasterBusProcessor);
`

export default MASTER_BUS_PROCESSOR_SOURCE
