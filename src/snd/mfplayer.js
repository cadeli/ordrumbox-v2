import { MfGlobals } from '../mfglobals.js'

import Utils from '../utils.js'
import MfSound from './mfsound.js'
import MfFlatNote from '../ctrl/flatnote.js'
import MfAutoCompose from '../ctrl/mfautocompose.js'

export default class MfPlayer {
    static TAG = "MFPLAYER"

    constructor() {
        this.mfSound = new MfSound()
        this.mfAutoCompose = new MfAutoCompose()
        this.loop = 0
        this.lastDisplayBars = 0
    }

    playNotes = (tick, atTime) => {
        try {
            //console.log("tick: " + tick + " time="+ atTime)
            let selPat = MfGlobals.patterns[MfGlobals.selectedPatternNum]
            let nbTickForPattern = (MfGlobals.TICK * selPat.nbBars)
            let loopStep = tick % nbTickForPattern
            if (loopStep === 0) {
                this.loop++
                if (MfGlobals.autoMode === true) {
                    this.mfAutoCompose.changePattern(this.loop, selPat)
                }
                Object.values(selPat.tracks).forEach((track, indexTrack) => {
                    if (track.auto === true) {
                        this.mfAutoCompose.changeTrack(this.loop, selPat, track)
                    }
                })
            }
            let flatNotes = MfGlobals.flatNotes
            flatNotes.forEach((flatNote, indexFlatNote) => {
                let loopPointStepPc = flatNote.track.loopPointStep / flatNote.track.nbStepPerBar
                let nbTickForLoop = Math.floor((loopPointStepPc + flatNote.track.loopPointBar) * MfGlobals.TICK)
                let ii = 0
                while (nbTickForPattern % nbTickForLoop != 0 && ii < 20) {
                    //ATT TODO beurk avoid double note on pattern start loop
                    nbTickForLoop++
                    ii++
                }
                if (flatNote.tick === tick % nbTickForLoop || flatNote.tick === tick % nbTickForPattern) {
                    let stepBar = flatNote.note.bar * flatNote.track.nbStepPerBar + flatNote.note.stepInBar
                    //console.log("tick:" + tick +"  tickPattern:"+nbTickForPattern+"  tickloopL:"+nbTickForLoop + " play " + flatNote.track.name + " steppc:" + flatNote.note.steppc + " bar:" + flatNote.note.bar + " step:" + flatNote.note.stepInBar + " stepbar=" + stepBar +  " index=" + indexFlatNote + " ii="+ii)
                    if (flatNote.track.mute === false) {
                        if (this.isTrigged(flatNote.note.triggPhase, flatNote.note.triggFreq, this.loop)) {
                            let swingTime = this.computeSwingTime(flatNote.note, MfGlobals.secondsPerBeat, flatNote.track.swingRez, flatNote.track.swingDepth)
                            let pano = (parseFloat(flatNote.note.pano) + parseFloat(flatNote.track.pano)) / 2
                            flatNote.pano = Math.floor(pano * 100) / 100
                            let fpitch = Utils.semiToneToPitch(flatNote.note.pitch + flatNote.track.pitch)
                            flatNote.fpitch = Math.floor(fpitch * 100) / 100
                            flatNote.baseFpitch = flatNote.fpitch
                            this.computeLfos(flatNote, tick)
                            if (this.hasArp(flatNote.note.arp)) {
                                this.playArp(flatNote, atTime + swingTime)
                            } else {
                                this.mfSound.play(flatNote, atTime + swingTime)
                                this.computeRepeat(flatNote, atTime, swingTime)
                            }
                            this.computeEclidianFill(flatNote, atTime, swingTime)
                        }
                    }
                }
            })
            let curBar = Math.floor(tick / MfGlobals.TICK) % selPat.nbBars
            let curStep = Math.floor((tick % MfGlobals.TICK) / 8 + 1)
            let displayBars = Math.floor(curBar / 4) + 1
            curBar++
            if (curBar < 10) { curBar = "0" + curBar }
            document.getElementById("currentMark").innerText = "" + curBar + ":" + curStep
            if (this.lastDisplayBars != displayBars) {
                MfGlobals.mfUpdates.updatePatternView(selPat, displayBars)
                document.getElementById("patternLength").innerText = displayBars + "/" + (selPat.nbBars / 4)
                this.lastDisplayBars = displayBars
            }
        } catch (e) {
            console.error(e)
        }
    }

    computeNextPatternStepNote = (note, track) => {
        let last = track.nbStepPerBar * track.bars
        let first = note.bar * track.nbStepPerBar + note.stepInBar
        for (let i = first + 1; i < last; i++) {
            let sb = MfGlobals.mfCmd.convertPatternStepToBarStep(i, track.nbStepPerBar)
            if (MfGlobals.mfCmd.isNoteAt(track, sb.bar, sb.step).length > 0) {
                return i
            }
        }
        return last
    }

