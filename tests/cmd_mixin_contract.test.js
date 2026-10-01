// tests/cmd_mixin_contract.test.js
// Guard: the 34 command sub-module methods stay own, spread-safe delegates.
import { describe, it, expect } from 'vitest'
import Commander from '../src/logic/commands/cmd.js'

describe('Commander mixin contract', () => {
    it('declares exactly the 34 sub-module method names, unique', () => {
        expect(Commander.MIXIN_METHODS.length).toBe(34)
        expect(new Set(Commander.MIXIN_METHODS).size).toBe(34)
    })

    it('every mixin name is an own function property of a fresh Commander', () => {
        const cmd = new Commander()
        for (const name of Commander.MIXIN_METHODS) {
            expect(typeof cmd[name], `${name} must be a function`).toBe('function')
            expect(Object.hasOwn(cmd, name), `${name} must be own (spread copies)`).toBe(true)
        }
    })

    it('no mixin name collides with a Commander prototype method', () => {
        const proto = Commander.prototype
        for (const name of Commander.MIXIN_METHODS) {
            expect(proto[name], `${name} must not live on the prototype`).toBeUndefined()
        }
    })

    it('a spread copy still drives the real instance', () => {
        const cmd = new Commander()
        const copy = { ...cmd }
        const track = { name: 'T', stepsPerBeat: 4, nbBeats: 4, notes: [] }
        copy.addNote(track, 0, 0, 5)
        expect(track.notes).toHaveLength(1)
        expect(track.notes[0].beat).toBe(0)
    })

    it('overriding a method on a spread copy leaves the real instance untouched', () => {
        const cmd = new Commander()
        const copy = { ...cmd }
        copy.addNote = () => 'overridden'
        expect(copy.addNote()).toBe('overridden')
        expect(cmd.addNote).not.toBe(copy.addNote)
        expect(typeof cmd.addNote).toBe('function')
    })
})
