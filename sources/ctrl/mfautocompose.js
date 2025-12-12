export default class MfAutoCompose {
    static TAG = "MFPATTERNS"
    constructor() { }

    change = (loop, pattern) => {
        let LOOP_LGR = 16
        let bassTrack = MfGlobals.mfUpdates.mfCmd.getTrackFromType(pattern, "BASS")
        if (!bassTrack) {
            bassTrack = MfGlobals.mfUpdates.mfCmd.addTrack(pattern, "BASS")
            MfGlobals.mfMixer.addStrip("BASS") //TODO ATT
            bassTrack.generated = true
            bassTrack.velo = 0.3
        }
        if (bassTrack.notes.length===0 ) {
            if ((Math.random()) > 0.5) {
                this.generateNewBass(bassTrack)
            } else {
                this.generateNewBass2(bassTrack)
            }
        }

        Object.values(pattern.tracks).forEach((track, indexTrack) => {
            if (track.name === 'CHH' || track.name === 'OHH') {
                if (loop % LOOP_LGR < LOOP_LGR / 4 + 1) {
                    track.mute = true
                } else {
                    track.mute = false
                }
            }
            if (track.name === 'TOM' || track.name === 'COW'|| track.name === 'CLAP') {
                if (loop % LOOP_LGR === (LOOP_LGR *3/ 4) ) {
                    track.mute = true
                } 
                if (loop % LOOP_LGR === (LOOP_LGR *3/ 4 + 2)) {
                    track.mute = false
                }
            }
        })
        let snareTrack = null
        snareTrack = MfGlobals.mfUpdates.mfCmd.getTrackFromType(pattern, "SNARE_B")
        if (!snareTrack) {
            snareTrack = MfGlobals.mfUpdates.mfCmd.addTrack(pattern, "SNARE_B")
            MfGlobals.mfMixer.addStrip("SNARE_B") //TODO ATT
            snareTrack.velo = 1
            this.generateClearTrack(snareTrack)
        }
        if (loop % LOOP_LGR === 0 ){
            MfGlobals.mfAutoGenerate.go()
            if ((Math.random()) > 0.5) {
                this.generateNewBass(bassTrack)
            } else {
                this.generateNewBass2(bassTrack)
            }
        }
        if (loop % LOOP_LGR === LOOP_LGR / 2) {
            let cymTrack = MfGlobals.mfUpdates.mfCmd.getTrackFromType(pattern, "CRASH")
            this.generateNewCymBrk(cymTrack)
        }
        if (loop % LOOP_LGR === (LOOP_LGR / 2 + 1)) {
            let cymTrack = MfGlobals.mfUpdates.mfCmd.getTrackFromType(pattern, "CRASH")
            this.generateClearTrack(cymTrack)
        }
        if (loop % LOOP_LGR === LOOP_LGR - 1) {
            this.generateNewSnareBrk(snareTrack)
        }
        MfGlobals.mfPatterns.getFlatNotesFromPattern(pattern)
        MfGlobals.mfUpdates.updatePatternView(pattern, 1) //TODO
    }

    generateNewCymBrk = (track) => {
        track.notes = []
        for (let i = 0; i < 4; i++) {
            if (Math.floor(Math.random() * 10) > 2) {
                MfGlobals.mfUpdates.mfCmd.addNote(track, 2, i, 0)
            }
        }
        for (let i = 0; i < 4; i++) {
            MfGlobals.mfUpdates.mfCmd.addNote(track, 3, i, 0)
        }
    }

    generateNewSnareBrk = (track) => {
        track.notes = []
        for (let i = 0; i < 4; i++) {
            if (Math.floor(Math.random() * 10) > 2) {
                MfGlobals.mfUpdates.mfCmd.addNote(track, 2, i, 0)
            }
        }
        for (let i = 0; i < 4; i++) {
            MfGlobals.mfUpdates.mfCmd.addNote(track, 3, i, 0)
        }
    }

    generateClearTrack = (track) => {
        track.notes = []
    }

    generateNewBass2 = (bassTrack) => {
        bassTrack.notes = []
        let tones = MfGlobals.scales["major"].scaleSteps
        let tone1 = this.getRndTone(tones)
        let tone2 = this.getRndTone(tones)
        let tone3 = this.getRndTone(tones)
        if (Math.floor(Math.random() * 10) > 3) {
            MfGlobals.mfUpdates.mfCmd.addNote(bassTrack, 0, 0, tones[0])
        }
        if (Math.floor(Math.random() * 10) > 3) {
            MfGlobals.mfUpdates.mfCmd.addNote(bassTrack, 0, 1, tone1)
        }
        if (Math.floor(Math.random() * 10) > 4) {
            MfGlobals.mfUpdates.mfCmd.addNote(bassTrack, 0, 2, tone2)
        }
        if (Math.floor(Math.random() * 10) > 3) {
            MfGlobals.mfUpdates.mfCmd.addNote(bassTrack, 0, 3, tone3)
        }
        bassTrack.loopPointBar = 1
        bassTrack.loopPointStep = 0
        bassTrack.loopPoint = 4
        this.displayDebugNotes(bassTrack)
    }


    generateNewBass = (bassTrack) => {
        bassTrack.notes = []
        let tones = MfGlobals.scales["major"].scaleSteps
        let tone1 = this.getRndTone(tones)
        let tone2 = this.getRndTone(tones)
        MfGlobals.mfUpdates.mfCmd.addNote(bassTrack, 0, 0, tone1)
        let step = Math.floor(Math.random() * bassTrack.nbStepPerBar)
        MfGlobals.mfUpdates.mfCmd.addNote(bassTrack, 1, step, 0)
        step = Math.floor(Math.random() * bassTrack.nbStepPerBar)
        MfGlobals.mfUpdates.mfCmd.addNote(bassTrack, 1, step, 0)
        MfGlobals.mfUpdates.mfCmd.addNote(bassTrack, 2, 0, tone2)
        MfGlobals.mfUpdates.mfCmd.addNote(bassTrack, 3, 0, tone1)
        step = Math.floor(Math.random() * bassTrack.nbStepPerBar)
        MfGlobals.mfUpdates.mfCmd.addNote(bassTrack, 3, step, tone1)
        this.displayDebugNotes(bassTrack)
    }


    getRndTone = (tones) => {
        let nb = Math.floor(Math.random() * tones.length)
        let tone = tones[nb]
        if (tone > 5) { tone -= 12 }
        return tone
    }

    displayDebugNotes = (track) => {
        let ret = "" + track.name + "="
        Object.values(track.notes).forEach((note, indexTrack) => {
            ret += "BS: " + note.bar + ":" + note.step + " P=" + note.pitch + " - "
        })
        console.log(ret)
    }
}