    computeEclidianFill = (flatNote, atTime, swingTime) => {
        // euclidian fill rules
        if (flatNote.note.euclidianFill && flatNote.note.euclidianFill > 0) {
            let startStep = MfGlobals.mfCmd.convertBarStepToPatternStep(flatNote.note.bar, flatNote.note.stepInBar, flatNote.track.nbStepPerBar)
            let endStep = this.computeNextPatternStepNote(flatNote.note, flatNote.track)
            let internalStep = ((endStep - startStep) / (flatNote.note.euclidianFill + 1))

            for (let i = 1; i <= flatNote.note.euclidianFill; i++) {
                let at = MfGlobals.secondsPerBeat * internalStep * i * 2
                this.mfSound.play(flatNote, at + atTime + swingTime)
            }
        }
    }

    computeRepeat = (flatNote, atTime, swingTime) => {
        //repeat rules
        let firstVelo = flatNote.track.velo
        const stepDuration = this.getTrackStepDuration(flatNote.track)
        //const stepSpacing = this.getRetriggStepSpacing(flatNote.note)
        const stepSpacing = Utils.getStepSpacing(flatNote.note?.retriggStep)
        for (let i = 1; i < flatNote.note.retriggNum; i++) {
            if (stepSpacing) {
                let at = i * stepDuration * stepSpacing
                //flatNote.track.velo -= 0.1
                if (flatNote.track.velo > 0) {
                    this.mfSound.play(flatNote, at + atTime + swingTime)
                }
            }
        }
        flatNote.track.velo = firstVelo
    }

    computeLfos = (flatNote, tick) => {
        if (!MfGlobals.selectedTrackNum) { return }
        //if (!document.getElementById("trackCtrlFilterQ")) { return } //TODO dom reated dynamicly
        let selPat = MfGlobals.patterns[MfGlobals.selectedPatternNum]
        let selTrack = selPat.tracks[MfGlobals.selectedTrackNum % selPat.tracks.length]
        if (flatNote.track.pitchLfo) {
            const pitchOffset = this.getLfoVal(flatNote.track.pitchLfo, tick)
            flatNote.pitchLfo = pitchOffset
            const baseFpitch = Number(flatNote.baseFpitch ?? flatNote.fpitch ?? 1)
            flatNote.fpitch = Number((baseFpitch * Utils.semiToneToPitch(pitchOffset)).toFixed(4))
            if (selTrack.name === flatNote.track.name) {
                document.getElementById("trackCtrlPitch").setValue(Utils.pitchToSemiTone(baseFpitch))
            }
        }
        if (flatNote.track.veloLfo) {
            flatNote.track.velo = this.getLfoVal(flatNote.track.veloLfo, tick)
            if (selTrack.name === flatNote.track.name) {
                document.getElementById("trackCtrlVelo").setValue(flatNote.track.velo)
            }
        }
        if (flatNote.track.panoLfo) {
            flatNote.pano = this.getLfoVal(flatNote.track.panoLfo, tick)
            if (selTrack.name === flatNote.track.name) {
                document.getElementById("trackCtrlPano").setValue(flatNote.pano)
            }
        }
        if (flatNote.track.filterFreqLfo) {
            flatNote.track.filterFreq = this.getLfoVal(flatNote.track.filterFreqLfo, tick)
            if (selTrack.name === flatNote.track.name) {
                document.getElementById("trackCtrlFltr_F").setValue(flatNote.track.filterFreq)
            }
        }
        if (flatNote.track.filterQLfo) {

            flatNote.track.filterQ = this.getLfoVal(flatNote.track.filterQLfo, tick)
            if (selTrack.name === flatNote.track.name) {
                document.getElementById("trackCtrlFltr_Q").setValue(flatNote.track.filterQ)
            }
        }
    }

    hasArp = (arp) => {
        if (arp == null) {
            return false
        }
        if (Array.isArray(arp)) {
            return arp.length > 0
        }
        if (typeof arp === 'string') {
            return arp.trim().length > 0
        }
        if (typeof arp === 'object') {
            return Array.isArray(arp.intervals) ? arp.intervals.length > 0 : true
        }
        return false
    }

    playArp = (flatNote, startTime) => {
        const arpConfig = this.normalizeArp(flatNote.note.arp)
        if (!arpConfig || arpConfig.sequence.length === 0) {
            this.mfSound.play(flatNote, startTime)
            return
        }

        const totalNotes = Math.max(1, Math.min(16, parseInt(flatNote.note.retriggNum ?? 1)))
        const noteSpacing = this.getTrackStepDuration(flatNote.track) * this.getRetriggStepSpacing(flatNote.note)

        for (let index = 0; index < totalNotes; index++) {
            const semitoneOffset = arpConfig.sequence[index % arpConfig.sequence.length]
            const arpFlatNote = this.createArpFlatNote(flatNote, semitoneOffset)
            this.mfSound.play(arpFlatNote, startTime + index * noteSpacing)
        }
    }

