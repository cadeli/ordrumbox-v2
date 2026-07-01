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
 *   - 2 LFOs with target routing (all native targets supported)
 *   - Glide (slide) between notes
 *   - Filter envelope modulation
 *
 * LFO target routing (per LFO):
 *   0 = NOT (disabled)
 *   1 = FLT  (filter frequency, ×1000)
 *   2 = VCO1 (osc1 detune, ×1000)
 *   3 = VCO2 (osc2 detune, ×1000)
 *   4 = VCO3 (osc3 detune, ×1000)
 *   5 = masterVolume (master gain, ×1)
 *   6 = vco1.gain (osc1 gain, ×1)
 *   7 = vco1.detune (osc1 detune, ×100)
 *   8 = vco1.octave (osc1 detune, ×1200)
 *   9 = vco2.gain (osc2 gain, ×1)
 *  10 = vco2.detune (osc2 detune, ×100)
 *  11 = vco2.octave (osc2 detune, ×1200)
 *  12 = vco3.gain (osc3 gain, ×1)
 *  13 = vco3.detune (osc3 detune, ×100)
 *  14 = vco3.octave (osc3 detune, ×1200)
 *  15 = filter.freq (filter frequency, ×1000)
 *  16 = filter.filterEnvelopeAmount (filter frequency, ×1000)
 *  17 = filter.Q (filter Q, ×24)
 *  18 = noise.mix (noise gain, ×1)
 *
 * Trigger model:
 *   The host sends messages via `port`:
 *     { type: 'trigger', startTime, lastFreq1, lastFreq2, lastFreq3 }
 *     { type: 'release', releaseTime }
 *     { type: 'update', ...overrides }
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
 *   - 16: attack     (s, 0..0.5)
 *   - 17: decay      (s, 0..1)
 *   - 18: sustain    (linear, 0..1)
 *   - 19: release    (s, 0..0.5)
 *   - 20: master     (linear, 0..2)
 *   - 21: pan        (-1..1)
 *   - 22: velocity   (linear, 0..1)
 *   - 23: slide      (s, 0..2)
 *   - 24: filterEnvAmt (linear, 0..1)
 */

