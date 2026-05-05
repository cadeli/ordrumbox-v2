import { MfGlobals } from '../mfglobals.js'

export default class MfCmd {
    static TAG = "MFCMD"

    constructor() {
    }

    // Safe updater for track properties
    // Accepts a track object and a updates object. Only whitelisted keys are applied.
    // Extra or unknown keys are ignored gracefully to avoid runtime errors when callers
    // pass a larger payload (bars, stepsPerBar, pan, reverbAmount, etc.).
    updateTrack = (track, updates) => {
        if (!track || !updates || typeof updates !== 'object') {
            return track
        }
        // Split keys into structural vs extra updates to support multi-step updates
        const STRUCT_KEYS = new Set(['name', 'soundId', 'bars', 'stepsPerBar', 'loopAtStep', 'useSoftSynth', 'mono', 'mute', 'solo', 'auto'])
        const EXTRA_KEYS = new Set(['pan', 'panLfo', 'velocity', 'velocityLfo', 'pitch', 'pitchLfo', 'reverbType', 'reverbAmount', 'saturationType', 'saturationAmount', 'sampleLength', 'synthSoundKey', 'swingResolution', 'swingAmount', 'trackLength', 'filterType', 'filterFreqLfo', 'filterFreq', 'filterQLfo', 'filterQ'])
        const ignoredKeys = []

        // First apply structural keys (phase 1)
        for (const [k, v] of Object.entries(updates)) {
            if (STRUCT_KEYS.has(k)) {
                track[k] = v
            }
        }
        // Then apply extra keys (phase 2)
        for (const [k, v] of Object.entries(updates)) {
            if (EXTRA_KEYS.has(k)) {
                // Apply pan even if it's 0; 0 means center and is a valid value when provided explicitly
                track[k] = v
            }
        }
        // Any key not in either set is ignored
        for (const k of Object.keys(updates)) {
            if (!STRUCT_KEYS.has(k) && !EXTRA_KEYS.has(k)) {
                ignoredKeys.push(k)
            }
        }

       
        // Recompute derived fields if needed
        if (typeof track.stepsPerBar === 'number' && typeof track.loopAtStep === 'number') {
            track.loopPointBar = Math.floor(track.loopAtStep / track.stepsPerBar)
            track.loopPointStep = track.loopAtStep % track.stepsPerBar
        }
        if (typeof track.loopAtStep === 'undefined' && typeof track.loopPointBar === 'number' && typeof track.stepsPerBar === 'number') {
            track.loopAtStep = track.loopPointBar * track.stepsPerBar + (track.loopPointStep ?? 0)
        }
        return track
    }

    isNoteAt = (track, bar, stepInBar) => {
        let notes = []
        let ret = null
        Object.values(track.notes).forEach((note) => {
            if (note.stepInBar === stepInBar && note.bar === bar) {
                notes.push(note)
            }
        })
        return notes
    }

    deleteNote = (track, selNote) => {
        let i = 0
        Object.values(track.notes).forEach((note) => {
            if (note.stepInBar === selNote.stepInBar && note.bar === selNote.bar) {
                track.notes.splice(i, 1)
                //console.log("deleteNote deleted  ="+(selNote.bar*track.stepsPerBar+ selNote.stepInBar))
            }
            i++
        })
    }

    addNote = (track, bar, stepInBar, pitch = 0) => {
        //console.log("mfCmd::add note " +track.name+ " at " + bar + ":" + stepInBar + " p="+pitch)
        let steppc = Math.round((stepInBar * 100) / track.stepsPerBar)
        //
        if (steppc > 100) { //TODO
            track.stepsPerBar = 8 //max value
            steppc = Math.round((stepInBar * 100) / track.stepsPerBar)
        }
        //
        let note = {
            "stepInBar": stepInBar,
            "steppc": steppc,
            "bar": bar,
            "velocity": 0.8,
            "pan": 0,
            "pitch": pitch,
            "arp": null,
            "triggerFreq": 1,
            "triggerPhase": 0,
            "retriggerNum": 1,
            "retriggStep": 1,
            "euclidianFill": 0
        }
       // console.log("mfCmd::add note " + track.name + " bar=" + bar + " step=" + stepInBar)
        track.notes.push(note)
        return note
    }

    addTrack = (pattern, type, stepsPerBar = 4) => {
       // console.log("mfCmd::addTrack " + pattern.name + " = " + type)

        let track = this.createTrack(pattern.nbBars, type, stepsPerBar);
        pattern.tracks.push(track)
        return track
    }