    normalizeArp = (arp) => {
        let intervals = []
        let mode = 'up'

        if (Array.isArray(arp)) {
            intervals = arp
        } else if (typeof arp === 'string') {
            intervals = arp.split(',').map((value) => Number(value.trim())).filter((value) => Number.isFinite(value))
        } else if (typeof arp === 'object' && arp !== null) {
            intervals = Array.isArray(arp.intervals) ? arp.intervals : []
            mode = String(arp.mode ?? mode).toLowerCase()
        }

        intervals = intervals.map((value) => Number(value)).filter((value) => Number.isFinite(value))
        if (intervals.length === 0) {
            return null
        }

        if (!intervals.includes(0)) {
            intervals.unshift(0)
        }

        let sequence = intervals
        if (mode === 'down') {
            sequence = [...intervals].sort((a, b) => b - a)
        } else if (mode === 'updown') {
            const ascending = [...intervals].sort((a, b) => a - b)
            const descending = ascending.slice(1, -1).reverse()
            sequence = ascending.concat(descending)
        } else {
            sequence = [...intervals].sort((a, b) => a - b)
        }

        return {
            sequence
        }
    }

    getTrackStepDuration = (track) => {
        const tickDuration = 0.25 * MfGlobals.secondsPerBeat
        const ticksPerTrackStep = MfGlobals.TICK / track.nbStepPerBar
        return Math.max(tickDuration, ticksPerTrackStep * tickDuration)
    }

    getRetriggStepSpacing = (note) => {
        const stepSpacing = parseFloat(note?.retriggStep * (note?.retriggStep / 4)) / 4
        return stepSpacing
    }

    createArpFlatNote = (flatNote, semitoneOffset) => {
        const arpNote = {
            ...flatNote.note,
            pitch: (flatNote.note.pitch ?? 0) + semitoneOffset
        }

        return {
            ...flatNote,
            note: arpNote,
            fpitch: Number((flatNote.fpitch * Utils.semiToneToPitch(semitoneOffset)).toFixed(4))
        }
    }

    getLfoVal = (lfo, tick) => {
        let freq = Number(lfo.freq) * Number(lfo.freq / 4) * (MfGlobals.TICK * 4) //4 bars
        let phase = lfo.phase * 2 * Math.PI
        let ret = Math.sin((tick / freq) * (2 * Math.PI) + phase)
        ret = (ret + 1) / 2 //normalize sinus
        //console.log("djtCmd::getLfoVal "+lfo.name+" tick= "+ tick + "(sin)=>" +parseFloat(ret*100))
        ret = (ret * (parseFloat(lfo.max) - parseFloat(lfo.min))) + parseFloat(lfo.min)
        //console.log("djtCmd::getLfoVal "+lfo.name+" tick= "+ tick + "(sin)=>" +parseFloat(ret*100))
        // ret = (ret * (parseFloat(initialValueMax) - parseFloat(initialValueMin))) + parseFloat(initialValueMin)
        // Utils.displayStatusBar("tick: " + tick +"sin="+parseFloat(ret_0*100)+ " ret=" + (ret_1*100)+ " ret=" + parseFloat(ret*100))
        // console.log("djtCmd::getLfoVal "+lfo.name+"("+initialValueMin+","+initialValue+","+initialValueMax+")"+" tick= "+ tick + "=>" +ret)
        //console.log("eeee ret="+ret+ " ="+lfo.name)
        ret = (Math.floor(100 * ret)) / 100
        return parseFloat(ret)
    }


    computeSwingTime = (note, secondsPerBeat, rez, depth) => {
        let swingTime = 0
        rez = 2
        if (Math.floor(note.stepInBar % rez) === 1) {
            swingTime = depth * secondsPerBeat
        }
        //console.log("mfPlayer::computeSwingTime  bar="+ note.bar, " step="+ note.stepInBar+ " rez="+rez + " swing="+swingTime)          
        return swingTime
    }

    isTrigged = (triggPhase, triggFreq, loop) => {
        triggPhase %= triggFreq
        if ((loop + triggPhase) % (triggFreq) == 0) {
            return true
        }
        return false
    }

    simpleBeep = (indexTrack) => {
        if (MfGlobals.audioCtx != null) {
            let pat = MfGlobals.patterns[MfGlobals.selectedPatternNum]
            let track = pat.tracks[indexTrack]

            let note = {
                "name": "N_" + indexTrack + "_" + 0 + "_" + 0,
                "stepInBar": 0,
                "steppc": 0,
                "bar": 0,
                "velo": 0.8,
                "pano": 0,
                "pitch": 0,
                "arp": null,
                "triggFreq": 1,
                "triggPhase": 0,
                "retriggNum": 1,
                "retriggStep": 1,
                "euclidianFill": 0
            }
            let flatNote = new MfFlatNote(0, track.soundId, track, note)

            if (MfGlobals.mfMixer) {
                if (!MfGlobals.mfMixer.strips.length) {
                    MfGlobals.mfMixer.start()
                }
                if (MfGlobals.mfMixer.strips.length === 0) {
                    MfGlobals.mfMixer.start()
                }

            }
            this.mfSound.playSample(flatNote, MfGlobals.audioCtx.currentTime)
            console.log("Play :" + track.name + "=" + MfGlobals.sounds[track.soundId].url)
        }
    }
}

