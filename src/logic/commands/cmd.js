import { NOT_FOUND } from '../../core/constants.js'
import MfDefaults from '../../patterns/defaults.js'
import { fixPattern } from '../../patterns/fixer.js'
import { appState } from '../../state/app_state.js'
import { getAutoAssignService, serviceRegistry } from '../../state/service_registry.js'
import { soundRegistry } from '../../state/sound_registry.js'
import { playbackEvents } from '../../state/playback_events.js'

export default class MfCmd {
    static TAG = "MFCMD"

    constructor() {
    }

    // Safe updater for track properties
    // Accepts a track object and a updates object. Only whitelisted keys are applied.
    // Extra or unknown keys are ignored gracefully to avoid runtime errors when callers
    // pass a larger payload (bars, barQuantize, pan, reverbAmount, etc.).
    updateTrack = (track, updates) => {
        if (!track || !updates || typeof updates !== 'object') {
            return track
        }
        
        let changed = false
        // Split keys into structural vs extra updates to support multi-step updates
        const STRUCT_KEYS = new Set(['name', 'soundId', 'bars', 'barQuantize', 'loopAtStep', 'useSoftSynth', 'mono', 'mute', 'solo', 'auto'])
        const EXTRA_KEYS = new Set(['pan', 'panLfo', 'velocity', 'velocityLfo', 'pitch', 'pitchLfo', 'reverbType', 'reverbAmount', 'delayType', 'delayTime', 'delayAmount', 'fxSelected', 'saturationType', 'saturationAmount', 'sampleLength', 'synthSoundKey', 'swingResolution', 'swingAmount', 'trackLength', 'filterType', 'filterFreqLfo', 'filterFreq', 'filterQLfo', 'filterQ'])
        
        for (const [k, v] of Object.entries(updates)) {
            if (STRUCT_KEYS.has(k) || EXTRA_KEYS.has(k)) {
                if (track[k] !== v) {
                    track[k] = v
                    changed = true
                }
            }
        }

        if (changed) {
            this._incrementPatternVersionByTrack(track)
        }

        // Recompute derived fields if needed
        if (typeof track.barQuantize === 'number' && typeof track.loopAtStep === 'number') {
            track.loopPointBar = Math.floor(track.loopAtStep / track.barQuantize)
            track.loopPointStep = track.loopAtStep % track.barQuantize
        }
        if (typeof track.loopAtStep === 'undefined' && typeof track.loopPointBar === 'number' && typeof track.barQuantize === 'number') {
            track.loopAtStep = track.loopPointBar * track.barQuantize + (track.loopPointStep ?? 0)
        }
        return track
    }

    _incrementPatternVersionByTrack(track) {
        // Find the pattern containing this track to increment its version
        for (const pattern of appState.patterns) {
            if (pattern.tracks && Object.values(pattern.tracks).includes(track)) {
                pattern._version = (pattern._version || 0) + 1
                break
            }
        }
    }

    isNoteAt = (track, bar, barStep) => {
        let notes = []
        Object.values(track.notes).forEach((note) => {
            if (note.barStep === barStep && note.bar === bar) {
                notes.push(note)
            }
        })
        return notes
    }

    deleteNote = (track, selNote) => {
        let i = 0
        let deleted = false
        Object.values(track.notes).forEach((note) => {
            if (note.barStep === selNote.barStep && note.bar === selNote.bar) {
                track.notes.splice(i, 1)
                deleted = true
            }
            i++
        })
        if (deleted) {
            this._incrementPatternVersionByTrack(track)
        }
    }

    addNote = (track, bar, barStep, pitch = 0) => {
        let steppc = Math.round((barStep * 100) / track.barQuantize)
        if (steppc > 100) {
            track.barQuantize = 8
            steppc = Math.round((barStep * 100) / track.barQuantize)
        }
        let note = {
            "barStep": barStep,
            "steppc": steppc,
            "bar": bar,
            "velocity": 0.8,
            "pan": 0,
            "pitch": pitch,
            "arp": null,
            "triggerFreq": 1,
            "triggerPhase": 0,
            "triggerProbability": 1,
            "arpTriggerProbability": 1,
            "retriggerNum": 1,
            "retriggerStep": 1,
            "euclidianFill": 0
        }
        track.notes.push(note)
        this._incrementPatternVersionByTrack(track)
        return note
    }

