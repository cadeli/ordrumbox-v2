import Utils from '../utils.js'

export default class MfAutoGenerate {
    static TAG = "MFAUTOGENERATE"

    constructor() { }

    go = () => {
        console.log("MFAUTOGENERATE::go")
        let pattern = MfGlobals.patterns[MfGlobals.selectedPatternNum]
        MfGlobals.mfUpdates.mfCmd.cleanPattern(pattern)

        let styles = ["funk", "afro", "blues", "boogie", "bossa", "chacha", "disco",
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
        let flatnotes = MfGlobals.mfPatterns.getFlatNotesFromPattern(MfGlobals.patterns[MfGlobals.selectedPatternNum])
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
        if (newTrack == null) { retrun }
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
}

