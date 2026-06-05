import Utils from '../core/utils.js';
import MfDefaults from '../patterns/defaults.js';
import { RAMP_TIME } from '../core/constants.js';
import {
    computeLfoFrequency,
    computeLfoDepth,
    REVERB_PRESETS,
    SATURATION_TYPES,
} from './math.js';
import WorkletLoader from './worklets/loader.js';
import STRIP_SOURCE from './worklets/processors/strip_source.js';

export { SATURATION_TYPES, REVERB_PRESETS };

// Register the unified strip processor (idempotent)
WorkletLoader.register('strip', STRIP_SOURCE);

const SATURATION_TYPES_IDX = { soft: 0, hard: 1, tape: 2 };
const REVERB_PRESETS_PARAMS = {
    none:   { room: 0.0,  damp: 0.5, width: 0.0, pre: 0      },
    room:   { room: 0.5,  damp: 0.5, width: 0.8, pre: 0.008  },
    hall:   { room: 0.85, damp: 0.3, width: 1.0, pre: 0.02   },
    plate:  { room: 0.7,  damp: 0.4, width: 0.9, pre: 0.012  },
    spring: { room: 0.45, damp: 0.6, width: 0.5, pre: 0.01   },
    gated:  { room: 0.4,  damp: 0.7, width: 0.4, pre: 0      },
};
const FILTER_MODES = { lowpass: 0, highpass: 1, bandpass: 2, notch: 3 };
const DELAY_MODES  = { none: 0, slap: 0, tape: 1, pingpong: 2 };

export default class MfStrip {
    static TAG = "MFSTRIP";

    constructor(name, audioCtx) {
        this.name = name;
        this.audioCtx = audioCtx;
        this.bpm = MfDefaults.getPatternProp({}, 'bpm');

        this.stripNode = null;
        this.voicesInput = audioCtx.createGain(); // Entry for voices
        
        // Pitch LFO gain (still needed to multiply the 0..1 signal from worklet for voice detune)
        this._lfoGains = { pitchLfo: audioCtx.createGain() };
        this._lfoGains.pitchLfo.gain.value = 1.0; 

        // State caching for UI and introspection
        this.currentFilterType = 'allpass';
        this.currentSaturationType = 'soft';
        this.currentSaturationAmount = 0;
        this.currentReverbType = 'none';
        this.currentReverbAmount = 0;
        this.currentDelayType = 'tape';
        this.currentDelayAmount = 0;
    }

    static async create(name, audioCtx) {
        const strip = new MfStrip(name, audioCtx);
        await WorkletLoader.ensureLoaded(audioCtx);
        strip._initNode();
        return strip;
    }

    _initNode() {
        const ctx = this.audioCtx;
        this.stripNode = WorkletLoader.createNode(ctx, 'strip', {
            numberOfInputs: 1,
            numberOfOutputs: 2,
            outputChannelCount: [2, 1] // Output 0: Stereo Audio, Output 1: Mono Pitch LFO
        });

        this.voicesInput.connect(this.stripNode);
        
        // Connect Pitch LFO output to the gain node used by voices
        this.stripNode.connect(this._lfoGains.pitchLfo, 1);
        
        // Final output is the stripNode's first output
        this.output = { 
            gain: this.stripNode.parameters.get('volume'),
            connect: (dest) => this.stripNode.connect(dest, 0),
            disconnect: () => this.stripNode.disconnect(0)
        };
        // For compatibility with MfMixer wiring: strip.pan.connect(mixer.busInput)
        this.pan = {
            pan: this.stripNode.parameters.get('pan'),
            connect: (dest) => this.stripNode.connect(dest, 0),
            disconnect: () => this.stripNode.disconnect(0)
        };
    }

    connectVoice(node) {
        node.connect(this.voicesInput);
    }

    setBpm = (bpm) => {
        this.bpm = bpm;
    }

    updateLfo = (key, config) => {
        if (!this.stripNode) return;
        const time = this.audioCtx.currentTime;
        const params = this.stripNode.parameters;

        const map = {
            pitchLfo:      'lfoPitch',
            velocityLfo:   'lfoVelo',
            panLfo:        'lfoPan',
            filterFreqLfo: 'lfoCut',
            filterQLfo:    'lfoQ'
        };
        const prefix = map[key];
        if (!prefix) return;

        if (!config) {
            params.get(`${prefix}Depth`)?.setTargetAtTime(0, time, RAMP_TIME);
            params.get(`${prefix}Bias`)?.setTargetAtTime(0, time, RAMP_TIME);
            return;
        }

        const freq  = computeLfoFrequency(config.freq ?? 1, this.bpm);
        let min = parseFloat(config.min) || 0;
        let max = parseFloat(config.max) || 0;

        // Ensure we send normalized [0..1] values for depth/bias
        if (key === 'filterFreqLfo' && (min > 1 || max > 1)) {
            min = Utils.hzToNormalizedTrackFilterFreq(min);
            max = Utils.hzToNormalizedTrackFilterFreq(max);
        }
        if (key === 'filterQLfo' && (min > 1 || max > 1)) {
            min = Utils.valueToNormalizedTrackFilterQ(min);
            max = Utils.valueToNormalizedTrackFilterQ(max);
        }

        const depth = max - min;
        const bias  = min;
        const wave  = config.waveform ?? 0;

        params.get(`${prefix}Freq`)?.setTargetAtTime(freq, time, RAMP_TIME);
        params.get(`${prefix}Wave`)?.setTargetAtTime(wave, time, RAMP_TIME);
        params.get(`${prefix}Depth`)?.setTargetAtTime(depth, time, RAMP_TIME);
        params.get(`${prefix}Bias`)?.setTargetAtTime(bias, time, RAMP_TIME);
    }

