import Utils from '../utils.js'

export default class MfCmd { //should be global or static
    static TAG = "MFCMD"

    constructor() {}

    setBpm = (bpm) => { //ATT duplicate funct
        this.bpm = bpm
        document.getElementById("showTempo").innerText = bpm
        MfGlobals.secondsPerBeat = 60 * 4 / (this.bpm * MfGlobals.TICK)
    }

    isNoteAt = (track, bar, step) => {
        let notes = []
        let ret = null
        Object.values(track.notes).forEach((note) => {
            if (note.step === step && note.bar === bar) {
                notes.push(note)
            }
        })
        return notes
    }

    deleteNote = (track, selNote) => {
        let i = 0
        Object.values(track.notes).forEach((note) => {
            if (note.step === selNote.step && note.bar === selNote.bar) {
                track.notes.splice(i, 1)
            }
            i++
        })
    }

    addNote = (track, bar, step, pitch = 0) => {
        let steppc = Math.round((step * 100) / track.nbStepPerBar)
        let note = {
            "name": "N_" + track.name + "_" + bar + "_" + step,
            "step": step,
            "steppc": steppc,
            "bar": bar,
            "velo": 0.8,
            "pano": 0,
            "pitch": pitch,
            "arp": null,
            "triggFreq": 1,
            "triggPhase": 0,
            "retriggNum": 1,
            "retriggStep": 1,
            "retriggStepMulpt": 1,
            "euclidianFill": 0
        }
        //console.log("mfCmd::add note " + " bar=" + bar + " step=" + step)
        track.notes.push(note)
        return note
    }


    addTrack = (pattern, type) => {
        let newTrack = {
            "name": type,
            "autoSound": true,
            "soundNum": 1,
            "bars": pattern.nbBars,
            "nbStepPerBar": 4,
            "loopPoint": pattern.nbBars * 4,
            "swingRez": 1,
            "swingDepth": 0,
            "velo": 1,
            "veloLfo": null,
            "pitch": 0,
            "pitchLfo": null,
            "pano": this.getPanoFromTrackName(type),
            "panoLfo": null,
            "solo": false,
            "mute": false,
            "generated": false,
            "filterType": "allpass",
            "filterFreqLfo": null,
            "filterFreq": 0,
            "filterQLfo": null,
            "filterQ": 0,
            "notes": []
        }
        newTrack.loopPointBar = Math.floor(newTrack.loopPoint / newTrack.nbStepPerBar)
        newTrack.loopPointStep = newTrack.loopPoint % newTrack.nbStepPerBar
        newTrack.soundNum = this.getSoundNumFromKitAndTrackname(MfGlobals.selectedDrumkit, type)
        pattern.tracks.push(newTrack)
        return newTrack
    }

    addPattern = (name) => {
        let pattern = this.createPattern(name)
        MfGlobals.patterns.push(pattern)
        return pattern
    }

    createPattern = (name) => {
        if (!name) {
            let nb = 0
            if (MfGlobals.patterns.length) {
                nb = MfGlobals.patterns.length
            }
            name = "NewPat_" + nb
        }
        let pattern = {
            "name": name,
            "tracks": [],
            "bpm": 120,
            "nbBars": 4
        }
        this.addTrack(pattern, "KICK")
        this.addTrack(pattern, "SNARE")
        this.addTrack(pattern, "TOM")
        this.addTrack(pattern, "CLAP")
        this.addTrack(pattern, "COW")
        this.addTrack(pattern, "CHH")
        this.addTrack(pattern, "OHH")
        this.addTrack(pattern, "CRASH")
        return pattern
    }

    setSelectedPatternNum = (num) => {
        console.log("mfCmd::setSelectedPatternNum " + num + "=" + MfGlobals.patterns[num].name)
        MfGlobals.selectedPatternNum = num
        let selPattern = MfGlobals.patterns[MfGlobals.selectedPatternNum]
        this.setBpm(selPattern.bpm)
        this.autoAssignSounds(selPattern)
        let flatnotes = MfGlobals.mfPatterns.getFlatNotesFromPattern(MfGlobals.patterns[MfGlobals.selectedPatternNum])
        // console.log(flatnotes)
        MfGlobals.displayBars = 1
    }


