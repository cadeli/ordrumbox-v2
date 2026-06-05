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
import SATURATION_SOURCE from './worklets/processors/saturation_source.js';
import FILTER_SOURCE from './worklets/processors/filter_source.js';
import REVERB_SOURCE from './worklets/processors/reverb_source.js';
import DELAY_SOURCE from './worklets/processors/delay_source.js';
import LFO_SOURCE from './worklets/processors/lfo_source.js';

export { SATURATION_TYPES, REVERB_PRESETS };

// Register processors once at module load (idempotent — WorkletLoader guards duplicates)
WorkletLoader.register('saturation', SATURATION_SOURCE);
WorkletLoader.register('filter',     FILTER_SOURCE);
WorkletLoader.register('reverb',     REVERB_SOURCE);
WorkletLoader.register('delay',      DELAY_SOURCE);
WorkletLoader.register('lfo',        LFO_SOURCE);

// Maps used by setFilter / setReverb / setDelay
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

function _param(node, name) {
    return node.parameters.get(name);
}

export default class MfStrip {
    static TAG = "MFSTRIP";
    static REVERB_PRESETS = REVERB_PRESETS;
    static SATURATION_TYPES = SATURATION_TYPES;

    /**
     * MfStrip is always worklet-based. Call the async factory `MfStrip.create()`
     * instead of `new MfStrip()` so that worklets are loaded before nodes are wired.
     */
    constructor(name, audioCtx) {
        this.name = name;
        this.audioCtx = audioCtx;
        this.bpm = MfDefaults.getPatternProp({}, 'bpm');

        // Worklet effect nodes — populated by _initWorkletNodes()
        this.filterNode      = null;
        this.saturationNode  = null;
        this.reverbNode      = null;
        this.delayNode       = null;

        // LFO worklet nodes keyed by lfo name
        this.lfoNodes = {};

        // Gain nodes that remain native (lightweight — no DSP, just routing)
        this.voicesInput    = audioCtx.createGain();  // entry point for voices
        this.output         = audioCtx.createGain();  // final track output
        this.pan            = audioCtx.createStereoPanner();

        // LFO gain nodes (depth control — stays native, modulates AudioParams)
        this._lfoGains = {
            pitchLfo:      audioCtx.createGain(),
            velocityLfo:   audioCtx.createGain(),
            panLfo:        audioCtx.createGain(),
            filterFreqLfo: audioCtx.createGain(),
            filterQLfo:    audioCtx.createGain(),
        };
        Object.values(this._lfoGains).forEach(g => { g.gain.value = 0; });

        // Current state (used for re-apply after context restart)
        this.currentFilterType      = 'allpass';
        this.currentReverbType      = 'none';
        this.currentReverbAmount    = 0;
        this.currentDelayType       = 'tape';
        this.currentDelayAmount     = 0;
        this.currentSaturationType  = 'soft';
        this.currentSaturationAmount = 0;
    }

    /**
     * Async factory — loads worklets then wires the audio graph.
     * Use this instead of `new MfStrip()` in production code.
     */
    static async create(name, audioCtx) {
        const strip = new MfStrip(name, audioCtx);
        await WorkletLoader.ensureLoaded(audioCtx);
        strip._initWorkletNodes();
        strip._wireGraph();
        strip._initLfoNodes();
        return strip;
    }

    // ─── Internal setup ────────────────────────────────────────────────────────

    _initWorkletNodes() {
        const ctx = this.audioCtx;
        const stereo = { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] };

        this.filterNode     = WorkletLoader.createNode(ctx, 'filter',     stereo);
        this.saturationNode = WorkletLoader.createNode(ctx, 'saturation', stereo);
        this.reverbNode     = WorkletLoader.createNode(ctx, 'reverb',     stereo);
        this.delayNode      = WorkletLoader.createNode(ctx, 'delay',      stereo);

        // Worklet processors declare their own AudioParam defaults (e.g.
        // delay mix=1, reverb mix=1). Snap the strip's "no-effect" state
        // immediately via setValueAtTime so every freshly created strip
        // starts silent until updateStripFromTrack pushes the user-configured
        // values. Using setValueAtTime (snap) rather than setTargetAtTime
        // (ramp) avoids a brief audible delay/reverb on the first note of
        // every track whose strip is created on demand.
        const t = ctx.currentTime;
        const snap = (node, name, val) => {
            const p = node.parameters.get(name);
            if (p) p.setValueAtTime(val, t);
        };

        // Filter: allpass passthrough
        snap(this.filterNode,     'cutoff', 20000);
        snap(this.filterNode,     'q',      0.1);
        snap(this.filterNode,     'mode',   0);