    updateFilter = (type, freq, q) => {
        if (!this.stripNode) return;
        const time = this.audioCtx.currentTime;
        const params = this.stripNode.parameters;
        this.currentFilterType = type || 'allpass';

        if (this.currentFilterType === 'allpass') {
            params.get('cutoff')?.setTargetAtTime(1, time, RAMP_TIME);
            return;
        }

        let fFreq = Number(freq) || 0;
        if (fFreq > 1) fFreq = Utils.hzToNormalizedTrackFilterFreq(fFreq);
        
        let fQ = Number(q) || 0;
        if (fQ > 1) fQ = Utils.valueToNormalizedTrackFilterQ(fQ);

        const mode  = FILTER_MODES[this.currentFilterType] ?? 0;

        params.get('cutoff')?.setTargetAtTime(fFreq, time, RAMP_TIME);
        params.get('q')?.setTargetAtTime(fQ, time, RAMP_TIME);
        params.get('filterMode')?.setTargetAtTime(mode, time, RAMP_TIME);
    }

    updateSaturation = (type = 'soft', amount = 0) => {
        if (!this.stripNode) return;
        const time = this.audioCtx.currentTime;
        const params = this.stripNode.parameters;
        
        const normalizedAmount = Math.min(1, Math.max(0, Number(amount) || 0));
        this.currentSaturationType = SATURATION_TYPES.includes(type) ? type : 'soft';
        this.currentSaturationAmount = normalizedAmount;

        const typeIdx = SATURATION_TYPES_IDX[this.currentSaturationType] ?? 0;
        const drive   = 1 + normalizedAmount * 6;
        const out     = 1 - normalizedAmount * 0.15;
        const mix     = normalizedAmount > 0 ? 1 : 0;

        params.get('satType')?.setTargetAtTime(typeIdx, time, RAMP_TIME);
        params.get('satDrive')?.setTargetAtTime(drive, time, RAMP_TIME);
        params.get('satOut')?.setTargetAtTime(out, time, RAMP_TIME);
        params.get('satMix')?.setTargetAtTime(mix, time, RAMP_TIME);
    }

    updateReverb = (type = 'none', amount = 0) => {
        if (!this.stripNode) return;
        const time = this.audioCtx.currentTime;
        const params = this.stripNode.parameters;

        const normalizedType = REVERB_PRESETS[type] ? type : 'none';
        const normalizedAmount = Math.min(1, Math.max(0, Number(amount) || 0));
        
        this.currentReverbType = normalizedType;
        this.currentReverbAmount = normalizedAmount;

        const p   = REVERB_PRESETS_PARAMS[normalizedType] ?? REVERB_PRESETS_PARAMS.none;
        const wet = normalizedType === 'none' ? 0 : normalizedAmount;

        params.get('revRoom')?.setTargetAtTime(p.room, time, RAMP_TIME);
        params.get('revDamp')?.setTargetAtTime(p.damp, time, RAMP_TIME);
        params.get('revWidth')?.setTargetAtTime(p.width, time, RAMP_TIME);
        params.get('revMix')?.setTargetAtTime(wet, time, RAMP_TIME);
    }

    updateDelay = (type = 'tape', timeValue = 1, amount = 0) => {
        if (!this.stripNode) return;
        const time = this.audioCtx.currentTime;
        const params = this.stripNode.parameters;

        const normalizedType = DELAY_MODES.hasOwnProperty(type) ? type : 'tape';
        const normalizedAmount = Math.min(1, Math.max(0, Number(amount) || 0));

        this.currentDelayType = normalizedType;
        this.currentDelayAmount = normalizedAmount;

        if (normalizedType === 'none' || normalizedAmount <= 0) {
            params.get('dlyMix')?.setTargetAtTime(0, time, RAMP_TIME);
            return;
        }

        const delaySeconds = Utils.getDelayTimeInSeconds(timeValue, this.bpm);
        const mode = DELAY_MODES[normalizedType] ?? 1;
        const isPP = mode >= 1.5;

        params.get('dlyTimeL')?.setTargetAtTime(isPP ? delaySeconds * 0.667 : delaySeconds, time, RAMP_TIME);
        params.get('dlyTimeR')?.setTargetAtTime(delaySeconds, time, RAMP_TIME);
        params.get('dlyMode')?.setTargetAtTime(mode, time, RAMP_TIME);
        params.get('dlyMix')?.setTargetAtTime(normalizedAmount, time, RAMP_TIME);
    }

    delete = () => {
        if (this.stripNode) {
            this.stripNode.disconnect();
            this.stripNode = null;
        }
        this.voicesInput.disconnect();
        this._lfoGains.pitchLfo.disconnect();
        this._lfoGains = {};
    }
}