    getPanoFromTrackName = (type) => {
        let pano = 0
        switch (type) {
            case "KICK":
                pano = 0
                break;
            case "SNARE":
                pano = 0.3
                break;
            case "TOM":
                pano = 0.5
                break;
            case "CLAP":
                pano = -0.4
                break;
            case "COW":
                pano = 0.4
                break;
            case "CHH":
                pano = -0.3
                break;
            case "OHH":
                pano = -0.2
                break;
            case "CRASH":
                pano = 1
                break;
            default:
                pano = 0
                break;
        }
        return pano
    }


    getTrackFromType = (pattern, type) => {
        let ret = null
        Object.values(pattern.tracks).forEach((track) => {
            if (track.name === type) {
                ret = track
            }
        })
        return ret
    }

    getLfoVal = (lfo, stepBarLoop, initialValue, initialValueMin, initialValueMax) => {
        let freq = (lfo.freqM / lfo.freq) * 16
        let phase = lfo.phase * 2 * Math.PI
        let ret = Math.sin(2 * Math.PI * stepBarLoop / (16 * freq) + phase)
        if (lfo.form == 2) {
            if (ret > 0) {
                ret = 1
            } else {
                ret = -1
            }
        }
        ret = (ret + 1) / 2 //normalize sinus
        //console.log("djtCmd::getLfoVal "+lfo.name+" stepBarLoop= "+ stepBarLoop + "(sin)=>" +parseInt(ret*100))
        ret = (ret * (parseFloat(lfo.max) - parseFloat(lfo.min))) + parseFloat(lfo.min)
        //console.log("djtCmd::getLfoVal "+lfo.name+" stepBarLoop= "+ stepBarLoop + "(sin)=>" +parseInt(ret*100))

        let ampl = (parseFloat(initialValueMax) - parseFloat(initialValueMin))
        ret = (ret * (initialValue + initialValueMin) * ampl)
        ret = parseInt(ret * 100)
        //console.log("djtCmd::getLfoVal "+lfo.name+"("+initialValueMin+","+initialValue+","+initialValueMax+")"+" stepBarLoop= "+ stepBarLoop + "=>" +ret)
        return ret / 100
    }

    autoAssignSounds = (pattern) => {
        if (MfGlobals.audioCtx!=null) {
            Object.values(pattern.tracks).forEach((track, indexTrack) => {
                this.autoAssignTrackSounds(track, indexTrack)
            })
        }
    }

