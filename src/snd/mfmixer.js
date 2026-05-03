import { MfGlobals } from '../mfglobals.js';
import MfStrip from './mfstrip.js';
import InstrumentsManager from '../ctrl/instrumentsManager.js'

export default class MfMixer {
    static TAG = "MFMIXER";

    constructor() {
        this.trackName = "all";
        this.lfo = null;
        this.strips = {};

        // Noeuds Audio
        this.analyser = null;
        this.compressor = null;
        this.lowcutFilter = null;
        this.hicutFilter = null;
        this.masterGain = null;
    }

    start = () => {
        const ctx = MfGlobals.audioCtx;
        this.trackName = "all";
        MfGlobals.leds["all"] = 20;

        if (!this.lfo) {
            this.lfo = ctx.createOscillator();
            this.lfo.start(0);
        }

        if (!this.compressor) {
            this.compressor = ctx.createDynamicsCompressor();
            this.compressor.threshold.setValueAtTime(-12, ctx.currentTime);
            this.compressor.knee.setValueAtTime(30, ctx.currentTime);
            this.compressor.ratio.setValueAtTime(4, ctx.currentTime);
            this.compressor.attack.setValueAtTime(0.005, ctx.currentTime);
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
            this.masterGain.gain.setValueAtTime(4.0, ctx.currentTime);
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

        this.createStrips();
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
            const strip = new MfStrip(name);
            this.strips[name] = strip;
            MfGlobals.leds[name] = 20;

            if (strip.output) {
                strip.output.connect(this.compressor);
            }
        }
    }

    createStrips = () => {
        const pattern = MfGlobals.patterns[MfGlobals.selectedPatternNum];
        if (!pattern) return;

        const soundTypes = InstrumentsManager.DATA.instruments.map(instType => instType.id);
        Object.values(soundTypes).forEach(instType => {
            this.addStrip(instType);
        });

        if (pattern.tracks) {
            Object.values(pattern.tracks).forEach(track => {
                if (track.name && !this.strips[track.name]) {
                    this.addStrip(track.name);
                }
            });
        }
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
}