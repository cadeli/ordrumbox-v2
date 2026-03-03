import Utils from '../utils.js'

export default class MfAutoGenerate {
    static TAG = "MFAUTOGENERATE"

    constructor() { }


    loadTrackLib = () => {
        console.log("MfAutoGenerate::loadTrackLib")
        MfGlobals.mfResourcesLoader.loadTrackLib("./assets/tracklib.json", this.loadScales)

    }

    loadScales = () => {
        console.log("MfAutoGenerate::loadScales")
        console.log("trackLib")
        console.log(MfGlobals.trackLib)
        //
        MfGlobals.trackLib.forEach(track => {
            console.log("MfAutoGenerate::loadScales track :", track.tags.style)
        });
        //
        MfGlobals.mfResourcesLoader.loadScales("./assets/scales.json", this.checkResources)
    }

    checkResources = () => {
        console.log("MfAutoGenerate::checkResources")
        console.log("scales")
        console.log(MfGlobals.scales)
    }

    generateTrack = (style, track) => {
        console.log("MFAUTOGENERATE::generateTrack")
        if (MfGlobals.trackLib.length <= 0) {
            this.loadTrackLib()
        }
        let pattern = MfGlobals.patterns[MfGlobals.selectedPatternNum]
        let newTrack = this.getRndTrackNoStyle(track.name, "default") //ATT no styles
        if (!newTrack) {
            newTrack = MfGlobals.mfUpdates.mfCmd.createTrack(pattern.nbBars, track.name)
            this.generateNewBass3(pattern, newTrack)
        }
        track.notes = []
        Object.values(newTrack.notes).forEach((note) => {
            track.notes.push(note)
        })
        track.loopPoint = newTrack.loopPoint
        this.replaceTrack(pattern, track)
        track.loopPointBar = Math.floor(track.loopPoint / track.nbStepPerBar)
        track.loopPointStep = track.loopPoint % track.nbStepPerBar
        MfGlobals.mfUpdates.updatePatternView(pattern, 1)
        MfGlobals.mfPatterns.computeFlatNotesFromPattern(pattern)

    }

    //TODO style as parameter
    generatePattern = () => {
        console.log("MFAUTOGENERATE::generatePattern")
        if (MfGlobals.trackLib.length <= 0) {
            this.loadTrackLib()
        }

        let pattern = MfGlobals.patterns[MfGlobals.selectedPatternNum]
        MfGlobals.mfUpdates.mfCmd.cleanPattern(pattern)

        let styles = ["funk", "trib", "blues", "boogie", "bossa", "chacha", "disco", "electro",
            "jazz", "march", "tango", "paso", "Charleston", "pop", "reggae", "rock", "rnb",
            "samba", "shuffle", "ska", "slow", "swing", "twist", "waltz"]
        let style = styles[Math.floor(Math.random() * styles.length)]

        let track = this.getRndTrack(style, "KICK", "default")
        this.replaceTrack(pattern, track)
        track = this.getRndTrack(style, "SNARE", "default")
        this.replaceTrack(pattern, track)
        track = this.getRndTrack(style, "CHH", "default")
        this.replaceTrack(pattern, track)
        track = this.getRndTrack(style, "OHH", "default")
        this.replaceTrack(pattern, track)
        track = this.getRndTrack(style, "CRASH", "default")
        if (track != null) {
            if (track.notes.length < 3 && track.loopPoint == 16) {
                this.replaceTrack(pattern, track)
            } else {
                track.name = "OHH"
                this.replaceTrack(pattern, track)
            }
        }
        let t = (Math.floor(Math.random() * 3))
        switch (t) {
            case 0:
                track = this.getRndTrack(style, "CLAP", "default")
                this.replaceTrack(pattern, track)
                break
            case 1:
                track = this.getRndTrack(style, "COW", "default")
                this.replaceTrack(pattern, track)
                break
            case 2:
                track = this.getRndTrack(style, "TOM", "default")
                this.replaceTrack(pattern, track)
                break
        }

        this.optimizeHH(pattern)

        MfGlobals.patterns[MfGlobals.selectedPatternNum] = pattern
        MfGlobals.mfUpdates.mfCmd.autoAssignSounds(MfGlobals.patterns[MfGlobals.selectedPatternNum])
        MfGlobals.mfPatterns.computeFlatNotesFromPattern(MfGlobals.patterns[MfGlobals.selectedPatternNum])
        MfGlobals.mfUpdates.updatePatternView(MfGlobals.patterns[MfGlobals.selectedPatternNum], 1)
    }

