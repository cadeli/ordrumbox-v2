import { TICK } from '../../core/constants.js'
import { appState } from '../../state/app_state.js'
import { serviceRegistry } from '../../state/service_registry.js'
import { logger } from '../../core/logger.js'
import { reportUserError } from '../../core/notify.js'

export default class Transport {
    constructor(audioCtx) {
        this.audioCtx = audioCtx
        this.isRunning = false
        this.tick = 1
        this.bpm = 120.0
        this.schedulerPollIntervalMs = 25.0
        this.scheduleAheadSeconds = 0.1
        this.nextStepTime = 0.0
        this.nextClockTime = 0.0
        this.clockInterval = 60 / (this.bpm * 24)
        this.timerWorker = null
        this.onSchedule = null // Callback(tick, time)
    }

    ensureTimerWorker = () => {
        if (this.timerWorker) return

        this.timerWorker = new Worker(new URL('../../core/timerworker.js', import.meta.url), { type: 'module' })

        this.timerWorker.onmessage = (e) => {
            if (e.data === 'tick') {
                this.scheduler()
            } else {
                logger.info('Transport', 'Transport worker message: ' + e.data)
            }
        }
        this.timerWorker.postMessage({ interval: this.schedulerPollIntervalMs })
    }

    start = () => {
        this.isRunning = true
        this.tick = 0
        const now = this.audioCtx.currentTime
        this.nextStepTime = now
        this.nextClockTime = now

        this.ensureTimerWorker()
        this.timerWorker.postMessage('start')

        if (serviceRegistry.midiManager) {
            const perfNow = performance.now()
            serviceRegistry.midiManager.sendStart(perfNow)
        }
    }

    stop = () => {
        this.isRunning = false
        this.timerWorker?.postMessage('stop')

        if (serviceRegistry.midiManager) {
            serviceRegistry.midiManager.sendStop()
        }
    }

    setBpm = (bpm) => {
        this.bpm = bpm
        this.clockInterval = 60 / (this.bpm * 24)
        appState.secondsPerTick = 60 / (this.bpm * TICK)
        logger.info('Transport', 'Transport::setBpm new bpm is ', bpm)
    }

    scheduler = () => {
        const audioNow = this.audioCtx.currentTime
        const perfNow = performance.now()

        // Schedule Clock
        while (this.nextClockTime < audioNow + this.scheduleAheadSeconds) {
            if (this.isRunning && serviceRegistry.midiManager) {
                const midiTime = perfNow + (this.nextClockTime - audioNow) * 1000
                serviceRegistry.midiManager.sendClock(midiTime)
            }
            this.nextClockTime += this.clockInterval
        }

        // Schedule Ticks
        // onSchedule runs synchronously and the tick is advanced right after it:
        // the poll fires every 25 ms while a tick lasts ~15.6 ms at 120 BPM, so
        // anything that holds the loop open (an awaited promise, a single-flight
        // guard) would let the lookahead fall behind and playback run slow.
        // Async failures are handled by the caller itself — see Sequencer.
        while (this.nextStepTime < audioNow + this.scheduleAheadSeconds) {
            if (this.isRunning && this.onSchedule) {
                try {
                    this.onSchedule(this.tick, this.nextStepTime)
                } catch (err) {
                    // A synchronous throw used to escape into the worker
                    // onmessage and freeze playback.
                    logger.error('Transport', 'onSchedule threw', err)
                    reportUserError('Transport.onSchedule', 'Playback tick failed — audio may drop out', { cause: err })
                }
                this.advanceTick()
            } else {
                break
            }
        }
    }

    /**
     * Advances the sequencer by one tick: pushes nextStepTime one tick further and
     * increments the counter. Nothing is "noted" here — the caller (onSchedule) is
     * what sounds a tick. (It used to be called nextNote, which claims an effect
     * this method does not have.)
     */
    advanceTick = () => {
        this.nextStepTime += appState.secondsPerTick
        this.tick++
    }
}
