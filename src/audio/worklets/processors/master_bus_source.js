/**
 * Master Bus AudioWorkletProcessor source.
 *
 * Inlined as a string and loaded via Blob URL by WorkletLoader.
 * Replaces the native DynamicsCompressor + cascaded BiquadFilters
 * + master GainNode in MfMixer with a unified, low-latency DSP chain:
 *
 *   input  ->  highpass (TPT SVF, ~35Hz)  ->  lowpass (TPT SVF, ~18500Hz)
 *          ->  soft-knee compressor (RMS detector)  ->  master gain
 *          ->  output
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
 */

const MASTER_BUS_PROCESSOR_SOURCE = `
class _OnePoleState {
    constructor() { this.y = 0; this.xPrev = 0; }
}

class MasterBusProcessor extends AudioWorkletProcessor {
    static get parameterDescriptors() {
        return [
            { name: 'compThreshold', defaultValue: -12, minValue: -60, maxValue: 0,    automationRate: 'k-rate' },
            { name: 'compRatio',     defaultValue: 4,   minValue: 1,   maxValue: 20,   automationRate: 'k-rate' },
            { name: 'compKnee',      defaultValue: 30,  minValue: 0,   maxValue: 40,   automationRate: 'k-rate' },
            { name: 'compAttack',    defaultValue: 0.003, minValue: 0.001, maxValue: 1, automationRate: 'k-rate' },
            { name: 'compRelease',   defaultValue: 0.15,  minValue: 0.01,  maxValue: 1, automationRate: 'k-rate' },
            { name: 'compMakeup',    defaultValue: 0,    minValue: 0,   maxValue: 24,  automationRate: 'k-rate' },
            { name: 'lowcut',        defaultValue: 35,   minValue: 10,  maxValue: 500, automationRate: 'a-rate' },
            { name: 'hicut',         defaultValue: 18500, minValue: 1000, maxValue: 22000, automationRate: 'a-rate' },
            { name: 'master',        defaultValue: 1.0,  minValue: 0,   maxValue: 2,   automationRate: 'a-rate' },
            { name: 'bypass',        defaultValue: 0,    minValue: 0,   maxValue: 1,   automationRate: 'k-rate' }
        ];
    }

    constructor() {
        super();
        this.hpfL = new _OnePoleState();
        this.hpfR = new _OnePoleState();
        this.lpfL = new _OnePoleState();
        this.lpfR = new _OnePoleState();
        this.envDb = -100;
    }

    _onePoleHpf(st, x, f, sr) {
        // 1-pole highpass: y[n] = a * (y[n-1] + x[n] - x[n-1])
        // where a = RC / (RC + dt), RC = 1/(2*pi*f).
        const fClamped = Math.max(0.001, Math.min(f, sr * 0.45));
        const RC = 1 / (2 * Math.PI * fClamped);
        const dt = 1 / sr;
        const a = RC / (RC + dt);
        st.y = a * (st.y + x - st.xPrev);
        st.xPrev = x;
        return st.y;
    }

    _onePoleLpf(st, x, f, sr) {
        // 1-pole lowpass: y[n] = a*x[n] + (1-a)*y[n-1], a = dt/(RC+dt)
        const fClamped = Math.max(0.001, Math.min(f, sr * 0.45));
        const RC = 1 / (2 * Math.PI * fClamped);
        const dt = 1 / sr;
        const a = dt / (RC + dt);
        st.y = a * x + (1 - a) * st.y;
        st.xPrev = x;
        return st.y;
    }

    process(inputs, outputs, parameters) {
        const input = inputs[0];
        const output = outputs[0];
        if (!output || output.length === 0) return true;

        const sr = sampleRate;
        const threshold = parameters.compThreshold[0];
        const ratio     = parameters.compRatio[0];
        const knee      = parameters.compKnee[0];
        const attack    = parameters.compAttack[0];
        const release   = parameters.compRelease[0];
        const makeup    = parameters.compMakeup[0];
        const bypass    = parameters.bypass[0];

        const frames = output[0].length;
        const hasInput = input && input.length > 0;
        const inL = hasInput ? input[0] : null;
        const inR = hasInput && input.length > 1 ? input[1] : inL;

        const makeUpLin = Math.pow(10, makeup / 20);

        for (let i = 0; i < frames; i++) {
            const lowcut = parameters.lowcut.length === frames ? parameters.lowcut[i] : parameters.lowcut[0];
            const hicut  = parameters.hicut.length  === frames ? parameters.hicut[i]  : parameters.hicut[0];
            const master = parameters.master.length === frames ? parameters.master[i] : parameters.master[0];

            let xL = inL ? inL[i] : 0;
            let xR = inR ? inR[i] : 0;

            if (bypass < 0.5) {
                // HPF (lowcut) — 1-pole highpass
                xL = this._onePoleHpf(this.hpfL, xL, lowcut, sr);
                xR = this._onePoleHpf(this.hpfR, xR, lowcut, sr);
                // LPF (hicut) — 1-pole lowpass
                xL = this._onePoleLpf(this.lpfL, xL, hicut, sr);
                xR = this._onePoleLpf(this.lpfR, xR, hicut, sr);

                // Compressor (linked stereo: detect on max(L,R))
                const detect = Math.max(Math.abs(xL), Math.abs(xR));
                const detectDb = detect > 1e-9 ? 20 * Math.log10(detect) : -100;

                let overDb = detectDb - threshold;
                let gainReductionDb = 0;
                if (knee > 0 && Math.abs(overDb) <= knee / 2) {
                    // Soft knee: parabolic interpolation in the knee region
                    const kneeCurve = (overDb + knee / 2) / knee;
                    gainReductionDb = (1 - 1 / ratio) * (kneeCurve * kneeCurve * 0.5 * knee);
                } else if (overDb > 0) {
                    gainReductionDb = overDb * (1 - 1 / ratio);
                }

                // Envelope follower
                const targetDb = -gainReductionDb;
                const coeff = (targetDb > this.envDb) ? attack : release;
                const a = Math.exp(-1 / (Math.max(0.0001, coeff) * sr));
                this.envDb = a * this.envDb + (1 - a) * targetDb;

                const compGain = Math.pow(10, this.envDb / 20);
                xL *= compGain * makeUpLin;
                xR *= compGain * makeUpLin;
            }

            output[0][i] = xL * master;
            if (output.length > 1) {
                output[1][i] = xR * master;
            }
        }
        return true;
    }
}

registerProcessor('master-bus-processor', MasterBusProcessor);
`

export default MASTER_BUS_PROCESSOR_SOURCE
