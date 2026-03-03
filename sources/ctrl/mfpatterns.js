import Utils from '../utils.js'
import MfFlatNote from './flatnote.js'
export default class MfPatterns {
    static TAG = "MFPATTERNS"

    constructor() { }

    computeFlatNotesFromPattern = (djtPattern) => {
        console.log("mfPattern::computeFlatNotesFromPattern : recompute flat notes")
        if (MfGlobals.audioCtx != null) {
            let flatNotes = []
            Object.values(djtPattern.tracks).forEach((track) => {
                let lastTick = -1
                //console.log("mfPattern::compoteFlatNotesFromPattern " + track.name +":"+track.nbStepPerBar)
                Object.values(track.notes).forEach((note) => {
                    let tick = note.bar * MfGlobals.TICK + Math.round((note.step * MfGlobals.TICK) / track.nbStepPerBar)
                    // console.log("mfPattern::computeFlatNotesFromPattern " + track.name +":"+track.nbStepPerBar+ " bar:" + note.bar + " step:" + note.step + " -> " + tick)
                    if (tick != lastTick) { //only one note per tick (avoid tick precision problems and mono) 
                        lastTick = tick
                        let flatNote = new MfFlatNote(tick, track.soundNum, track, note) //TODO use note.soundNum
                        flatNotes.push(flatNote)
                    }
                })
            })
            MfGlobals.flatNotes = flatNotes
            // console.log(flatNotes)
        }
    }

}