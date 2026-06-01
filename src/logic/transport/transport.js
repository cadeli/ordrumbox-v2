import { TICK } from '../../core/constants.js'
import { appState } from '../../state/app_state.js'
import Utils from '../../core/utils.js'
import { serviceRegistry } from '../../state/service_registry.js'

export default class Transport {
    constructor(audioCtx) {
        this.audioCtx = audioCtx
        this.isRunning = false
        this.tick = 1
        this.bpm = 120.0
        this.lookahead = 25.0
        this.scheduleAheadTime = 0.1
        this.nextStepTime = 0.0
        this.nextClockTime = 0.0
        this.clockInterval = 60 / (this.bpm * 24)
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
        const now = this.audioCtx.currentTime
        this.nextStepTime = now
        this.nextClockTime = now
        
        this.ensureTimerWorker()
        this.timerWorker.postMessage("start")

        if (serviceRegistry.midiManager) {
            const perfNow = performance.now()
            serviceRegistry.midiManager.sendStart(perfNow)
        }
    }

    stop = () => {
        this.isRunning = false
        this.timerWorker?.postMessage("stop")
        
        if (serviceRegistry.midiManager) {
            serviceRegistry.midiManager.sendStop()
        }
    }

    setBpm = (bpm) => {
        this.bpm = bpm
        this.clockInterval = 60 / (this.bpm * 24)
        appState.secondsPerBeat = 60 * 4 / (this.bpm * TICK)
        console.log("Transport::setBpm new bpm is ", bpm)
    }

    scheduler = () => {
        const audioNow = this.audioCtx.currentTime
        const perfNow = performance.now()

        // Schedule Clock
        while (this.nextClockTime < audioNow + this.scheduleAheadTime) {
            if (this.isRunning && serviceRegistry.midiManager) {
                const midiTime = perfNow + (this.nextClockTime - audioNow) * 1000
                serviceRegistry.midiManager.sendClock(midiTime)
            }
            this.nextClockTime += this.clockInterval
        }

        // Schedule Ticks
        while (this.nextStepTime < audioNow + this.scheduleAheadTime) {
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
