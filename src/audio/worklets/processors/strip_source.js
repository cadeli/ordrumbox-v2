/**
 * Unified Strip AudioWorkletProcessor source.
 * 
 * Combines Filter (TPT SVF), Saturation, Reverb (Freeverb), 
 * Delay (with feedback FX), and 5 internal LFOs into a single DSP block.
 * 
 * Performance: ~4x-8x less overhead than individual nodes.
 */

const STRIP_PROCESSOR_SOURCE = `
// --- Constants & Helpers ---
const COMB_TUNINGS_L = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
const COMB_TUNINGS_R = [1139, 1211, 1300, 1379, 1445, 1514, 1580, 1640];
const ALLPASS_TUNINGS_L = [556, 441, 341, 225];
const ALLPASS_TUNINGS_R = [579, 464, 364, 248];

class _Comb {
    constructor(len) { this.buf = new Float32Array(len); this.idx = 0; this.store = 0; }
    process(inp, d1, d2, fb) {
        const out = this.buf[this.idx];
        this.store = out * d2 + this.store * d1;
        this.buf[this.idx] = inp + this.store * fb;
        this.idx = (this.idx + 1) % this.buf.length;
        return out;
    }
}
class _Allpass {
    constructor(len) { this.buf = new Float32Array(len); this.idx = 0; }
    process(inp) {
        const bout = this.buf[this.idx];
        const out = -inp + bout;
        this.buf[this.idx] = inp + bout * 0.5;
        this.idx = (this.idx + 1) % this.buf.length;
        return out;
    }
}
class _DelayLine {
    constructor(maxSec) { this.buf = new Float32Array(Math.ceil(maxSec * 48000)); this.idx = 0; }
    read(d) {
        const len = this.buf.length;
        const ridx = ((this.idx - d) % len + len) % len;
        const i = ridx | 0;
        const f = ridx - i;
        return this.buf[i] * (1 - f) + this.buf[(i + 1) % len] * f; // linear interp
    }
    write(v) { this.buf[this.idx] = v; this.idx = (this.idx + 1) % this.buf.length; }
}
class _Lfo {
    constructor() { this.phase = 0; this.val = 0; }
    process(f, wave, sr) {
        this.phase += f / sr;
        if (this.phase >= 1) {
            this.phase -= 1;
            if (wave > 3.5) this.val = Math.random() * 2 - 1; // S&H
        }
        const p = this.phase;
        if (wave < 0.5) return Math.sin(2 * Math.PI * p); // Sine
        if (wave < 1.5) return p < 0.25 ? p * 4 : (p < 0.75 ? 2 - p * 4 : p * 4 - 4); // Tri
        if (wave < 2.5) return p * 2 - 1; // Saw
        if (wave < 3.5) return p < 0.5 ? 1 : -1; // Square
        return this.val;
    }
}

class StripProcessor extends AudioWorkletProcessor {
    static get parameterDescriptors() {
        return [
            // Filter
            { name: 'cutoff', defaultValue: 20000, minValue: 20, maxValue: 20000 },
            { name: 'q',      defaultValue: 0.1,   minValue: 0.1, maxValue: 20 },
            { name: 'filterMode', defaultValue: 0, minValue: 0, maxValue: 3 }, // 0:LP, 1:HP, 2:BP, 3:Notch
            // Saturation
            { name: 'satType', defaultValue: 0, minValue: 0, maxValue: 2 },
            { name: 'satDrive', defaultValue: 1, minValue: 1, maxValue: 7 },
            { name: 'satOut', defaultValue: 1, minValue: 0, maxValue: 1 },
            { name: 'satMix', defaultValue: 0, minValue: 0, maxValue: 1 },
            // Reverb
            { name: 'revRoom', defaultValue: 0.5, minValue: 0, maxValue: 1 },
            { name: 'revDamp', defaultValue: 0.5, minValue: 0, maxValue: 1 },
            { name: 'revWidth', defaultValue: 1, minValue: 0, maxValue: 1 },
            { name: 'revMix', defaultValue: 0, minValue: 0, maxValue: 1 },
            // Delay
            { name: 'dlyTimeL', defaultValue: 0.25, minValue: 0, maxValue: 2 },
            { name: 'dlyTimeR', defaultValue: 0.25, minValue: 0, maxValue: 2 },
            { name: 'dlyFb', defaultValue: 0.4, minValue: 0, maxValue: 0.99 },
            { name: 'dlyMix', defaultValue: 0, minValue: 0, maxValue: 1 },
            { name: 'dlyMode', defaultValue: 1, minValue: 0, maxValue: 2 }, // 0:Slap, 1:Tape, 2:PP
            // Master/Pan
            { name: 'volume', defaultValue: 1, minValue: 0, maxValue: 2 },
            { name: 'pan',    defaultValue: 0, minValue: -1, maxValue: 1 },
            // LFOs (5 x [freq, wave, depth, bias])
            { name: 'lfoPitchFreq', defaultValue: 1 }, { name: 'lfoPitchWave', defaultValue: 0 }, { name: 'lfoPitchDepth', defaultValue: 0 }, { name: 'lfoPitchBias', defaultValue: 0 },
            { name: 'lfoVeloFreq',  defaultValue: 1 }, { name: 'lfoVeloWave',  defaultValue: 0 }, { name: 'lfoVeloDepth',  defaultValue: 0 }, { name: 'lfoVeloBias',  defaultValue: 0 },
            { name: 'lfoPanFreq',   defaultValue: 1 }, { name: 'lfoPanWave',   defaultValue: 0 }, { name: 'lfoPanDepth',   defaultValue: 0 }, { name: 'lfoPanBias',   defaultValue: 0 },
            { name: 'lfoCutFreq',   defaultValue: 1 }, { name: 'lfoCutWave',   defaultValue: 0 }, { name: 'lfoCutDepth',   defaultValue: 0 }, { name: 'lfoCutBias',   defaultValue: 0 },
            { name: 'lfoQFreq',     defaultValue: 1 }, { name: 'lfoQWave',     defaultValue: 0 }, { name: 'lfoQDepth',     defaultValue: 0 }, { name: 'lfoQBias',     defaultValue: 0 }
        ];
    }

    constructor() {
        super();
        this.z1L = 0; this.z2L = 0; // Filter state L
        this.z1R = 0; this.z2R = 0; // Filter state R
        this.combsL = COMB_TUNINGS_L.map(l => new _Comb(l));
        this.combsR = COMB_TUNINGS_R.map(l => new _Comb(l));
        this.apL = ALLPASS_TUNINGS_L.map(l => new _Allpass(l));
        this.apR = ALLPASS_TUNINGS_R.map(l => new _Allpass(l));
        this.revD1 = 0; this.revD2 = 0;
        this.dlyL = new _DelayLine(2.1);
        this.dlyR = new _DelayLine(2.1);
        this.dlyFiltL = 0; this.dlyFiltR = 0;
        this.lfos = { pitch: new _Lfo(), velo: new _Lfo(), pan: new _Lfo(), cut: new _Lfo(), q: new _Lfo() };
    }

    _shape(x, drive, type, mix, out) {
        if (mix <= 0) return x;
        const d = x * drive;
        let s;
        if (type < 0.5) s = Math.tanh(d);
        else if (type < 1.5) s = Math.max(-1, Math.min(1, d));
        else s = Math.atan(d);
        return (x * (1 - mix) + s * mix) * out;
    }

    process(inputs, outputs, params) {
        const input = inputs[0];
        const output = outputs[0];
        const pitchLfoOut = outputs[1];
        if (!input || !input[0] || !output || !output[0]) return true;

        const sr = sampleRate;
        const frames = input[0].length;
        const inL = input[0];
        const inR = input[1] || inL;
        const outL = output[0];
        const outR = output[1];

        // LFO Pitch Output (port 1) - used to modulate voice detune
        if (pitchLfoOut && pitchLfoOut[0]) {
            const f = params.lfoPitchFreq[0], w = params.lfoPitchWave[0], d = params.lfoPitchDepth[0], b = params.lfoPitchBias[0];
            for (let i = 0; i < frames; i++) {
                const raw = this.lfos.pitch.process(f, w, sr);
                pitchLfoOut[0][i] = b + ((raw + 1) * 0.5) * d;
            }
        }

        for (let i = 0; i < frames; i++) {
            // --- 1. LFO Internal Processing ---
            const vRaw = this.lfos.velo.process(params.lfoVeloFreq[0], params.lfoVeloWave[0], sr);
            const vLfo = params.lfoVeloBias[0] + ((vRaw + 1) * 0.5) * params.lfoVeloDepth[0];
            
            const pRaw = this.lfos.pan.process(params.lfoPanFreq[0], params.lfoPanWave[0], sr);
            const pLfo = params.lfoPanBias[0] + ((pRaw + 1) * 0.5) * params.lfoPanDepth[0];
            
            const cRaw = this.lfos.cut.process(params.lfoCutFreq[0], params.lfoCutWave[0], sr);
            const cLfo = params.lfoCutBias[0] + ((cRaw + 1) * 0.5) * params.lfoCutDepth[0];
            
            const qRaw = this.lfos.q.process(params.lfoQFreq[0], params.lfoQWave[0], sr);
            const qLfo = params.lfoQBias[0] + ((qRaw + 1) * 0.5) * params.lfoQDepth[0];

            // --- 2. Filter (TPT SVF - Stereo) ---
            const fHz = Math.max(20, Math.min(19900, params.cutoff[0] + cLfo));
            const Q = Math.max(0.1, params.q[0] + qLfo);
            const g = Math.tan(Math.PI * fHz / sr), k = 1 / Q;
            const a1 = 1 / (1 + g * (g + k)), a2 = g * a1, a3 = g * a2;
            
            // Left Channel
            const v3L = inL[i] - this.z2L, v1L = a1 * this.z1L + a2 * v3L, v2L = this.z2L + a2 * this.z1L + a3 * v3L;
            this.z1L = 2 * v1L - this.z1L; this.z2L = 2 * v2L - this.z2L;
            // Right Channel
            const v3R = inR[i] - this.z2R, v1R = a1 * this.z1R + a2 * v3R, v2R = this.z2R + a2 * this.z1R + a3 * v3R;
            this.z1R = 2 * v1R - this.z1R; this.z2R = 2 * v2R - this.z2R;
            
            const mode = params.filterMode[0];
            let dryL, dryR;
            if (mode < 0.5)      { dryL = v2L; dryR = v2R; } // LP
            else if (mode < 1.5) { dryL = v3L - v1L * k; dryR = v3R - v1R * k; } // HP
            else if (mode < 2.5) { dryL = v1L; dryR = v1R; } // BP
            else                { dryL = v3L - v1L * k + v2L; dryR = v3R - v1R * k + v2R; } // Notch

            // --- 3. Saturation ---
            const satL = this._shape(dryL, params.satDrive[0], params.satType[0], params.satMix[0], params.satOut[0]);
            const satR = this._shape(dryR, params.satDrive[0], params.satType[0], params.satMix[0], params.satOut[0]);

            // --- 4. Reverb (Freeverb) ---
            const rm = params.revRoom[0] * 0.28 + 0.7, damp1 = params.revDamp[0] * 0.4, damp2 = 1 - damp1;
            const rMix = params.revMix[0], rW1 = params.revWidth[0] * 0.5 + 0.5, rW2 = (1 - params.revWidth[0]) * 0.5;
            const rIn = (satL + satR) * 0.0075; // Mono sum for reverb input
            let oLC = 0, oRC = 0;
            for(let c=0; c<8; c++) { oLC += this.combsL[c].process(rIn, damp1, damp2, rm); oRC += this.combsR[c].process(rIn, damp1, damp2, rm); }
            for(let a=0; a<4; a++) { oLC = this.apL[a].process(oLC); oRC = this.apR[a].process(oRC); }
            const rL = (oLC * rW1 + oRC * rW2) * rMix, rR = (oRC * rW1 + oLC * rW2) * rMix;

            // --- 5. Delay ---
            const dMix = params.dlyMix[0], dFb = params.dlyFb[0], isPP = params.dlyMode[0] > 1.5;
            const dL = this.dlyL.read(params.dlyTimeL[0] * sr), dR = this.dlyR.read(params.dlyTimeR[0] * sr);
            this.dlyFiltL += 0.5 * (dL - this.dlyFiltL); this.dlyFiltR += 0.5 * (dR - this.dlyFiltR);
            const dSL = this._shape(this.dlyFiltL * dFb, 1.5, 0, 0.5, 1), dSR = this._shape(this.dlyFiltR * dFb, 1.5, 0, 0.5, 1);
            if (isPP) { this.dlyL.write(satL + dSR); this.dlyR.write(satR + dSL); } 
            else { this.dlyL.write(satL + dSL); this.dlyR.write(satR + dSR); }
            const dWetL = dL * dMix, dWetR = dR * dMix;

            // --- 6. Final Mix & Pan ---
            const vol = params.volume[0] * Math.pow(2, vLfo);
            const p = Math.max(-1, Math.min(1, params.pan[0] + pLfo));
            const panL = Math.cos((p + 1) * Math.PI / 4), panR = Math.sin((p + 1) * Math.PI / 4);
            
            outL[i] = (satL + rL + dWetL) * vol * panL;
            outR[i] = (satR + rR + dWetR) * vol * panR;
        }
        return true;
    }
}
registerProcessor('strip', StripProcessor);
`;
export default STRIP_PROCESSOR_SOURCE;
