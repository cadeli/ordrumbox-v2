export default class MfStructureSong {
    static TAG = "MFSTRUCTURESONG"

    constructor(structure = null) {
        this.structure = structure ?? [
            { name: "intro", loops: 4 },
            { name: "chorus", loops: 8 },
            { name: "verse", loops: 8 },
            { name: "break", loops: 1 },
            { name: "chorus", loops: 8 },
            { name: "verse", loops: 8 },
            { name: "break", loops: 1 },
            { name: "bridge", loops: 4 },
            { name: "verse", loops: 8 },
            { name: "outro", loops: 4 }
        ]
        this.totalLoops = this.structure.reduce((total, element) => total + element.loops, 0)
    }

    getElement = (loop) => {
        const safeLoop = Math.max(0, Math.floor(Number(loop) || 0))
        const loopInSong = this.totalLoops > 0 ? safeLoop % this.totalLoops : 0
        let cursor = 0
        const counters = {}

        for (let index = 0; index < this.structure.length; index++) {
            const element = this.structure[index]
            counters[element.name] = (counters[element.name] ?? 0) + 1

            if (loopInSong < cursor + element.loops) {
                return {
                    name: element.name,
                    number: counters[element.name],
                    index: index,
                    loop: safeLoop,
                    loopInSong: loopInSong,
                    loopInElement: loopInSong - cursor,
                    isLastLoopBeforeChange: loopInSong - cursor === element.loops - 1,
                    elementLoops: element.loops,
                    totalLoops: this.totalLoops
                }
            }

            cursor += element.loops
        }

        return {
            name: "unknown",
            number: 0,
            index: -1,
            loop: safeLoop,
            loopInSong: loopInSong,
            loopInElement: 0,
            isLastLoopBeforeChange: false,
            elementLoops: 0,
            totalLoops: this.totalLoops
        }
    }
}
