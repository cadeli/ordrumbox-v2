import { describe, it, expect, beforeEach } from 'vitest'
import { appState } from '../src/state/app_state.js'
import { makeAppStateMock } from './helpers/app_state_mock.js'

describe('appState.selectedPattern', () => {
    beforeEach(() => {
        appState.reset()
        appState.patterns = [{ name: 'A' }, { name: 'B' }, { name: 'C' }]
    })

    it('is derived from patterns[selectedPatternIdx], never stored', () => {
        appState.selectedPatternIdx = 1
        expect(appState.selectedPattern).toBe(appState.patterns[1])

        appState.selectedPatternIdx = 2
        expect(appState.selectedPattern).toBe(appState.patterns[2])
    })

    it('follows a later index change (not a snapshot)', () => {
        appState.selectedPatternIdx = 0
        expect(appState.selectedPattern.name).toBe('A')

        appState.selectedPatternIdx = 2
        expect(appState.selectedPattern.name).toBe('C')
    })

    it('returns undefined when the index points outside patterns', () => {
        appState.selectedPatternIdx = 7
        expect(appState.selectedPattern).toBeUndefined()
    })

    it('returns undefined when there is no pattern at all', () => {
        appState.patterns = []
        appState.selectedPatternIdx = 0
        expect(appState.selectedPattern).toBeUndefined()
    })

    it('survives reset() (prototype getter, not an own field)', () => {
        appState.selectedPatternIdx = 2
        appState.reset()
        appState.patterns = [{ name: 'A' }]
        expect(appState.selectedPattern).toBe(appState.patterns[0])
        expect(Object.hasOwn(appState, 'selectedPattern')).toBe(false)
    })

    it('is not overwritten by Object.assign in reset()', () => {
        Object.assign(appState, { patterns: [{ name: 'Z' }], selectedPatternIdx: 0 })
        expect(appState.selectedPattern.name).toBe('Z')
    })
})

describe('makeAppStateMock (test helper)', () => {
    it('mirrors the real getter so mocks cannot silently degrade', () => {
        const mock = makeAppStateMock({ patterns: [{ name: 'A' }, { name: 'B' }] })
        expect(mock.selectedPattern).toBe(mock.patterns[0])

        mock.selectedPatternIdx = 1
        expect(mock.selectedPattern.name).toBe('B')

        mock.selectedPatternIdx = 9
        expect(mock.selectedPattern).toBeUndefined()
    })
})
