import { MfGlobals } from '../mfglobals.js';
import Utils from '../utils.js';

export default class MfStrip {
    static TAG = "MFSTRIP";
    static SATURATION_TYPES = Object.freeze(["soft", "hard", "tape"]);
    static REVERB_PRESETS = Object.freeze({
        none: { duration: 0, decay: 0, preDelay: 0, tone: 1 },
        room: { duration: 0.8, decay: 2.2, preDelay: 0.008, tone: 0.85 },
        hall: { duration: 2.4, decay: 3.8, preDelay: 0.02, tone: 0.75 },
        plate: { duration: 1.6, decay: 2.8, preDelay: 0.012, tone: 0.9 },
        spring: { duration: 1.2, decay: 2.4, preDelay: 0.01, tone: 0.65 },
        gated: { duration: 0.7, decay: 1.4, preDelay: 0.004, tone: 0.8, gated: true }
    });

    constructor(name) {
        this.name = name;
        const ctx = MfGlobals.audioCtx;

        // 1. CRÉATION DES NODES DE LA TRANCHE
        // Le gain final de la piste
        this.output = ctx.createGain();
        
        // Double filtrage pour le 24dB/octave
        this.filter1 = ctx.createBiquadFilter();
        this.filter2 = ctx.createBiquadFilter();
        this.saturDrive = ctx.createGain();
        this.saturator = ctx.createWaveShaper();
        this.dryGain = ctx.createGain();
        this.wetGain = ctx.createGain();
        this.reverbInput = ctx.createGain();
        this.reverb = ctx.createConvolver();
        
        this.filter1.type = "allpass";
        this.filter2.type = "allpass";
        this.saturDrive.gain.value = 1;
        this.dryGain.gain.value = 1;
        this.wetGain.gain.value = 0;
        this.reverbInput.gain.value = 1;
        this.saturator.curve = this.createSaturationCurve("soft", 0);
        this.saturator.oversample = "4x";

        // : Filtre 1 -> Filtre 2 -> Saturation -> (Dry + Reverb) -> Gain de la piste -> Compresseur Global
        this.filter1.connect(this.filter2);
        this.filter2.connect(this.saturDrive);
        this.saturDrive.connect(this.saturator);
        this.saturator.connect(this.dryGain);
        this.saturator.connect(this.reverbInput);
        this.reverbInput.connect(this.reverb);
        this.reverb.connect(this.wetGain);
        this.dryGain.connect(this.output);
        this.wetGain.connect(this.output);

        // Variable pour stocker le type actuel
        this.currentFilterType = "allpass";
        this.currentReverbType = "none";
        this.currentSaturationType = "soft";
        this.currentSaturationAmount = 0;
        this.impulseCache = new Map();
        this.updateSaturation("soft", 0);
        this.updateReverb("none", 0);
    }

    updateFilter = (type, freq, q) => {
        const ctx = MfGlobals.audioCtx;
        const time = ctx.currentTime;

        this.currentFilterType = type || "allpass";

        if (this.currentFilterType === "allpass") {
            this.filter1.type = "allpass";
            this.filter2.type = "allpass";
            return;
        }

        const fFreq = Utils.normalizeTrackFilterFreqValue(freq);
        const fQ = Utils.normalizeTrackFilterQValue(q);

        [this.filter1, this.filter2].forEach(f => {
            f.type = this.currentFilterType;
            f.frequency.setTargetAtTime(fFreq, time, 0.02);
            f.Q.setTargetAtTime(fQ, time, 0.02);
        });
    }

    updateReverb = (type = "none", amount = 0) => {
        const ctx = MfGlobals.audioCtx;
        const time = ctx.currentTime;
        const normalizedType = MfStrip.REVERB_PRESETS[type] ? type : "none";
        const normalizedAmount = Math.min(1, Math.max(0, Number(amount) || 0));

        this.currentReverbType = normalizedType;

        if (normalizedType === "none" || normalizedAmount <= 0) {
            this.dryGain.gain.setTargetAtTime(1, time, 0.02);
            this.wetGain.gain.setTargetAtTime(0, time, 0.02);
            this.reverb.buffer = null;
            return;
        }

        this.reverb.buffer = this.getImpulseResponse(normalizedType);
        this.dryGain.gain.setTargetAtTime(1 - (normalizedAmount * 0.35), time, 0.02);
        this.wetGain.gain.setTargetAtTime(normalizedAmount, time, 0.02);
    }

