export default class MfStrip {
    static TAG = "MFSTRIP"

    constructor(name) {
        //console.log("mfStrip::create "+name)
        this.name = name
        this.gain = MfGlobals.audioCtx.createGain();
        this.bfilter = MfGlobals.audioCtx.createBiquadFilter()

        this.bfilter.connect(this.gain)
        this.gain.connect(MfGlobals.mfMixer.compressor)

        this.gain.gain.value = 1
        this.bfilter.type = "allpass"
        this.updateFilter("allpass", 10, 0)
    }

    delete = () => {
        //console.log("mfStrip::delete "+this.name)
        this.gain = null
        this.bfilter = null
    }

    updateFilter = (type, freq, q) => {
        // console.log("mfStrip::updateFilter " + this.name + " type=" + type + " freq=" + freq+ " q=" + q)
        let mFreq = 2000 * (freq) + 300
        let mQ = 20 * q + 1
        let mType = type
        let mGain = 25
        this.bfilter.type = mType
        this.bfilter.frequency.setValueAtTime(mFreq, MfGlobals.audioCtx.currentTime)
        this.bfilter.Q.setValueAtTime(mQ, MfGlobals.audioCtx.currentTime)
        this.bfilter.gain.setValueAtTime(mGain, MfGlobals.audioCtx.currentTime)
    }


}