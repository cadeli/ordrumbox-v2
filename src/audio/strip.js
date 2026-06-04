import Utils from '../core/utils.js';
import MfDefaults from '../patterns/defaults.js';
import { RAMP_TIME } from '../core/constants.js';
import {
    computeSaturationCurve,
    computeImpulseSampleData,
    computeLfoFrequency,
    computeLfoDepth,
    computeDriveGain,
    computeOutputGain,
    computeDelaySettings,
    REVERB_PRESETS,
    SATURATION_TYPES,
} from './math.js';
import WorkletBridge from './worklets/bridge.js';

export { SATURATION_TYPES, REVERB_PRESETS };

export default class MfStrip {
    static TAG = "MFSTRIP";
    static REVERB_PRESETS = REVERB_PRESETS;
    static SATURATION_TYPES = SATURATION_TYPES;

    constructor(name, audioCtx) {
        this.name = name;
        this.audioCtx = audioCtx;
        this.bpm = MfDefaults.getPatternProp({}, 'bpm');

        // 1. CRÉATION DES NODES DE LA TRANCHE
        this.output = audioCtx.createGain();
        this.filter1 = audioCtx.createBiquadFilter();
        this.filter2 = audioCtx.createBiquadFilter();
        this.saturDrive = audioCtx.createGain();
        this.saturator = audioCtx.createWaveShaper();
        this.dryGain = audioCtx.createGain();
        this.reverbInput = audioCtx.createGain();
        this.reverb = audioCtx.createConvolver();
        this.reverbWetGain = audioCtx.createGain();
        this.delayInput = audioCtx.createGain();
        this.delay = audioCtx.createDelay(2.0);
        this.delayFeedback = audioCtx.createGain();
        this.delayFilter = audioCtx.createBiquadFilter();
        this.delayWetGain = audioCtx.createGain();
        this.pan = audioCtx.createStereoPanner();
        this.panLeft = audioCtx.createStereoPanner();
        this.panRight = audioCtx.createStereoPanner();

        // 2. NATIVE LFOs
        this.lfos = {
            pitchLfo: { osc: audioCtx.createOscillator(), gain: audioCtx.createGain() },
            velocityLfo: { osc: audioCtx.createOscillator(), gain: audioCtx.createGain() },
            panLfo: { osc: audioCtx.createOscillator(), gain: audioCtx.createGain() },
            filterFreqLfo: { osc: audioCtx.createOscillator(), gain: audioCtx.createGain() },
            filterQLfo: { osc: audioCtx.createOscillator(), gain: audioCtx.createGain() }
        };

        Object.values(this.lfos).forEach(lfo => {
            lfo.osc.connect(lfo.gain);
            lfo.osc.start();
            lfo.gain.gain.value = 0; // Default off
        });

        // Connect track-level LFOs
        this.lfos.velocityLfo.gain.connect(this.output.gain);
        this.lfos.filterFreqLfo.gain.connect(this.filter1.frequency);
        this.lfos.filterFreqLfo.gain.connect(this.filter2.frequency);
        this.lfos.filterQLfo.gain.connect(this.filter1.Q);
        this.lfos.filterQLfo.gain.connect(this.filter2.Q);

        // Voice-level LFO nodes (Pitch, Pan) will be connected per-note in MfSound
        
        this.filter1.type = "allpass";
        this.filter2.type = "allpass";
        this.saturDrive.gain.value = 1;
        this.dryGain.gain.value = 1;
        this.reverbInput.gain.value = 0;
        this.reverbWetGain.gain.value = 1;
        this.delayInput.gain.value = 0;
        this.delayWetGain.gain.value = 1;
        this.delay.delayTime.value = 0.25;
        this.delayFeedback.gain.value = 0.3;
        this.delayFilter.type = "lowpass";
        this.delayFilter.frequency.value = 3000;
        this.panLeft.pan.value = -1;
        this.panRight.pan.value = 1;
        this.saturator.curve = this.createSaturationCurve("soft", 0);
        this.saturator.oversample = "4x";

        // Filtre -> dry/saturation, reverb send et delay send indépendants.
        this.filter1.connect(this.filter2);
        this.filter2.connect(this.saturDrive);
        this.filter2.connect(this.reverbInput);
        this.filter2.connect(this.delayInput);
        this.saturDrive.connect(this.saturator);
        this.saturator.connect(this.dryGain);
        this.reverbInput.connect(this.reverb);
        this.reverb.connect(this.reverbWetGain);
        this.delayInput.connect(this.delay);
        this.delay.connect(this.delayWetGain);
        this.dryGain.connect(this.output);
        this.reverbWetGain.connect(this.output);
        this.delayWetGain.connect(this.output);
        this.output.connect(this.pan);

        // Variable pour stocker le type actuel
        this.currentFilterType = "allpass";
        this.currentReverbType = "none";
        this.currentReverbAmount = 0;
        this.currentDelayType = "tape";
        this.currentDelayAmount = 0;
        this.delayRoutingType = null;
        this.currentSaturationType = "soft";
        this.currentSaturationAmount = 0;
        this.impulseCache = new Map();
        this.updateSaturation("soft", 0);
        this.updateReverb("none", 0);
        this.updateDelay("tape", 1, 0);
    }

