import MfStrip from './mfstrip.js'

export default class MfMixer {
    static TAG = "MFMIXER"

    constructor() {
        this.trackName = "all"
        this.lfo = null
        this.strips = []
    }

    start = () => {
        // console.log("MfMixer::start")
        this.trackName = "all" //used for fft visu
        MfGlobals.leds["all"] = 20
        if (this.lfo === null) {
            this.lfo = MfGlobals.audioCtx.createOscillator()
            this.lfo.start(0)
        }
        if (!this.analyser) {
            this.analyser = MfGlobals.audioCtx.createAnalyser()
            this.analyser.fftSize = 512
            this.gFftData = new Uint8Array(this.analyser.frequencyBinCount)
            this.dataArray = new Uint8Array(this.analyser.fftSize)
        }
        if (!this.compressor) {
            this.compressor = MfGlobals.audioCtx.createDynamicsCompressor()
            this.compressor.threshold.value = -20
            this.compressor.knee.value = 20
            this.compressor.ratio.value = 4
            this.compressor.attack.value = 0.10
            this.compressor.release.value = 0.25
        }
        if (!this.lowcutFilter) {
            this.lowcutFilter = MfGlobals.audioCtx.createBiquadFilter();
            this.lowcutFilter.type = "highpass"
            this.lowcutFilter.frequency.value = 40
            this.lowcutFilter.Q.value = 0
            this.lowcutFilter.gain.value = 100
        }
        if (!this.hicutFilter) {
            this.hicutFilter = MfGlobals.audioCtx.createBiquadFilter();
            this.hicutFilter.type = "lowpass"
            this.hicutFilter.frequency.value = 15000
            this.hicutFilter.Q.value = 0
            this.hicutFilter.gain.value = 100
        }

        if (!this.gain) {
            this.gain = MfGlobals.audioCtx.createGain();
            this.gain.gain.value = 3
        }
        this.compressor.connect(this.lowcutFilter)
        this.lowcutFilter.connect(this.hicutFilter)
        this.hicutFilter.connect(this.gain)
        this.gain.connect(this.analyser)

        this.gain.connect(this.analyser)
        this.analyser.connect(MfGlobals.audioCtx.destination)
        this.createStrips()
    }

    stop = () => {
        this.gFftData = null
        this.dataArray = null
        this.analyser = null
        this.compressor = null
        this.gain = null
        this.hicutFilter=null
        this.lowcutFilter=null
        this.deteteStrips()
        // console.log("MfMixer::stop")
    }

    addStrip = (name) => {
        if (!this.strips[name]) {
            this.strips[name] = new MfStrip(name)
            MfGlobals.leds[name] = 20
        }
    }

    createStrips = () => {
        let pattern = MfGlobals.patterns[MfGlobals.selectedPatternNum]
        Object.values(pattern.tracks).forEach((track, indexTrack) => {
            this.addStrip(track.name)
        })

    }

    deteteStrips = () => {
        Object.values(this.strips).forEach((strip, indexStrip) => {
            strip.delete()
            strip = null
        })
        this.strips = []
    }

    updateFilter = (name, type, freq, q) => {
        if (this.strips[name]) {
            this.strips[name].updateFilter(type, freq, q)
        }
    }







}