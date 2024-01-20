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
                    this.mfAutoCompose.change(this.loop, selPat)
                }
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
                    let stepBar = flatNote.note.bar * flatNote.track.nbStepPerBar + flatNote.note.step
                    //console.log("tick:" + tick +"  tickPattern:"+nbTickForPattern+"  tickloopL:"+nbTickForLoop + " play " + flatNote.track.name + " steppc:" + flatNote.note.steppc + " bar:" + flatNote.note.bar + " step:" + flatNote.note.step + " stepbar=" + stepBar +  " index=" + indexFlatNote + " ii="+ii)
                    if (flatNote.track.mute === false) {
                        if (this.isTrigged(flatNote.note.triggPhase, flatNote.note.triggFreq, this.loop)) {
                            let swingTime = this.computeSwingTime(flatNote.note, MfGlobals.secondsPerBeat, flatNote.track.swingRez, flatNote.track.swingDepth)
                            let pano = (eval(flatNote.note.pano) + eval(flatNote.track.pano)) / 2
                            flatNote.pano =  Math.floor(pano*100)/100
                            let fpitch = ((eval(flatNote.track.pitch) + eval(flatNote.note.pitch)) / 12 + 1)
                            flatNote.fpitch = Math.floor(fpitch*100)/100
                            this.computeLfos(flatNote, tick)
                            this.mfSound.play(flatNote, atTime + swingTime)
                            this.computeRepeat(flatNote, atTime, swingTime)
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
        let first = note.bar * track.nbStepPerBar + note.step
        for (let i = first + 1; i < last; i++) {
            let sb = MfGlobals.mfUpdates.mfCmd.convertPatternStepToBarStep(i, track.nbStepPerBar)
            if (MfGlobals.mfUpdates.mfCmd.isNoteAt(track, sb.bar, sb.step).length > 0) {
                return i
            }
        }
        return last
    }

    computeEclidianFill = (flatNote, atTime, swingTime) => {
        // euclidian fill rules
        if (flatNote.note.euclidianFill && flatNote.note.euclidianFill > 0) {
            let startStep = MfGlobals.mfUpdates.mfCmd.convertBarStepToPatternStep(flatNote.note.bar, flatNote.note.step, flatNote.track.nbStepPerBar)
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
        for (let i = 1; i < flatNote.note.retriggNum; i++) {
            let fstep = parseFloat(eval(flatNote.note.retriggStepMulpt) / eval(flatNote.note.retriggStep))
            if (fstep) { //json pb
                let at = i * MfGlobals.secondsPerBeat * fstep
                flatNote.track.velo -= 0.1
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
            flatNote.fpitch = this.getLfoVal(flatNote.track.pitchLfo, tick, flatNote.fpitch, 0.5, 2)
            if (selTrack.name === flatNote.track.name) {
                document.getElementById("trackCtrlPitch").innerText = flatNote.fpitch
               // document.getElementById("trackCtrlPitchInput").value = flatNote.fpitch
            }
        }
        if (flatNote.track.veloLfo) {
            flatNote.track.velo = this.getLfoVal(flatNote.track.veloLfo, tick, flatNote.track.velo, 0, 1)
            if (selTrack.name === flatNote.track.name) {
                document.getElementById("trackCtrlVelo").innerText = flatNote.track.velo
                 document.getElementById("trackCtrlVeloInput").value = flatNote.track.velo
            }
        }
        if (flatNote.track.panoLfo) {
            flatNote.pano = this.getLfoVal(flatNote.track.panoLfo, tick, flatNote.pano, -1, 1)
            if (selTrack.name === flatNote.track.name) {
                document.getElementById("trackCtrlPano").innerText = flatNote.pano
                 document.getElementById("trackCtrlPanoInput").value = flatNote.pano
            }
        }
        if (flatNote.track.filterFreqLfo) {
            flatNote.track.filterFreq = this.getLfoVal(flatNote.track.filterFreqLfo, tick, flatNote.track.filterFreq, 0, 1)
            if (selTrack.name === flatNote.track.name && document.getElementById("trackCtrlFilterFreq")) {
                document.getElementById("trackCtrlFilterFreq").innerText = flatNote.track.filterFreq
                  document.getElementById("trackCtrlFilterFreqInput").value = flatNote.track.filterFreq
           }
        }
        if (flatNote.track.filterQLfo) {
            flatNote.track.filterQ = this.getLfoVal(flatNote.track.filterQLfo, tick, flatNote.track.filterQ, 0, 1)
            if (selTrack.name === flatNote.track.name && document.getElementById("trackCtrlFilterQ")) {
                document.getElementById("trackCtrlFilterQ").innerText = flatNote.track.filterQ
                document.getElementById("trackCtrlFilterQInput").value = flatNote.track.filterQ
            }
        }
    }

    getLfoVal = (lfo, tick, initialValue, initialValueMin, initialValueMax) => {
        let freq = (lfo.freqMulpt / lfo.freq) * (MfGlobals.TICK * 4) //4 bars
        let phase = lfo.phase * 2 * Math.PI
        let ret = Math.sin((tick / freq) * (2 * Math.PI) + phase)
        ret = (ret + 1) / 2 //normalize sinus
        //console.log("djtCmd::getLfoVal "+lfo.name+" tick= "+ tick + "(sin)=>" +parseInt(ret*100))
        ret = (ret * (parseFloat(lfo.max) - parseFloat(lfo.min))) + parseFloat(lfo.min)
        //console.log("djtCmd::getLfoVal "+lfo.name+" tick= "+ tick + "(sin)=>" +parseInt(ret*100))
        ret = (ret * (parseFloat(initialValueMax) - parseFloat(initialValueMin))) + parseFloat(initialValueMin)
        // Utils.displayStatusBar("tick: " + tick +"sin="+parseInt(ret_0*100)+ " ret=" + parseInt(ret_1*100)+ " ret=" + parseInt(ret*100))
        // console.log("djtCmd::getLfoVal "+lfo.name+"("+initialValueMin+","+initialValue+","+initialValueMax+")"+" tick= "+ tick + "=>" +ret)
        //console.log("eeee ret="+ret+ " ="+lfo.name)
        ret=(Math.floor(100*ret))/100
        return eval(ret)
    }


    computeSwingTime = (note, secondsPerBeat, rez, depth) => {
        let swingTime = 0
        rez = 2
        if (Math.floor(note.step % rez) === 1) {
            swingTime = depth * secondsPerBeat
        }
        //console.log("mfPlayer::computeSwingTime  bar="+ note.bar, " step="+ note.step+ " rez="+rez + " swing="+swingTime)          
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
            let note = { "velo": 1, "pano": 0, "pitch": 0 }
            let flatNote = new MfFlatNote(0, track.soundNum, track, note)
           
                if (MfGlobals.mfMixer.strips.length === 0) {
                    MfGlobals.mfMixer.start()
                }
                this.mfSound.playSample(flatNote, 0)
                console.log("Play :" + track.name + "=" + MfGlobals.sounds[track.soundNum].url)
            }
    }



}