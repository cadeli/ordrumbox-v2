import { describe, it, expect } from 'vitest'
import { getDelayTimeInSeconds } from '../src/audio/fx_values.js'

describe('audio/fx_values', () => {
    describe('getDelayTimeInSeconds', () => {
        it('1 @ 120bpm = 0.5s', () => {
            expect(getDelayTimeInSeconds(1, 120)).toBe(0.5)
        })

        it('4 @ 60bpm = 4s', () => {
            expect(getDelayTimeInSeconds(4, 60)).toBe(4)
        })

        it('2 @ 120bpm = 1s', () => {
            expect(getDelayTimeInSeconds(2, 120)).toBe(1)
        })

        it('invalid value falls back to multiplier 1', () => {
            expect(getDelayTimeInSeconds('abc', 120)).toBe(0.5)
        })

        it('0 is a valid delay time (returns 0 seconds)', () => {
            expect(getDelayTimeInSeconds(0, 120)).toBe(0)
        })
    })
})
