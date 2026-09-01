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
 *     { type: 'trigger', startTime }
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
 *   - 23: filterEnvAmt (linear, 0..1)
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
    const p = ((phase % 1) + 1) % 1;
    const idx = p * SINE_TABLE_SIZE;
    const i = idx | 0;
    const f = idx - i;
    return _sineTable[i & (SINE_TABLE_SIZE - 1)] * (1 - f) + _sineTable[(i + 1) & (SINE_TABLE_SIZE - 1)] * f;
}

// PolyBLEP anti-aliasing: smooths discontinuities at waveform transition points
// t = current phase [0,1), dt = phase increment (freq / sampleRate)
function _polyBLEP(t, dt) {
    if (dt <= 0.00001 || dt >= 0.5) return 0.0;
    if (t < dt) {
        const n = t / dt;
        return n + n - n * n - 1.0;
    }
    if (t > 1.0 - dt) {
        const n = (t - 1.0) / dt;
        return n * n + n + n + 1.0;
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
    #rngState;
    #lfo1Det;
    #lfo1Gain;
    #lfo2Det;
    #lfo2Gain;
    #lfoScratch;
    #filtLP;
    #filtHP;
    #filtBP;
    #envLevel;
    #envSegment;
    #envSegmentStart;
    #envA; #envD; #envS; #envR; #envPeak;
    #lastEnvTime;
    #filtEnvLevel;
    #filtEnvSeg;
    #filtEnvStart;
    #filtEnvBase; #filtEnvPeak;
    #modEnvLevel;
    #modEnvSeg;
    #modEnvSegStart;
    #modEnvReleaseStartLevel;
    #overrides;
    #attackParam;
    #decayParam;
    #sustainParam;
    #releaseParam;
    #velocityParam;

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
            { name: 'filterEnvAmt', defaultValue: 0,  minValue: 0,     maxValue: 1,     automationRate: 'k-rate' },
            { name: 'fmAmount',   defaultValue: 0,    minValue: 0,     maxValue: 1,     automationRate: 'k-rate' },
            { name: 'modEnvAttack',  defaultValue: 0.01, minValue: 0,   maxValue: 0.5,   automationRate: 'k-rate' },
            { name: 'modEnvDecay',   defaultValue: 0.1,  minValue: 0,   maxValue: 1.0,   automationRate: 'k-rate' },
            { name: 'modEnvSustain', defaultValue: 0,    minValue: 0,   maxValue: 1,     automationRate: 'k-rate' },
            { name: 'modEnvRelease', defaultValue: 0.1,  minValue: 0,   maxValue: 0.5,   automationRate: 'k-rate' },
            { name: 'modEnvTarget',  defaultValue: 0,    minValue: 0,   maxValue: 4,     automationRate: 'k-rate' },
            { name: 'modEnvDepth',   defaultValue: 0,    minValue: 0,   maxValue: 1,     automationRate: 'k-rate' },
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
        this.#rngState = 54321;
        this.lfoPhase1 = 0;
        this.lfoPhase2 = 0;
        this.#lfo1Det = [0, 0, 0];
        this.#lfo1Gain = [0, 0, 0];
        this.#lfo2Det = [0, 0, 0];
        this.#lfo2Gain = [0, 0, 0];
        this.#lfoScratch = [0, 0, 0, 0];
        // Pre-allocated filter output (avoids object allocation per sample)
        this.#filtLP = 0;
        this.#filtHP = 0;
        this.#filtBP = 0;
        // Pre-allocated envelope state (incremental state machine)
        this.#envLevel = 0;
        this.#envSegment = 0; // 0=idle, 1=attack, 2=decay, 3=sustain, 4=release
        this.#envSegmentStart = 0;
        this.#envA = 0; this.#envD = 0; this.#envS = 0; this.#envR = 0; this.#envPeak = 0;
        this.#lastEnvTime = -1;
        // Filter envelope state
        this.#filtEnvLevel = 0;
        this.#filtEnvSeg = 0; // 0=off, 1=attack, 2=decay
        this.#filtEnvStart = 0;
        this.#filtEnvBase = 0; this.#filtEnvPeak = 0;
        // Modulation envelope state (full ADSR, independent target)
        this.#modEnvLevel = 0;
        this.#modEnvSeg = 0; // 0=idle, 1=attack, 2=decay, 3=sustain, 4=release
        this.#modEnvSegStart = 0;
        this.#modEnvReleaseStartLevel = 0;
        this.port.onmessage = (e) => this.#onMessage(e.data);
    }

    #onMessage(msg) {
        if (!msg || typeof msg !== 'object') return
        if (msg.type === 'trigger') {
            this.startTime = msg.startTime ?? 0;
            this.releaseTime = -1;
            this.#envSegment = 1;
            this.#envSegmentStart = 0;
            this.#envLevel = 0;
            this.#lastEnvTime = -1;
            // Filter envelope: start attack phase
            this.#filtEnvSeg = 1;
            this.#filtEnvStart = 0;
            this.#filtEnvLevel = 0;
            // Modulation envelope: start attack phase
            this.#modEnvSeg = 1;
            this.#modEnvSegStart = 0;
            this.#modEnvLevel = 0;
            this.#modEnvReleaseStartLevel = 0;
        } else if (msg.type === 'release') {
            this.releaseTime = msg.releaseTime ?? 0;
        } else if (msg.type === 'resetEnv') {
            this.#envSegment = 1;
            this.#envSegmentStart = 0;
            this.#envLevel = 0;
            this.#lastEnvTime = -1;
            this.releaseTime = -1;
        } else if (msg.type === 'update') {
            for (const k of Object.keys(msg)) {
                if (k === 'type') continue;
                if (this.#overrides === undefined) this.#overrides = {};
                this.#overrides[k] = msg[k];
            }
        }
    }

    #v(shape, phase, dt) {
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

    #lfoValue(target, depth, phase, det, gain, out) {
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

    #param(name, arr, fallback = 0) {
        if (this.#overrides && name in this.#overrides) {
            return this.#overrides[name];
        }
        return arr ? arr[0] : fallback;
    }

    // Inline filter computation — writes results to pre-allocated members
    #tptFilt(x, g, k) {
        if (!Number.isFinite(this.filt.z1)) this.filt.z1 = 0;
        if (!Number.isFinite(this.filt.z2)) this.filt.z2 = 0;
        const gClamped = Math.max(0.0001, Math.min(10.0, g));
        const kClamped = Math.max(0.05, Math.min(10.0, k));
        const a1 = 1 / (1 + gClamped * (gClamped + kClamped));
        const a2 = gClamped * a1;
        const a3 = gClamped * a2;
        const v3 = x - this.filt.z2;
        const v1 = a1 * this.filt.z1 + a2 * v3;
        const v2 = this.filt.z2 + a2 * this.filt.z1 + a3 * v3;
        this.filt.z1 = 2 * v1 - this.filt.z1;
        this.filt.z2 = 2 * v2 - this.filt.z2;
        if (Math.abs(this.filt.z1) < 1e-15 || !Number.isFinite(this.filt.z1)) this.filt.z1 = 0;
        if (Math.abs(this.filt.z2) < 1e-15 || !Number.isFinite(this.filt.z2)) this.filt.z2 = 0;
        this.#filtLP = v2;
        this.#filtHP = v3 - v1 * kClamped;
        this.#filtBP = v1;
    }

    // Incremental envelope (state machine, no per-sample re-evaluation)
    #envelopeStep(t, A, D, S, R, V) {
        if (t < 0) return 0;
        if (this.#envA !== A || this.#envD !== D || this.#envS !== S || this.#envR !== R || this.#envPeak !== V) {
            this.#envA = A; this.#envD = D; this.#envS = S; this.#envR = R; this.#envPeak = V;
        }
        const peak = V;
        const seg = this.#envSegment;
        if (seg === 0) return 0;
        if (seg === 1) {
            // Attack — quadratic ease-in
            if (A <= 0.0001) {
                this.#envLevel = peak;
                this.#envSegment = 2;
                this.#envSegmentStart = t;
            } else {
                const dt = t - this.#envSegmentStart;
                if (dt >= A) {
                    this.#envLevel = peak;
                    this.#envSegment = 2;
                    this.#envSegmentStart = t;
                } else {
                    const norm = Math.max(0, dt / A);
                    this.#envLevel = peak * norm * norm;
                }
            }
        }
        if (this.#envSegment === 2) {
            // Decay — cubic ease-out
            const dt = t - this.#envSegmentStart;
            if (D <= 0.0001 || dt >= D) {
                this.#envLevel = peak * S;
                this.#envSegment = 3;
            } else {
                const norm = Math.max(0, Math.min(1, 1 - dt / D));
                const curve = norm * norm * norm;
                this.#envLevel = peak * (S + (1 - S) * curve);
            }
        }
        if (this.#envSegment === 3) {
            // Sustain
            this.#envLevel = peak * S;
        }
        if (this.#envSegment === 4) {
            // Release — cubic ease-out
            const rt = t - this.#envSegmentStart;
            if (R <= 0.0001 || rt >= R) {
                this.#envLevel = 0;
                this.#envSegment = 0;
            } else {
                const norm = Math.max(0, Math.min(1, 1 - rt / R));
                const curve = norm * norm * norm;
                this.#envLevel = this.releaseStartLevel * curve;
            }
        }
        return Number.isFinite(this.#envLevel) && this.#envLevel > 0 ? this.#envLevel : 0;
    }

    // Modulation envelope — full ADSR, independent target routing
    #modEnvStep(t, A, D, S, R) {
        if (t < 0) return 0;
        const seg = this.#modEnvSeg;
        if (seg === 0) return 0;
        if (seg === 1) {
            if (A <= 0.0001) { this.#modEnvLevel = 1; this.#modEnvSeg = 2; this.#modEnvSegStart = t; }
            else {
                const dt = t - this.#modEnvSegStart;
                if (dt >= A) { this.#modEnvLevel = 1; this.#modEnvSeg = 2; this.#modEnvSegStart = t; }
                else { this.#modEnvLevel = Math.max(0, dt / A); }
            }
        }
        if (this.#modEnvSeg === 2) {
            const dt = t - this.#modEnvSegStart;
            if (D <= 0.0001 || dt >= D) { this.#modEnvLevel = S; this.#modEnvSeg = 3; }
            else {
                const norm = Math.max(0, Math.min(1, 1 - dt / D));
                this.#modEnvLevel = S + (1 - S) * (norm * norm * norm);
            }
        }
        if (this.#modEnvSeg === 3) { this.#modEnvLevel = S; }
        if (this.#modEnvSeg === 4) {
            const rt = t - this.#modEnvSegStart;
            if (R <= 0.0001 || rt >= R) { this.#modEnvLevel = 0; this.#modEnvSeg = 0; }
            else {
                const norm = Math.max(0, Math.min(1, 1 - rt / R));
                this.#modEnvLevel = this.#modEnvReleaseStartLevel * (norm * norm * norm);
            }
        }
        return Number.isFinite(this.#modEnvLevel) && this.#modEnvLevel > 0 ? this.#modEnvLevel : 0;
    }

    process(inputs, outputs, parameters) {
        const output = outputs[0];
        if (!output || output.length === 0) return true;

        const sr = sampleRate;
        const frames = output[0].length;
        if (frames === 0) return true;

        // Cache param refs
        this.#attackParam   = parameters.attack;
        this.#decayParam    = parameters.decay;
        this.#sustainParam  = parameters.sustain;
        this.#releaseParam  = parameters.release;
        this.#velocityParam = parameters.velocity;

        // Read static params
        const f1 = this.#param('osc1Freq', parameters.osc1Freq);
        const f2 = this.#param('osc2Freq', parameters.osc2Freq);
        const f3 = this.#param('osc3Freq', parameters.osc3Freq);
        const g1 = this.#param('osc1Gain', parameters.osc1Gain);
        const g2 = this.#param('osc2Gain', parameters.osc2Gain);
        const g3 = this.#param('osc3Gain', parameters.osc3Gain);
        const d1 = this.#param('osc1Detune', parameters.osc1Detune);
        const d2 = this.#param('osc2Detune', parameters.osc2Detune);
        const d3 = this.#param('osc3Detune', parameters.osc3Detune);
        const w1 = this.#param('osc1Wave', parameters.osc1Wave);
        const w2 = this.#param('osc2Wave', parameters.osc2Wave);
        const w3 = this.#param('osc3Wave', parameters.osc3Wave);
        const noiseMix = this.#param('noiseMix', parameters.noiseMix);
        const fType = this.#param('filterType', parameters.filterType);
        const fFreq = this.#param('filterFreq', parameters.filterFreq);
        const fQ    = this.#param('filterQ', parameters.filterQ);
        const master = this.#param('master', parameters.master);
        const pan    = this.#param('pan', parameters.pan);
        const lfo1Target = Math.round(this.#param('lfo1Target', parameters.lfo1Target));
        const lfo1Wave   = Math.round(this.#param('lfo1Wave', parameters.lfo1Wave));
        const lfo1Freq   = this.#param('lfo1Freq', parameters.lfo1Freq);
        const lfo1Depth  = this.#param('lfo1Depth', parameters.lfo1Depth);
        const lfo2Target = Math.round(this.#param('lfo2Target', parameters.lfo2Target));
        const lfo2Wave   = Math.round(this.#param('lfo2Wave', parameters.lfo2Wave));
        const lfo2Freq   = this.#param('lfo2Freq', parameters.lfo2Freq);
        const lfo2Depth  = this.#param('lfo2Depth', parameters.lfo2Depth);
        const filterEnvAmt = this.#param('filterEnvAmt', parameters.filterEnvAmt);
        const fmAmount   = this.#param('fmAmount', parameters.fmAmount);
        const fmAlgo     = Math.round(this.#param('fmAlgo', [0]));
        const mA  = this.#param('modEnvAttack', parameters.modEnvAttack);
        const mD  = this.#param('modEnvDecay', parameters.modEnvDecay);
        const mS  = this.#param('modEnvSustain', parameters.modEnvSustain);
        const mR  = this.#param('modEnvRelease', parameters.modEnvRelease);
        const mTgt = Math.round(this.#param('modEnvTarget', parameters.modEnvTarget));
        const mDepth = this.#param('modEnvDepth', parameters.modEnvDepth);
        const drive = this.#param('drive', parameters.drive);
        const pitchPunch = this.#param('pitchPunch', parameters.pitchPunch);
        const subGain = this.#param('subGain', parameters.subGain);

        // Bypass flags (set via update message from host)
        const bypassNoise  = !!this.#param('bypassNoise',  [0]);
        const bypassFilter = !!this.#param('bypassFilter', [0]);
        const bypassEnv    = !!this.#param('bypassEnv',    [0]);
        const bypassLfo1   = !!this.#param('bypassLfo1',   [0]);
        const bypassLfo2   = !!this.#param('bypassLfo2',   [0]);
        const bypassFm     = !!this.#param('bypassFm',     [0]);
        const bypassModEnv = !!this.#param('bypassModEnv', [0]);
        const bypassFilterEnv = !!this.#param('bypassFilterEnv', [0]);

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
        const panL = Math.cos((panClamp + 1) * PI / 4);
        const panR = Math.sin((panClamp + 1) * PI / 4);

        // Map filter type
        let filtMode = 0;
        if (fType >= 0.5 && fType < 1.5) filtMode = 1;
        else if (fType >= 1.5 && fType < 2.5) filtMode = 2;
        else if (fType >= 2.5) filtMode = 3;

        // Read ADSR once
        const A = this.#param('attack', this.#attackParam);
        const D = this.#param('decay', this.#decayParam);
        const S = this.#param('sustain', this.#sustainParam);
        const R = this.#param('release', this.#releaseParam);
        const V = this.#param('velocity', this.#velocityParam);

        // Pre-compute filter coefficients
        const fFreqMod = Math.max(20, Math.min(20000, fFreq));
        const fQval = Math.max(0.1, Math.min(20, fQ));
        const gCoeff = Math.tan(PI * Math.min(fFreqMod, sr * 0.25) / sr);
        const kCoeff = 1 / fQval;

        const lfo1Inc = lfo1Freq / sr;
        const lfo2Inc = lfo2Freq / sr;

        for (let i = 0; i < frames; i++) {
            const currentTime = (currentFrame + i) / sr;
            const t = currentTime - this.startTime;

            if (t < 0) {
                output[0][i] = 0;
                if (output.length > 1) output[1][i] = 0;
                continue;
            }

            // Advance LFO phases safely
            this.lfoPhase1 = (this.lfoPhase1 + lfo1Inc) % 1.0;
            this.lfoPhase2 = (this.lfoPhase2 + lfo2Inc) % 1.0;

            // Compute LFO modulations
            this.#lfoValue(bypassLfo1 ? 0 : lfo1Target, lfo1Depth, this.lfoPhase1, this.#lfo1Det, this.#lfo1Gain, this.#lfoScratch);
            const lfo1Filt = this.#lfoScratch[0];
            const lfo1Master = this.#lfoScratch[1];
            const lfo1Q = this.#lfoScratch[2];
            const lfo1Noise = this.#lfoScratch[3];
            this.#lfoValue(bypassLfo2 ? 0 : lfo2Target, lfo2Depth, this.lfoPhase2, this.#lfo2Det, this.#lfo2Gain, this.#lfoScratch);
            const lfo2Filt = this.#lfoScratch[0];
            const lfo2Master = this.#lfoScratch[1];
            const lfo2Q = this.#lfoScratch[2];
            const lfo2Noise = this.#lfoScratch[3];

            // Apply LFO to filter frequency
            let fFreqSample = fFreq + lfo1Filt + lfo2Filt;

            // Modulation envelope
            let mEnv = 0;
            if (!bypassModEnv && mTgt > 0 && mDepth > 0.001) {
                if (this.#modEnvSeg > 0 && this.#modEnvSeg < 4 && this.releaseTime > 0 && currentTime >= this.releaseTime) {
                    this.#modEnvReleaseStartLevel = this.#modEnvLevel;
                    this.#modEnvSeg = 4;
                    this.#modEnvSegStart = t;
                }
                mEnv = this.#modEnvStep(t, mA, mD, mS, mR);
            }

            // Filter envelope
            if (!bypassFilterEnv && filterEnvAmt > 0.001 && this.#filtEnvSeg > 0) {
                if (this.#filtEnvSeg === 1) {
                    const attack = A;
                    if (attack > 0.0001 && t < attack) {
                        this.#filtEnvLevel = t / attack;
                    } else {
                        this.#filtEnvLevel = 1;
                        this.#filtEnvSeg = 2;
                    }
                } else if (this.#filtEnvSeg === 2) {
                    const dt = t - A;
                    const decay = D;
                    if (decay > 0.0001 && dt < decay) {
                        this.#filtEnvLevel = 1 - (dt / decay);
                    } else {
                        this.#filtEnvLevel = 0;
                        this.#filtEnvSeg = 0;
                    }
                }
                const filtEnvMod = (20000 - fFreqSample) * filterEnvAmt * this.#filtEnvLevel;
                fFreqSample += filtEnvMod;
            }

            // Mod envelope → filter freq target
            if (mTgt === 1 && mEnv > 0.001) {
                fFreqSample += (20000 - fFreqSample) * mDepth * mEnv;
            }

            // Apply LFO to oscillator detune
            const d1Mod = d1 + this.#lfo1Det[0] + this.#lfo2Det[0];
            const d2Mod = d2 + this.#lfo1Det[1] + this.#lfo2Det[1];
            const d3Mod = d3 + this.#lfo1Det[2] + this.#lfo2Det[2];

            // Apply LFO to oscillator gain
            const g1Mod = g1 + this.#lfo1Gain[0] + this.#lfo2Gain[0];
            const g2Mod = g2 + this.#lfo1Gain[1] + this.#lfo2Gain[1];
            const g3Mod = g3 + this.#lfo1Gain[2] + this.#lfo2Gain[2];
            let g1c = g1Mod < 0 ? 0 : (g1Mod > 1 ? 1 : g1Mod);
            let g2c = g2Mod < 0 ? 0 : (g2Mod > 1 ? 1 : g2Mod);
            let g3c = g3Mod < 0 ? 0 : (g3Mod > 1 ? 1 : g3Mod);

            // Apply LFO to master volume
            const masterMod = master + lfo1Master + lfo2Master;
            const masterClamped = masterMod > 0 ? masterMod : 0;

            // Apply detune
            const det1 = d1Mod === 0 ? 1 : Math.exp(d1Mod * LN2_OVER_1200);
            const det2 = d2Mod === 0 ? 1 : Math.exp(d2Mod * LN2_OVER_1200);
            const det3 = d3Mod === 0 ? 1 : Math.exp(d3Mod * LN2_OVER_1200);
            let f1d = f1 * det1;
            let f2d = f2 * det2;
            let f3d = f3 * det3;

            // Pitch Punch transient envelope (fast 60ms pitch drop for punchy bass attack)
            if (pitchPunch > 0.001 && t < 0.06) {
                const punchEnv = 1 - (t / 0.06);
                const punchRatio = Math.exp(punchEnv * pitchPunch * 24 * LN2_OVER_1200);
                f1d *= punchRatio;
                f2d *= punchRatio;
                f3d *= punchRatio;
            }

            // FM algorithm routing
            let f1fm = f1d, f2fm = f2d;
            if (!bypassFm && fmAmount > 0.001) {
                const rawO2 = this.#v(w2, this.phase2, Math.min(0.49, f2d / sr));
                const rawO3 = this.#v(w3, this.phase3, Math.min(0.49, f3d / sr));
                const fmDepth = fmAmount * 1000;
                if (fmAlgo === 0) {
                    f1fm = f1d + rawO2 * fmDepth;
                } else if (fmAlgo === 1) {
                    f1fm = f1d + rawO3 * fmDepth;
                } else if (fmAlgo === 2) {
                    f1fm = f1d + rawO2 * fmDepth;
                    f2fm = f2d + rawO3 * fmDepth;
                } else if (fmAlgo === 3) {
                    f1fm = f1d + (rawO2 + rawO3) * fmDepth;
                } else if (fmAlgo === 4) {
                    const rawO1 = this.#v(w1, this.phase1, Math.min(0.49, f1d / sr));
                    f1fm = f1d + rawO2 * fmDepth;
                    f2fm = f2d + rawO1 * fmDepth;
                }
                if (f1fm < 0) f1fm = 0;
                if (f2fm < 0) f2fm = 0;
            }

            // Mod envelope → pitch/FM/shape targets
            if (mTgt > 0 && mEnv > 0.001) {
                if (mTgt === 2) {
                    const pitchCt = mDepth * mEnv * 1200;
                    const pitchRatio = Math.exp(pitchCt * LN2_OVER_1200);
                    f1fm *= pitchRatio;
                    f2fm *= pitchRatio;
                    f3d *= pitchRatio;
                } else if (mTgt === 3 && !bypassFm) {
                    const fmMod = fmAmount * mDepth * mEnv;
                    if (fmMod > 0.001) {
                        const rawO2 = this.#v(w2, this.phase2, Math.min(0.49, f2d / sr));
                        const rawO3 = this.#v(w3, this.phase3, Math.min(0.49, f3d / sr));
                        const fmDepthM = fmMod * 1000;
                        if (fmAlgo === 0) { f1fm += rawO2 * fmDepthM; }
                        else if (fmAlgo === 1) { f1fm += rawO3 * fmDepthM; }
                        else if (fmAlgo === 2) { f1fm += rawO2 * fmDepthM; f2fm += rawO3 * fmDepthM; }
                        else if (fmAlgo === 3) { f1fm += (rawO2 + rawO3) * fmDepthM; }
                        else if (fmAlgo === 4) {
                            const rawO1 = this.#v(w1, this.phase1, Math.min(0.49, f1d / sr));
                            f1fm += rawO2 * fmDepthM;
                            f2fm += rawO1 * fmDepthM;
                        }
                    }
                } else if (mTgt === 4) {
                    g1c = Math.max(0, Math.min(1, g1c + mDepth * mEnv * (1 - g1c)));
                    g2c = Math.max(0, Math.min(1, g2c + mDepth * mEnv * (1 - g2c)));
                    g3c = Math.max(0, Math.min(1, g3c + mDepth * mEnv * (1 - g3c)));
                }
            }

            // Phase increments with Nyquist bounding & modulo
            const dt1 = Math.min(0.49, Math.max(0, f1fm / sr));
            const dt2 = Math.min(0.49, Math.max(0, f2fm / sr));
            const dt3 = Math.min(0.49, Math.max(0, f3d / sr));

            this.phase1 = (this.phase1 + dt1) % 1.0;
            this.phase2 = (this.phase2 + dt2) % 1.0;
            this.phase3 = (this.phase3 + dt3) % 1.0;

            const o1 = this.#v(w1, this.phase1, dt1) * g1c;
            const o2 = this.#v(w2, this.phase2, dt2) * g2c;
            const o3 = this.#v(w3, this.phase3, dt3) * g3c;

            // Optional sub-oscillator (pure sine 1 octave below osc1)
            let sub = 0;
            if (subGain > 0.001) {
                const subPhase = (this.phase1 * 0.5) % 1.0;
                sub = _sinLookup(subPhase) * subGain;
            }

            const oscSum = (o1 + o2 + o3 + sub) * oscMix;

            // Noise (cheap PRNG)
            this.#rngState = _xorshift32(this.#rngState);
            let noise = 0;
            if (!bypassNoise) {
                const noiseMod = noiseMix + lfo1Noise + lfo2Noise;
                const noiseClamped = noiseMod < 0 ? 0 : (noiseMod > 1 ? 1 : noiseMod);
                noise = (this.#rngState / 2147483648) * noiseClamped;
            }

            let dry = oscSum + noise;

            // Analog-style warm drive / saturation for bass
            if (drive > 0.001) {
                const driveFactor = 1 + drive * 3.5;
                const driven = dry * driveFactor;
                dry = driven / (1 + Math.abs(driven) * 0.6);
            }

            // Filter
            const qMod = fQval + lfo1Q + lfo2Q;
            const kMod = 1 / (qMod < 0.1 ? 0.1 : (qMod > 20 ? 20 : qMod));
            const needsFiltRecomp = lfo1Filt !== 0 || lfo2Filt !== 0 || (filterEnvAmt > 0.001 && this.#filtEnvSeg > 0) || lfo1Q !== 0 || lfo2Q !== 0 || (mTgt === 1 && mEnv > 0.001);

            let y;
            if (bypassFilter) {
                y = dry;
            } else {
                if (needsFiltRecomp) {
                    const fClamped = fFreqSample < 20 ? 20 : (fFreqSample > sr * 0.25 ? sr * 0.25 : fFreqSample);
                    const gLfo = Math.tan(PI * fClamped / sr);
                    this.#tptFilt(dry, gLfo, kMod);
                } else {
                    this.#tptFilt(dry, gCoeff, kCoeff);
                }

                if (filtMode === 0) y = this.#filtLP;
                else if (filtMode === 1) y = this.#filtHP;
                else if (filtMode === 2) y = this.#filtBP;
                else y = this.#filtLP + this.#filtHP;
            }

            // Amplitude envelope
            if (this.#envSegment > 0 && this.#envSegment < 4 && this.releaseTime > 0 && currentTime >= this.releaseTime) {
                this.releaseStartLevel = this.#envLevel;
                this.#envSegment = 4;
                this.#envSegmentStart = t;
            }
            const env = this.#envelopeStep(t, A, D, S, R, V);
            y *= (bypassEnv ? 1 : env) * masterClamped;

            output[0][i] = y * panL;
            if (output.length > 1) {
                output[1][i] = y * panR;
            }
        }
        return true;
    }
}

registerProcessor('synth-voice', SynthVoiceProcessor);
`

export default SYNTH_VOICE_PROCESSOR_SOURCE