    createTrack = (nbBars, type, stepsPerBar = 4) => {
        let newTrack = {
            "name": type,
            "useAutoAssignSound": true,
            "soundId": "NOT_DEFINED",
            "bars": nbBars,
            "stepsPerBar": stepsPerBar,
            "loopAtStep": nbBars * stepsPerBar,
            "swingResolution": 1,
            "swingAmount": 0,
            "velocity": 1,
            "velocityLfo": null,
            "pitch": 0,
            "pitchLfo": null,
            "pan": this.getPanoFromTrackName(type),
            "panLfo": null,
            "solo": false,
            "mute": false,
            "auto": false,
            "useSoftSynth": false,
            "mono": false,
            "filterType": "allpass",
            "filterFreqLfo": null,
            "filterFreq": 20,
            "filterQLfo": null,
            "filterQ": 0.707,
            "reverbType": "none",
            "reverbAmount": 0,
            "saturationType": "soft",
            "saturationAmount": 0,
            "notes": []
        }
        newTrack.loopPointBar = Math.floor(newTrack.loopAtStep / newTrack.stepsPerBar)
        newTrack.loopPointStep = newTrack.loopAtStep % newTrack.stepsPerBar
        return newTrack
    }

    addPattern = (name) => {
        let pattern = this.createPattern(name)
        MfGlobals.patterns.push(pattern)
        return pattern
    }

    getPatternByName = (name) => {
        const normalizedName = String(name ?? '').trim().toUpperCase()
        return MfGlobals.patterns.find((pattern) => pattern?.name?.toUpperCase() === normalizedName) ?? null
    }

    resetPatternTracks = (pattern) => {
        pattern.tracks = []
    }

    setPatternName = (pattern, name) => {
        pattern.name = name
        return pattern
    }

    getPatternName = (pattern) => pattern?.name ?? ''

    setPatternBpm = (pattern, bpm) => {
        pattern.bpm = Number(bpm) || 120
        return pattern
    }

    getPatternBpm = (pattern) => Number(pattern?.bpm ?? 120)

    setPatternBars = (pattern, nbBars) => {
        pattern.nbBars = Number(nbBars) || 4
        return pattern
    }

    getPatternBars = (pattern) => Number(pattern?.nbBars ?? 4)

    setPatternDescription = (pattern, description) => {
        pattern.description = String(description ?? '')
        return pattern
    }

    getPatternDescription = (pattern) => String(pattern?.description ?? '')

    setPatternMetadata = (pattern, sourcePattern) => {
        if (sourcePattern.application) {
            pattern.application = sourcePattern.application
        }
        if (sourcePattern.url) {
            pattern.url = sourcePattern.url
        }
        if (sourcePattern.tags) {
            pattern.tags = { ...sourcePattern.tags }
        }
        return pattern
    }

