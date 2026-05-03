import { MfGlobals } from '../mfglobals.js'

export default class MfCmd {
    static TAG = "MFCMD"

    constructor() {
    }

    // Safe updater for track properties
    // Accepts a track object and a updates object. Only whitelisted keys are applied.
    // Extra or unknown keys are ignored gracefully to avoid runtime errors when callers
    // pass a larger payload (bars, nbStepPerBar, pano, reverbAmount, etc.).
    updateTrack = (track, updates) => {
        if (!track || !updates || typeof updates !== 'object') {
            return track
        }
        // Split keys into structural vs extra updates to support multi-step updates
        const STRUCT_KEYS = new Set(['name', 'soundId', 'bars', 'nbStepPerBar', 'loopPoint', 'generated', 'mono', 'mute', 'solo', 'auto'])
        const EXTRA_KEYS = new Set(['pano', 'panoLfo', 'velo', 'veloLfo', 'pitch', 'pitchLfo', 'reverbType', 'reverbAmount', 'saturationType', 'saturationAmount', 'sampleLength', 'synthSoundKey', 'swingRez', 'swingDepth', 'trackLength', 'filterType', 'filterFreqLfo', 'filterFreq', 'filterQLfo', 'filterQ'])
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
                // Apply pano even if it's 0; 0 means center and is a valid value when provided explicitly
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
        if (typeof track.nbStepPerBar === 'number' && typeof track.loopPoint === 'number') {
            track.loopPointBar = Math.floor(track.loopPoint / track.nbStepPerBar)
            track.loopPointStep = track.loopPoint % track.nbStepPerBar
        }
        if (typeof track.loopPoint === 'undefined' && typeof track.loopPointBar === 'number' && typeof track.nbStepPerBar === 'number') {
            track.loopPoint = track.loopPointBar * track.nbStepPerBar + (track.loopPointStep ?? 0)
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
                //console.log("deleteNote deleted  ="+(selNote.bar*track.nbStepPerBar+ selNote.stepInBar))
            }
            i++
        })
    }

    addNote = (track, bar, stepInBar, pitch = 0) => {
        //console.log("mfCmd::add note " +track.name+ " at " + bar + ":" + stepInBar + " p="+pitch)
        let steppc = Math.round((stepInBar * 100) / track.nbStepPerBar)
        //
        if (steppc > 100) { //TODO
            track.nbStepPerBar = 8 //max value
            steppc = Math.round((stepInBar * 100) / track.nbStepPerBar)
        }
        //
        let note = {
            "name": "N_" + track.name + "_" + bar + "_" + stepInBar,
            "stepInBar": stepInBar,
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
            "euclidianFill": 0
        }
       // console.log("mfCmd::add note " + track.name + " bar=" + bar + " step=" + stepInBar)
        track.notes.push(note)
        return note
    }

    addTrack = (pattern, type) => {
       // console.log("mfCmd::addTrack " + pattern.name + " = " + type)

        let track = this.createTrack(pattern.nbBars, type)
        pattern.tracks.push(track)
        return track
    }

    createTrack = (nbBars, type) => {
        let newTrack = {
            "name": type,
            "autoSound": true,
            "soundId": "",
            "bars": nbBars,
            "nbStepPerBar": 8,
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
        newTrack.loopPointBar = Math.floor(newTrack.loopPoint / newTrack.nbStepPerBar)
        newTrack.loopPointStep = newTrack.loopPoint % newTrack.nbStepPerBar
        newTrack.soundId = ""
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
        if (sourceTrack.pano===0) {
            sourceTrack.pano=0.1
        }
        if (track.pano===0) {
            track.pano=0.1
        }
        track.autoSound = sourceTrack.autoSound ?? track.autoSound
        track.soundId = sourceTrack.soundId ?? track.soundId
        track.bars = sourceTrack.bars ?? sourceTrack.nbBars ?? track.bars
        track.nbStepPerBar = sourceTrack.nbStepPerBar ?? track.nbStepPerBar
        track.loopPoint = sourceTrack.loopPoint ?? (track.bars * track.nbStepPerBar)
        track.swingRez = sourceTrack.swingRez ?? track.swingRez
        track.swingDepth = sourceTrack.swingDepth ?? track.swingDepth
        track.velo = sourceTrack.velo ?? track.velo
        track.veloLfo = sourceTrack.veloLfo ?? track.veloLfo
        track.pitch = sourceTrack.pitch ?? track.pitch
        track.pitchLfo = sourceTrack.pitchLfo ?? track.pitchLfo
        track.pano = sourceTrack.pano ?? track.pano
        track.panoLfo = sourceTrack.panoLfo ?? track.panoLfo
        track.solo = sourceTrack.solo ?? track.solo
        track.mute = sourceTrack.mute ?? track.mute
        track.auto = sourceTrack.auto ?? track.auto
        track.generated = sourceTrack.generated ?? track.generated
        track.mono = sourceTrack.mono ?? track.mono
        track.filterType = sourceTrack.filterType ?? track.filterType
        track.filterFreqLfo = sourceTrack.filterFreqLfo ?? track.filterFreqLfo
        track.filterFreq = sourceTrack.filterFreq ?? track.filterFreq
        track.filterQLfo = sourceTrack.filterQLfo ?? track.filterQLfo
        track.filterQ = sourceTrack.filterQ ?? track.filterQ
        track.reverbType = sourceTrack.reverbType ?? track.reverbType
        track.reverbAmount = sourceTrack.reverbAmount ?? track.reverbAmount
        track.saturationType = sourceTrack.saturationType ?? track.saturationType
        track.saturationAmount = sourceTrack.saturationAmount ?? track.saturationAmount
        track.sampleLength = sourceTrack.sampleLength ?? track.sampleLength
        track.synthSoundKey = sourceTrack.synthSoundKey ?? track.synthSoundKey
        track.loopPointBar = Math.floor(track.loopPoint / track.nbStepPerBar)
        track.loopPointStep = track.loopPoint % track.nbStepPerBar
        return track
    }

    getTrackName = (track) => track?.name ?? ''

    setNoteProps = (note, sourceNote, track) => {
        note.name = sourceNote.name ?? note.name
        note.stepInBar = sourceNote.stepInBar ?? sourceNote.step ?? note.stepInBar
        note.bar = sourceNote.bar ?? note.bar
        note.velo = sourceNote.velo ?? note.velo
        note.pano = sourceNote.pano ?? note.pano
        note.pitch = sourceNote.pitch ?? note.pitch
        note.arp = sourceNote.arp ?? note.arp
        note.triggFreq = sourceNote.triggFreq ?? note.triggFreq
        note.triggPhase = sourceNote.triggPhase ?? note.triggPhase
        note.retriggNum = sourceNote.retriggNum ?? note.retriggNum
        note.retriggStep = sourceNote.retriggStep ?? note.retriggStep
        note.euclidianFill = sourceNote.euclidianFill ?? note.euclidianFill
        note.steppc = sourceNote.steppc ?? Math.round((note.stepInBar * 100) / track.nbStepPerBar)
        return note
    }

    importPatternFromJson = (sourcePattern) => {
        const patternName = sourcePattern?.name ?? undefined
        const importedPattern = this.addPattern(patternName)

        this.setPatternName(importedPattern, patternName ?? this.getPatternName(importedPattern))
        this.setPatternBpm(importedPattern, sourcePattern?.bpm ?? this.getPatternBpm(importedPattern))
        this.setPatternBars(importedPattern, sourcePattern?.nbBars ?? this.getPatternBars(importedPattern))
        this.setPatternMetadata(importedPattern, sourcePattern ?? {})
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
            case "COWBELL":
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
            note.stepInBar = Math.floor((note.steppc / 100) * track.nbStepPerBar)
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
        track.autoSound = false
        track.generated = false
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
            sig += (note.stepInBar) + (note.bar) * track.nbStepPerBar
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
                let th = parseInt(note.bar) * parseInt(track.nbStepPerBar) + parseInt(note.stepInBar)
                //  console.log("test to delete >"+sig+"< nb="+nb+ " from"+ th+ " on "+ track.loopPoint + " nbnotes="+track.notes.length)
                if (th >= parseInt(track.loopPoint)) {
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
