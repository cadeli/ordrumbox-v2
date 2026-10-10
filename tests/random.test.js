import { describe, it, expect, vi } from 'vitest'
import { pickRandom, pickRandomKey } from '../src/core/random.js'

describe('core/random', () => {
    describe('pickRandom', () => {
        it('returns an item of the list', () => {
            const list = ['a', 'b', 'c']
            expect(list).toContain(pickRandom(list))
        })

        it('draws over the whole index range', () => {
            const rnd = vi.spyOn(Math, 'random').mockReturnValue(0)
            expect(pickRandom(['a', 'b', 'c'])).toBe('a')
            rnd.mockReturnValue(0.99)
            expect(pickRandom(['a', 'b', 'c'])).toBe('c')
            rnd.mockRestore()
        })

        it('returns null for an empty list', () => {
            expect(pickRandom([])).toBeNull()
            expect(pickRandom(null)).toBeNull()
            expect(pickRandom(undefined)).toBeNull()
        })

        it('draws nothing when the list is empty', () => {
            const rnd = vi.spyOn(Math, 'random')
            pickRandom([])
            expect(rnd).not.toHaveBeenCalled()
            rnd.mockRestore()
        })
    })

    describe('pickRandomKey', () => {
        it('returns a key of the object', () => {
            const obj = { a: 1, b: 2, c: 3 }
            expect(['a', 'b', 'c']).toContain(pickRandomKey(obj))
        })

        it('returns null for an empty object', () => {
            expect(pickRandomKey({})).toBeNull()
        })
    })
})