const SYNTH_VOICE_PROCESSOR_SOURCE = `
const PI = Math.PI;
const TWO_PI = 2 * PI;
const LN2_OVER_1200 = 0.0005776226504666211; // Math.LN2 / 1200

// Sine lookup table (4096 entries)
const SINE_TABLE_SIZE = 4096;
const _sineTable = new Float32Array(SINE_TABLE_SIZE);
for (let i = 0; i < SINE_TABLE_SIZE; i++) {
    _sineTable[i] = Math.sin(TWO_PI * i / SINE_TABLE_SIZE);
}
function _sinLookup(phase) {
    const idx = ((phase % 1) + 1) % 1 * SINE_TABLE_SIZE;
    const i = idx | 0;
    const f = idx - i;
    return _sineTable[i & (SINE_TABLE_SIZE - 1)] * (1 - f) + _sineTable[(i + 1) & (SINE_TABLE_SIZE - 1)] * f;
}

// PolyBLEP anti-aliasing: smooths discontinuities at waveform transition points
// t = current phase [0,1), dt = phase increment (freq / sampleRate)
function _polyBLEP(t, dt) {
    if (t < dt) {
        t /= dt;
        return t + t - t * t - 1.0;
    }
    if (t > 1.0 - dt) {
        t = (t - 1.0) / dt;
        return t * t + t + t + 1.0;
    }
    return 0.0;
}

// Cheap xorshift32 PRNG (replaces Math.random for noise)
function _xorshift32(state) {
    state ^= state << 13;
    state ^= state >> 17;
    state ^= state << 5;
    return state | 0;
}

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
            { name: 'attack',     defaultValue: 0.01, minValue: 0,     maxValue: 0.5,   automationRate: 'k-rate' },
            { name: 'decay',      defaultValue: 0.1,  minValue: 0,     maxValue: 1.0,   automationRate: 'k-rate' },
            { name: 'sustain',    defaultValue: 0.7,  minValue: 0,     maxValue: 1,     automationRate: 'k-rate' },
            { name: 'release',    defaultValue: 0.1,  minValue: 0,     maxValue: 0.5,   automationRate: 'k-rate' },
            { name: 'master',     defaultValue: 0.8,  minValue: 0,     maxValue: 2,     automationRate: 'k-rate' },
            { name: 'pan',        defaultValue: 0,    minValue: -1,    maxValue: 1,     automationRate: 'k-rate' },
            { name: 'velocity',   defaultValue: 0.8,  minValue: 0,     maxValue: 1,     automationRate: 'k-rate' },
            { name: 'lfo1Target', defaultValue: 0,    minValue: 0,     maxValue: 8,     automationRate: 'k-rate' },
            { name: 'lfo1Wave',   defaultValue: 0,    minValue: 0,     maxValue: 3,     automationRate: 'k-rate' },
            { name: 'lfo1Freq',   defaultValue: 1,    minValue: 0,     maxValue: 20,    automationRate: 'k-rate' },
            { name: 'lfo1Depth',  defaultValue: 0,    minValue: 0,     maxValue: 1,     automationRate: 'k-rate' },
            { name: 'lfo2Target', defaultValue: 0,    minValue: 0,     maxValue: 8,     automationRate: 'k-rate' },
            { name: 'lfo2Wave',   defaultValue: 0,    minValue: 0,     maxValue: 3,     automationRate: 'k-rate' },
            { name: 'lfo2Freq',   defaultValue: 1,    minValue: 0,     maxValue: 20,    automationRate: 'k-rate' },
            { name: 'lfo2Depth',  defaultValue: 0,    minValue: 0,     maxValue: 1,     automationRate: 'k-rate' },
            { name: 'slide',      defaultValue: 0,    minValue: 0,     maxValue: 2,     automationRate: 'k-rate' },
            { name: 'filterEnvAmt', defaultValue: 0,  minValue: 0,     maxValue: 1,     automationRate: 'k-rate' },
        ];
    }

    constructor() {
        super();
        this.filt = new _TptState();
        this.startTime = -1;
        this.releaseTime = -1;
        this.releaseStartLevel = 0;
        this.phase1 = 0;
        this.phase2 = 0;
        this.phase3 = 0;
        this._rngState = 54321;
        this.lfoPhase1 = 0;
        this.lfoPhase2 = 0;
        this._lfo1Det = [0, 0, 0];
        this._lfo1Gain = [0, 0, 0];
        this._lfo2Det = [0, 0, 0];
        this._lfo2Gain = [0, 0, 0];
        this._lfoScratch = [0, 0, 0, 0];
        // Pre-allocated filter output (avoids object allocation per sample)
        this._filtLP = 0;
        this._filtHP = 0;
        this._filtBP = 0;
        // Pre-allocated envelope state (incremental state machine)
        this._envLevel = 0;
        this._envSegment = 0; // 0=idle, 1=attack, 2=decay, 3=sustain, 4=release
        this._envSegmentStart = 0;
        this._envA = 0; this._envD = 0; this._envS = 0; this._envR = 0; this._envPeak = 0;
        this._lastEnvTime = -1;
        // Glide state
        this._glideStart1 = 0; this._glideStart2 = 0; this._glideStart3 = 0;
        this._glideTarget1 = 0; this._glideTarget2 = 0; this._glideTarget3 = 0;
        this._glideTime = 0; this._glideElapsed = 0;
        // Filter envelope state
        this._filtEnvLevel = 0;
        this._filtEnvSeg = 0; // 0=off, 1=attack, 2=decay
        this._filtEnvStart = 0;
        this._filtEnvBase = 0; this._filtEnvPeak = 0;
        this.port.onmessage = (e) => this._onMessage(e.data);
    }

    _onMessage(msg) {
        if (!msg || typeof msg !== 'object') return
        if (msg.type === 'trigger') {
            this.startTime = msg.startTime ?? 0;
            this.releaseTime = -1;
            this._envSegment = 1;
            this._envSegmentStart = 0;
            this._envLevel = 0;
            this._lastEnvTime = -1;
            // Glide: capture starting frequencies for ramp
            this._glideStart1 = msg.lastFreq1 ?? 0;
            this._glideStart2 = msg.lastFreq2 ?? 0;
            this._glideStart3 = msg.lastFreq3 ?? 0;
            this._glideElapsed = 0;
            // Filter envelope: start attack phase
            this._filtEnvSeg = 1;
            this._filtEnvStart = 0;
            this._filtEnvLevel = 0;
        } else if (msg.type === 'release') {
            this.releaseTime = msg.releaseTime ?? 0;
        } else if (msg.type === 'update') {
            for (const k of Object.keys(msg)) {
                if (k === 'type') continue;
                if (this._overrides === undefined) this._overrides = {};
                this._overrides[k] = msg[k];
            }
        }
    }

    _v(shape, phase, dt) {
        if (shape < 0.5) return _sinLookup(phase);
        if (shape < 1.5) {
            if (phase < 0.25) return phase * 4;
            if (phase < 0.75) return 2 - phase * 4;
            return phase * 4 - 4;
        }
        if (shape < 2.5) {
            const saw = phase * 2 - 1;
            return saw - _polyBLEP(phase, dt);
        }
        const sq = phase < 0.5 ? 1 : -1;
        return sq + _polyBLEP(phase, dt) - _polyBLEP((phase + 0.5) % 1, dt);
    }

    _lfoValue(target, depth, phase, det, gain, out) {
        det[0] = 0; det[1] = 0; det[2] = 0;
        gain[0] = 0; gain[1] = 0; gain[2] = 0;
        out[0] = 0; out[1] = 0; out[2] = 0; out[3] = 0;
        if (target === 0) return;
        const raw = _sinLookup(phase) * depth;
        if (target === 1)  { out[0] = raw * 1000; return; }
        if (target === 2)  { det[0] = raw * 1000; return; }
        if (target === 3)  { det[1] = raw * 1000; return; }
        if (target === 4)  { det[2] = raw * 1000; return; }
        if (target === 5)  { out[1] = raw; return; }
        if (target === 6)  { gain[0] = raw; return; }
        if (target === 7)  { det[0] = raw * 100; return; }
        if (target === 8)  { det[0] = raw * 1200; return; }
        if (target === 9)  { gain[1] = raw; return; }
        if (target === 10) { det[1] = raw * 100; return; }
        if (target === 11) { det[1] = raw * 1200; return; }
        if (target === 12) { gain[2] = raw; return; }
        if (target === 13) { det[2] = raw * 100; return; }
        if (target === 14) { det[2] = raw * 1200; return; }
        if (target === 15) { out[0] = raw * 1000; return; }
        if (target === 16) { out[0] = raw * 1000; return; }
        if (target === 17) { out[2] = raw * 24; return; }
        if (target === 18) { out[3] = raw; return; }
    }

    _param(name, arr) {
        if (this._overrides && name in this._overrides) {
            return this._overrides[name];
        }
        return arr[0];
    }

    // Inline filter computation — writes results to pre-allocated members
    _tptFilt(x, g, k) {
        const a1 = 1 / (1 + g * (g + k));
        const a2 = g * a1;
        const a3 = g * a2;
        const v3 = x - this.filt.z2;
        const v1 = a1 * this.filt.z1 + a2 * v3;
        const v2 = this.filt.z2 + a2 * this.filt.z1 + a3 * v3;
        this.filt.z1 = 2 * v1 - this.filt.z1;
        this.filt.z2 = 2 * v2 - this.filt.z2;
        this._filtLP = v2;
        this._filtHP = v3 - v1 * k;
        this._filtBP = v1;
    }

    // Incremental envelope (state machine, no per-sample re-evaluation)
    _envelopeStep(t, A, D, S, R, V) {
        if (this._envA !== A || this._envD !== D || this._envS !== S || this._envR !== R || this._envPeak !== V) {
            this._envA = A; this._envD = D; this._envS = S; this._envR = R; this._envPeak = V;
        }
        const peak = V;
        const seg = this._envSegment;
        if (seg === 0) return 0;
        if (seg === 1) {
            // Attack — quadratic ease-in: t²
            if (A <= 0.0001) {
                this._envLevel = peak;
                this._envSegment = 2;
                this._envSegmentStart = t;
            } else {
                const dt = t - this._envSegmentStart;
                if (dt >= A) {
                    this._envLevel = peak;
                    this._envSegment = 2;
                    this._envSegmentStart = t;
                } else {
                    const norm = dt / A;
                    this._envLevel = peak * norm * norm;
                }
            }
        }
        if (this._envSegment === 2) {
            // Decay — cubic ease-out: (1-t)^3
            const dt = t - this._envSegmentStart;
            if (D <= 0.0001 || dt >= D) {
                this._envLevel = peak * S;
                this._envSegment = 3;
            } else {
                const norm = 1 - dt / D;
                const curve = norm * norm * norm;
                this._envLevel = peak * (S + (1 - S) * curve);
            }
        }
        if (this._envSegment === 3) {
            // Sustain
            this._envLevel = peak * S;
        }
        if (this._envSegment === 4) {
            // Release — cubic ease-out: (1-t)^3
            const rt = t - this._envSegmentStart;
            if (R <= 0.0001 || rt >= R) {
                this._envLevel = 0;
                this._envSegment = 0;
            } else {
                const norm = 1 - rt / R;
                const curve = norm * norm * norm;
                this._envLevel = this.releaseStartLevel * curve;
            }
        }
        return this._envLevel > 0 ? this._envLevel : 0;
    }

    process(inputs, outputs, parameters) {
        const output = outputs[0];
        if (!output || output.length === 0) return true;

        const sr = sampleRate;
        const frames = output[0].length;
        if (frames === 0) return true;

        // Cache param refs
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
        const lfo1Target = Math.round(this._param('lfo1Target', parameters.lfo1Target));
        const lfo1Wave   = Math.round(this._param('lfo1Wave', parameters.lfo1Wave));
        const lfo1Freq   = this._param('lfo1Freq', parameters.lfo1Freq);
        const lfo1Depth  = this._param('lfo1Depth', parameters.lfo1Depth);
        const lfo2Target = Math.round(this._param('lfo2Target', parameters.lfo2Target));
        const lfo2Wave   = Math.round(this._param('lfo2Wave', parameters.lfo2Wave));
        const lfo2Freq   = this._param('lfo2Freq', parameters.lfo2Freq);
        const lfo2Depth  = this._param('lfo2Depth', parameters.lfo2Depth);
        const slide      = this._param('slide', parameters.slide);
        const filterEnvAmt = this._param('filterEnvAmt', parameters.filterEnvAmt);

        const oscMix = 1 - noiseMix;

        // If not triggered, output silence
        if (this.startTime < 0) {
            for (let i = 0; i < frames; i++) {
                output[0][i] = 0;
                if (output.length > 1) output[1][i] = 0;
            }
            return true;
        }

        // Stereo pan gains (equal-power) — computed once
        const panClamp = Math.max(-1, Math.min(1, pan));
        const panL = Math.cos((panClamp + 1) * PI / 4);
        const panR = Math.sin((panClamp + 1) * PI / 4);

        // Map filter type
        let filtMode = 0;
        if (fType >= 0.5 && fType < 1.5) filtMode = 1;
        else if (fType >= 1.5 && fType < 2.5) filtMode = 2;
        else if (fType >= 2.5) filtMode = 3;

        // Read ADSR once
        const A = this._param('attack', this._attackParam);
        const D = this._param('decay', this._decayParam);
        const S = this._param('sustain', this._sustainParam);
        const R = this._param('release', this._releaseParam);
        const V = this._param('velocity', this._velocityParam);

        // Pre-compute filter coefficients (hoisted when LFO depth=0 on filter)
        const fFreqMod = fFreq; // LFO applied per-sample below if needed
        const fQval = fQ;
        const wd = TWO_PI * (Math.min(fFreqMod, sr * 0.25) / sr);
        const wa = 2 * sr * Math.tan(wd * 0.5);
        const gCoeff = wa * 0.5;
        const kCoeff = 1 / fQval;

        // Pre-compute detune ratios (skip Math.pow when detune=0 and no LFO)
        const hasLfoDet1 = lfo1Target >= 2 && lfo1Target <= 4;
        const hasLfoDet2 = lfo2Target >= 2 && lfo2Target <= 4;
        const baseDet1 = (d1 === 0 && !hasLfoDet1 && !hasLfoDet2) ? 1 : Math.exp(d1 * LN2_OVER_1200);
        const baseDet2 = (d2 === 0 && !hasLfoDet1 && !hasLfoDet2) ? 1 : Math.exp(d2 * LN2_OVER_1200);
        const baseDet3 = (d3 === 0 && !hasLfoDet1 && !hasLfoDet2) ? 1 : Math.exp(d3 * LN2_OVER_1200);

        const lfo1Inc = lfo1Freq / sr;
        const lfo2Inc = lfo2Freq / sr;

        for (let i = 0; i < frames; i++) {
            const currentTime = (currentFrame + i) / sr;
            const t = currentTime - this.startTime;

            // Advance LFO phases (use simple subtract instead of Math.floor)
            this.lfoPhase1 += lfo1Inc;
            this.lfoPhase2 += lfo2Inc;
            if (this.lfoPhase1 >= 1) this.lfoPhase1 -= 1;
            if (this.lfoPhase2 >= 1) this.lfoPhase2 -= 1;

            // Compute LFO modulations (short-circuit when depth=0)
            const actualLfo1Depth = lfo1Depth;
            const actualLfo2Depth = lfo2Depth;
            this._lfoValue(lfo1Target, actualLfo1Depth, this.lfoPhase1, this._lfo1Det, this._lfo1Gain, this._lfoScratch);
            const lfo1Filt = this._lfoScratch[0];
            const lfo1Master = this._lfoScratch[1];
            const lfo1Q = this._lfoScratch[2];
            const lfo1Noise = this._lfoScratch[3];
            this._lfoValue(lfo2Target, actualLfo2Depth, this.lfoPhase2, this._lfo2Det, this._lfo2Gain, this._lfoScratch);
            const lfo2Filt = this._lfoScratch[0];
            const lfo2Master = this._lfoScratch[1];
            const lfo2Q = this._lfoScratch[2];
            const lfo2Noise = this._lfoScratch[3];

            // Apply LFO to filter frequency
            let fFreqSample = fFreq + lfo1Filt + lfo2Filt;

            // Filter envelope: ramp filter freq up during attack, back during decay
            if (filterEnvAmt > 0.001 && this._filtEnvSeg > 0) {
                if (this._filtEnvSeg === 1) {
                    // Attack phase: ramp from base to peak
                    const dt = t;
                    const attack = A;
                    if (attack > 0.0001 && dt < attack) {
                        this._filtEnvLevel = dt / attack;
                    } else {
                        this._filtEnvLevel = 1;
                        this._filtEnvSeg = 2;
                    }
                } else if (this._filtEnvSeg === 2) {
                    // Decay phase: ramp from peak back to base
                    const dt = t - A;
                    const decay = D;
                    if (decay > 0.0001 && dt < decay) {
                        this._filtEnvLevel = 1 - (dt / decay);
                    } else {
                        this._filtEnvLevel = 0;
                        this._filtEnvSeg = 0;
                    }
                }
                // Modulate filter frequency: sweep from base toward FILTER_FREQ_MAX (20000 Hz)
                // Matches native SynthVoice: peakFreq = mFreq + (FILTER_FREQ_MAX - mFreq) * envAmt
                const filtEnvMod = (20000 - fFreqSample) * filterEnvAmt * this._filtEnvLevel;
                fFreqSample = fFreqSample + filtEnvMod;
            }

            // Apply LFO to oscillator detune
            const d1Mod = d1 + this._lfo1Det[0] + this._lfo2Det[0];
            const d2Mod = d2 + this._lfo1Det[1] + this._lfo2Det[1];
            const d3Mod = d3 + this._lfo1Det[2] + this._lfo2Det[2];

            // Apply LFO to oscillator gain
            const g1Mod = g1 + this._lfo1Gain[0] + this._lfo2Gain[0];
            const g2Mod = g2 + this._lfo1Gain[1] + this._lfo2Gain[1];
            const g3Mod = g3 + this._lfo1Gain[2] + this._lfo2Gain[2];
            const g1c = g1Mod < 0 ? 0 : (g1Mod > 1 ? 1 : g1Mod);
            const g2c = g2Mod < 0 ? 0 : (g2Mod > 1 ? 1 : g2Mod);
            const g3c = g3Mod < 0 ? 0 : (g3Mod > 1 ? 1 : g3Mod);

            // Apply LFO to master volume
            const masterMod = master + lfo1Master + lfo2Master;
            const masterClamped = masterMod > 0 ? masterMod : 0;

            // Apply detune (use Math.exp — faster than Math.pow; skip when no change)
            const det1 = d1Mod === 0 ? 1 : Math.exp(d1Mod * LN2_OVER_1200);
            const det2 = d2Mod === 0 ? 1 : Math.exp(d2Mod * LN2_OVER_1200);
            const det3 = d3Mod === 0 ? 1 : Math.exp(d3Mod * LN2_OVER_1200);
            const f1d = f1 * det1;
            const f2d = f2 * det2;
            const f3d = f3 * det3;

            // Glide (slide): linear ramp from lastFreq to targetFreq
            let f1g = f1d, f2g = f2d, f3g = f3d;
            if (slide > 0.001) {
                this._glideElapsed += 1 / sr;
                const glideT = Math.min(this._glideElapsed / slide, 1);
                if (this._glideStart1 > 0) f1g = this._glideStart1 + (f1d - this._glideStart1) * glideT;
                if (this._glideStart2 > 0) f2g = this._glideStart2 + (f2d - this._glideStart2) * glideT;
                if (this._glideStart3 > 0) f3g = this._glideStart3 + (f3d - this._glideStart3) * glideT;
            }

            // Advance oscillators (use simple subtract)
            this.phase1 += f1g / sr;
            this.phase2 += f2g / sr;
            this.phase3 += f3g / sr;
            if (this.phase1 >= 1) this.phase1 -= 1;
            if (this.phase2 >= 1) this.phase2 -= 1;
            if (this.phase3 >= 1) this.phase3 -= 1;

            const o1 = this._v(w1, this.phase1, f1g / sr) * g1c;
            const o2 = this._v(w2, this.phase2, f2g / sr) * g2c;
            const o3 = this._v(w3, this.phase3, f3g / sr) * g3c;
            const oscSum = (o1 + o2 + o3) * oscMix;

            // Noise (cheap PRNG) — apply LFO to noise mix
            this._rngState = _xorshift32(this._rngState);
            const noiseMod = noiseMix + lfo1Noise + lfo2Noise;
            const noiseClamped = noiseMod < 0 ? 0 : (noiseMod > 1 ? 1 : noiseMod);
            const noise = (this._rngState / 2147483648) * noiseClamped;

            const dry = oscSum + noise;

            // Compute modulated Q for filter
            const qMod = fQval + lfo1Q + lfo2Q;
            const kMod = 1 / (qMod < 0.1 ? 0.1 : (qMod > 20 ? 20 : qMod));
            const needsFiltRecomp = lfo1Filt !== 0 || lfo2Filt !== 0 || (filterEnvAmt > 0.001 && this._filtEnvSeg > 0) || lfo1Q !== 0 || lfo2Q !== 0;

            // Filter: recompute coefficients when LFO or filter envelope modulates freq or Q
            if (needsFiltRecomp) {
                const fClamped = fFreqSample < 20 ? 20 : (fFreqSample > sr * 0.25 ? sr * 0.25 : fFreqSample);
                const wdLfo = TWO_PI * (fClamped / sr);
                const waLfo = 2 * sr * Math.tan(wdLfo * 0.5);
                const gLfo = waLfo * 0.5;
                this._tptFilt(dry, gLfo, kMod);
            } else {
                this._tptFilt(dry, gCoeff, kCoeff);
            }

            let y;
            if (filtMode === 0) y = this._filtLP;
            else if (filtMode === 1) y = this._filtHP;
            else if (filtMode === 2) y = this._filtBP;
            else y = this._filtLP + this._filtHP;

            // Envelope (incremental state machine)
            // Check if release time reached: transition from attack/decay/sustain to release
            if (this._envSegment > 0 && this._envSegment < 4 && this.releaseTime > 0 && currentTime >= this.releaseTime) {
                this.releaseStartLevel = this._envLevel;
                this._envSegment = 4;
                this._envSegmentStart = t;
            }
            const env = this._envelopeStep(t, A, D, S, R, V);
            y *= env * masterClamped;

            output[0][i] = y * panL;
            if (output.length > 1) {
                output[1][i] = y * panR;
            }
        }
        // Return false when envelope is idle to let the AudioWorkletNode be GC'd
        return this._envSegment !== 0;
    }
}

registerProcessor('synth-voice', SynthVoiceProcessor);
`

export default SYNTH_VOICE_PROCESSOR_SOURCE
