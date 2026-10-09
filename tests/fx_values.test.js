import { describe, it, expect } from 'vitest'
import {
    WAVE_TYPES,
    FILTER_TYPES,
    WAVE_TO_INT,
    FILTER_TO_INT,
    waveToInt,
    filterToInt,
    DELAY_TIME_VALUES,
    DELAY_TIME_LABELS,
    getDelayTimeInSeconds,
} from '../src/audio/fx_values.js'

describe('audio/fx_values', () => {
    // The UI picks a value by INDEX in WAVE_TYPES/FILTER_TYPES while the voice
    // maps the name to the worklet int through *_TO_INT — the two must agree,
    // or a knob position and a rendered sound drift apart.
    describe('name → worklet integer contract', () => {
        it('WAVE_TO_INT mirrors the index in WAVE_TYPES', () => {
            WAVE_TYPES.forEach((name, i) => {
                expect(WAVE_TO_INT[name], `wave '${name}'`).toBe(i)
                expect(waveToInt(name), `wave '${name}'`).toBe(i)
            })
        })

        it('FILTER_TO_INT mirrors the index in FILTER_TYPES', () => {
            FILTER_TYPES.forEach((name, i) => {
                expect(FILTER_TO_INT[name], `filter '${name}'`).toBe(i)
                expect(filterToInt(name), `filter '${name}'`).toBe(i)
            })
        })

        // `notch` is worklet-only (hand-written patterns): present in the map,
        // absent from the UI list.
        it('notch is mapped but not UI-exposed', () => {
            expect(FILTER_TO_INT.notch).toBe(3)
            expect(filterToInt('notch')).toBe(3)
            expect(FILTER_TYPES).not.toContain('notch')
        })

        it('random is the 5th waveform (sample & hold, code 4)', () => {
            expect(WAVE_TYPES).toContain('random')
            expect(waveToInt('random')).toBe(4)
        })

        it('unknown names fall back to the first entry', () => {
            expect(waveToInt('nope')).toBe(0)
            expect(filterToInt('nope')).toBe(0)
        })
    })

    describe('delay time values', () => {
        it('has one label per value', () => {
            expect(DELAY_TIME_LABELS).toHaveLength(DELAY_TIME_VALUES.length)
        })

        it('values ascend from 1/16 to 4 beats', () => {
            expect(DELAY_TIME_VALUES).toEqual([0.0625, 0.125, 0.25, 0.5, 1, 2, 4])
        })
    })

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
