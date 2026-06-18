import Utils from '../core/utils.js';
import MfDefaults from '../patterns/defaults.js';
import { RAMP_TIME } from '../core/constants.js';
import WorkletLoader from './worklets/loader.js';
import STRIP_SOURCE from './worklets/processors/strip_source.js';
import { logger } from "../core/logger.js"

WorkletLoader.register('strip', STRIP_SOURCE);

const SATURATION_TYPES = Object.freeze(["soft", "hard", "tape"]);
const REVERB_PRESETS = Object.freeze({
    none:   { duration: 0, decay: 0, preDelay: 0, tone: 1, room: 0.0, damp: 0.5, width: 0.0, pre: 0 },
    room:   { duration: 0.8, decay: 2.2, preDelay: 0.008, tone: 0.85, room: 0.5, damp: 0.5, width: 0.8, pre: 0.008 },
    hall:   { duration: 2.4, decay: 3.8, preDelay: 0.02, tone: 0.75, room: 0.85, damp: 0.3, width: 1.0, pre: 0.02 },
    plate:  { duration: 1.6, decay: 2.8, preDelay: 0.012, tone: 0.9, room: 0.7, damp: 0.4, width: 0.9, pre: 0.012 },
    spring: { duration: 1.2, decay: 2.4, preDelay: 0.01, tone: 0.65, room: 0.45, damp: 0.6, width: 0.5, pre: 0.01 },
    gated:  { duration: 0.7, decay: 1.4, preDelay: 0.004, tone: 0.8, gated: true, room: 0.4, damp: 0.7, width: 0.4, pre: 0 }
});
const SATURATION_TYPES_IDX = { soft: 0, hard: 1, tape: 2 };
const FILTER_MODES = { lowpass: 0, highpass: 1, bandpass: 2, notch: 3 };
const DELAY_MODES  = { none: 0, slap: 0, tape: 1, pingpong: 2 };

export default class MfStrip {
    static TAG = "MFSTRIP";

    constructor(name, audioCtx, mixer) {
        this.name = name;
        this.audioCtx = audioCtx;
        this.mixer = mixer;
        this.bpm = MfDefaults.getPatternProp({}, 'bpm');

        this.stripNode = null;
        this.voicesInput = audioCtx.createGain();

        this.levelAnalyser = audioCtx.createAnalyser();
        this.levelAnalyser.fftSize = 256;
        this.levelData = new Uint8Array(this.levelAnalyser.frequencyBinCount);

        this.currentFilterType = 'allpass';
        this.currentSaturationType = 'soft';
        this.currentSaturationAmount = 0;
        this.currentReverbType = 'none';
        this.currentReverbAmount = 0;
        this.currentDelayType = 'tape';
        this.currentDelayAmount = 0;
    }

    static async create(name, audioCtx, mixer) {
        const strip = new MfStrip(name, audioCtx, mixer);
        await WorkletLoader.ensureLoaded(audioCtx);
        strip._initNode();
        return strip;
    }

    _initNode() {
        const ctx = this.audioCtx;
        this.stripNode = WorkletLoader.createNode(ctx, 'strip', {
            numberOfInputs: 1,
            numberOfOutputs: 1,
            outputChannelCount: [2]
        });

        this.voicesInput.connect(this.stripNode);

        if (this.mixer?.transportClock) {
            this.mixer.transportClock.connect(this.stripNode.parameters.get('transportTime'));
        }

        this.stripNode.parameters.get('bpm')?.setValueAtTime(this.bpm, ctx.currentTime);

        this.stripNode.connect(this.levelAnalyser, 0);

        this.output = {
            gain: this.stripNode.parameters.get('volume'),
            connect: (dest) => this.levelAnalyser.connect(dest),
            disconnect: () => this.levelAnalyser.disconnect()
        };
        this.pan = {
            pan: this.stripNode.parameters.get('pan'),
            connect: (dest) => this.levelAnalyser.connect(dest),
            disconnect: () => this.levelAnalyser.disconnect()
        };
    }

    connectVoice(node) {
        node.connect(this.voicesInput);
    }

    getLevel = () => {
        if (!this.levelAnalyser) return 0
        this.levelAnalyser.getByteTimeDomainData(this.levelData)
        let sum = 0
        for (let i = 0; i < this.levelData.length; i++) {
            const v = (this.levelData[i] - 128) / 128
            sum += v * v
        }
        return Math.sqrt(sum / this.levelData.length)
    }

    setBpm = (bpm) => {
        this.bpm = bpm;
        if (this.stripNode) {
            this.stripNode.parameters.get('bpm')?.setTargetAtTime(bpm, this.audioCtx.currentTime, RAMP_TIME);
        }
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

        let fFreq = ((_v=>!Number.isNaN(_v)?_v:(logger.warn('FB','num',freq,0),0))(Number(freq)));
        if (fFreq > 1) fFreq = Utils.hzToNormalizedTrackFilterFreq(fFreq);

        let fQ = ((_v=>!Number.isNaN(_v)?_v:(logger.warn('FB','num',q,0),0))(Number(q)));
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

        const normalizedAmount = Math.min(1, Math.max(0, ((_v=>!Number.isNaN(_v)?_v:(logger.warn('FB','num',amount,0),0))(Number(amount)))));
        this.currentSaturationType = SATURATION_TYPES.includes(type) ? type : 'soft';
        this.currentSaturationAmount = normalizedAmount;

        const typeIdx = SATURATION_TYPES_IDX[type] ?? 0;
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
        const normalizedAmount = Math.min(1, Math.max(0, ((_v=>!Number.isNaN(_v)?_v:(logger.warn('FB','num',amount,0),0))(Number(amount)))));

        this.currentReverbType = normalizedType;
        this.currentReverbAmount = normalizedAmount;

        const p   = REVERB_PRESETS[normalizedType] ?? REVERB_PRESETS.none;
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
        const normalizedAmount = Math.min(1, Math.max(0, ((_v=>!Number.isNaN(_v)?_v:(logger.warn('FB','num',amount,0),0))(Number(amount)))));

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
        if (this.levelAnalyser) {
            this.levelAnalyser.disconnect();
            this.levelAnalyser = null;
        }
    }
}