    addTrack = (pattern, type, barQuantize = 4) => {
        // console.log("mfCmd::addTrack " + pattern.name + " = " + type)

        let track = this.createTrack(pattern.nbBars, type, barQuantize);
        pattern.tracks.push(track)
        return track
    }

    createTrack = (nbBars, name, barQuantize = 4) => {
        let newTrack = {
            "name": name,
            "useAutoAssignSound": true,
            "soundId": "NOT_DEFINED",
            "bars": nbBars,
            "barQuantize": barQuantize,
            "loopAtStep": nbBars * barQuantize,
            "swingResolution": 1,
            "swingAmount": 0,
            "velocity": 1,
            "velocityLfo": null,
            "pitch": 0,
            "pitchLfo": null,
            "pan": this.getPanoFromTrackName(name),
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
            "delayType": "tape",
            "delayTime": 1,
            "delayAmount": 0,
            "fxSelected": "reverb",
            "saturationType": "soft",
            "saturationAmount": 0,
            "notes": []
        }
        newTrack.loopPointBar = Math.floor(newTrack.loopAtStep / newTrack.barQuantize)
        newTrack.loopPointStep = newTrack.loopAtStep % newTrack.barQuantize
        return newTrack
    }

    addPattern = (name) => {
        let pattern = this.createPattern(name)
        appState.patterns.push(pattern)
        return pattern
    }

    getPatternByName = (name) => {
        const normalizedName = String(name ?? '').trim().toUpperCase()
        return appState.patterns.find((pattern) => pattern?.name?.toUpperCase() === normalizedName) ?? null
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
        pattern.bpm = Number(bpm) || MfDefaults.getPatternProp({}, 'bpm')
        return pattern
    }

    getPatternBpm = (pattern) => Number(pattern?.bpm ?? MfDefaults.getPatternProp({}, 'bpm'))

    setPatternBars = (pattern, nbBars) => {
        pattern.nbBars = Number(nbBars) || MfDefaults.getPatternProp({}, 'nbBars')
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
        const props = [
            "useAutoAssignSound", "soundId", "barQuantize", "loopAtStep",
            "swingResolution", "swingAmount", "velocity", "velocityLfo", "pitch", "pitchLfo",
            "pan", "panLfo", "solo", "mute", "auto", "useSoftSynth",
            "filterType", "filterFreqLfo", "filterFreq", "filterQLfo", "filterQ",
            "sampleLength"
        ];

        props.forEach(prop => {
            if (prop in sourceTrack) {
                track[prop] = sourceTrack[prop];
            }
        });

        // Properties that are deleted if not in source
        const deletableProps = [
            "mono", "filterLfoFreq", "reverbType", "reverbAmount", 
            "delayType", "delayTime", "delayAmount", "fxSelected", 
            "saturationType", "saturationAmount", "synthSoundKey"
        ];

        deletableProps.forEach(prop => {
            if (prop in sourceTrack) {
                track[prop] = sourceTrack[prop];
            } else {
                delete track[prop];
            }
        });

        // Special case for bars/nbBars which are aliases
        if ("bars" in sourceTrack) track.bars = sourceTrack.bars;
        else if ("nbBars" in sourceTrack) track.bars = sourceTrack.nbBars;

        // Default loopAtStep if not provided
        if (!("loopAtStep" in sourceTrack)) {
            track.loopAtStep = track.bars * track.barQuantize;
        }

        // Always recompute derived fields
        track.loopPointBar = Math.floor(track.loopAtStep / track.barQuantize);
        track.loopPointStep = track.loopAtStep % track.barQuantize;

        return track;
    }

    getTrackName = (track) => track?.name ?? ''

