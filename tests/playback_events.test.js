/**
 * playbackEvents (EventBus) — a subscriber must never be able to starve the
 * others: production drops console.*, so a swallowed exception would be silent,
 * and one broken panel listener would freeze every other panel on the same event.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { playbackEvents } from '../src/state/playback_events.js'
import { resetUserErrorReports } from '../src/core/notify.js'

describe('EventBus — listener failures stay isolated', () => {
    beforeEach(() => {
        resetUserErrorReports()
        // Both tests below make a subscriber throw on purpose; the bus reports the
        // cause, which prints an expected stack trace that reads like a failure.
        vi.spyOn(console, 'error').mockImplementation(() => {})
        vi.spyOn(console, 'warn').mockImplementation(() => {})
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('a throwing subscriber does not starve the other subscribers', () => {
        const seen = []
        const boom = vi.fn(() => {
            throw new Error('subscriber exploded')
        })
        const after = vi.fn(() => seen.push('after'))

        playbackEvents.on('p1b-test-event', boom)
        playbackEvents.on('p1b-test-event', after)

        expect(() => playbackEvents.emit('p1b-test-event', 1)).not.toThrow()
        expect(boom).toHaveBeenCalledTimes(1)
        expect(after).toHaveBeenCalledTimes(1)
        expect(seen).toEqual(['after'])

        playbackEvents.off('p1b-test-event', boom)
        playbackEvents.off('p1b-test-event', after)
    })

    it('a throwing subscriber inside batch() does not abort the queue', () => {
        const second = vi.fn()
        const boom = () => {
            throw new Error('boom')
        }
        playbackEvents.on('p1b-batch-event', boom)
        playbackEvents.on('p1b-batch-2', second)

        expect(() =>
            playbackEvents.batch(() => {
                playbackEvents.emit('p1b-batch-event')
                playbackEvents.emit('p1b-batch-2')
            }),
        ).not.toThrow()
        expect(second).toHaveBeenCalledTimes(1)

        playbackEvents.off('p1b-batch-event', boom)
        playbackEvents.off('p1b-batch-2', second)
    })
})
