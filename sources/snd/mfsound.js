export default class MfSound {

    constructor() { }

    init = () => { }

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
            if (!MfGlobals.mfMixer) { console.error("mfsound::playSample no mixer " + flatNote.track.name); MfGlobals.mfSeq.stop() }
            let strip = MfGlobals.mfMixer.strips[flatNote.track.name]
            if (!strip) { console.error("mfsound::playSample no strip " + flatNote.track.name); MfGlobals.mfSeq.stop() }
            if (!strip.bfilter) { console.error("mfsound::playSample no bfilter " + flatNote.track.name) }
            MfGlobals.leds[flatNote.track.name] = 20

            let gainEnveloppe = MfGlobals.audioCtx.createGain();
            let gainVolume = MfGlobals.audioCtx.createGain();
            let panNode = MfGlobals.audioCtx.createStereoPanner();
            let snd = MfGlobals.audioCtx.createBufferSource()
            snd.playbackRate.value = flatNote.fpitch
            strip.updateFilter(flatNote.track.filterType, flatNote.track.filterFreq, flatNote.track.filterQ)
            strip.gain.gain.value = flatNote.track.velo
            gainEnveloppe.gain.value = 1;//flatNote.note.velo
            gainVolume.gain.value = flatNote.note.velo
            if (!flatNote.track.sampleLength) { flatNote.track.sampleLength = 500 }
            gainEnveloppe.gain.setTargetAtTime(0, time + flatNote.track.sampleLength, 0.02)
            panNode.pan.value = flatNote.pano
            if (isNaN(flatNote.soundNum)) {
                console.error("MfSound::playSample no soundnum flatNote= ", flatNote)//TODO
                flatNote.soundNum = 0
            }
            if (flatNote.soundNum > MfGlobals.sounds.length || flatNote.soundNum < 0) {
                console.error("MfSound::playSample flatNote.soundnum =", flatNote.soundNum, " MfGlobals.sounds.length =", MfGlobals.sounds.length, " flatNote=", flatNote)//TODO
                flatNote.soundNum = 0
            } else {
                snd.buffer = MfGlobals.sounds[flatNote.soundNum].buffer
            }

            snd.connect(gainEnveloppe)
            gainEnveloppe.connect(panNode)
            panNode.connect(strip.bfilter)
            strip.bfilter.connect(gainVolume)



            snd.start(time)
        } catch (e) {
            console.error(e)
            console.error(flatNote)
        }
    }

    loadGeneratedsounds = () => {
        console.log("MfSounds::loadGeneratedsounds")
        MfGlobals.mfResourcesLoader.loadGeneratedSounds("./assets/generated_sounds.json", this.checkResources)
    }

    checkResources = () => {
        console.log("MfSounds::checkResources")
        console.log("generatedSounds")
        console.log(MfGlobals.generatedSounds)
        this.playGenerated(this.flatNote, this.time)
    }

    playGenerated = (flatNote, time) => {

        if (Object.keys(MfGlobals.generatedSounds).length === 0) {
            this.flatNote = flatNote // TODO
            this.time = time         // TODO
            this.loadGeneratedsounds()
        }

        if (!flatNote.track.synthSoundKey) { flatNote.track.synthSoundKey = "BASS1" }//TODO
        let generatedSound = MfGlobals.generatedSounds[flatNote.track.synthSoundKey]
        if (!generatedSound) return //TODO
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
        if (generatedSound.lfo.target === 'VCO1') {
            lfoGain.connect(vco1.detune)
        }
        if (generatedSound.lfo.target === 'VCO2') {
            lfoGain.connect(vco2.detune)
        }
        if (generatedSound.lfo.target === 'VCO3') {
            lfoGain.connect(vco3.detune)
        }
        if (generatedSound.lfo.target === 'FLT') {
            lfoGain.connect(filter.frequency)
        }
        if (generatedSound.lfo.target === 'NOT') { }

        let oct = 1
        let detune = 0
        if (flatNote.fpitch) { //jic
            // console.log ("flatnote pitch"+ flatNote.fpitch )
            oct = Math.pow(2, Math.floor((parseFloat(generatedSound.vco1.octave * 10)) - 5))
            vco1.frequency.value = (oct) * 440.0 * flatNote.fpitch / 4
            detune = Math.pow(2, Math.floor((parseFloat(generatedSound.vco1.detune * 10)) - 5)) / 12
            vco1.detune.value = (detune) * 440.0 * flatNote.fpitch / 4
            vco1.type = generatedSound.vco1.wave.toLowerCase()
            //console.log(vco1.detune.value)
            //console.log(generatedSound.vco1 )

            oct = Math.pow(2, Math.floor((parseFloat(generatedSound.vco2.octave * 10)) - 5))
            vco2.frequency.value = (oct) * 440.0 * flatNote.fpitch / 4
            detune = Math.pow(2, Math.floor((parseFloat(generatedSound.vco1.detune * 10)) - 5)) / 12
            vco2.detune.value = (detune) * 440.0 * flatNote.fpitch / 4
            vco2.type = generatedSound.vco2.wave.toLowerCase()

            oct = Math.pow(2, Math.floor((parseFloat(generatedSound.vco3.octave * 10)) - 5))
            vco3.frequency.value = (oct) * 440.0 * flatNote.fpitch / 4
            detune = Math.pow(2, Math.floor((parseFloat(generatedSound.vco1.detune * 10)) - 5)) / 12
            vco3.detune.value = (detune) * 440.0 * flatNote.fpitch / 4
            vco3.type = generatedSound.vco3.wave.toLowerCase()
        }
        //let finalVol = generatedSound.enveloppe.sustain
        gainVco1.gain.value = generatedSound.vco1.gain
        gainVco2.gain.value = generatedSound.vco2.gain
        gainVco3.gain.value = generatedSound.vco3.gain

        //filter.gain.setValueAtTime(0, time);
        //filter.gain.linearRampToValueAtTime(1, time + generatedSound.enveloppe.attack/2);
        //filter.gain.linearRampToValueAtTime(ggeneratedSound.vco2.gain, time + (generatedSound.enveloppe.attack + generatedSound.enveloppe.decay)/3);
        //filter.gain.linearRampToValueAtTime(0, time + generatedSound.enveloppe.release)

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
        gainAjust.gain.value = flatNote.track.velo //TODO
        gainMain.connect(gainAjust)
        gainAjust.connect(MfGlobals.mfMixer.compressor)

        vco1.start(time)
        vco2.start(time)
        vco3.start(time)

        let mFreq = 2000 * (generatedSound.filter.freq) + 50
        let mQ = 20 * generatedSound.filter.Q + 1
        filter.type = generatedSound.filter.type
        filter.frequency.setValueAtTime(mFreq, time)
        filter.Q.setValueAtTime(mQ, time)
        filter.gain.setValueAtTime(25, time)


        gainMain.gain.setValueAtTime(0, time);
        gainMain.gain.linearRampToValueAtTime(1, time + generatedSound.enveloppe.attack);
        gainMain.gain.linearRampToValueAtTime(generatedSound.enveloppe.sustain, time + generatedSound.enveloppe.attack + generatedSound.enveloppe.decay);
        gainMain.gain.linearRampToValueAtTime(0, time + generatedSound.enveloppe.release)
        // Stop oscillators after release
        vco1.stop(time + generatedSound.enveloppe.release + 0.05);
        vco2.stop(time + generatedSound.enveloppe.release + 0.05);
        vco3.stop(time + generatedSound.enveloppe.release + 0.05);
        //filter.stop(time + generatedSound.enveloppe.release + 0.05);

    }


}