    optimizeHH = (pattern) => {
        let trackCHH = MfGlobals.mfUpdates.mfCmd.getTrackFromType(pattern, "CHH")
        let trackOHH = MfGlobals.mfUpdates.mfCmd.getTrackFromType(pattern, "OHH")
        Object.values(trackCHH.notes).forEach((note) => {
            let step = note.step
            let bar = note.bar
            let notes = MfGlobals.mfUpdates.mfCmd.isNoteAt(trackOHH, bar, step)
            if (notes.length > 0) {
                MfGlobals.mfUpdates.mfCmd.deleteNote(trackOHH, notes[0])
            }
        })
    }

    replaceTrack = (mfPattern, newTrack) => {
        if (newTrack == null) { return }
        Object.values(mfPattern.tracks).forEach((track) => {
            if (track.name === newTrack.name) {
                let newTrackCopy = JSON.parse(JSON.stringify(newTrack))
                Object.assign(track, newTrackCopy)
            }
        })
    }

    getRndTrack = (style, inst, type) => {
        let tracks = []
        for (let i in MfGlobals.trackLib) {
            let track = MfGlobals.trackLib[i]
            if (track.name === inst) {
                if (track.tags.type === type) {
                    if (track.tags.style === style) {
                        tracks.push(track)
                    }
                }
            }
        }
        if (tracks.length > 0) {
            //console.log("found "+tracks.length + " for " +style+"="+inst)
            let index = Math.floor(Math.random() * tracks.length)
            return tracks[index]
        }
        console.log("mfAutogenerate::getRndTrack  no track =" + style + "=" + inst + " in trackLib")
        return this.getRndTrackNoStyle(inst, type)
    }

    getRndTrackNoStyle = (inst, type) => {
        let tracks = []
        for (let i in MfGlobals.trackLib) {
            let track = MfGlobals.trackLib[i]
            if ((track.name === inst) && (track.tags.type === type)) {
                tracks.push(track)
                //console.log("mfAutogenerate::getRndTrackNoStyle  add track " + track.name)
            } else {
                //console.log("mfAutogenerate::getRndTrackNoStyle " + i + " for:" + inst + " dont add  track " + track.name+ " "+ track.tags.type)
            }
        }
        if (tracks.length > 0) {
            let track = tracks[Math.floor(Math.random() * tracks.length)]
            //console.log("mfAutogenerate::getRndTrackNoStyle found #" + tracks.length
            //    + " inst=" + inst + " type=" + type
            //    + " choose track style:" + track.tags.style)
            return track
        }
        console.error("mfAutogenerate::getRndTrackNoStyle no track any type =" + type + " inst=" + inst + " in trackLib")
        return null
    }

    generateNewBass3 = (pattern, bassTrack) => { // ATT 
        console.log("mfAutoCompose::generateNewBass3")
        // TODO json
        let rootPattern = [0, 5, 7,]
        let density = 0.6
        let variation = 0.15
        let scale = MfGlobals.scales["blues scale"].scaleSteps
        //
        bassTrack.notes = []
        for (let bar = 0; bar < pattern.nbBars; bar++) {
            const rootPitch = rootPattern[bar % rootPattern.length];
            let lastStepNote = rootPitch;
            const barData = [];
            for (let step = 0; step < bassTrack.nbStepPerBar; step++) {
                const strongBeat = step % 4 === 0;
                const playNote = strongBeat || Math.random() < density;
                if (playNote) {
                    let note;
                    if (strongBeat || Math.random() > variation) {
                        const interval = Math.random() < 0.75 ? 0 : 7;
                        note = rootPitch + interval;
                    } else {
                        const degree = scale[Math.floor(Math.random() * scale.length)];
                        note = rootPitch + degree;
                        if (Math.abs(note - lastStepNote) > 7) {
                            note = rootPitch;
                        }
                    }
                    lastStepNote = note;
                    MfGlobals.mfUpdates.mfCmd.addNote(bassTrack, bar, step, note)
                }
            }
        }
        // this.displayDebugNotes(bassTrack)
    }


}

