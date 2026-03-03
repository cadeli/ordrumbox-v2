import MfUpdates from '../ihm/mfupdates.js'
import MfSeq from '../mfseq.js'
import MfComponents from '../ihm/mfcomponents.js'
import MfResourcesLoader from '../load/mfresourcesloader.js'


export default class MfCmd { //should be global or static
    static TAG = "MFCMD"

    constructor() {
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
                //console.log("deleteNote deleted  ="+eval(selNote.bar*track.nbStepPerBar+ selNote.step))
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
        let track =this.createTrack(pattern.nbBars, type)
        pattern.tracks.push(track)
        return track
    }

    createTrack = (nbBars, type) => {
        let newTrack = {
            "name": type,
            "autoSound": true,
            "soundNum": 1,
            "bars": nbBars,
            "nbStepPerBar": 4,
            "loopPoint": nbBars * 4,
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
            "auto": false,
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
        if (MfGlobals.drumkitList.length > 7) {
            newTrack.soundNum = this.getSoundNumFromKitAndTrackname(MfGlobals.drumkitList[MfGlobals.selectedDrumkitNum].name, type)
        } else {
            newTrack.soundNum = 0
            console.warn("mfCmd::addTrack  No drumkit list ...")
        }
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

    kitIsloaded = (drumkit) => {//at least one of the sample for the drumkit
        let ret = false
        for (let i = 0; i < MfGlobals.sounds.length; i++) {
            if (MfGlobals.sounds[i].kit_name === drumkit.name) {
                return true
            }
        }
        return ret
    }

    setSelectedDrumkitNum = (num) => {
        console.log("mfCmd::setSelectedDrumkitNum : " + num + " = " + MfGlobals.drumkitList[num].name)
        MfGlobals.selectedDrumkitNum = num
        if (!this.kitIsloaded(MfGlobals.drumkitList[num])) {
            console.log("mfCmd::setSelectedDrumkitNum :  must load kit:", MfGlobals.drumkitList[num].name)
            console.log(MfGlobals.sounds)
            MfGlobals.mfResourcesLoader.loadSamplesFromDrumkit(MfGlobals.drumkitList[num], this.autoAssignsoundsForNewDrumkit)
        } else {
            this.autoAssignsoundsForNewDrumkit()
        }
    }

    autoAssignsoundsForNewDrumkit = () => {
        console.log("mfCmd::autoAssignsoundsForNewDrumkit : ")
        console.log("sounds")
        console.log(MfGlobals.sounds)
        let selPattern = MfGlobals.patterns[MfGlobals.selectedPatternNum]
        MfGlobals.mfSeq.setBpm(selPattern.bpm)
        this.autoAssignSounds(selPattern)
        MfGlobals.mfPatterns.computeFlatNotesFromPattern(selPattern)
        // console.log(MfGlobals.flatNotes )
    }

    setSelectedPatternNum = (num) => {
        console.log("mfCmd::setSelectedPatternNum " + num + " = " + MfGlobals.patterns[num].name)
        MfGlobals.selectedPatternNum = num
        let selPattern = MfGlobals.patterns[MfGlobals.selectedPatternNum]
        MfGlobals.mfSeq.setBpm(selPattern.bpm)
        this.autoAssignSounds(selPattern)
        MfGlobals.mfPatterns.computeFlatNotesFromPattern(selPattern)
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
        if (MfGlobals.sounds.length > 0) {
            if (MfGlobals.audioCtx != null) {
                Object.values(pattern.tracks).forEach((track, indexTrack) => {
                    this.autoAssignTrackSounds(track, indexTrack)
                })
            }
        }
    }

    autoAssignTrackSounds = (track) => {
        const selDrumkitName = MfGlobals.drumkitList[MfGlobals.selectedDrumkitNum].name
        if (track.autoSound === true) {
            let soundNum = this.getSoundNumFromKitAndTrackname(selDrumkitName, track.name)
            if (soundNum === -1) {
                let debugtxt = ""
                for (let i = 0; i < MfGlobals.sounds.length; i++) {
                    let sound = MfGlobals.sounds[i]
                    if (sound) {
                        if (sound.kit_name === selDrumkitName) {
                            debugtxt += sound.key + ","
                        }
                    }
                }
                console.log("mfCmd::autoAssignSounds " + track.name + " not found <" + selDrumkitName + " : " + debugtxt + "> ")
            }
            //
            if (soundNum === -1) {
                let newSoundKey = ""
                //TODO sound equivalence
                if (soundNum === -1 && track.name === "TOM") {
                    newSoundKey = "MTOM"
                    soundNum = this.getSoundNumFromKitAndTrackname(selDrumkitName, newSoundKey)
                }
                if (soundNum === -1 && track.name === "TOM") {
                    newSoundKey = "LTOM"
                    soundNum = this.getSoundNumFromKitAndTrackname(selDrumkitName, newSoundKey)
                }
                if (soundNum === -1 && track.name === "TOM") {
                    newSoundKey = "HTOM"
                    soundNum = this.getSoundNumFromKitAndTrackname(selDrumkitName, newSoundKey)
                }
                if (soundNum === -1 && track.name === "TOM") {
                    newSoundKey = "BASS"
                    soundNum = this.getSoundNumFromKitAndTrackname(selDrumkitName, newSoundKey)
                }
                if (soundNum === -1 && track.name === "TOM") {
                    newSoundKey = "MELO"
                    soundNum = this.getSoundNumFromKitAndTrackname(selDrumkitName, newSoundKey)
                }
                if (soundNum === -1 && track.name === "CRASH") {
                    newSoundKey = "RIDE"
                    soundNum = this.getSoundNumFromKitAndTrackname(selDrumkitName, newSoundKey)
                }
                if (soundNum === -1 && track.name === "CRASH") {
                    newSoundKey = "CONGAS"
                    soundNum = this.getSoundNumFromKitAndTrackname(selDrumkitName, newSoundKey)
                }
                if (soundNum === -1 && track.name === "COW") {
                    newSoundKey = "COWBELL"
                    soundNum = this.getSoundNumFromKitAndTrackname(selDrumkitName, newSoundKey)
                }
                if (soundNum === -1 && track.name === "COW") {
                    newSoundKey = "RIMSHOT"
                    soundNum = this.getSoundNumFromKitAndTrackname(selDrumkitName, newSoundKey)
                }
                if (soundNum === -1 && track.name === "COW") {
                    newSoundKey = "RIDE"
                    soundNum = this.getSoundNumFromKitAndTrackname(selDrumkitName, newSoundKey)
                }
                if (soundNum === -1 && track.name === "COW") {
                    newSoundKey = "TIMBAL"
                    soundNum = this.getSoundNumFromKitAndTrackname(selDrumkitName, newSoundKey)
                }

                if (soundNum === -1 && track.name === "COW") {
                    newSoundKey = "LTOM"
                    soundNum = this.getSoundNumFromKitAndTrackname(selDrumkitName, newSoundKey)
                }
                if (soundNum === -1 && track.name === "CLAP") {
                    newSoundKey = "LWOODBLOCK"
                    soundNum = this.getSoundNumFromKitAndTrackname(selDrumkitName, newSoundKey)
                }
                if (soundNum === -1 && track.name === "CLAP") {
                    newSoundKey = "MELO"
                    soundNum = this.getSoundNumFromKitAndTrackname(selDrumkitName, newSoundKey)
                }
                if (soundNum === -1 && track.name === "CLAP") {
                    newSoundKey = "RIMSHOT"
                    soundNum = this.getSoundNumFromKitAndTrackname(selDrumkitName, newSoundKey)
                }
                if (soundNum === -1 && track.name === "CLAP") {
                    newSoundKey = "HIT"
                    soundNum = this.getSoundNumFromKitAndTrackname(selDrumkitName, newSoundKey)
                }
                if (soundNum === -1 && track.name === "CLAP") {
                    newSoundKey = "HTOM"
                    soundNum = this.getSoundNumFromKitAndTrackname(selDrumkitName, newSoundKey)
                }
                if (soundNum === -1 && track.name === "CHH") {
                    newSoundKey = "MELO"
                    soundNum = this.getSoundNumFromKitAndTrackname(selDrumkitName, newSoundKey)
                }
                if (soundNum === -1 && track.name === "OHH") {
                    newSoundKey = "TAMBOURINE"
                    soundNum = this.getSoundNumFromKitAndTrackname(selDrumkitName, newSoundKey)
                }
                if (soundNum === -1 && track.name === "OHH") {
                    newSoundKey = "SGUIRO"
                    soundNum = this.getSoundNumFromKitAndTrackname(selDrumkitName, newSoundKey)
                }
                if (soundNum === -1 && track.name === "BASS") {
                    newSoundKey = "TOM"
                    soundNum = this.getSoundNumFromKitAndTrackname(selDrumkitName, newSoundKey)
                }
                console.log("mfCmd::autoAssignSounds " + track.name + " <=" + newSoundKey)
                soundNum = this.getSoundNumFromKitAndTrackname(selDrumkitName, newSoundKey)
            }

            // end sound equivalence
            if (soundNum === -1) {
                let start = this.getSoundNumFromKitAndTrackname(selDrumkitName, "KICK")
                soundNum = start + Math.floor(Math.random * 8) //TODO get from track index num
                console.error("mfCmd::autoAssignSounds cannot find from kit:" + selDrumkitName + " nb instr=" + MfGlobals.drumkitList[MfGlobals.selectedDrumkitNum].instruments.length + ":" + track.name)
            }
            track.soundNum = soundNum
        }
    }

    getSoundNumFromKitAndTrackname = (drumkitName, trackName) => {
        let ret = -1
        for (let i = 0; i < MfGlobals.sounds.length; i++) {
            let sound = MfGlobals.sounds[i]
            if (sound) {
                if (sound.kit_name === drumkitName) {
                    if (trackName.toUpperCase().includes(sound.key)) {
                        ret = sound.index
                        //console.log("getSoundNumFromKitAndTrackname match for track:", trackName, " kit:", drumkitName, " key:", sound.key)
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

    compacteTrack = (track) => { //assume 4bars
        let sig = ""
        let sig0 = ""
        let sig1 = ""
        let sig2 = ""
        let sig3 = ""

        // console.log("track len="+track.notes.length)
        for (let i in track.notes) {
            let note = track.notes[i]
            if (note.bar === 0) {
                sig0 += note.step + "_"
            }
            if (note.bar === 1) {
                sig1 += note.step + "_"
            }
            if (note.bar === 2) {
                sig2 += note.step + "_"
            }
            if (note.bar === 3) {
                sig3 += note.step + "_"
            }
            sig += (note.step) + (note.bar) * track.nbStepPerBar
            sig += "_"
        }
        // console.log("track len="+track.notes.length)
        if ((sig0 === sig2) && (sig1 === sig3)) {
            if (sig0 === sig1) {
                if (sig0 === "0_1_2_3_") {
                    this.setLoopAndDelete(track, 16, sig)
                    //console.log("compacte 16 =" + sig + " => " + "0_")
                } else if (sig0 === "0_2_") {
                    this.setLoopAndDelete(track, 8, sig)
                    //console.log("compacte 8 =" + sig + " => " + "0__")
                } else if (sig0 === "1_3_") {
                    this.setLoopAndDelete(track, 8, sig)
                    // console.log("compacte 8 =" + sig + " => " + "1__")
                } else {
                    this.setLoopAndDelete(track, 4, sig)
                    //console.log("compacte 4 =" + sig + " => " + sig0)
                }
            } else if ((sig0 + sig1) === (sig2 + sig3)) {
                this.setLoopAndDelete(track, 2, sig)
                //console.log("compacte 2 =" + sig + " => " + sig0 + sig1)
            }
        }
        //  console.log("track len="+track.notes.length+" sig="+sig)
    }

    setLoopAndDelete = (track, nb, sig) => {
        if (nb === 2) {
            track.loopPoint = 2 * track.nbStepPerBar
        } else if (nb === 4) {
            track.loopPoint = 1 * track.nbStepPerBar
        } else if (nb === 8) {
            track.loopPoint = 2
        } else if (nb === 16) {
            track.loopPoint = 1
        } else {
            console.error("error setLoopAndDelete nb=" + nb)
        }
        for (let i = 0; i < 4; i++) { //delete in list (argh)
            for (let ii in track.notes) {
                let note = track.notes[ii]
                let th = eval(note.bar * track.nbStepPerBar + note.step)
                //  console.log("test to delete >"+sig+"< nb="+nb+ " from"+ th+ " on "+ track.loopPoint + " nbnotes="+track.notes.length)
                if (th >= eval(track.loopPoint)) {
                    MfGlobals.mfUpdates.mfCmd.deleteNote(track, note)
                }
            }
        }
    }

    compareTrack = (track, refTrack) => {
        if (track.name === refTrack.name) {
            if (track.notes.length != refTrack.notes.length) {
                return false
            }
            for (let i in track.notes) { //ignore velo, pano and effects
                if (track.notes[i].name != refTrack.notes[i].name) {
                    return false
                }
            }
            console.log("compareTrack track equal " + track.name + "=" + refTrack.name)
            return true
        }
        return false
    }

}