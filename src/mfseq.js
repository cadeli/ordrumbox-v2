import { MfGlobals } from './mfglobals.js'

import Utils from './utils.js'
import MfPlayer from './snd/mfplayer.js'
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
        this.lookahead = 25.0; // How frequently to call scheduling function (in milliseconds)
        this.scheduleAheadTime = 0.1; // How far ahead to schedule audio (sec) This is calculated from lookahead, and overlaps  with next interval (in case the timer is late)
        this.nextStepTime = 0.0; // when the next note is due.
        this.timerWorker = null;
        this.isPatternsLoading = false
        this.patternsLoadFailed = false
        this.isSamplesLoading = false
        this.samplesLoadFailed = false
        MfGlobals.mfMixer = new MfMixer()
    }

    ensureTimerWorker = () => {
        if (this.timerWorker) {
            return
        }

        this.timerWorker = new Worker(
            new URL('timerworker.js', import.meta.url),
            { type: 'module' } // allow "import" inside worker
        )

        this.timerWorker.onmessage = (e) => {
            if (e.data == "tick") {
                this.scheduler();
            } else {
                console.log("message: " + e.data);
            }
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

    firstStart = async () => {
        console.log("mfseq::firstStart : nbpat=",MfGlobals.patterns.length )
   
        console.log("mfSeq::firstStart::sounds")
        console.log(MfGlobals.sounds)
        if (MfGlobals.patterns.length==0) {
            if (this.isPatternsLoading || this.patternsLoadFailed) {
                return
            }

            this.isPatternsLoading = true
            MfGlobals.mfResourcesLoader.loadPatterns(MfGlobals.urlpatterns, () => {
                this.isPatternsLoading = false
                if (MfGlobals.patterns.length === 0) {
                    this.patternsLoadFailed = true
                    console.warn("mfSeq::firstStart loaded no patterns")
                    return
                }
                this.firstStart()
            }).catch((error) => {
                this.isPatternsLoading = false
                this.patternsLoadFailed = true
                console.error("mfSeq::firstStart failed to load patterns", error)
            })
            return
        }
        let selPattern = MfGlobals.patterns[MfGlobals.selectedPatternNum]
        if (!selPattern) {
            console.warn("mfSeq::firstStart no selected pattern")
            return
        }
        MfGlobals.mfSeq.setBpm(selPattern.bpm)
        const mfAutoAssign = await MfGlobals.getAutoAssign()
        mfAutoAssign.autoAssignSounds(selPattern)
        MfGlobals.mfPatterns.computeFlatNotesFromPattern(selPattern)
        document.getElementById("resourcesProgress").style.display = 'none'
        document.getElementById("showPattern").style.display = 'block'
        this.start()
    }

    start = () => {
        MfGlobals.mfResourcesLoader.ensureAudioContext()
        if (Object.keys(MfGlobals.sounds).length == 0) {
            if (this.isSamplesLoading || this.samplesLoadFailed) {
                return
            }

            const drumkit = MfGlobals.drumkitList[0]
            if (!drumkit) {
                this.samplesLoadFailed = true
                console.warn("mfSeq::start no drumkit available")
                return
            }

            this.isSamplesLoading = true
            MfGlobals.mfResourcesLoader.loadSamplesFromDrumkit(drumkit).then(() => {
                this.isSamplesLoading = false
                if (Object.keys(MfGlobals.sounds).length === 0) {
                    this.samplesLoadFailed = true
                    console.warn("mfSeq::start loaded no samples")
                    return
                }
                this.firstStart()
            }).catch((error) => {
                this.isSamplesLoading = false
                this.samplesLoadFailed = true
                console.error("mfSeq::start failed to load samples", error)
            })
        } else {
            if (!this.unlocked) {
                this.playSilentBuffer()
            }
            this.isRunning = true
            this.tick = 0;
            this.nextStepTime = MfGlobals.audioCtx.currentTime;
            this.ensureTimerWorker()
            this.timerWorker.postMessage("start");
            if (MfGlobals.mfMixer == null) {
                MfGlobals.mfMixer = new MfMixer()
            }
            MfGlobals.mfMixer.start()
            if (this.mfAudioRec == null) {
                import('./snd/mfaudiorec.js').then(({ default: MfAudioRec }) => {
                    if (!this.isRunning || this.mfAudioRec != null) {
                        return
                    }
                    this.mfAudioRec = new MfAudioRec(MfGlobals.mfMixer.analyser)
                    this.mfAudioRec.startRecording()
                    this.mfAudioRec.onComplete = function (rec, blob) {
                        MfGlobals.blob = blob
                    }
                })
            }
        }
    }

    stop = () => {
        this.isRunning = false
        this.timerWorker?.postMessage("stop")
        if (MfGlobals.mfMixer) {
            MfGlobals.mfMixer.stop()
        }
        if (this.mfAudioRec) {
            this.mfAudioRec.finishRecording()
            this.mfAudioRec = null
        }
    }

    toggleStartStop = () => {
        //MfGlobals.mfLoader.loadSamplesIsWorking = false // TODO (manual fallback)
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
        MfGlobals.secondsPerBeat = 60 * 4 / (this.bpm * MfGlobals.TICK)
        let selPat = MfGlobals.patterns[MfGlobals.selectedPatternNum]
        selPat.bpm = bpm
        console.log("mdSeq::setBpm new bpm is ", bpm)
    }

    scheduler = () => {
        while (this.nextStepTime < MfGlobals.audioCtx.currentTime + this.scheduleAheadTime) {
            if (this.isRunning) {
                this.mfPlayer.playNotes(this.tick, this.nextStepTime)
            }
            this.nextNote();
        }
    }

    nextNote = () => {
        // Advance current note and time by a 16th note...
        this.nextStepTime += 0.25 * MfGlobals.secondsPerBeat
        this.tick++
         Utils.displayStatusBar("step "+ Math.floor(this.tick/4))
    }

    displayLagWarning = (interval) => {
        console.log("lag de " + parseFloat(interval) + " Ms")
        let text = "Argg, ça lague de " + parseFloat(interval) + " Ms"
        Utils.displayModalMessage(text)
    }

    simpleBeep = (indexTrack) => {
        if (MfGlobals.mfMixer) {
            MfGlobals.mfResourcesLoader.ensureAudioContext()
            this.mfPlayer.simpleBeep(indexTrack)
        }
    }
}
