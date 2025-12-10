export default class MfSound {

    constructor() {}

    init = () => {}

    play = (flatNote, time) => {
        if (MfGlobals.mfMixer.analyser) { //TODO 
            if (flatNote.track.generated === true) {
                this.playGenerated(flatNote, time)
            } else {
                this.playSample(flatNote, time)
            }
        }
    }

    playSample = (flatNote, time) => {
        try {
            let strip = MfGlobals.mfMixer.strips[flatNote.track.name]
            if (!strip) { console.error("mfsound::playSample no strip " + flatNote.track.name);MfGlobals.mfSeq.stop() }
            if (!strip.bfilter) { console.error("mfsound::playSample no bfilter " + flatNote.track.name) }
            MfGlobals.leds[flatNote.track.name] = 20

            let gain = MfGlobals.audioCtx.createGain();
            let panNode = MfGlobals.audioCtx.createStereoPanner();
            let snd = MfGlobals.audioCtx.createBufferSource()
            snd.playbackRate.value = flatNote.fpitch
            strip.updateFilter(flatNote.track.filterType, flatNote.track.filterFreq, flatNote.track.filterQ)
            strip.gain.gain.value = flatNote.track.velo
            gain.gain.value = flatNote.note.velo 
            if (!flatNote.track.sampleLength)  {flatNote.track.sampleLength=500}
            gain.gain.setTargetAtTime(0, time + flatNote.track.sampleLength, 0.02)
            panNode.pan.value = flatNote.pano
            if (!flatNote.soundNum) {flatNote.soundNum=0}//TODO
            snd.buffer = MfGlobals.sounds[flatNote.soundNum].buffer

            snd.connect(gain)
            gain.connect(panNode)
            panNode.connect(strip.bfilter)

            snd.start(time)
        } catch (e) {
            console.error(e)
            console.error(flatNote)
        }
    }

    playGenerated = (flatNote, time) => {
        if (!flatNote.track.synthSoundKey) {flatNote.track.synthSoundKey="bass1"}
        let generatedSound = MfGlobals.generatedSounds[flatNote.track.synthSoundKey]

        let gainMain = MfGlobals.audioCtx.createGain()
        let gainAjust = MfGlobals.audioCtx.createGain()
        let gainVco1 = MfGlobals.audioCtx.createGain()
        let gainVco2 = MfGlobals.audioCtx.createGain()
        let gainVco3 = MfGlobals.audioCtx.createGain()
        let panNode = MfGlobals.audioCtx.createStereoPanner()
        let vco1 = MfGlobals.audioCtx.createOscillator()
        let vco2 = MfGlobals.audioCtx.createOscillator()
        let vco3 = MfGlobals.audioCtx.createOscillator()
        let filter = MfGlobals.audioCtx.createBiquadFilter()

        let lfoGain = MfGlobals.audioCtx.createGain();

        MfGlobals.mfMixer.lfo.type = generatedSound.lfo.wave
        MfGlobals.mfMixer.lfo.connect(lfoGain);
        MfGlobals.mfMixer.lfo.frequency.value = eval(generatedSound.lfo.freq) * 1 + 0.1
        lfoGain.gain.value = 1000 * generatedSound.lfo.depth
        if (generatedSound.lfo.target === 'vco1') {
            lfoGain.connect(vco1.detune)
        }
        if (generatedSound.lfo.target === 'vco2') {
            lfoGain.connect(vco2.detune)
        }
        if (generatedSound.lfo.target === 'vco3') {
            lfoGain.connect(vco3.detune)
        }
        if (generatedSound.lfo.target === 'flt') {
            lfoGain.connect(filter.frequency)
        }
        if (generatedSound.lfo.target === 'not') {}

        let lengthInSec = (generatedSound.enveloppe.lgr / 5.0) + 0.1
        let oct = 1
        let detune = 0
        if (flatNote.fpitch) { //jic
            // console.log ("flatnote pitch"+ flatNote.fpitch )
            oct = Math.pow(2, Math.floor((parseFloat(generatedSound.vco1.octave * 10)) - 5))
            vco1.frequency.value = (oct) * 440.0 * flatNote.fpitch / 4
            vco1.detune.value = 1000 * parseFloat(generatedSound.vco1.detune - 0.5)
            vco1.type = generatedSound.vco1.wave
            //console.log(vco1.detune.value)
            //console.log(generatedSound.vco1 )

            oct = Math.pow(2, Math.floor((parseFloat(generatedSound.vco2.octave * 10)) - 5))
            vco2.frequency.value = (oct) * 440.0 * flatNote.fpitch / 4
            vco2.detune.value = 1000 * parseFloat(generatedSound.vco2.detune - 0.5)
            vco2.type = generatedSound.vco2.wave

            oct = Math.pow(2, Math.floor((parseFloat(generatedSound.vco3.octave * 10)) - 5))
            vco3.frequency.value = (oct) * 440.0 * flatNote.fpitch / 4
            vco3.detune.value = 1000 * parseFloat(generatedSound.vco3.detune - 0.5)
            vco3.type = generatedSound.vco3.wave
        }
        let finalVol = generatedSound.enveloppe.vol; 
        gainVco1.gain.setTargetAtTime(finalVol*generatedSound.vco1.gain, time, 0.01);
        gainVco1.gain.setTargetAtTime(0, time + lengthInSec, 0.01);
        gainVco2.gain.setTargetAtTime(finalVol*generatedSound.vco2.gain, time, 0.01);
        gainVco2.gain.setTargetAtTime(0, time + lengthInSec, 0.01);
        gainVco3.gain.setTargetAtTime(finalVol*generatedSound.vco3.gain, time, 0.01);
        gainVco3.gain.setTargetAtTime(0, time + lengthInSec, 0.01);

        gainMain.gain.setTargetAtTime(finalVol, time, 0.01);
        gainMain.gain.setTargetAtTime(flatNote.track.velo*generatedSound.enveloppe.vol/6, time + lengthInSec/2, 0.01);
        gainMain.gain.setTargetAtTime(0, time + lengthInSec, 0.01);

        if (flatNote.pano) {
            panNode.pan.value = flatNote.pano
        }

        vco1.connect(gainVco1)
        vco2.connect(gainVco2)
        vco3.connect(gainVco3)
        gainVco1.connect(panNode)
        gainVco2.connect(panNode)
        gainVco3.connect(panNode)
        panNode.connect(filter)
        filter.connect(gainMain)
        gainAjust.gain.value =  flatNote.track.velo/4. //TODO
        gainMain.connect(gainAjust)
        gainAjust.connect(MfGlobals.mfMixer.compressor)

        vco1.start(time)
        vco1.stop(time + lengthInSec)
        vco2.start(time)
        vco2.stop(time + lengthInSec)
        vco3.start(time)
        vco3.stop(time + lengthInSec)

        let mFreq = 2000 * (generatedSound.filter.freq) + 50
        let mQ = 20 * generatedSound.filter.Q + 1
        filter.type = generatedSound.filter.type
        filter.frequency.setValueAtTime(mFreq, time)
        filter.Q.setValueAtTime(mQ, time)
        filter.gain.setValueAtTime(25, time)
    }


}