/**
 * Synth Voice AudioWorkletProcessor source.
 *
 * Inlined as a string and loaded via Blob URL by WorkletLoader.
 * Implements a complete monophonic synth voice in DSP:
 *   - 3 VCOs (sine / triangle / saw / square) with per-osc gain, detune, octave
 *   - 1 white noise generator with mix
 *   - 1 LP/HP/BP/Notch filter (TPT SVF) with Q
 *   - 1 ADSR envelope (attack, decay, sustain, release)
 *   - 1 master gain
 *   - 1 stereo pan
 *
 * Trigger model:
 *   The host sends messages via `port`:
 *     { type: 'trigger', startTime }   — start envelope at startTime (seconds)
 *     { type: 'release', releaseTime } — start release phase at releaseTime
 *     { type: 'update', ...overrides } — live-update params
 *
 *   Inside `process()`, the envelope state is computed from
 *   (currentSample / sampleRate) - startTime, with ADSR segments.
 *
 * AudioParam layout (all k-rate, can be modulated via port messages too):
 *   - 0:  osc1Freq  (Hz, 20..20000)
 *   - 1:  osc2Freq  (Hz, 20..20000)
 *   - 2:  osc3Freq  (Hz, 20..20000)
 *   - 3:  osc1Gain  (linear, 0..1)
 *   - 4:  osc2Gain  (linear, 0..1)
 *   - 5:  osc3Gain  (linear, 0..1)
 *   - 6:  osc1Detune (cents, -1200..1200)
 *   - 7:  osc2Detune (cents, -1200..1200)
 *   - 8:  osc3Detune (cents, -1200..1200)
 *   - 9:  osc1Wave  (0=sine, 1=tri, 2=saw, 3=square)
 *   - 10: osc2Wave
 *   - 11: osc3Wave
 *   - 12: noiseMix  (0..1)
 *   - 13: filterType (0=LP, 1=HP, 2=BP, 3=Notch)
 *   - 14: filterFreq (Hz, 20..20000)
 *   - 15: filterQ    (0.1..20)
 *   - 16: attack     (s, 0..5)
 *   - 17: decay      (s, 0..5)
 *   - 18: sustain    (linear, 0..1)
 *   - 19: release    (s, 0..5)
 *   - 20: master     (linear, 0..2)
 *   - 21: pan        (-1..1)
 *   - 22: velocity   (linear, 0..1)
 */