    setBpm = (bpm) => {
        this.bpm = bpm;
    }

    updateLfo = (key, config) => {
        const lfo = this.lfos[key];
        if (!lfo) return;

        const ctx = this.audioCtx;
        const time = ctx.currentTime;

        if (!config) {
            // Worklet path: just zero the depth (worklet keeps generating)
            if (this._lfoWorklets?.nodes?.[key]) {
                lfo.gain.gain.setTargetAtTime(0, time, RAMP_TIME);
                return;
            }
            lfo.gain.gain.setTargetAtTime(0, time, RAMP_TIME);
            return;
        }

        const frequency = computeLfoFrequency(config.freq ?? 1, this.bpm);
        const depth = computeLfoDepth(config.min, config.max);
        const waveform = config.waveform ?? 0;  // 0=sine (default)

        // Worklet path
        if (this._lfoWorklets?.nodes?.[key]) {
            const wn = this._lfoWorklets.nodes[key]
            const params = wn.parameters
            if (params.get('freq'))     params.get('freq').setTargetAtTime(frequency, time, RAMP_TIME)
            if (params.get('waveform')) params.get('waveform').setTargetAtTime(waveform, time, RAMP_TIME)
            lfo.gain.gain.setTargetAtTime(depth, time, RAMP_TIME)
            return
        }

        // Native path
        lfo.osc.frequency.setTargetAtTime(frequency, time, RAMP_TIME);
        lfo.gain.gain.setTargetAtTime(depth, time, RAMP_TIME);
    }

    updateFilter = (type, freq, q) => {
        const ctx = this.audioCtx;
        const time = ctx.currentTime;

        this.currentFilterType = type || "allpass";

        // Worklet path
        if (this._worklet?.nodes?.filter) {
            if (this.currentFilterType === "allpass") {
                // TPT SVF doesn't have allpass — use passthrough (cutoff very high, Q low)
                WorkletBridge.setFilter(this, "lowpass", 20000, 0.1);
            } else {
                const fFreq = Utils.normalizeTrackFilterFreqValue(freq);
                const fQ = Utils.normalizeTrackFilterQValue(q);
                WorkletBridge.setFilter(this, this.currentFilterType, fFreq, fQ);
            }
            return;
        }

        // Native fallback
        if (this.currentFilterType === "allpass") {
            this.filter1.type = "allpass";
            this.filter2.type = "allpass";
            return;
        }

        const fFreq = Utils.normalizeTrackFilterFreqValue(freq);
        const fQ = Utils.normalizeTrackFilterQValue(q);

        [this.filter1, this.filter2].forEach(f => {
            f.type = this.currentFilterType;
            f.frequency.setTargetAtTime(fFreq, time, RAMP_TIME);
            f.Q.setTargetAtTime(fQ, time, RAMP_TIME);
        });
    }

