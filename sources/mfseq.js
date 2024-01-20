import Utils from './utils.js'
import MfPlayer from './snd/mfplayer.js'
import MfAudioRec from './snd/mfaudiorec.js'
import MfLoader from './load/mfloader.js'
import MfMixer from './snd/mfmixer.js'

export default class MfSeq {
    static TAG = "MFSEQ"

    constructor() {
        this.mfPlayer = new MfPlayer()
        this.mfAudioRec = null
        this.unlocked = false;
        this.isRunning = false;
        this.startTime; // The start time of the entire sequence.
        this.tick = 1; // What 1/4 step is currently last scheduled?
        this.bpm = 120.0; // bpm (in beats per minute)
        this.setBpm(this.bpm)
        this.lookahead = 25.0; // How frequently to call scheduling function (in milliseconds)
        this.scheduleAheadTime = 0.1; // How far ahead to schedule audio (sec) This is calculated from lookahead, and overlaps  with next interval (in case the timer is late)
        this.nextStepTime = 0.0; // when the next note is due.
        this.timerWorker = null;

        this.timerWorker = new Worker("timerworker.js")
        let that = this
        this.timerWorker.onmessage = function(e) {
            if (e.data == "tick") {
                // console.log("tick!");
                that.scheduler();
            } else
                console.log("message: " + e.data);
        }
        this.timerWorker.postMessage({ "interval": this.lookahead })
    }

    //  unlock the audio
    playSilentBuffer = () => {
        let buffer = MfGlobals.audioCtx.createBuffer(1, 1, 22050)
        let node = MfGlobals.audioCtx.createBufferSource()
        node.buffer = buffer
        node.start(0)
        this.unlocked = true
    }

    onAllResourceLoad = () => {
        console.log("mfseq::onAllResourceLoad :")
        MfGlobals.selectedDrumkit = "real"
        MfGlobals.mfUpdates.mfCmd.autoAssignSounds(MfGlobals.patterns[MfGlobals.selectedPatternNum])
        let flatnotes = MfGlobals.mfPatterns.getFlatNotesFromPattern(MfGlobals.patterns[MfGlobals.selectedPatternNum])
        document.getElementById("selectedDrumkitDisp").innerHTML = MfGlobals.selectedDrumkit
        this.start()
    }


    start = () => {
        if (Object.keys(MfGlobals.drumkits).length==0) {
            const mfLoader = new MfLoader(this.onAllResourceLoad)
            mfLoader.loadMinimalKit()
        } else {
            if (!this.unlocked) {
                this.playSilentBuffer()
            }
            this.isRunning = true
            this.tick = 0;
            this.nextStepTime = MfGlobals.audioCtx.currentTime;
            this.timerWorker.postMessage("start");
            // this.mfPlayer.mfSound.init() // called here because we wait for audioctx
            if (MfGlobals.mfMixer == null) {
                MfGlobals.mfMixer = new MfMixer()
            }
            MfGlobals.mfMixer.start()
            if (this.mfAudioRec == null) {
                this.mfAudioRec = new MfAudioRec(MfGlobals.mfMixer.analyser)
                this.mfAudioRec.startRecording()
                this.mfAudioRec.onComplete = function(rec, blob) {
                    MfGlobals.blob = blob
                }
            }
        }
    }

    stop = () => {
        this.isRunning = false
        this.timerWorker.postMessage("stop");
        MfGlobals.mfMixer.stop()
        this.mfAudioRec.finishRecording()
        this.mfAudioRec = null
    }

    toggleStartStop = () => {
        if (this.isRunning === false) {
            document.getElementById("download").replaceChildren()
            document.getElementById('playstop').innerText = "stop"
            this.start()
        } else {
            document.getElementById('playstop').innerText = "play"
            this.stop()
        }
        console.log("mfSeq::toggleStartStop")
    }



    setBpm = (bpm) => {
        this.bpm = bpm
        if (eval(bpm) > 99) {
            document.getElementById("showTempo").innerText = bpm
        } else {
            document.getElementById("showTempo").innerHTML = "&nbsp;" + bpm
        }
        MfGlobals.secondsPerBeat = 60 * 4 / (this.bpm * MfGlobals.TICK)
    }

    scheduler = () => {
        while (this.nextStepTime < MfGlobals.audioCtx.currentTime + this.scheduleAheadTime) {
            this.mfPlayer.playNotes(this.tick, this.nextStepTime)
            this.nextNote();
        }
    }

    nextNote = () => {
        // Advance current note and time by a 16th note...
        this.nextStepTime += 0.25 * MfGlobals.secondsPerBeat
        this.tick++
        // Utils.displayStatusBar("step "+ Math.floor(this.tick/4))
    }

    displayLagWarning = (interval) => {
        console.log("lag de " + parseInt(interval) + " Ms")
        let text = "Argg, ça lague de " + parseInt(interval) + " Ms"
        Utils.displayModalMessage(text)
    }

    simpleBeep = (indexTrack) => {
        this.mfPlayer.simpleBeep(indexTrack)
    }
}