const SYNTH_VOICE_PROCESSOR_SOURCE = `
class _TptState {
    constructor() { this.z1 = 0; this.z2 = 0; }
}

class SynthVoiceProcessor extends AudioWorkletProcessor {
    static get parameterDescriptors() {
        return [
            { name: 'osc1Freq',   defaultValue: 440,  minValue: 20,    maxValue: 20000, automationRate: 'k-rate' },
            { name: 'osc2Freq',   defaultValue: 440,  minValue: 20,    maxValue: 20000, automationRate: 'k-rate' },
            { name: 'osc3Freq',   defaultValue: 440,  minValue: 20,    maxValue: 20000, automationRate: 'k-rate' },
            { name: 'osc1Gain',   defaultValue: 0.5,  minValue: 0,     maxValue: 1,     automationRate: 'k-rate' },
            { name: 'osc2Gain',   defaultValue: 0.5,  minValue: 0,     maxValue: 1,     automationRate: 'k-rate' },
            { name: 'osc3Gain',   defaultValue: 0.5,  minValue: 0,     maxValue: 1,     automationRate: 'k-rate' },
            { name: 'osc1Detune', defaultValue: 0,    minValue: -1200, maxValue: 1200,  automationRate: 'k-rate' },
            { name: 'osc2Detune', defaultValue: 0,    minValue: -1200, maxValue: 1200,  automationRate: 'k-rate' },
            { name: 'osc3Detune', defaultValue: 0,    minValue: -1200, maxValue: 1200,  automationRate: 'k-rate' },
            { name: 'osc1Wave',   defaultValue: 0,    minValue: 0,     maxValue: 3,     automationRate: 'k-rate' },
            { name: 'osc2Wave',   defaultValue: 0,    minValue: 0,     maxValue: 3,     automationRate: 'k-rate' },
            { name: 'osc3Wave',   defaultValue: 0,    minValue: 0,     maxValue: 3,     automationRate: 'k-rate' },
            { name: 'noiseMix',   defaultValue: 0,    minValue: 0,     maxValue: 1,     automationRate: 'k-rate' },
            { name: 'filterType', defaultValue: 0,    minValue: 0,     maxValue: 3,     automationRate: 'k-rate' },
            { name: 'filterFreq', defaultValue: 1000, minValue: 20,    maxValue: 20000, automationRate: 'k-rate' },
            { name: 'filterQ',    defaultValue: 0.7,  minValue: 0.1,   maxValue: 20,    automationRate: 'k-rate' },
            { name: 'attack',     defaultValue: 0.01, minValue: 0,     maxValue: 5,     automationRate: 'k-rate' },
            { name: 'decay',      defaultValue: 0.1,  minValue: 0,     maxValue: 5,     automationRate: 'k-rate' },
            { name: 'sustain',    defaultValue: 0.7,  minValue: 0,     maxValue: 1,     automationRate: 'k-rate' },
            { name: 'release',    defaultValue: 0.1,  minValue: 0,     maxValue: 5,     automationRate: 'k-rate' },
            { name: 'master',     defaultValue: 0.8,  minValue: 0,     maxValue: 2,     automationRate: 'k-rate' },
            { name: 'pan',        defaultValue: 0,    minValue: -1,    maxValue: 1,     automationRate: 'k-rate' },
            { name: 'velocity',   defaultValue: 0.8,  minValue: 0,     maxValue: 1,     automationRate: 'k-rate' }
        ];
    }

    constructor() {
        super();
        this.filt = new _TptState();
        this.startTime = -1;   // seconds, -1 = not triggered
        this.releaseTime = -1; // seconds, -1 = no release scheduled
        this.frameCount = 0;   // total frames processed
        this.phase1 = 0;
        this.phase2 = 0;
        this.phase3 = 0;
        this.lastNoise = 0;
        this.port.onmessage = (e) => this._onMessage(e.data);
    }

    _onMessage(msg) {
        if (!msg || typeof msg !== 'object') return
        if (msg.type === 'trigger') {
            this.startTime = msg.startTime ?? 0;
            this.releaseTime = -1;
        } else if (msg.type === 'release') {
            this.releaseTime = msg.releaseTime ?? 0;
        } else if (msg.type === 'update') {
            // Override individual AudioParam values; we just store them
            // and read in process()
            for (const k of Object.keys(msg)) {
                if (k === 'type') continue;
                if (this._overrides === undefined) this._overrides = {};
                this._overrides[k] = msg[k];
            }
        }
    }

    _v(shape, phase) {
        // phase in [0, 1). Waveform: 0=sine, 1=triangle, 2=saw, 3=square
        if (shape < 0.5) return Math.sin(2 * Math.PI * phase);
        if (shape < 1.5) {
            // triangle wave: ramps 0->1 then 1->-1->0
            if (phase < 0.25) return phase * 4;
            if (phase < 0.75) return 2 - phase * 4;
            return phase * 4 - 4;
        }
        if (shape < 2.5) return phase * 2 - 1;  // saw
        return phase < 0.5 ? 1 : -1;  // square
    }

    _param(name, arr) {
        // Apply message override if present
        if (this._overrides && name in this._overrides) {
            return this._overrides[name];
        }
        return arr[0];
    }

    _tptFilt(st, x, f, q, sr) {
        const fClamped = Math.min(f, sr * 0.25);
        const wd = 2 * Math.PI * (fClamped / sr);
        const wa = 2 * sr * Math.tan(wd * 0.5);
        const g = wa * 0.5;
        const k = 1 / q;
        const a1 = 1 / (1 + g * (g + k));
        const a2 = g * a1;
        const a3 = g * a2;
        const v3 = x - st.z2;
        const v1 = a1 * st.z1 + a2 * v3;
        const v2 = st.z2 + a2 * st.z1 + a3 * v3;
        st.z1 = 2 * v1 - st.z1;
        st.z2 = 2 * v2 - st.z2;
        return { lp: v2, hp: v3 - v1 * k, bp: v1 };
    }

    _envelope(t) {
        // t = time since trigger (seconds)
        const A = this._param('attack',   this._attackParam);
        const D = this._param('decay',    this._decayParam);
        const S = this._param('sustain',  this._sustainParam);
        const R = this._param('release',  this._releaseParam);
        const V = this._param('velocity', this._velocityParam);
        const peak = V;

        // Compute level at this time (before any release)
        let level;
        if (t < 0) {
            level = 0;
        } else if (t < A) {
            level = peak * (t / Math.max(0.0001, A));
        } else if (t < A + D) {
            const dt = t - A;
            level = peak * (S + (1 - S) * (1 - dt / Math.max(0.0001, D)));
        } else {
            level = peak * S;
        }

        // Apply release ramp if past releaseTime
        if (this.releaseTime >= 0 && t >= this.releaseTime) {
            const rt = t - this.releaseTime;
            if (rt >= R) {
                return 0;
            }
            // Compute level at the moment of release
            const releaseT = this.releaseTime;
            let startLevel;
            if (releaseT < A) {
                startLevel = peak * (releaseT / Math.max(0.0001, A));
            } else if (releaseT < A + D) {
                const dt = releaseT - A;
                startLevel = peak * (S + (1 - S) * (1 - dt / Math.max(0.0001, D)));
            } else {
                startLevel = peak * S;
            }
            level = startLevel * (1 - rt / Math.max(0.0001, R));
        }

        return Math.max(0, level);
    }

    process(inputs, outputs, parameters) {
        const output = outputs[0];
        if (!output || output.length === 0) return true;

        const sr = sampleRate;
        const frames = output[0].length;
        if (frames === 0) return true;

        // Cache param refs to avoid object lookup in hot loop
        this._attackParam   = parameters.attack;
        this._decayParam    = parameters.decay;
        this._sustainParam  = parameters.sustain;
        this._releaseParam  = parameters.release;
        this._velocityParam = parameters.velocity;

        // Read static params
        const f1 = this._param('osc1Freq', parameters.osc1Freq);
        const f2 = this._param('osc2Freq', parameters.osc2Freq);
        const f3 = this._param('osc3Freq', parameters.osc3Freq);
        const g1 = this._param('osc1Gain', parameters.osc1Gain);
        const g2 = this._param('osc2Gain', parameters.osc2Gain);
        const g3 = this._param('osc3Gain', parameters.osc3Gain);
        const d1 = this._param('osc1Detune', parameters.osc1Detune);
        const d2 = this._param('osc2Detune', parameters.osc2Detune);
        const d3 = this._param('osc3Detune', parameters.osc3Detune);
        const w1 = this._param('osc1Wave', parameters.osc1Wave);
        const w2 = this._param('osc2Wave', parameters.osc2Wave);
        const w3 = this._param('osc3Wave', parameters.osc3Wave);
        const noiseMix = this._param('noiseMix', parameters.noiseMix);
        const fType = this._param('filterType', parameters.filterType);
        const fFreq = this._param('filterFreq', parameters.filterFreq);
        const fQ    = this._param('filterQ', parameters.filterQ);
        const master = this._param('master', parameters.master);
        const pan    = this._param('pan', parameters.pan);

        // Apply detune (cents → frequency multiplier)
        const det1 = Math.pow(2, d1 / 1200);
        const det2 = Math.pow(2, d2 / 1200);
        const det3 = Math.pow(2, d3 / 1200);
        const f1d = f1 * det1;
        const f2d = f2 * det2;
        const f3d = f3 * det3;

        const oscMix = 1 - noiseMix;

        // If not triggered, output silence
        if (this.startTime < 0) {
            for (let i = 0; i < frames; i++) {
                output[0][i] = 0;
                if (output.length > 1) output[1][i] = 0;
            }
            return true;
        }

        // Stereo pan gains (equal-power)
        const panClamp = Math.max(-1, Math.min(1, pan));
        const panL = Math.cos((panClamp + 1) * Math.PI / 4);
        const panR = Math.sin((panClamp + 1) * Math.PI / 4);

        // Map filter type
        let filtMode = 0; // 0=LP, 1=HP, 2=BP, 3=Notch
        if (fType < 0.5) filtMode = 0;
        else if (fType < 1.5) filtMode = 1;
        else if (fType < 2.5) filtMode = 2;
        else filtMode = 3;

        for (let i = 0; i < frames; i++) {
            // t = seconds since the trigger, tracked across process calls
            const t = (this.frameCount + i) / sr - this.startTime;

            // Advance oscillators
            this.phase1 += f1d / sr;
            this.phase2 += f2d / sr;
            this.phase3 += f3d / sr;
            if (this.phase1 >= 1) this.phase1 -= Math.floor(this.phase1);
            if (this.phase2 >= 1) this.phase2 -= Math.floor(this.phase2);
            if (this.phase3 >= 1) this.phase3 -= Math.floor(this.phase3);

            const o1 = this._v(w1, this.phase1) * g1;
            const o2 = this._v(w2, this.phase2) * g2;
            const o3 = this._v(w3, this.phase3) * g3;
            const oscSum = (o1 + o2 + o3) * oscMix;

            // Simple white noise (Box-Muller-ish cheap noise)
            this.lastNoise = (Math.random() * 2 - 1);
            const noise = this.lastNoise * noiseMix;

            const dry = oscSum + noise;

            // Filter
            const f = this._tptFilt(this.filt, dry, fFreq, fQ, sr);
            let y;
            if (filtMode === 0) y = f.lp;
            else if (filtMode === 1) y = f.hp;
            else if (filtMode === 2) y = f.bp;
            else y = f.lp + f.hp;  // notch

            // Envelope
            const env = this._envelope(t);
            y *= env * master;

            output[0][i] = y * panL;
            if (output.length > 1) {
                output[1][i] = y * panR;
            }
        }
        this.frameCount += frames;
        return true;
    }
}

registerProcessor('synth-voice', SynthVoiceProcessor);
`

export default SYNTH_VOICE_PROCESSOR_SOURCE
