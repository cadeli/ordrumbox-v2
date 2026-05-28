import { TICK } from '../../core/constants.js'
import { appState } from '../../state/app_state.js'
import Utils from '../../core/utils.js'

export default class Transport {
    constructor(audioCtx) {
        this.audioCtx = audioCtx
        this.isRunning = false
        this.tick = 1
        this.bpm = 120.0
        this.lookahead = 25.0
        this.scheduleAheadTime = 0.1
        this.nextStepTime = 0.0
        this.timerWorker = null
        this.onSchedule = null // Callback(tick, time)
    }

    ensureTimerWorker = () => {
        if (this.timerWorker) return

        this.timerWorker = new Worker(
            new URL('../../core/timerworker.js', import.meta.url),
            { type: 'module' }
        )

        this.timerWorker.onmessage = (e) => {
            if (e.data === "tick") {
                this.scheduler()
            } else {
                console.log("Transport worker message: " + e.data)
            }
        }
        this.timerWorker.postMessage({ "interval": this.lookahead })
    }

    start = () => {
        this.isRunning = true
        this.tick = 0
        this.nextStepTime = this.audioCtx.currentTime
        this.ensureTimerWorker()
        this.timerWorker.postMessage("start")
    }

    stop = () => {
        this.isRunning = false
        this.timerWorker?.postMessage("stop")
    }

    setBpm = (bpm) => {
        this.bpm = bpm
        appState.secondsPerBeat = 60 * 4 / (this.bpm * TICK)
        console.log("Transport::setBpm new bpm is ", bpm)
    }

    scheduler = () => {
        while (this.nextStepTime < this.audioCtx.currentTime + this.scheduleAheadTime) {
            if (this.isRunning && this.onSchedule) {
                this.onSchedule(this.tick, this.nextStepTime)
            }
            this.nextNote()
        }
    }

    nextNote = () => {
        this.nextStepTime += 0.25 * appState.secondsPerBeat
        this.tick++
        Utils.displayStatusBar("step " + Math.floor(this.tick / 4))
    }
}