    setTrackProps = (track, sourceTrack) => {
        const knownProps = [
            "useAutoAssignSound", "soundId", "bars", "nbBars", "stepsPerBar", "loopAtStep",
            "swingResolution", "swingAmount", "velocity", "velocityLfo", "pitch", "pitchLfo",
            "pan", "panLfo", "solo", "mute", "auto", "useSoftSynth", "mono",
            "filterType", "filterFreqLfo", "filterFreq", "filterQLfo", "filterQ", "filterLfoFreq",
            "reverbType", "reverbAmount", "saturationType", "saturationAmount", "sampleLength", "synthSoundKey"
        ];
        
        if ("useAutoAssignSound" in sourceTrack) track.useAutoAssignSound = sourceTrack.useAutoAssignSound
        if ("soundId" in sourceTrack) track.soundId = sourceTrack.soundId
        if ("bars" in sourceTrack) track.bars = sourceTrack.bars
        else if ("nbBars" in sourceTrack) track.bars = sourceTrack.nbBars
        if ("stepsPerBar" in sourceTrack) track.stepsPerBar = sourceTrack.stepsPerBar
        if ("loopAtStep" in sourceTrack) track.loopAtStep = sourceTrack.loopAtStep
        else track.loopAtStep = track.bars * track.stepsPerBar
        if ("swingResolution" in sourceTrack) track.swingResolution = sourceTrack.swingResolution
        if ("swingAmount" in sourceTrack) track.swingAmount = sourceTrack.swingAmount
        if ("velocity" in sourceTrack) track.velocity = sourceTrack.velocity
        if ("velocityLfo" in sourceTrack) track.velocityLfo = sourceTrack.velocityLfo
        if ("pitch" in sourceTrack) track.pitch = sourceTrack.pitch
        if ("pitchLfo" in sourceTrack) track.pitchLfo = sourceTrack.pitchLfo
        if ("pan" in sourceTrack) track.pan = sourceTrack.pan
        if ("panLfo" in sourceTrack) track.panLfo = sourceTrack.panLfo
        if ("solo" in sourceTrack) track.solo = sourceTrack.solo
        if ("mute" in sourceTrack) track.mute = sourceTrack.mute
        if ("auto" in sourceTrack) track.auto = sourceTrack.auto
        if ("useSoftSynth" in sourceTrack) track.useSoftSynth = sourceTrack.useSoftSynth
        if ("mono" in sourceTrack) track.mono = sourceTrack.mono
        else delete track.mono
        if ("filterType" in sourceTrack) track.filterType = sourceTrack.filterType
        if ("filterFreqLfo" in sourceTrack) track.filterFreqLfo = sourceTrack.filterFreqLfo
        if ("filterFreq" in sourceTrack) track.filterFreq = sourceTrack.filterFreq
        if ("filterQLfo" in sourceTrack) track.filterQLfo = sourceTrack.filterQLfo
        if ("filterQ" in sourceTrack) track.filterQ = sourceTrack.filterQ
        if ("filterLfoFreq" in sourceTrack) track.filterLfoFreq = sourceTrack.filterLfoFreq
        else delete track.filterLfoFreq
        if ("reverbType" in sourceTrack) track.reverbType = sourceTrack.reverbType
        else delete track.reverbType
        if ("reverbAmount" in sourceTrack) track.reverbAmount = sourceTrack.reverbAmount
        else delete track.reverbAmount
        if ("saturationType" in sourceTrack) track.saturationType = sourceTrack.saturationType
        else delete track.saturationType
        if ("saturationAmount" in sourceTrack) track.saturationAmount = sourceTrack.saturationAmount
        else delete track.saturationAmount
        if ("sampleLength" in sourceTrack) track.sampleLength = sourceTrack.sampleLength
        if ("synthSoundKey" in sourceTrack) track.synthSoundKey = sourceTrack.synthSoundKey
        else delete track.synthSoundKey
        track.loopPointBar = Math.floor(track.loopAtStep / track.stepsPerBar)
        track.loopPointStep = track.loopAtStep % track.stepsPerBar
        return track
    }

    getTrackName = (track) => track?.name ?? ''

    setNoteProps = (note, sourceNote, track) => {
        if (sourceNote.stepInBar !== undefined) note.stepInBar = sourceNote.stepInBar
        else if (sourceNote.step !== undefined) note.stepInBar = sourceNote.step
        if (sourceNote.bar !== undefined) note.bar = sourceNote.bar
        if (sourceNote.velocity !== undefined) note.velocity = sourceNote.velocity
        if (sourceNote.pan !== undefined) note.pan = sourceNote.pan
        if (sourceNote.pitch !== undefined) note.pitch = sourceNote.pitch
        if (sourceNote.arp !== undefined) note.arp = sourceNote.arp
        if (sourceNote.triggerFreq !== undefined) note.triggerFreq = sourceNote.triggerFreq
        if (sourceNote.triggerPhase !== undefined) note.triggerPhase = sourceNote.triggerPhase
        if (sourceNote.retriggerNum !== undefined) note.retriggerNum = sourceNote.retriggerNum
        if (sourceNote.retriggStep !== undefined) note.retriggStep = sourceNote.retriggStep
        if (sourceNote.euclidianFill !== undefined) note.euclidianFill = sourceNote.euclidianFill
        if (sourceNote.steppc !== undefined) note.steppc = sourceNote.steppc
        else note.steppc = Math.round((note.stepInBar * 100) / track.stepsPerBar)
        return note
    }