    updateSaturation = (type = "soft", amount = 0) => {
        const ctx = MfGlobals.audioCtx;
        const time = ctx.currentTime;
        const normalizedType = MfStrip.SATURATION_TYPES.includes(type) ? type : "soft";
        const normalizedAmount = Math.min(1, Math.max(0, Number(amount) || 0));
        this.currentSaturationType = normalizedType;
        this.currentSaturationAmount = normalizedAmount;

        const drive = 1 + (normalizedAmount * 6);
        this.saturDrive.gain.setTargetAtTime(drive, time, 0.02);
        this.saturator.curve = this.createSaturationCurve(normalizedType, normalizedAmount);
        this.output.gain.setTargetAtTime(1 - (normalizedAmount * 0.15), time, 0.02);
    }

    createSaturationCurve = (type = "soft", amount = 0) => {
        const normalizedAmount = Math.min(1, Math.max(0, Number(amount) || 0));
        const samples = 1024;
        const curve = new Float32Array(samples);
        for (let i = 0; i < samples; i++) {
            const x = (i * 2 / (samples - 1)) - 1;
            switch (type) {
                case "hard": {
                    const k = 1 + (normalizedAmount * 80);
                    curve[i] = Math.max(-1, Math.min(1, x * k));
                    break;
                }
                case "tape": {
                    const k = 1 + (normalizedAmount * 12);
                    curve[i] = Math.atan(k * x) / Math.atan(k);
                    break;
                }
                case "soft":
                default: {
                    const k = 1 + (normalizedAmount * 40);
                    curve[i] = Math.tanh(k * x) / Math.tanh(k);
                    break;
                }
            }
        }
        return curve;
    }

    getImpulseResponse = (type) => {
        if (this.impulseCache.has(type)) {
            return this.impulseCache.get(type);
        }

        const preset = MfStrip.REVERB_PRESETS[type] ?? MfStrip.REVERB_PRESETS.none;
        const ctx = MfGlobals.audioCtx;
        const sampleRate = ctx.sampleRate;
        const length = Math.max(1, Math.floor(sampleRate * preset.duration));
        const impulse = ctx.createBuffer(2, length, sampleRate);

        for (let channel = 0; channel < impulse.numberOfChannels; channel++) {
            const data = impulse.getChannelData(channel);
            for (let i = 0; i < length; i++) {
                const t = i / sampleRate;
                const decay = Math.pow(1 - (i / length), preset.decay);
                const delayed = t >= preset.preDelay ? 1 : 0;
                const gatedGain = preset.gated && i > length * 0.65 ? 0.2 : 1;
                const noise = (Math.random() * 2 - 1);
                const springRipple = type === "spring"
                    ? Math.sin((i / sampleRate) * 170) * 0.25 + Math.sin((i / sampleRate) * 510) * 0.1
                    : 0;
                data[i] = (noise * preset.tone + springRipple) * decay * delayed * gatedGain;
            }
        }

        this.impulseCache.set(type, impulse);
        return impulse;
    }

    delete = () => {
        // Déconnexion propre de tous les nodes
        if (this.filter1) this.filter1.disconnect();
        if (this.filter2) this.filter2.disconnect();
        if (this.saturDrive) this.saturDrive.disconnect();
        if (this.saturator) this.saturator.disconnect();
        if (this.dryGain) this.dryGain.disconnect();
        if (this.wetGain) this.wetGain.disconnect();
        if (this.reverbInput) this.reverbInput.disconnect();
        if (this.reverb) this.reverb.disconnect();
        if (this.output) this.output.disconnect();

        // Libération de la mémoire
        this.filter1 = null;
        this.filter2 = null;
        this.saturDrive = null;
        this.saturator = null;
        this.dryGain = null;
        this.wetGain = null;
        this.reverbInput = null;
        this.reverb = null;
        this.output = null;
        this.impulseCache?.clear();
        this.impulseCache = null;
    }
}