    setNoteProps = (note, sourceNote, track) => {
        const props = [
            "bar", "velocity", "pan", "pitch", "arp", 
            "triggerFreq", "triggerPhase", "triggerProbability", 
            "arpTriggerProbability", "retriggerNum", "retriggerStep", 
            "euclidianFill", "steppc"
        ];

        props.forEach(prop => {
            if (prop in sourceNote) {
                note[prop] = sourceNote[prop];
            }
        });

        // Special cases for step/barStep aliases
        if (sourceNote.barStep !== undefined) note.barStep = sourceNote.barStep;
        else if (sourceNote.step !== undefined) note.barStep = sourceNote.step;

        // Ensure steppc is computed if not provided
        if (sourceNote.steppc === undefined) {
            note.steppc = Math.round((note.barStep * 100) / track.barQuantize);
        }

        return note;
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
                    Number(sourceNote.barStep ?? sourceNote.step ?? 0),
                    Number(sourceNote.pitch ?? 0)
                )
                this.setNoteProps(note, sourceNote, track)
            })
        })

        fixPattern(importedPattern)

        return importedPattern
    }

    createPattern = (name) => {
        if (!name) {
            let nb = 0
            if (appState.patterns.length) {
                nb = appState.patterns.length
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
        return Object.values(soundRegistry.sounds).some(sound => sound.kit_name === drumkit.name);
    }

    setSelectedDrumkitNum = (num) => {
        console.log("mfCmd::setSelectedDrumkitNum : " + num + " = " + soundRegistry.drumkitList[num].name)
        appState.selectedDrumkitNum = num
        if (!this.kitIsLoaded(soundRegistry.drumkitList[num])) {
            console.log("mfCmd::setSelectedDrumkitNum :  must load kit:", soundRegistry.drumkitList[num].name)
            console.log(soundRegistry.sounds)
            serviceRegistry.mfResourcesLoader.loadSamplesFromDrumkit(soundRegistry.drumkitList[num], this.autoAssignsoundsForNewDrumkit)
        } else {
            this.autoAssignsoundsForNewDrumkit()
        }
        playbackEvents.onDrumkitChange.forEach(cb => cb())
    }

    autoAssignsoundsForNewDrumkit = async () => {
        console.log("mfCmd::autoAssignsoundsForNewDrumkit :sounds")
        console.log(soundRegistry.sounds)
        let selPattern = appState.patterns[appState.selectedPatternNum]
        serviceRegistry.mfSeq.setBpm(selPattern.bpm)
        const mfAutoAssign = await getAutoAssignService()
        mfAutoAssign.autoAssignSounds(selPattern)
        serviceRegistry.mfPatterns.computeFlatNotesFromPattern(selPattern, 0, serviceRegistry.audioCtx)
        // console.log(appState.flatNotes )
    }

    setSelectedPatternNum = async (num) => {
        if (appState.patterns.length > 0) {
            console.log("mfCmd::setSelectedPatternNum " + num + " = " + appState.patterns[num].name)
            appState.selectedPatternNum = num
            let selPattern = appState.patterns[appState.selectedPatternNum]
            serviceRegistry.mfSeq.setBpm(selPattern.bpm)
            if (Object.keys(soundRegistry.sounds).length > 0) {
                const mfAutoAssign = await getAutoAssignService()
                mfAutoAssign.autoAssignSounds(selPattern)
            }
            serviceRegistry.mfPatterns.computeFlatNotesFromPattern(selPattern, 0, serviceRegistry.audioCtx)
            // console.log(flatnotes)
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
        // No-op after UI removal
    }

    setNbBar = (pattern, newBar) => {
        let oldBar = pattern.nbBars * (pattern.tracks[0]?.barQuantize ?? 4)
        pattern.nbBars = newBar * 4
        Object.values(pattern.tracks).forEach((track, indexTrack) => {
            if (track.loopAtStep >= oldBar) {
                track.loopAtStep = pattern.nbBars * track.barQuantize
                track.loopPointBar = Math.floor(track.loopAtStep / track.barQuantize)
                track.loopPointStep = track.loopAtStep % track.barQuantize
            }
            track.bars = pattern.nbBars
        })
    }

    incrNbStepPerBar = (track) => {
        let loopStepPc = Math.round((track.loopPointStep * 100) / track.barQuantize)
        track.barQuantize++
        if (track.barQuantize > 8) {
            track.barQuantize = 1
        }

        Object.values(track.notes).forEach((note) => {
            note.barStep = Math.floor((note.steppc / 100) * track.barQuantize)
        })
        track.loopPointStep = Math.floor((loopStepPc / 100) * track.barQuantize)
        track.loopAtStep = track.loopPointBar * track.barQuantize + track.loopPointStep
    }

    incrLoopPoint = (track) => {
        track.loopAtStep--
        if (track.loopAtStep < 1) {
            track.loopAtStep = track.barQuantize * track.bars
        }
        track.loopPointBar = Math.floor(track.loopAtStep / track.barQuantize)
        track.loopPointStep = track.loopAtStep % track.barQuantize
    }

    cleanPattern = (pattern) => { 
        Object.values(pattern.tracks).forEach((track) => {
            this.cleanTrack(track )
        })
    }

    cleanTrack = (track)=> {
        Object.values(track.notes).forEach((note) => {
            note.arp = null
            note = null
        })
        track.notes = []
        track.loopPointStep = 0
        track.loopPointBar = track.bars
        track.loopAtStep = track.loopPointBar * track.barQuantize + track.loopPointStep

    }

    getAllSoundsForType(soundKey) {
        let retSounds = []
        for (const soundId in soundRegistry.sounds) {
            if (soundRegistry.sounds[soundId].key === soundKey) {
                retSounds.push(soundRegistry.sounds[soundId])
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
        for (const soundId in soundRegistry.sounds) {
            if (soundRegistry.sounds[soundId].url === url) {
                return soundId;
            }
        }
        return NOT_FOUND;
    }

    convertPatternStepToBarStep = (patternStep, barQuantize) => {
        let bar = Math.floor(patternStep / barQuantize)
        let step = patternStep % barQuantize
        return { bar: bar, step: step }
    }

    convertBarStepToPatternStep = (bar, step, barQuantize) => {
        return bar * barQuantize + step
    }

    // @deprecated - unused, kept for reference
    euclidianFill = (track, startStep, endStep, nb, triggerFreq) => {
        let internalStep = Math.floor((endStep - startStep) / nb)
        if (internalStep > 0) {
            let pitch = 0
            let patternStep = startStep + internalStep
            while (patternStep < endStep) {
                let barStep = this.convertPatternStepToBarStep(patternStep, track.barQuantize)
                this.addNote(track, barStep.bar, barStep.step, pitch)
                patternStep += internalStep
            }
        }
    }

    // @deprecated - replaced by Utils.addLoopToTrackIfPossible
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
                sig0 += note.barStep + "_"
            }
            if (note.bar === 1) {
                sig1 += note.barStep + "_"
            }
            if (note.bar === 2) {
                sig2 += note.barStep + "_"
            }
            if (note.bar === 3) {
                sig3 += note.barStep + "_"
            }
            sig += (note.barStep) + (note.bar) * track.barQuantize
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

    // @deprecated - only called by compacteTrack (also deprecated)
    setLoopAndDelete = (track, nb, sig) => {
        if (nb === 2) {
            track.loopAtStep = 2 * track.barQuantize
        } else if (nb === 4) {
            track.loopAtStep = 1 * track.barQuantize
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
                let th = parseInt(note.bar) * parseInt(track.barQuantize) + parseInt(note.barStep)
                //  console.log("test to delete >"+sig+"< nb="+nb+ " from"+ th+ " on "+ track.loopAtStep + " nbnotes="+track.notes.length)
                if (th >= parseInt(track.loopAtStep)) {
                    this.deleteNote(track, note)
                }
            }
        }
    }

    // @deprecated - buggy: compares note.name which doesn't exist
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