    updateReverb = (type = "none", amount = 0) => {
        const ctx = this.audioCtx;
        const time = ctx.currentTime;
        const normalizedType = MfStrip.REVERB_PRESETS[type] ? type : "none";
        const normalizedAmount = Math.min(1, Math.max(0, Number(amount) || 0));

        this.currentReverbType = normalizedType;
        this.currentReverbAmount = normalizedAmount;

        // Worklet path
        if (this._worklet?.nodes?.reverb) {
            WorkletBridge.setReverb(this, normalizedType, normalizedAmount);
            // Keep reverbInput at full level (mix is on the worklet)
            this.reverbInput.gain.setTargetAtTime(1, time, RAMP_TIME);
            return;
        }

        if (normalizedType === "none" || normalizedAmount <= 0) {
            this.reverbInput.gain.setTargetAtTime(0, time, RAMP_TIME);
            this.reverb.buffer = null;
            return;
        }

        this.reverb.buffer = this.getImpulseResponse(normalizedType);
        this.reverbInput.gain.setTargetAtTime(normalizedAmount, time, RAMP_TIME);
    }

    updateDelay = (type = "tape", timeValue = 1, amount = 0) => {
        const ctx = this.audioCtx;
        const time = ctx.currentTime;
        const normalizedAmount = Math.min(1, Math.max(0, Number(amount) || 0));
        const delaySeconds = Utils.getDelayTimeInSeconds(timeValue, this.bpm);
        const normalizedType = ['none', 'slap', 'tape', 'pingpong'].includes(type) ? type : 'tape';

        this.currentDelayType = normalizedType;
        this.currentDelayAmount = normalizedAmount;

        // Worklet path
        if (this._worklet?.nodes?.delay) {
            if (normalizedType === 'none' || normalizedAmount <= 0) {
                WorkletBridge.setDelay(this, 'none', 0.001, 0)
            } else {
                WorkletBridge.setDelay(this, normalizedType, delaySeconds, normalizedAmount)
            }
            this.delayInput.gain.setValueAtTime(1, time)
            return
        }

        if (this.delayRoutingType !== normalizedType) {
            this.configureDelayRouting(normalizedType, time);
        }

        this.delay.delayTime.setTargetAtTime(delaySeconds, time, RAMP_TIME);

        if (normalizedType === 'none' || normalizedAmount <= 0) {
            this.delayInput.gain.setTargetAtTime(0, time, 0.01);
            this.delayWetGain.gain.setTargetAtTime(0, time, 0.01);
            this.delayFeedback.gain.setTargetAtTime(0, time, 0.01);
            return;
        }

        this.applyDelayTypeSettings(normalizedType, time);
        this.delayInput.gain.setValueAtTime(normalizedAmount, time);
        this.delayWetGain.gain.setValueAtTime(1, time);
    }

    configureDelayRouting = (type, time) => {
        this.disconnectNode(this.delayInput);
        this.disconnectNode(this.delay);
        this.disconnectNode(this.delayFeedback);
        this.disconnectNode(this.delayFilter);
        this.disconnectNode(this.panLeft);
        this.disconnectNode(this.panRight);

        this.delayFeedback.gain.setTargetAtTime(0, time, RAMP_TIME);

        if (type === 'none') {
            this.delayInput.connect(this.delay);
            this.delay.connect(this.delayWetGain);
            this.delayRoutingType = type;
            return;
        }

        switch (type) {
            case 'slap':
                this.applyDelayTypeSettings(type, time);
                this.delayInput.connect(this.delay);
                this.delay.connect(this.delayFeedback);
                this.delayFeedback.connect(this.delayFilter);
                this.delayFilter.connect(this.delayWetGain);
                this.delay.connect(this.delayWetGain);
                break;
                
            case 'tape':
                this.applyDelayTypeSettings(type, time);
                this.delayInput.connect(this.delay);
                this.delay.connect(this.delayFeedback);
                this.delayFeedback.connect(this.delayFilter);
                this.delayFilter.connect(this.delay);
                this.delay.connect(this.delayWetGain);
                break;
                
            case 'pingpong':
                this.applyDelayTypeSettings(type, time);
                this.delayInput.connect(this.delay);
                this.delay.connect(this.panLeft);
                this.delay.connect(this.panRight);
                this.panLeft.connect(this.delayWetGain);
                this.panRight.connect(this.delayWetGain);
                break;
                
            default:
                this.delayInput.connect(this.delay);
                this.delay.connect(this.delayWetGain);
        }

        this.delayRoutingType = type;
    }

