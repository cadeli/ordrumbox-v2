/**
 * Unified Strip AudioWorkletProcessor source.
 * 
 * Combines Filter (TPT SVF), Saturation, Reverb (Freeverb), 
 * and Delay (with feedback FX) into a single DSP block.
 * 
 * LFO values are pre-computed in JS and pushed to the strip's
 * parameters at each step boundary — no internal LFO computation.
 */

const STRIP_PROCESSOR_SOURCE = `
// --- Constants & Helpers ---
const COMB_TUNINGS_L = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
const COMB_TUNINGS_R = [1139, 1211, 1300, 1379, 1445, 1514, 1580, 1640];
const ALLPASS_TUNINGS_L = [556, 441, 341, 225];
const ALLPASS_TUNINGS_R = [579, 464, 364, 248];
const PI = Math.PI;

class _Comb {
    constructor(len) { this.buf = new Float32Array(len); this.idx = 0; this.len = len; this.store = 0; }
    process(inp, d1, d2, fb) {
        const out = this.buf[this.idx];
        this.store = out * d2 + this.store * d1;
        this.buf[this.idx] = inp + this.store * fb;
        this.idx++;
        if (this.idx >= this.len) this.idx = 0;
        return out;
    }
}
class _Allpass {
    constructor(len) { this.buf = new Float32Array(len); this.idx = 0; this.len = len; }
    process(inp) {
        const bout = this.buf[this.idx];
        const out = -inp + bout;
        this.buf[this.idx] = inp + bout * 0.5;
        this.idx++;
        if (this.idx >= this.len) this.idx = 0;
        return out;
    }
}
class _DelayLine {
    constructor(maxSec) {
        this.buf = new Float32Array(Math.ceil(maxSec * 48000));
        this.idx = 0;
        this.len = this.buf.length;
    }
    read(d) {
        const len = this.len;
        let ridx = this.idx - d;
        ridx = ((ridx % len) + len) % len;
        const i = ridx | 0;
        const f = ridx - i;
        return this.buf[i] * (1 - f) + this.buf[(i + 1) % len] * f;
    }
    write(v) { this.buf[this.idx] = v; this.idx++; if (this.idx >= this.len) this.idx = 0; }
}

class StripProcessor extends AudioWorkletProcessor {
    static get parameterDescriptors() {
        return [
            // Filter (expecting normalized 0..1 values)
            { name: 'cutoff', defaultValue: 1, minValue: 0, maxValue: 1 },
            { name: 'q',      defaultValue: 0, minValue: 0, maxValue: 1 },
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
            // Transport / Tempo
            { name: 'transportTime', defaultValue: 0 },
            { name: 'bpm',           defaultValue: 120 },
        ];
    }

    constructor() {
        super();
        this.z1L = 0; this.z2L = 0; 
        this.z1R = 0; this.z2R = 0; 
        this.combsL = COMB_TUNINGS_L.map(l => new _Comb(l));
        this.combsR = COMB_TUNINGS_R.map(l => new _Comb(l));
        this.apL = ALLPASS_TUNINGS_L.map(l => new _Allpass(l));
        this.apR = ALLPASS_TUNINGS_R.map(l => new _Allpass(l));
        this.dlyL = new _DelayLine(2.1);
        this.dlyR = new _DelayLine(2.1);
        this.dlyFiltL = 0; this.dlyFiltR = 0;
    }

    _shape(x, drive, type, mix, out) {
        if (mix <= 0) return x;
        const d = x * drive;
        let s;
        if (type < 0.5) s = Math.tanh(d);
        else if (type < 1.5) s = d < -1 ? -1 : (d > 1 ? 1 : d);
        else s = Math.atan(d);
        return (x * (1 - mix) + s * mix) * out;
    }

    process(inputs, outputs, params) {
        const input = inputs[0];
        const output = outputs[0];
        if (!input || !input[0] || !output || !output[0]) return true;

        const sr = sampleRate;
        const frames = input[0].length;
        const inL = input[0], inR = input[1] ?? inL;
        const outL = output[0], outR = output[1];

        // Hoist all k-rate params
        const pCut = params.cutoff[0], pQ = params.q[0], fMode = params.filterMode[0];
        const satDrive = params.satDrive[0], satType = params.satType[0], satMix = params.satMix[0], satOut = params.satOut[0];
        const revRoom = params.revRoom[0], revDamp = params.revDamp[0], revWidth = params.revWidth[0], revMix = params.revMix[0];
        const dlyMix = params.dlyMix[0], dlyFb = params.dlyFb[0], dlyMode = params.dlyMode[0];
        const dlyTimeL = params.dlyTimeL[0], dlyTimeR = params.dlyTimeR[0];
        const volParam = params.volume[0], panParam = params.pan[0];

        // Pre-compute reverb constants
        const rm = revRoom * 0.28 + 0.7;
        const damp1 = revDamp * 0.4, damp2 = 1 - damp1;
        const rW1 = revWidth * 0.5 + 0.5, rW2 = (1 - revWidth) * 0.5;
        const hasReverb = revMix > 0.001;
        const hasDelay = dlyMix > 0.001;
        const hasSat = satMix > 0;
        const isPP = dlyMode > 1.5;

        // Pre-compute pan constants (no LFO, always static)
        const p = Math.max(-1, Math.min(1, panParam));
        const staticPanL = Math.cos((p + 1) * PI / 4);
        const staticPanR = Math.sin((p + 1) * PI / 4);
        const panMax = staticPanL > staticPanR ? staticPanL : staticPanR;
        const staticPanComp = panMax > 0.001 ? 1 / panMax : 1;

        for (let i = 0; i < frames; i++) {
            // --- 1. Filter (Stereo TPT SVF) ---
            const normCut = pCut < 0 ? 0 : (pCut > 1 ? 1 : pCut);
            const fHz = 20 * Math.pow(1000, normCut);
            const normQ = pQ < 0 ? 0 : (pQ > 1 ? 1 : pQ);
            const Q = normQ * 18 + 0.707;

            const g = Math.tan(PI * fHz / sr), k = 1 / Q;
            const a1 = 1 / (1 + g * (g + k)), a2 = g * a1, a3 = g * a2;
            
            const v3L = inL[i] - this.z2L, v1L = a1 * this.z1L + a2 * v3L, v2L = this.z2L + a2 * this.z1L + a3 * v3L;
            this.z1L = 2 * v1L - this.z1L; this.z2L = 2 * v2L - this.z2L;
            const v3R = inR[i] - this.z2R, v1R = a1 * this.z1R + a2 * v3R, v2R = this.z2R + a2 * this.z1R + a3 * v3R;
            this.z1R = 2 * v1R - this.z1R; this.z2R = 2 * v2R - this.z2R;
            
            if (Math.abs(this.z1L) < 1e-15) this.z1L = 0; if (Math.abs(this.z2L) < 1e-15) this.z2L = 0;
            if (Math.abs(this.z1R) < 1e-15) this.z1R = 0; if (Math.abs(this.z2R) < 1e-15) this.z2R = 0;

            let dryL, dryR;
            if (fMode < 0.5)      { dryL = v2L; dryR = v2R; }
            else if (fMode < 1.5) { dryL = v3L - v1L * k; dryR = v3R - v1R * k; }
            else if (fMode < 2.5) { dryL = v1L; dryR = v1R; }
            else                { dryL = v3L - v1L * k + v2L; dryR = v3R - v1R * k + v2R; }

            // --- 2. Saturation (skip when mix=0) ---
            const satL = hasSat ? this._shape(dryL, satDrive, satType, satMix, satOut) : dryL;
            const satR = hasSat ? this._shape(dryR, satDrive, satType, satMix, satOut) : dryR;

            // --- 3. Reverb (skip when mix=0) ---
            let rL = 0, rR = 0;
            if (hasReverb) {
                const rIn = (satL + satR) * 0.0075;
                let oLC = 0, oRC = 0;
                for(let c=0; c<8; c++) { oLC += this.combsL[c].process(rIn, damp1, damp2, rm); oRC += this.combsR[c].process(rIn, damp1, damp2, rm); }
                for(let a=0; a<4; a++) { oLC = this.apL[a].process(oLC); oRC = this.apR[a].process(oRC); }
                rL = (oLC * rW1 + oRC * rW2) * revMix;
                rR = (oRC * rW1 + oLC * rW2) * revMix;
            }

            // --- 4. Delay (skip when mix=0) ---
            let dWetL = 0, dWetR = 0;
            if (hasDelay) {
                const dL = this.dlyL.read(dlyTimeL * sr), dR = this.dlyR.read(dlyTimeR * sr);
                this.dlyFiltL += 0.5 * (dL - this.dlyFiltL); this.dlyFiltR += 0.5 * (dR - this.dlyFiltR);
                const dSL = this._shape(this.dlyFiltL * dlyFb, 1.5, 0, 0.5, 1), dSR = this._shape(this.dlyFiltR * dlyFb, 1.5, 0, 0.5, 1);
                if (isPP) { this.dlyL.write(satL + dSR); this.dlyR.write(satR + dSL); } 
                else { this.dlyL.write(satL + dSL); this.dlyR.write(satR + dSR); }
                dWetL = dL * dlyMix;
                dWetR = dR * dlyMix;
            } else {
                this.dlyL.write(satL);
                this.dlyR.write(satR);
            }

            // --- 5. Final Mix & Pan ---
            const vol = volParam < 0 ? 0 : (volParam > 2 ? 2 : volParam);

            let fOutL = (satL + rL + dWetL) * vol * staticPanL * staticPanComp;
            let fOutR = (satR + rR + dWetR) * vol * staticPanR * staticPanComp;

            if (Math.abs(fOutL) < 1e-15) fOutL = 0;
            if (Math.abs(fOutR) < 1e-15) fOutR = 0;
            outL[i] = fOutL > 2 ? 2 : (fOutL < -2 ? -2 : fOutL);
            outR[i] = fOutR > 2 ? 2 : (fOutR < -2 ? -2 : fOutR);
        }

        return true;
    }
}
registerProcessor('strip', StripProcessor);
`;
export default STRIP_PROCESSOR_SOURCE;
