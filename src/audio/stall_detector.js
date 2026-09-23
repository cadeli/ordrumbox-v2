import { playbackEvents } from '../state/playback_events.js'
import { logger } from '../core/logger.js'

/**
 * Monitors the audio scheduling loop for stalls.
 *
 * Detects:
 * - Timer worker stoppage (tab throttled, worker crash) — via tick counter
 * - AudioContext suspension (browser policy, user gesture required)
 *
 * Fires playbackEvents.onStall / onStallResume when state changes.
 */
export default class AudioStallDetector {
    #audioCtx
    #transport
    #checkIntervalMs
    #timerId
    #lastTick
    #stalled
    #onCtxStateChangeBound

    constructor({ audioCtx, transport, checkIntervalMs = 500 } = {}) {
        this.#audioCtx = audioCtx
        this.#transport = transport
        this.#checkIntervalMs = checkIntervalMs
        this.#timerId = null
        this.#lastTick = -1
        this.#stalled = false
        this.#onCtxStateChangeBound = this.#onCtxStateChange.bind(this)
    }

    start() {
        if (this.#timerId) return

        this.#lastTick = this.#transport?.tick ?? -1
        this.#stalled = false

        this.#audioCtx.addEventListener('statechange', this.#onCtxStateChangeBound)

        this.#timerId = setInterval(() => this.#check(), this.#checkIntervalMs)
    }

    stop() {
        if (this.#timerId) {
            clearInterval(this.#timerId)
            this.#timerId = null
        }

        if (this.#audioCtx) {
            this.#audioCtx.removeEventListener('statechange', this.#onCtxStateChangeBound)
        }

        if (this.#stalled) {
            this.#stalled = false
            playbackEvents.emit('stallResume')
        }
    }

    get isStalled() {
        return this.#stalled
    }

    #onCtxStateChange() {
        const state = this.#audioCtx?.state
        if (state === 'suspended' && this.#transport?.isRunning && !this.#stalled) {
            this.#stalled = true
            logger.warn('StallDetector', 'AudioContext suspended during playback')
            playbackEvents.emit('stall', { reason: 'context-suspended' })
            this.#tryResume()
        } else if (state === 'running' && this.#stalled) {
            this.#stalled = false
            logger.warn('StallDetector', 'AudioContext resumed')
            playbackEvents.emit('stallResume')
        }
    }

    #check() {
        if (!this.#transport?.isRunning) return

        const currentTick = this.#transport.tick
        const tickAdvanced = currentTick !== this.#lastTick
        this.#lastTick = currentTick

        if (!tickAdvanced) {
            if (!this.#stalled) {
                this.#stalled = true
                logger.warn('StallDetector', 'Scheduler stalled — tick not advancing')
                playbackEvents.emit('stall', { reason: 'scheduler-silent' })
                this.#tryResume()
            }
        } else if (this.#stalled) {
            this.#stalled = false
            playbackEvents.emit('stallResume')
        }
    }

    async #tryResume() {
        if (this.#audioCtx?.state === 'suspended') {
            try {
                await this.#audioCtx.resume()
                if (this.#audioCtx?.state === 'running') {
                    logger.warn('StallDetector', 'AudioContext resumed via .resume()')
                }
            } catch (e) {
                logger.warn('StallDetector', 'AudioContext resume failed', e)
            }
        }
    }
}