    importPatternFromJson = (sourcePattern) => {
        const patternName = sourcePattern?.name ?? undefined
        const importedPattern = this.addPattern(patternName)

        this.setPatternName(importedPattern, patternName ?? this.getPatternName(importedPattern))
        this.setPatternBpm(importedPattern, sourcePattern?.bpm ?? this.getPatternBpm(importedPattern))
        this.setPatternBars(importedPattern, sourcePattern?.nbBars ?? this.getPatternBars(importedPattern))
        this.setPatternMetadata(importedPattern, sourcePattern ?? {})
        
        if (!("description" in sourcePattern)) {
            delete importedPattern.description
        } else if (sourcePattern.description !== "") {
            importedPattern.description = sourcePattern.description
        } else {
            delete importedPattern.description
        }
        
        this.resetPatternTracks(importedPattern)

        Object.values(sourcePattern?.tracks ?? []).forEach((sourceTrack) => {
            const track = this.addTrack(importedPattern, sourceTrack.name)
            this.setTrackProps(track, sourceTrack)

            Object.values(sourceTrack.notes ?? []).forEach((sourceNote) => {
                const note = this.addNote(
                    track,
                    Number(sourceNote.bar ?? 0),
                    Number(sourceNote.stepInBar ?? sourceNote.step ?? 0),
                    Number(sourceNote.pitch ?? 0)
                )
                this.setNoteProps(note, sourceNote, track)
            })
        })

        return importedPattern
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
            "description": "",
            "tracks": [],
            "bpm": 120,
            "nbBars": 4
        }
        return pattern
    }

    kitIsLoaded = (drumkit) => {
        return Object.values(MfGlobals.sounds).some(sound => sound.kit_name === drumkit.name);
    }

    setSelectedDrumkitNum = (num) => {
        console.log("mfCmd::setSelectedDrumkitNum : " + num + " = " + MfGlobals.drumkitList[num].name)
        MfGlobals.selectedDrumkitNum = num
        if (!this.kitIsLoaded(MfGlobals.drumkitList[num])) {
            console.log("mfCmd::setSelectedDrumkitNum :  must load kit:", MfGlobals.drumkitList[num].name)
            console.log(MfGlobals.sounds)
            MfGlobals.mfResourcesLoader.loadSamplesFromDrumkit(MfGlobals.drumkitList[num], this.autoAssignsoundsForNewDrumkit)
        } else {
            this.autoAssignsoundsForNewDrumkit()
        }
    }

    autoAssignsoundsForNewDrumkit = async () => {
        console.log("mfCmd::autoAssignsoundsForNewDrumkit :sounds")
        console.log(MfGlobals.sounds)
        let selPattern = MfGlobals.patterns[MfGlobals.selectedPatternNum]
        MfGlobals.mfSeq.setBpm(selPattern.bpm)
        const mfAutoAssign = await MfGlobals.getAutoAssign()
        mfAutoAssign.autoAssignSounds(selPattern)
        MfGlobals.mfPatterns.computeFlatNotesFromPattern(selPattern)
        // console.log(MfGlobals.flatNotes )
    }

    setSelectedPatternNum = async (num) => {
        if (MfGlobals.patterns.length > 0) {
            console.log("mfCmd::setSelectedPatternNum " + num + " = " + MfGlobals.patterns[num].name)
            MfGlobals.selectedPatternNum = num
            let selPattern = MfGlobals.patterns[MfGlobals.selectedPatternNum]
            MfGlobals.mfSeq.setBpm(selPattern.bpm)
            if (Object.keys(MfGlobals.sounds).length > 0) {
                const mfAutoAssign = await MfGlobals.getAutoAssign()
                mfAutoAssign.autoAssignSounds(selPattern)
            }
            MfGlobals.mfPatterns.computeFlatNotesFromPattern(selPattern)
            // console.log(flatnotes)
            MfGlobals.displayBars = 1
        }
    }


    getPanoFromTrackName = (type) => {
        let pan = 0
        switch (type) {
            case "KICK":
                pan = 0
                break;
            case "SNARE":
                pan = 0.3
                break;
            case "TOM":
                pan = 0.5
                break;
            case "CLAP":
                pan = -0.4
                break;
            case "COWBELL":
                pan = 0.4
                break;
            case "CHH":
                pan = -0.3
                break;
            case "OHH":
                pan = -0.2
                break;
            case "CRASH":
                pan = 1
                break;
            default:
                pan = 0
                break;
        }
        return pan
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



    incrDisplayBar = (pattern) => {
        let max = Math.floor(pattern.nbBars / 4) + 1
        MfGlobals.displayBars++
        if (MfGlobals.displayBars >= max) {
            MfGlobals.displayBars = 1
        }
    }

    setNbBar = (pattern, newBar) => {
        let oldBar = pattern.nbBars * pattern.tracks[0].stepsPerBar
        pattern.nbBars = newBar * 4
        Object.values(pattern.tracks).forEach((track, indexTrack) => {
            if (track.loopAtStep >= oldBar) {
                track.loopAtStep = pattern.nbBars * track.stepsPerBar
                track.loopPointBar = Math.floor(track.loopAtStep / track.stepsPerBar)
                track.loopPointStep = track.loopAtStep % track.stepsPerBar
            }
            track.bars = pattern.nbBars
        })
    }

    incrNbStepPerBar = (track) => {
        let loopStepPc = Math.round((track.loopPointStep * 100) / track.stepsPerBar)
        track.stepsPerBar++
        if (track.stepsPerBar > 8) {
            track.stepsPerBar = 1
        }

        Object.values(track.notes).forEach((note) => {
            note.stepInBar = Math.floor((note.steppc / 100) * track.stepsPerBar)
        })
        track.loopPointStep = Math.floor((loopStepPc / 100) * track.stepsPerBar)
        track.loopAtStep = track.loopPointBar * track.stepsPerBar + track.loopPointStep
    }

    incrLoopPoint = (track) => {
        track.loopAtStep--
        if (track.loopAtStep < 1) {
            track.loopAtStep = track.stepsPerBar * track.bars
        }
        track.loopPointBar = Math.floor(track.loopAtStep / track.stepsPerBar)
        track.loopPointStep = track.loopAtStep % track.stepsPerBar
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
            track.loopAtStep = track.loopPointBar * track.stepsPerBar + track.loopPointStep
        })
    }


    convertAllTo4stepPerBar = () => {
        Object.values(MfGlobals.patterns).forEach((pattern, indexPattern) => {
            Object.values(pattern.tracks).forEach((track, indexTrack) => {
                while (track.stepsPerBar != 4) { //ATT TODO rewrite
                    this.incrNbStepPerBar(track)
                }
            })
        })
    }

  getAllSoundsForType(soundKey) {
    let retSounds = []
     for (const soundId in MfGlobals.sounds) {
        if (MfGlobals.sounds[soundId].key === soundKey) {
            retSounds.push(MfGlobals.sounds[soundId])
        }
     }
     return retSounds
  }

    changeTrackSound = (track, soundId) => {
        track.soundId = soundId
        track.useAutoAssignSound = false
        track.useSoftSynth = false
        track.sampleLength = 1
    }

    changeTrackName = (track, newName) => {
        track.name = newName
        track.sampleLength = 1
    }

    getSoundIdFromUrl = (url) => {
        for (const soundId in MfGlobals.sounds) {
            if (MfGlobals.sounds[soundId].url === url) {
                return soundId;
            }
        }
        return "NOT_FOUND";
    }

    convertPatternStepToBarStep = (patternStep, stepsPerBar) => {
        let bar = Math.floor(patternStep / stepsPerBar)
        let step = patternStep % stepsPerBar
        return { bar: bar, step: step }
    }

    convertBarStepToPatternStep = (bar, step, stepsPerBar) => {
        return bar * stepsPerBar + step
    }

    euclidianFill = (track, startStep, endStep, nb, triggerFreq) => {
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
                sig0 += note.stepInBar + "_"
            }
            if (note.bar === 1) {
                sig1 += note.stepInBar + "_"
            }
            if (note.bar === 2) {
                sig2 += note.stepInBar + "_"
            }
            if (note.bar === 3) {
                sig3 += note.stepInBar + "_"
            }
            sig += (note.stepInBar) + (note.bar) * track.stepsPerBar
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
            track.loopAtStep = 2 * track.stepsPerBar
        } else if (nb === 4) {
            track.loopAtStep = 1 * track.stepsPerBar
        } else if (nb === 8) {
            track.loopAtStep = 2
        } else if (nb === 16) {
            track.loopAtStep = 1
        } else {
            console.error("error setLoopAndDelete nb=" + nb)
        }
        for (let i = 0; i < 4; i++) { //delete in list (argh)
            for (let ii in track.notes) {
                let note = track.notes[ii]
                let th = parseInt(note.bar) * parseInt(track.stepsPerBar) + parseInt(note.stepInBar)
                //  console.log("test to delete >"+sig+"< nb="+nb+ " from"+ th+ " on "+ track.loopAtStep + " nbnotes="+track.notes.length)
                if (th >= parseInt(track.loopAtStep)) {
                    const ret = MfGlobals.mfCmd.deleteNote(track, note)
                }
            }
        }
    }

    compareTrack = (track, refTrack) => {
        if (track.name === refTrack.name) {
            if (track.notes.length != refTrack.notes.length) {
                return false
            }
            for (let i in track.notes) { //ignore velocity, pan and effects
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