    applyDelayTypeSettings = (type, time) => {
        this.delayFilter.type = "lowpass";
        const settings = computeDelaySettings(type);
        this.delayFeedback.gain.setTargetAtTime(settings.feedback, time, RAMP_TIME);
        this.delayFilter.frequency.setTargetAtTime(settings.filterFreq, time, RAMP_TIME);
    }

    disconnectNode = (node) => {
        if (!node) return;
        try {
            node.disconnect();
        } catch (e) {
            console.warn("MfStrip::disconnectNode failed", e);
        }
    }

    updateSaturation = (type = "soft", amount = 0) => {
        const ctx = this.audioCtx;
        const time = ctx.currentTime;
        const normalizedType = SATURATION_TYPES.includes(type) ? type : "soft";
        const normalizedAmount = Math.min(1, Math.max(0, Number(amount) || 0));
        this.currentSaturationType = normalizedType;
        this.currentSaturationAmount = normalizedAmount;

        // Worklet path (preferred when available)
        if (this._worklet?.nodes?.saturation) {
            WorkletBridge.setSaturation(this, normalizedType, normalizedAmount);
            return;
        }

        // Native fallback
        this.saturDrive.gain.setTargetAtTime(computeDriveGain(normalizedAmount), time, RAMP_TIME);
        this.saturator.curve = computeSaturationCurve(normalizedType, normalizedAmount);
        this.output.gain.setTargetAtTime(computeOutputGain(normalizedAmount), time, RAMP_TIME);
    }

    createSaturationCurve = (type = "soft", amount = 0) => {
        return computeSaturationCurve(type, amount)
    }

    getImpulseResponse = (type) => {
        if (this.impulseCache.has(type)) {
            return this.impulseCache.get(type);
        }

        const preset = REVERB_PRESETS[type] ?? REVERB_PRESETS.none;
        const ctx = this.audioCtx;
        const sampleRate = ctx.sampleRate;
        const length = Math.max(1, Math.floor(sampleRate * preset.duration));
        const impulse = ctx.createBuffer(2, length, sampleRate);

        for (let channel = 0; channel < impulse.numberOfChannels; channel++) {
            const data = impulse.getChannelData(channel);
            const sampleData = computeImpulseSampleData(sampleRate, preset, channel);
            for (let i = 0; i < length; i++) {
                data[i] = sampleData[i];
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
        if (this.reverbInput) this.reverbInput.disconnect();
        if (this.reverb) this.reverb.disconnect();
        if (this.reverbWetGain) this.reverbWetGain.disconnect();
        if (this.delayInput) this.delayInput.disconnect();
        if (this.delay) this.delay.disconnect();
        if (this.delayFeedback) this.delayFeedback.disconnect();
        if (this.delayFilter) this.delayFilter.disconnect();
        if (this.delayWetGain) this.delayWetGain.disconnect();
        if (this.pan) this.pan.disconnect();
        if (this.panLeft) this.panLeft.disconnect();
        if (this.panRight) this.panRight.disconnect();
        if (this.output) this.output.disconnect();

        // Libération de la mémoire
        this.filter1 = null;
        this.filter2 = null;
        this.saturDrive = null;
        this.saturator = null;
        this.dryGain = null;
        this.reverbInput = null;
        this.reverb = null;
        this.reverbWetGain = null;
        this.delayInput = null;
        this.delay = null;
        this.delayFeedback = null;
        this.delayFilter = null;
        this.delayWetGain = null;
        this.pan = null;
        this.panLeft = null;
        this.panRight = null;
        this.output = null;
        this.impulseCache?.clear();
        this.impulseCache = null;
    }
}
