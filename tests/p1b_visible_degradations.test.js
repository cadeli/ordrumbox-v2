/**
 * @vitest-environment jsdom
 *
 * P1b: degradations that must be VISIBLE to the user (production drops
 * console.*, so a logger call alone is invisible), plus the event-parity guard
 * that keeps orphan events (emitted but never subscribed) from coming back.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { EVENTS } from '../src/core/events.js'
import { playbackEvents } from '../src/state/playback_events.js'
import { resetUserErrorReports } from '../src/core/notify.js'

function srcFiles(dir = 'src', out = []) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const p = resolve(dir, entry.name)
        if (entry.isDirectory()) srcFiles(p, out)
        else if (entry.name.endsWith('.js')) out.push(p)
    }
    return out
}

describe('P1b — visible degradations', () => {
    beforeEach(() => {
        resetUserErrorReports()
        // Several tests here blow up listeners and trip degradation guards on
        // purpose; the EventBus and notify layers log the cause, which prints
        // expected stack traces that read like real failures.
        vi.spyOn(console, 'error').mockImplementation(() => {})
        vi.spyOn(console, 'warn').mockImplementation(() => {})
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    describe('event bus isolates listener failures', () => {
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

    describe('every event is emitted and subscribed (parity guard)', () => {
        const files = srcFiles('src')
        const emitted = new Set()
        const subscribed = new Set()

        for (const file of files) {
            const src = readFileSync(file, 'utf8')
            for (const m of src.matchAll(/playbackEvents\.emit\(\s*EVENTS\.(\w+)/g)) emitted.add(m[1])
            for (const m of src.matchAll(/EVENTS\.(\w+)/g)) {
                // count as "touched"; the parity check below only needs the
                // events that are emitted somewhere
                subscribed.add(m[1])
            }
        }

        for (const [name, value] of Object.entries(EVENTS)) {
            it(`${name} is referenced outside events.js`, () => {
                expect(subscribed.has(name), `EVENTS.${name} (${value}) is never referenced`).toBe(true)
            })
        }

        it('every emitted event is also referenced somewhere it can be handled', () => {
            for (const name of emitted) {
                expect(subscribed.has(name)).toBe(true)
            }
        })
    })
})