        // Saturation: drive=1, output=1, mix=1 (passthrough)
        snap(this.saturationNode, 'type',   0);
        snap(this.saturationNode, 'drive',  1);
        snap(this.saturationNode, 'output', 1);
        snap(this.saturationNode, 'mix',    1);

        // Reverb: mix=0 (silent)
        snap(this.reverbNode,     'roomSize', 0);
        snap(this.reverbNode,     'damping',  0.5);
        snap(this.reverbNode,     'width',    0);
        snap(this.reverbNode,     'preDelay', 0);
        snap(this.reverbNode,     'mix',      0);

        // Delay: mix=0 (silent)
        snap(this.delayNode,      'timeL',      0.25);
        snap(this.delayNode,      'timeR',      0.25);
        snap(this.delayNode,      'mode',       1);
        snap(this.delayNode,      'mix',        0);
        snap(this.delayNode,      'feedback',   0);
        snap(this.delayNode,      'filter',     5000);
        snap(this.delayNode,      'saturation', 0);
    }

    _wireGraph() {
        // voicesInput → filter → saturation → output (dry path)
        this.voicesInput.connect(this.filterNode);
        this.filterNode.connect(this.saturationNode);
        this.saturationNode.connect(this.output);

        // filter → reverb worklet → output (worklet handles dry/wet via its 'mix' param)
        this.filterNode.connect(this.reverbNode);
        this.reverbNode.connect(this.output);

        // filter → delay worklet → output (worklet handles dry/wet via its 'mix' param)
        this.filterNode.connect(this.delayNode);
        this.delayNode.connect(this.output);

        // output → pan (connects to busInput in mixer)
        this.output.connect(this.pan);
    }

    _initLfoNodes() {
        const ctx = this.audioCtx;
        const mono = { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1] };
        const lfoNames = Object.keys(this._lfoGains);

        for (const key of lfoNames) {
            const wn = WorkletLoader.createNode(ctx, 'lfo', mono);
            wn.connect(this._lfoGains[key]);
            this.lfoNodes[key] = wn;
        }

        // Connect LFO gain outputs to their AudioParam targets
        this._lfoGains.velocityLfo.connect(this.output.gain);
        // filterFreqLfo and filterQLfo modulate the filter worklet via AudioParam
        // (the worklet exposes 'cutoff' and 'q' as AudioParams)
        const cutoff = _param(this.filterNode, 'cutoff');
        const q      = _param(this.filterNode, 'q');
        if (cutoff) this._lfoGains.filterFreqLfo.connect(cutoff);
        if (q)      this._lfoGains.filterQLfo.connect(q);
    }

    // ─── Public API ────────────────────────────────────────────────────────────

    setBpm = (bpm) => {
        this.bpm = bpm;
    }

    /**
     * Connect a voice node to the strip's entry point.
     * Voices call this via BaseVoice.connectToStripInput().
     */
    connectVoice(node) {
        node.connect(this.voicesInput);
    }

    updateLfo = (key, config) => {
        const wn   = this.lfoNodes[key];
        const gain = this._lfoGains[key];
        if (!wn || !gain) return;

        const time = this.audioCtx.currentTime;

        if (!config) {
            gain.gain.setTargetAtTime(0, time, RAMP_TIME);
            return;
        }

        const frequency = computeLfoFrequency(config.freq ?? 1, this.bpm);
        const depth     = computeLfoDepth(config.min, config.max);
        const waveform  = config.waveform ?? 0;

        const params = wn.parameters;
        if (params.get('freq'))     params.get('freq').setTargetAtTime(frequency, time, RAMP_TIME);
        if (params.get('waveform')) params.get('waveform').setTargetAtTime(waveform, time, RAMP_TIME);
        gain.gain.setTargetAtTime(depth, time, RAMP_TIME);
    }

    updateFilter = (type, freq, q) => {
        const time = this.audioCtx.currentTime;
        this.currentFilterType = type || 'allpass';

        if (this.currentFilterType === 'allpass') {
            // Passthrough: open LP at max frequency, very low Q
            _param(this.filterNode, 'cutoff')?.setTargetAtTime(20000, time, RAMP_TIME);
            _param(this.filterNode, 'q')?.setTargetAtTime(0.1, time, RAMP_TIME);
            _param(this.filterNode, 'mode')?.setTargetAtTime(0, time, RAMP_TIME);
            return;
        }

        const fFreq = Utils.normalizeTrackFilterFreqValue(freq);
        const fQ    = Utils.normalizeTrackFilterQValue(q);
        const mode  = FILTER_MODES[this.currentFilterType] ?? 0;

        _param(this.filterNode, 'cutoff')?.setTargetAtTime(fFreq, time, RAMP_TIME);
        _param(this.filterNode, 'q')?.setTargetAtTime(fQ, time, RAMP_TIME);
        _param(this.filterNode, 'mode')?.setTargetAtTime(mode, time, RAMP_TIME);
    }

    updateReverb = (type = 'none', amount = 0) => {
        const time = this.audioCtx.currentTime;
        const normalizedType   = REVERB_PRESETS[type] ? type : 'none';
        const normalizedAmount = Math.min(1, Math.max(0, Number(amount) || 0));

        this.currentReverbType   = normalizedType;
        this.currentReverbAmount = normalizedAmount;

        const p   = REVERB_PRESETS_PARAMS[normalizedType] ?? REVERB_PRESETS_PARAMS.none;
        const wet = normalizedType === 'none' ? 0 : normalizedAmount;

        _param(this.reverbNode, 'roomSize')?.setTargetAtTime(p.room, time, RAMP_TIME);
        _param(this.reverbNode, 'damping')?.setTargetAtTime(p.damp, time, RAMP_TIME);
        _param(this.reverbNode, 'width')?.setTargetAtTime(p.width, time, RAMP_TIME);
        _param(this.reverbNode, 'preDelay')?.setTargetAtTime(p.pre, time, RAMP_TIME);

        // Worklet's 'mix' AudioParam controls the wet level directly.
        _param(this.reverbNode, 'mix')?.setTargetAtTime(wet, time, RAMP_TIME);
    }

    updateDelay = (type = 'tape', timeValue = 1, amount = 0) => {
        const time            = this.audioCtx.currentTime;
        const normalizedAmount = Math.min(1, Math.max(0, Number(amount) || 0));
        const normalizedType  = DELAY_MODES.hasOwnProperty(type) ? type : 'tape';
        const delaySeconds    = Utils.getDelayTimeInSeconds(timeValue, this.bpm);

        this.currentDelayType   = normalizedType;
        this.currentDelayAmount = normalizedAmount;

        if (normalizedType === 'none' || normalizedAmount <= 0) {
            _param(this.delayNode, 'mix')?.setTargetAtTime(0, time, RAMP_TIME);
            return;
        }

        const mode     = DELAY_MODES[normalizedType];
        const feedback = 0.4;
        const isPP     = mode >= 1.5;
        const tL       = isPP ? delaySeconds * 0.667 : delaySeconds;
        const tR       = isPP ? delaySeconds * 1.0   : delaySeconds;

        _param(this.delayNode, 'timeL')?.setTargetAtTime(tL, time, RAMP_TIME);
        _param(this.delayNode, 'timeR')?.setTargetAtTime(tR, time, RAMP_TIME);
        _param(this.delayNode, 'mode')?.setTargetAtTime(mode, time, RAMP_TIME);

        // Worklet's 'mix' AudioParam controls the wet level directly.
        _param(this.delayNode, 'mix')?.setTargetAtTime(normalizedAmount, time, RAMP_TIME);
        _param(this.delayNode, 'feedback')?.setTargetAtTime(feedback, time, RAMP_TIME);
        _param(this.delayNode, 'filter')?.setTargetAtTime(5000, time, RAMP_TIME);
        _param(this.delayNode, 'saturation')?.setTargetAtTime(0.1, time, RAMP_TIME);
    }

    updateSaturation = (type = 'soft', amount = 0) => {
        const time             = this.audioCtx.currentTime;
        const normalizedType   = SATURATION_TYPES.includes(type) ? type : 'soft';
        const normalizedAmount = Math.min(1, Math.max(0, Number(amount) || 0));

        this.currentSaturationType   = normalizedType;
        this.currentSaturationAmount = normalizedAmount;

        const typeIdx = SATURATION_TYPES_IDX[normalizedType] ?? 0;
        const drive   = 1 + normalizedAmount * 6;
        const out     = 1 - normalizedAmount * 0.15;

        _param(this.saturationNode, 'type')?.setTargetAtTime(typeIdx, time, RAMP_TIME);
        _param(this.saturationNode, 'drive')?.setTargetAtTime(drive, time, RAMP_TIME);
        _param(this.saturationNode, 'output')?.setTargetAtTime(out, time, RAMP_TIME);
        _param(this.saturationNode, 'mix')?.setTargetAtTime(1, time, RAMP_TIME);
    }

    delete = () => {
        const nodes = [
            this.voicesInput, this.filterNode, this.saturationNode,
            this.reverbNode, this.delayNode,
            this.output, this.pan,
            ...Object.values(this._lfoGains),
            ...Object.values(this.lfoNodes),
        ];

        for (const node of nodes) {
            if (!node) continue;
            try { node.disconnect(); } catch (_) {}
        }

        this.filterNode = this.saturationNode = this.reverbNode = this.delayNode = null;
        this.voicesInput = this.output = this.pan = null;
        this._lfoGains = {};
        this.lfoNodes  = {};
    }
}