    autoAssignTrackSounds=(track)=>{
          if (track.autoSound === true) {
                let soundNum = this.getSoundNumFromKitAndTrackname(MfGlobals.selectedDrumkit, track.name)
                if (soundNum === -1) {
                    let debugtxt = ""
                    for (let i = 0; i < MfGlobals.sounds.length; i++) {
                        let sound = MfGlobals.sounds[i]
                        if (sound) {
                            if (sound.kit_name === MfGlobals.selectedDrumkit) {
                                debugtxt += sound.key + ","
                            }
                        }
                    }
                    console.log("mfCmd::autoAssignSounds " + track.name + " not found <" + MfGlobals.selectedDrumkit + " : " + debugtxt + "> ")
                }
                //
                if (soundNum === -1) {
                    let newSoundKey = ""
                    //TODO sound equivalence
                    if (soundNum === -1 && track.name === "TOM") {
                        newSoundKey = "MTOM"
                        soundNum = this.getSoundNumFromKitAndTrackname(MfGlobals.selectedDrumkit, newSoundKey)
                    }
                    if (soundNum === -1 && track.name === "TOM") {
                        newSoundKey = "LTOM"
                        soundNum = this.getSoundNumFromKitAndTrackname(MfGlobals.selectedDrumkit, newSoundKey)
                    }
                    if (soundNum === -1 && track.name === "TOM") {
                        newSoundKey = "HTOM"
                        soundNum = this.getSoundNumFromKitAndTrackname(MfGlobals.selectedDrumkit, newSoundKey)
                    }
                    if (soundNum === -1 && track.name === "TOM") {
                        newSoundKey = "BASS"
                        soundNum = this.getSoundNumFromKitAndTrackname(MfGlobals.selectedDrumkit, newSoundKey)
                    }
                    if (soundNum === -1 && track.name === "TOM") {
                        newSoundKey = "MELO"
                        soundNum = this.getSoundNumFromKitAndTrackname(MfGlobals.selectedDrumkit, newSoundKey)
                    }
                    if (soundNum === -1 && track.name === "CRASH") {
                        newSoundKey = "RIDE"
                        soundNum = this.getSoundNumFromKitAndTrackname(MfGlobals.selectedDrumkit, newSoundKey)
                    }
                    if (soundNum === -1 && track.name === "CRASH") {
                        newSoundKey = "CONGAS"
                        soundNum = this.getSoundNumFromKitAndTrackname(MfGlobals.selectedDrumkit, newSoundKey)
                    }
                    if (soundNum === -1 && track.name === "COW") {
                        newSoundKey = "COWBELL"
                        soundNum = this.getSoundNumFromKitAndTrackname(MfGlobals.selectedDrumkit, newSoundKey)
                    }
                    if (soundNum === -1 && track.name === "COW") {
                        newSoundKey = "RIMSHOT"
                        soundNum = this.getSoundNumFromKitAndTrackname(MfGlobals.selectedDrumkit, newSoundKey)
                    }
                    if (soundNum === -1 && track.name === "COW") {
                        newSoundKey = "RIDE"
                        soundNum = this.getSoundNumFromKitAndTrackname(MfGlobals.selectedDrumkit, newSoundKey)
                    }
                    if (soundNum === -1 && track.name === "COW") {
                        newSoundKey = "TIMBAL"
                        soundNum = this.getSoundNumFromKitAndTrackname(MfGlobals.selectedDrumkit, newSoundKey)
                    }

                    if (soundNum === -1 && track.name === "COW") {
                        newSoundKey = "LTOM"
                        soundNum = this.getSoundNumFromKitAndTrackname(MfGlobals.selectedDrumkit, newSoundKey)
                    }
                    if (soundNum === -1 && track.name === "CLAP") {
                        newSoundKey = "LWOODBLOCK"
                        soundNum = this.getSoundNumFromKitAndTrackname(MfGlobals.selectedDrumkit, newSoundKey)
                    }
                    if (soundNum === -1 && track.name === "CLAP") {
                        newSoundKey = "MELO"
                        soundNum = this.getSoundNumFromKitAndTrackname(MfGlobals.selectedDrumkit, newSoundKey)
                    }
                    if (soundNum === -1 && track.name === "CLAP") {
                        newSoundKey = "RIMSHOT"
                        soundNum = this.getSoundNumFromKitAndTrackname(MfGlobals.selectedDrumkit, newSoundKey)
                    }
                    if (soundNum === -1 && track.name === "CLAP") {
                        newSoundKey = "HIT"
                        soundNum = this.getSoundNumFromKitAndTrackname(MfGlobals.selectedDrumkit, newSoundKey)
                    }
                    if (soundNum === -1 && track.name === "CLAP") {
                        newSoundKey = "HTOM"
                        soundNum = this.getSoundNumFromKitAndTrackname(MfGlobals.selectedDrumkit, newSoundKey)
                    }
                    if (soundNum === -1 && track.name === "CHH") {
                        newSoundKey = "MELO"
                        soundNum = this.getSoundNumFromKitAndTrackname(MfGlobals.selectedDrumkit, newSoundKey)
                    }
                    if (soundNum === -1 && track.name === "OHH") {
                        newSoundKey = "TAMBOURINE"
                        soundNum = this.getSoundNumFromKitAndTrackname(MfGlobals.selectedDrumkit, newSoundKey)
                    }
                    if (soundNum === -1 && track.name === "OHH") {
                        newSoundKey = "SGUIRO"
                        soundNum = this.getSoundNumFromKitAndTrackname(MfGlobals.selectedDrumkit, newSoundKey)
                    }
                    console.log("mfCmd::autoAssignSounds " + track.name + " <=" + newSoundKey)
                    soundNum = this.getSoundNumFromKitAndTrackname(MfGlobals.selectedDrumkit, newSoundKey)
                }

                // end sound equivalence
                if (soundNum === -1) {
                    let start = this.getSoundNumFromKitAndTrackname(MfGlobals.selectedDrumkit, "KICK")
                    soundNum = start +Math.floor(Math.random*8) //TODO get from track index num
                    console.error("----------------------mfCmd::autoAssignSounds cannot autoassign " + MfGlobals.selectedDrumkit + ":" + track.name)
                }
                track.soundNum = soundNum
            }
    }

