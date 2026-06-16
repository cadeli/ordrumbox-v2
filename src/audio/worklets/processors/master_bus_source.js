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
const LOG10_OVER_20 = 0.11512925464970229; // Math.LN10 / 20

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
        // HP filter state (flat properties, no object lookups)
        this._hpYL = 0; this._hpXPrevL = 0;
        this._hpYR = 0; this._hpXPrevR = 0;
        // LP filter state
        this._lpYL = 0;
        this._lpYR = 0;
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
        const makeUpLin = Math.exp(makeup * LOG10_OVER_20);
        const preGainLin = Math.exp(parameters.preGain[0] * LOG10_OVER_20);

        // Hoist filter params (k-rate for practical purposes)
        const lowcut  = parameters.lowcut[0];
        const hicut   = parameters.hicut[0];
        const masterV = parameters.master[0];

        // Pre-compute filter coefficients (hoisted outside loop — filters are k-rate)
        const lowcutClamped = Math.max(0.1, Math.min(lowcut, sr * 0.45));
        const hpRC = 1 / (2 * Math.PI * lowcutClamped);
        const hpA = hpRC / (hpRC + 1 / sr);

        const hicutClamped = Math.max(0.1, Math.min(hicut, sr * 0.45));
        const lpRC = 1 / (2 * Math.PI * hicutClamped);
        const lpA = (1 / sr) / (lpRC + 1 / sr);

        const inL = input[0];
        const inR = input.length > 1 ? input[1] : inL;
        const outL = output[0];
        const outR = output.length > 1 ? output[1] : outL;
        const frames = inL.length;

        const attCoeff = Math.exp(-1 / (attack * sr));
        const relCoeff = Math.exp(-1 / (release * sr));
        const invRatio = 1 - 1 / ratio;
        const invKnee = knee > 0 ? 1 / knee : 0;

        for (let i = 0; i < frames; i++) {
            let xL = inL[i];
            let xR = inR[i];

            if (bypass < 0.5) {
                // Pre-gain
                xL *= preGainLin;
                xR *= preGainLin;

                // Compressor: use Math.exp instead of Math.pow(10, x/20)
                const peak = Math.abs(xL) > Math.abs(xR) ? Math.abs(xL) : Math.abs(xR);
                const peakDb = peak > 1e-10 ? 20 * (Math.log(peak) / Math.LN10) : -100;

                const gainRedDb = this._computeGainReduction(peakDb, threshold, ratio, knee);
                const targetEnv = -gainRedDb;

                const coeff = (targetEnv < this.envDb) ? attCoeff : relCoeff;
                this.envDb = coeff * this.envDb + (1 - coeff) * targetEnv;

                const compLin = Math.exp(this.envDb * LOG10_OVER_20);
                xL *= compLin * makeUpLin;
                xR *= compLin * makeUpLin;

                // HPF (lowcut) — coefficients precomputed
                this._hpYL = hpA * (this._hpYL + xL - this._hpXPrevL);
                this._hpXPrevL = xL;
                xL = this._hpYL;

                this._hpYR = hpA * (this._hpYR + xR - this._hpXPrevR);
                this._hpXPrevR = xR;
                xR = this._hpYR;

                // LPF (hicut) — coefficients precomputed
                this._lpYL = lpA * xL + (1 - lpA) * this._lpYL;
                xL = this._lpYL;

                this._lpYR = lpA * xR + (1 - lpA) * this._lpYR;
                xR = this._lpYR;
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
