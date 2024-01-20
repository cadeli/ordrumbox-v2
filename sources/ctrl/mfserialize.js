export default class MfSerialize { //should be global or static
    static TAG = "MFSERIALIZE"

    constructor() {}

   serializePatterns = () => {
        MfGlobals.mfUpdates.mfCmd.convertAllTo4stepPerBar()
        let ret = { patterns: {} }
        Object.values(MfGlobals.patterns).forEach((pattern, indexPattern) => {
            ret.patterns[pattern.name] = {}
            let cols = []
            Object.values(pattern.tracks).forEach((track, indexTrack) => {
                for (let bar = 0; bar < track.bars; bar++) {
                    for (let step = 0; step < track.nbStepPerBar; step++) {
                        let patternStep = step + bar * track.nbStepPerBar
                        if (!cols[patternStep]) { cols[patternStep] = "" }
                        if (track.nbStepPerBar != 4) { cols[patternStep] = "-stop-" }
                        // if (track.bars!=4)  {cols[patternStep] = "stop"}
                        if (patternStep === track.loopPoint)
                            cols[patternStep] += "_" + track.name + "-L0-"
                        let txt = ""
                        let notes = MfGlobals.mfUpdates.mfCmd.isNoteAt(track, bar, step)
                        let note = notes[0]
                        if (note) {
                            txt = "_" + track.name + "-" +
                                "R" + note.triggFreq + "-" +
                                "H" + note.triggPhase + "-" +
                                "V" + note.velo + "-" +
                                "P" + note.pitch + "-" +
                                "S" + note.pano + "-"
                        }
                        cols[patternStep] += txt
                    }
                }

            })
            ret.patterns[pattern.name] = cols
        })
        console.log(ret)
        //console.log(JSON.stringify(ret));
        this.serializePatterns2(ret)

    }

    serializePatterns2 = (mark) => {
        let ret = "{"
        for (const [name, columns] of Object.entries(mark.patterns)) {
            ret += "\n\"" + name + "\":\""
            columns.forEach(word => {
                ret += word + ","
            })
            ret += "\","
        }
        ret += "}"
        console.log(ret)
    }
}