    getSoundNumFromKitAndTrackname = (drumkit, trackName) => {
        let ret = -1
        for (let i = 0; i < MfGlobals.sounds.length; i++) {
            let sound = MfGlobals.sounds[i]
            if (sound) {
                if (sound.kit_name === drumkit) {
                    if (trackName.toUpperCase().includes(sound.key)) {
                        ret = sound.index
                    }
                }
            }
        }
        return ret
    }

    incrDisplayBar = (pattern) => {
        let max = Math.floor(pattern.nbBars / 4) + 1
        MfGlobals.displayBars++
        if (MfGlobals.displayBars >= max) {
            MfGlobals.displayBars = 1
        }
    }

    setNbBar = (pattern, newBar) => {
        let oldBar = pattern.nbBars * pattern.tracks[0].nbStepPerBar
        pattern.nbBars = newBar * 4
        Object.values(pattern.tracks).forEach((track, indexTrack) => {
            if (track.loopPoint >= oldBar) {
                track.loopPoint = pattern.nbBars * track.nbStepPerBar
                track.loopPointBar = Math.floor(track.loopPoint / track.nbStepPerBar)
                track.loopPointStep = track.loopPoint % track.nbStepPerBar
            }
            track.bars = pattern.nbBars
        })
    }

    incrNbStepPerBar = (track) => {
        let loopStepPc = Math.round((track.loopPointStep * 100) / track.nbStepPerBar)
        track.nbStepPerBar++
        if (track.nbStepPerBar > 8) {
            track.nbStepPerBar = 1
        }

        Object.values(track.notes).forEach((note) => {
            note.step = Math.floor((note.steppc / 100) * track.nbStepPerBar)
        })
        track.loopPointStep = Math.floor((loopStepPc / 100) * track.nbStepPerBar)
        track.loopPoint = track.loopPointBar * track.nbStepPerBar + track.loopPointStep
    }

    incrLoopPoint = (track) => {
        track.loopPoint--
        if (track.loopPoint < 1) {
            track.loopPoint = track.nbStepPerBar * track.bars
        }
        track.loopPointBar = Math.floor(track.loopPoint / track.nbStepPerBar)
        track.loopPointStep = track.loopPoint % track.nbStepPerBar
    }

    cleanPattern = (pattern) => { //TODO verify clean
        Object.values(pattern.tracks).forEach((track) => {
            Object.values(track.notes).forEach((note) => {
                note.arp = null
                note = null
            })
            track.notes = []
            track.loopPointStep = 0
            track.loopPointBar = pattern.nbBars
            track.loopPoint = track.loopPointBar * track.nbStepPerBar + track.loopPointStep
        })
    }


    convertAllTo4stepPerBar = () => {
        Object.values(MfGlobals.patterns).forEach((pattern, indexPattern) => {
            Object.values(pattern.tracks).forEach((track, indexTrack) => {
                while (track.nbStepPerBar != 4) { //ATT TODO rewrite
                    this.incrNbStepPerBar(track)
                }
            })
        })
    }

    getAllSoundsByTypes = () => {
        let ret = {}
        for (let i = 0; i < MfGlobals.sounds.length; i++) {
            let sound = MfGlobals.sounds[i]
            if (!ret[sound.key]) { ret[sound.key] = [] }
            ret[sound.key].push(sound)
        }

        return ret
    }

    changeTrackSound = (track, soundNum) => {
        track.soundNum = soundNum
        track.autoSound = false
        track.generated = false
        track.sampleLength = 1
    }

    getSoundNumFromUrl = (url) => {
        let ret = 0
        for (let i = 0; i < MfGlobals.sounds.length; i++) {
            if (MfGlobals.sounds[i].url === url) {
                ret = i
            }
        }
        return ret;
    }

    convertPatternStepToBarStep = (patternStep, nbStepPerBar) => {
        let bar = Math.floor(patternStep / nbStepPerBar)
        let step = patternStep % nbStepPerBar
        return { bar: bar, step: step }
    }

    convertBarStepToPatternStep = (bar, step, nbStepPerBar) => {
        return bar * nbStepPerBar + step
    }

    euclidianFill = (track, startStep, endStep, nb, triggFreq) => {
        let internalStep = Math.floor((endStep - starStep) / nb)
        if (internalStep > 0) {
            let pitch = 0
            let patternStep = startStep + internalStep
            while (patternStep < endStep) {
                let barStep = this.convertPatternStepToBarStep(patternStep)
                this.addNote = (track, barStep.bar, barStep.step, pitch)
                patternStep += internalStep
            }
        }
    }
}