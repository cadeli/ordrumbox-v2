import { describe, it, expect } from 'vitest'
import Utils from '../src/core/utils.js'

describe('Utils (delay times)', () => {
    describe('getDelayTimeInSeconds', () => {
        it('1 @ 120bpm = 0.5s', () => {
            expect(Utils.getDelayTimeInSeconds(1, 120)).toBe(0.5)
        })

        it('4 @ 60bpm = 4s', () => {
            expect(Utils.getDelayTimeInSeconds(4, 60)).toBe(4)
        })

        it('2 @ 120bpm = 1s', () => {
            expect(Utils.getDelayTimeInSeconds(2, 120)).toBe(1)
        })

        it('invalid value falls back to multiplier 1', () => {
            expect(Utils.getDelayTimeInSeconds('abc', 120)).toBe(0.5)
        })

        it('0 is a valid delay time (returns 0 seconds)', () => {
            expect(Utils.getDelayTimeInSeconds(0, 120)).toBe(0)
        })
    })
})
