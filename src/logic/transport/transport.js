import { TICK } from '../../core/constants.js'
import { appState } from '../../state/app_state.js'
import { logger } from '../../core/logger.js'
import { reportUserError } from '../../core/notify.js'

export default class Transport {
    #getMidiManager

    /**
     * @param {BaseAudioContext} audioCtx
     * @param {object} [deps]
     * @param {() => any} [deps.getMidiManager] - resolves the live MIDI manager at call time (lazily created)
     */
    constructor(audioCtx, deps = {}) {
        this.#getMidiManager = deps.getMidiManager ?? (() => null)
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

    /** @returns {void} */
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

    /** @returns {void} */
    start = () => {
        this.isRunning = true
        this.tick = 0
        const now = this.audioCtx.currentTime
        this.nextStepTime = now
        this.nextClockTime = now

        this.ensureTimerWorker()
        this.timerWorker.postMessage('start')

        const midiManager = this.#getMidiManager()
        if (midiManager) {
            const perfNow = performance.now()
            midiManager.sendStart(perfNow)
        }
    }

    /** @returns {void} */
    stop = () => {
        this.isRunning = false
        this.timerWorker?.postMessage('stop')

        const midiManager = this.#getMidiManager()
        if (midiManager) {
            midiManager.sendStop()
        }
    }

    /** @param {number} bpm */
    setBpm = (bpm) => {
        this.bpm = bpm
        this.clockInterval = 60 / (this.bpm * 24)
        appState.secondsPerTick = 60 / (this.bpm * TICK)
        logger.info('Transport', 'Transport::setBpm new bpm is ', bpm)
    }

    /** @returns {void} */
    scheduler = () => {
        const audioNow = this.audioCtx.currentTime
        const perfNow = performance.now()

        // Schedule Clock
        while (this.nextClockTime < audioNow + this.scheduleAheadSeconds) {
            if (this.isRunning && this.#getMidiManager()) {
                const midiTime = perfNow + (this.nextClockTime - audioNow) * 1000
                this.#getMidiManager().sendClock(midiTime)
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
    /** @returns {void} */
    advanceTick = () => {
        this.nextStepTime += appState.secondsPerTick
        this.tick++
    }
}
