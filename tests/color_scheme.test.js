/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from 'vitest'
import { COLOR_SCHEME_COUNT, normalizeColorScheme } from '../src/core/constants.js'
import { applyColorScheme, color } from '../src/ui/theme.js'

describe('normalizeColorScheme', () => {
    it('keeps every scheme 1..COLOR_SCHEME_COUNT', () => {
        expect(COLOR_SCHEME_COUNT).toBe(3)
        for (let n = 1; n <= COLOR_SCHEME_COUNT; n++) {
            expect(normalizeColorScheme(n)).toBe(n)
        }
    })

    it('accepts the id as a numeric string', () => {
        expect(normalizeColorScheme('2')).toBe(2)
        expect(normalizeColorScheme('  3 ')).toBe(3)
    })

    it('falls back to 1 for anything else', () => {
        const invalid = [0, -1, 4, 42, 2.5, NaN, null, undefined, '', 'blue', [], {}, false]
        for (const value of invalid) {
            expect(normalizeColorScheme(value), String(value)).toBe(1)
        }
    })
})

describe('applyColorScheme', () => {
    afterEach(() => {
        delete document.documentElement.dataset.scheme
        document.documentElement.style.removeProperty('--accent')
        // drop any cache the test populated so later suites see the real tokens
        applyColorScheme(1)
        delete document.documentElement.dataset.scheme
    })

    it('tags the document with the normalized scheme', () => {
        expect(applyColorScheme(2)).toBe(2)
        expect(document.documentElement.dataset.scheme).toBe('2')

        expect(applyColorScheme(42)).toBe(1)
        expect(document.documentElement.dataset.scheme).toBe('1')
    })

    it('drops the token cache so the next color() re-reads the variables', () => {
        document.documentElement.style.setProperty('--accent', '#111111')
        expect(color('accent')).toBe('#111111')

        document.documentElement.style.setProperty('--accent', '#222222')
        expect(color('accent')).toBe('#111111') // still the cached read

        applyColorScheme(3)
        expect(color('accent')).toBe('#222222') // cache dropped, fresh read
    })
})
