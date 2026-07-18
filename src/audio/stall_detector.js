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
    constructor({ audioCtx, transport, checkIntervalMs = 500 } = {}) {
        this._audioCtx = audioCtx
        this._transport = transport
        this._checkIntervalMs = checkIntervalMs
        this._timerId = null
        this._lastTick = -1
        this._stalled = false
        this._onCtxStateChangeBound = this._onCtxStateChange.bind(this)
    }

    start() {
        if (this._timerId) return

        this._lastTick = this._transport?.tick ?? -1
        this._stalled = false

        if (typeof this._audioCtx?.addEventListener === 'function') {
            this._audioCtx.addEventListener('statechange', this._onCtxStateChangeBound)
        } else if (this._audioCtx) {
            this._audioCtx.onstatechange = this._onCtxStateChangeBound
        }

        this._timerId = setInterval(() => this._check(), this._checkIntervalMs)
    }

    stop() {
        if (this._timerId) {
            clearInterval(this._timerId)
            this._timerId = null
        }

        if (this._audioCtx) {
            if (typeof this._audioCtx.removeEventListener === 'function') {
                this._audioCtx.removeEventListener('statechange', this._onCtxStateChangeBound)
            } else {
                this._audioCtx.onstatechange = null
            }
        }

        if (this._stalled) {
            this._stalled = false
            playbackEvents.dispatchStallResume()
        }
    }

    get isStalled() {
        return this._stalled
    }

    _onCtxStateChange() {
        const state = this._audioCtx?.state
        if (state === 'suspended' && this._transport?.isRunning && !this._stalled) {
            this._stalled = true
            logger.warn('StallDetector', 'AudioContext suspended during playback')
            playbackEvents.dispatchStall({ reason: 'context-suspended' })
            this._tryResume()
        } else if (state === 'running' && this._stalled) {
            this._stalled = false
            logger.warn('StallDetector', 'AudioContext resumed')
            playbackEvents.dispatchStallResume()
        }
    }

    _check() {
        if (!this._transport?.isRunning) return

        const currentTick = this._transport.tick
        const tickAdvanced = currentTick !== this._lastTick
        this._lastTick = currentTick

        if (!tickAdvanced) {
            if (!this._stalled) {
                this._stalled = true
                logger.warn('StallDetector', 'Scheduler stalled — tick not advancing')
                playbackEvents.dispatchStall({ reason: 'scheduler-silent' })
                this._tryResume()
            }
        } else if (this._stalled) {
            this._stalled = false
            playbackEvents.dispatchStallResume()
        }
    }

    async _tryResume() {
        if (this._audioCtx?.state === 'suspended') {
            try {
                await this._audioCtx.resume()
                if (this._audioCtx?.state === 'running') {
                    logger.warn('StallDetector', 'AudioContext resumed via .resume()')
                }
            } catch {
                // resume failed — ignore
            }
        }
    }
}
