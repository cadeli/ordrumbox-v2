import MfStrip from './strip.js';
import { COMPRESSOR_ATTACK } from '../core/constants.js';

export default class MfMixer {
    static TAG = "MFMIXER";

    constructor(audioCtx) {
        this.audioCtx = audioCtx;
        this.trackName = "all";
        this.lfo = null;
        this.strips = {};

        this.analyser = null;
        this.compressor = null;
        this.lowcutFilter = null;
        this.hicutFilter = null;
        this.masterGain = null;
    }

    start = () => {
        const ctx = this.audioCtx;
        if (!ctx) {
            console.error("MfMixer::start - No audioCtx available");
            return;
        }
        this.trackName = "all";

        if (!this.lfo) {
            this.lfo = ctx.createOscillator();
            this.lfo.start(0);
        }

        if (!this.compressor) {
            this.compressor = ctx.createDynamicsCompressor();
            this.compressor.threshold.setValueAtTime(-12, ctx.currentTime);
            this.compressor.knee.setValueAtTime(30, ctx.currentTime);
            this.compressor.ratio.setValueAtTime(4, ctx.currentTime);
            this.compressor.attack.setValueAtTime(COMPRESSOR_ATTACK, ctx.currentTime);
            this.compressor.release.setValueAtTime(0.15, ctx.currentTime);
        }

        if (!this.lowcutFilter) {
            this.lowcutFilter = ctx.createBiquadFilter();
            this.lowcutFilter.type = "highpass";
            this.lowcutFilter.frequency.setValueAtTime(35, ctx.currentTime);
        }

        if (!this.hicutFilter) {
            this.hicutFilter = ctx.createBiquadFilter();
            this.hicutFilter.type = "lowpass";
            this.hicutFilter.frequency.setValueAtTime(18500, ctx.currentTime);
        }

        if (!this.masterGain) {
            this.masterGain = ctx.createGain();
            this.masterGain.gain.setValueAtTime(1.0, ctx.currentTime);
        }

        if (!this.analyser) {
            this.analyser = ctx.createAnalyser();
            this.analyser.fftSize = 1024;
            this.gFftData = new Uint8Array(this.analyser.frequencyBinCount);
            this.dataArray = new Uint8Array(this.analyser.fftSize);
        }

        this.compressor.connect(this.lowcutFilter);
        this.lowcutFilter.connect(this.hicutFilter);
        this.hicutFilter.connect(this.masterGain);
        this.masterGain.connect(this.analyser);
        this.analyser.connect(ctx.destination);
    }

    stop = () => {
        this.deleteStrips();

        const nodes = [this.lfo, this.compressor, this.lowcutFilter, this.hicutFilter, this.masterGain, this.analyser];

        nodes.forEach(node => {
            if (node) {
                try { node.disconnect(); } catch (e) { 
                    console.error(e)
                }
            }
        });

        if (this.lfo) {
            try { this.lfo.stop(); } catch (e) { console.error(e)}
        }

        this.lfo = null;
        this.compressor = null;
        this.lowcutFilter = null;
        this.hicutFilter = null;
        this.masterGain = null;
        this.analyser = null;
        this.gFftData = null;
        this.dataArray = null;
    }

    addStrip = (name) => {
        if (!this.strips[name]) {
            const strip = new MfStrip(name, this.audioCtx);
            this.strips[name] = strip;

            if (strip.pan && this.compressor) {
                strip.pan.connect(this.compressor);
            }
            console.log("MfMixer::addStrip " , name , " total strips = ", Object.keys(this.strips).length)
        }
    }

    getOrCreateStrip = (name) => {
        if (!this.strips[name]) {
            this.addStrip(name);
        }
        return this.strips[name];
    }

    deleteStrips = () => {
        Object.keys(this.strips).forEach(name => {
            if (this.strips[name].delete) {
                this.strips[name].delete();
            }
            delete this.strips[name];
        });
        this.strips = {};
    }

    setBpm = (bpm) => {
        Object.values(this.strips).forEach(strip => {
            strip.setBpm(bpm);
        });
    }
}
