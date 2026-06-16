/**
 * Unified Strip AudioWorkletProcessor source.
 * 
 * Combines Filter (TPT SVF), Saturation, Reverb (Freeverb), 
 * Delay (with feedback FX), and 5 internal LFOs into a single DSP block.
 * 
 * Synchronisation: uses 'transportTime' (seconds) and 'bpm' to calculate 
 * musical LFO cycles internally. 
 * 
 * Parameters like lfoCutFreq are PERIOD MULTIPLIERS:
 *   - 1.0 = 4 beats (1 bar)
 *   - 2.0 = 8 beats (2 bars)
 */

const STRIP_PROCESSOR_SOURCE = `
// --- Constants & Helpers ---
const COMB_TUNINGS_L = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
const COMB_TUNINGS_R = [1139, 1211, 1300, 1379, 1445, 1514, 1580, 1640];
const ALLPASS_TUNINGS_L = [556, 441, 341, 225];
const ALLPASS_TUNINGS_R = [579, 464, 364, 248];
const PI = Math.PI;
const TWO_PI = 2 * PI;

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

// Sine lookup table (4096 entries)
const SINE_TABLE_SIZE = 4096;
const _sineTable = new Float32Array(SINE_TABLE_SIZE);
for (let i = 0; i < SINE_TABLE_SIZE; i++) {
    _sineTable[i] = Math.sin(TWO_PI * i / SINE_TABLE_SIZE);
}
function _sinLookup(phase) {
    const idx = phase * SINE_TABLE_SIZE;
    const i = idx | 0;
    const f = idx - i;
    return _sineTable[i & (SINE_TABLE_SIZE - 1)] * (1 - f) + _sineTable[(i + 1) & (SINE_TABLE_SIZE - 1)] * f;
}

// Cheap xorshift32 PRNG (replaces Math.random for S&H)
function _xorshift32(state) {
    state ^= state << 13;
    state ^= state >> 17;
    state ^= state << 5;
    return state | 0;
}

// Shared LFO Waveform Math (matches math.js)
const getLfoWaveformValue = (phase, wave) => {
    const p = (phase - 0.25) - ((phase - 0.25) | 0);
    if (wave < 0.5) return _sinLookup(p); // Sine (LUT)
    if (wave < 1.5) return p < 0.25 ? p * 4 - 1 : (p < 0.75 ? 3 - p * 4 : p * 4 - 5); // Tri
    if (wave < 2.5) return p * 2 - 1; // Saw
    if (wave < 3.5) return p < 0.5 ? 1 : -1; // Square
    return 0; // S&H handled statefully
};

class _SH {
    constructor() { this.lastCycle = -1; this.val = 0; this._rngState = 12345; }
    process(time, freqMultiplier, bpm) {
        const period = freqMultiplier * 4 * (60 / bpm);
        const cycle = (time / period) | 0;
        if (cycle !== this.lastCycle) {
            this._rngState = _xorshift32(this._rngState);
            this.val = (this._rngState / 2147483648);
            this.lastCycle = cycle;
        }
        return this.val;
    }
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
            // LFO mix (0 = base value, 1 = LFO replaces)
            { name: 'lfoPitchMix', defaultValue: 0, minValue: 0, maxValue: 1 },
            { name: 'lfoVeloMix',  defaultValue: 0, minValue: 0, maxValue: 1 },
            { name: 'lfoPanMix',   defaultValue: 0, minValue: 0, maxValue: 1 },
            { name: 'lfoCutMix',   defaultValue: 0, minValue: 0, maxValue: 1 },
            { name: 'lfoQMix',     defaultValue: 0, minValue: 0, maxValue: 1 },
            // LFOs (Frequency = PERIOD MULTIPLIER, other params in user domain)
            { name: 'lfoPitchFreq', defaultValue: 1 }, { name: 'lfoPitchWave', defaultValue: 0 }, { name: 'lfoPitchDepth', defaultValue: 0 }, { name: 'lfoPitchBias', defaultValue: 0 }, { name: 'lfoPitchPhase', defaultValue: 0 },
            { name: 'lfoVeloFreq',  defaultValue: 1 }, { name: 'lfoVeloWave',  defaultValue: 0 }, { name: 'lfoVeloDepth',  defaultValue: 0 }, { name: 'lfoVeloBias',  defaultValue: 0 }, { name: 'lfoVeloPhase',  defaultValue: 0 },
            { name: 'lfoPanFreq',   defaultValue: 1 }, { name: 'lfoPanWave',   defaultValue: 0 }, { name: 'lfoPanDepth',   defaultValue: 0 }, { name: 'lfoPanBias',   defaultValue: 0 }, { name: 'lfoPanPhase',   defaultValue: 0 },
            { name: 'lfoCutFreq',   defaultValue: 1 }, { name: 'lfoCutWave',   defaultValue: 0 }, { name: 'lfoCutDepth',   defaultValue: 0 }, { name: 'lfoCutBias',   defaultValue: 0 }, { name: 'lfoCutPhase',   defaultValue: 0 },
            { name: 'lfoQFreq',     defaultValue: 1 }, { name: 'lfoQWave',     defaultValue: 0 }, { name: 'lfoQDepth',     defaultValue: 0 }, { name: 'lfoQBias',     defaultValue: 0 }, { name: 'lfoQPhase',     defaultValue: 0 }
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
        this.sh = { pitch: new _SH(), velo: new _SH(), pan: new _SH(), cut: new _SH(), q: new _SH() };
    }

    _shape(x, drive, type, mix, out) {
        if (mix <= 0) return x;
        const d = x * drive;
        let s;
        if (type < 0.5) s = Math.tanh(d);
        else if (type < 1.5) s = d < -1 ? -1 : (d > 1 ? 1 : d); // clip (no Math.max/min)
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
        const inL = input[0], inR = input[1] || inL;
        const outL = output[0], outR = output[1];
        const tTime = params.transportTime;
        const bpmArr = params.bpm;

        // === P0: Hoist ALL k-rate params before the loop ===
        const pCut = params.cutoff[0], pQ = params.q[0], fMode = params.filterMode[0];
        const satDrive = params.satDrive[0], satType = params.satType[0], satMix = params.satMix[0], satOut = params.satOut[0];
        const revRoom = params.revRoom[0], revDamp = params.revDamp[0], revWidth = params.revWidth[0], revMix = params.revMix[0];
        const dlyMix = params.dlyMix[0], dlyFb = params.dlyFb[0], dlyMode = params.dlyMode[0];
        const dlyTimeL = params.dlyTimeL[0], dlyTimeR = params.dlyTimeR[0];
        const volParam = params.volume[0], panParam = params.pan[0];

        // LFO params
        const lCutF = params.lfoCutFreq[0], lCutW = params.lfoCutWave[0], lCutD = params.lfoCutDepth[0], lCutB = params.lfoCutBias[0], lCutP = params.lfoCutPhase[0], lCutMix = params.lfoCutMix[0];
        const lQF = params.lfoQFreq[0], lQW = params.lfoQWave[0], lQD = params.lfoQDepth[0], lQB = params.lfoQBias[0], lQP = params.lfoQPhase[0], lQMix = params.lfoQMix[0];
        const lVF = params.lfoVeloFreq[0], lVW = params.lfoVeloWave[0], lVD = params.lfoVeloDepth[0], lVB = params.lfoVeloBias[0], lVP = params.lfoVeloPhase[0], lVMix = params.lfoVeloMix[0];
        const lPF = params.lfoPanFreq[0], lPW = params.lfoPanWave[0], lPD = params.lfoPanDepth[0], lPB = params.lfoPanBias[0], lPP = params.lfoPanPhase[0], lPMix = params.lfoPanMix[0];
        const lPitchF = params.lfoPitchFreq[0], lPitchW = params.lfoPitchWave[0], lPitchD = params.lfoPitchDepth[0], lPitchB = params.lfoPitchBias[0], lPitchP = params.lfoPitchPhase[0], lPitchMix = params.lfoPitchMix[0];

        // Pre-compute reverb constants (outside loop when possible)
        const rm = revRoom * 0.28 + 0.7;
        const damp1 = revDamp * 0.4, damp2 = 1 - damp1;
        const rW1 = revWidth * 0.5 + 0.5, rW2 = (1 - revWidth) * 0.5;
        const hasReverb = revMix > 0.001;
        const hasDelay = dlyMix > 0.001;
        const hasSat = satMix > 0;
        const isPP = dlyMode > 1.5;

        // Pre-compute static pan (when no LFO modulating pan)
        const panStatic = lPMix === 0;
        let staticPanL, staticPanR, staticPanComp;
        if (panStatic) {
            const p = Math.max(-1, Math.min(1, panParam));
            staticPanL = Math.cos((p + 1) * PI / 4);
            staticPanR = Math.sin((p + 1) * PI / 4);
            const panMax = staticPanL > staticPanR ? staticPanL : staticPanR;
            staticPanComp = panMax > 0.001 ? 1 / panMax : 1;
        }

        for (let i = 0; i < frames; i++) {
            const time = tTime.length > 1 ? tTime[i] : tTime[0];
            const bpm = bpmArr.length > 1 ? bpmArr[i] : bpmArr[0];

            // --- 1. LFO Internal Processing (short-circuit when depth=0) ---
            const vLfo = lVD !== 0 ? this._computeLfo(lVF, lVW, lVD, lVB, lVP, this.sh.velo, time, bpm) : lVB;
            const pLfo = lPD !== 0 ? this._computeLfo(lPF, lPW, lPD, lPB, lPP, this.sh.pan, time, bpm) : lPB;
            const cLfo = lCutD !== 0 ? this._computeLfo(lCutF, lCutW, lCutD, lCutB, lCutP, this.sh.cut, time, bpm) : lCutB;
            const qLfo = lQD !== 0 ? this._computeLfo(lQF, lQW, lQD, lQB, lQP, this.sh.q, time, bpm) : lQB;

            // --- 2. Filter (Stereo TPT SVF) ---
            const normCut = (1 - lCutMix) * pCut + lCutMix * cLfo;
            const normCutClamped = normCut < 0 ? 0 : (normCut > 1 ? 1 : normCut);
            const fHz = 20 * Math.pow(1000, normCutClamped);
            const normQ = (1 - lQMix) * pQ + lQMix * qLfo;
            const normQClamped = normQ < 0 ? 0 : (normQ > 1 ? 1 : normQ);
            const Q = normQClamped * 18 + 0.707;

            const g = Math.tan(PI * fHz / sr), k = 1 / Q;
            const a1 = 1 / (1 + g * (g + k)), a2 = g * a1, a3 = g * a2;
            
            const v3L = inL[i] - this.z2L, v1L = a1 * this.z1L + a2 * v3L, v2L = this.z2L + a2 * this.z1L + a3 * v3L;
            this.z1L = 2 * v1L - this.z1L; this.z2L = 2 * v2L - this.z2L;
            const v3R = inR[i] - this.z2R, v1R = a1 * this.z1R + a2 * v3R, v2R = this.z2R + a2 * this.z1R + a3 * v3R;
            this.z1R = 2 * v1R - this.z1R; this.z2R = 2 * v2R - this.z2R;
            
            let dryL, dryR;
            if (fMode < 0.5)      { dryL = v2L; dryR = v2R; }
            else if (fMode < 1.5) { dryL = v3L - v1L * k; dryR = v3R - v1R * k; }
            else if (fMode < 2.5) { dryL = v1L; dryR = v1R; }
            else                { dryL = v3L - v1L * k + v2L; dryR = v3R - v1R * k + v2R; }

            // --- 3. Saturation (skip when mix=0) ---
            const satL = hasSat ? this._shape(dryL, satDrive, satType, satMix, satOut) : dryL;
            const satR = hasSat ? this._shape(dryR, satDrive, satType, satMix, satOut) : dryR;

            // --- 4. Reverb (skip when mix=0) ---
            let rL = 0, rR = 0;
            if (hasReverb) {
                const rIn = (satL + satR) * 0.0075;
                let oLC = 0, oRC = 0;
                for(let c=0; c<8; c++) { oLC += this.combsL[c].process(rIn, damp1, damp2, rm); oRC += this.combsR[c].process(rIn, damp1, damp2, rm); }
                for(let a=0; a<4; a++) { oLC = this.apL[a].process(oLC); oRC = this.apR[a].process(oRC); }
                rL = (oLC * rW1 + oRC * rW2) * revMix;
                rR = (oRC * rW1 + oLC * rW2) * revMix;
            }

            // --- 5. Delay (skip when mix=0) ---
            let dWetL = 0, dWetR = 0;
            if (hasDelay) {
                const dL = this.dlyL.read(dlyTimeL * sr), dR = this.dlyR.read(dlyTimeR * sr);
                this.dlyFiltL += 0.5 * (dL - this.dlyFiltL); this.dlyFiltR += 0.5 * (dR - this.dlyFiltR);
                const dSL = this._shape(this.dlyFiltL * dlyFb, 1.5, 0, 0.5, 1), dSR = this._shape(this.dlyFiltR * dlyFb, 1.5, 0, 0.5, 1);
                if (isPP) { this.dlyL.write(satL + dSR); this.dlyR.write(satR + dSL); } 
                else { this.dlyL.write(satL + dSL); this.dlyR.write(satR + dSR); }
                dWetL = dL * dMix;
                dWetR = dR * dMix;
            } else {
                // Still write through to keep delay buffer advancing (prevents stale audio when enabled)
                this.dlyL.write(satL);
                this.dlyR.write(satR);
            }

            // --- 6. Final Mix & Pan ---
            const vol = (1 - lVMix) * volParam + lVMix * vLfo;
            let panL, panR, panComp;
            if (panStatic) {
                panL = staticPanL;
                panR = staticPanR;
                panComp = staticPanComp;
            } else {
                const p = Math.max(-1, Math.min(1, (1 - lPMix) * panParam + lPMix * pLfo));
                panL = Math.cos((p + 1) * PI / 4);
                panR = Math.sin((p + 1) * PI / 4);
                const panMax = panL > panR ? panL : panR;
                panComp = panMax > 0.001 ? 1 / panMax : 1;
            }
            outL[i] = (satL + rL + dWetL) * vol * panL * panComp;
            outR[i] = (satR + rR + dWetR) * vol * panR * panComp;

            // LFO Pitch Output (port 1)
            if (pitchLfoOut && pitchLfoOut[0]) {
                const pitchVal = lPitchD !== 0 ? this._computeLfo(lPitchF, lPitchW, lPitchD, lPitchB, lPitchP, this.sh.pitch, time, bpm) : lPitchB;
                pitchLfoOut[0][i] = lPitchMix * pitchVal;
            }
        }
        return true;
    }

    _computeLfo(fMult, w, d, b, phase, sh, time, bpm) {
        const transportPhase = time / (4 * (60 / bpm));
        const localPhase = (transportPhase / fMult) + phase;
        const raw = w > 3.5 ? sh.process(time, fMult, bpm) : getLfoWaveformValue(localPhase, w);
        return b + ((raw + 1) * 0.5) * d;
    }
}
registerProcessor('strip', StripProcessor);
`;
export default STRIP_PROCESSOR_SOURCE;
