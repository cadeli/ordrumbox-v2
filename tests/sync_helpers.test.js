// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { syncComponentMap, syncKnobs } from '../src/ui/components/sync_helpers.js'

function makeInstance(key) {
    return {
        key,
        el: null,
        setValue: vi.fn(),
        destroy: vi.fn(),
        createElement: vi.fn(function () {
            const el = document.createElement('div')
            this.el = el
            return el
        }),
    }
}

function makeContainer(keyToPlaceholder = {}) {
    return {
        querySelector: vi.fn((sel) => {
            for (const [k, v] of Object.entries(keyToPlaceholder)) {
                if (sel.includes(k)) return v
            }
            return null
        }),
    }
}

describe('syncComponentMap', () => {
    it('creates new instances for keys not in prev', () => {
        const p1 = document.createElement('div')
        const container = makeContainer({ foo: p1 })
        const create = vi.fn(() => makeInstance('foo'))
        const update = vi.fn()

        const result = syncComponentMap({
            container,
            configs: [{ key: 'foo' }],
            selector: 'test',
            prev: new Map(),
            create,
            update,
        })

        expect(create).toHaveBeenCalledTimes(1)
        expect(result.has('foo')).toBe(true)
    })

    it('reuses existing instances for matching keys and calls update', () => {
        const parent = document.createElement('div')
        const p1 = document.createElement('div')
        parent.appendChild(p1)
        const container = makeContainer({ foo: p1 })
        const existing = makeInstance('foo')
        existing.el = document.createElement('div')
        parent.appendChild(existing.el)
        const create = vi.fn()
        const update = vi.fn()

        const result = syncComponentMap({
            container,
            configs: [{ key: 'foo', val: 42 }],
            selector: 'test',
            prev: new Map([['foo', existing]]),
            create,
            update,
        })

        expect(create).not.toHaveBeenCalled()
        expect(update).toHaveBeenCalledWith(existing, { key: 'foo', val: 42 })
        expect(result.get('foo')).toBe(existing)
    })

    it('skips createElement when el is already in correct parent', () => {
        const parent = document.createElement('div')
        const p1 = document.createElement('div')
        parent.appendChild(p1)
        const container = makeContainer({ foo: p1 })
        const existing = makeInstance('foo')
        existing.el = document.createElement('div')
        parent.appendChild(existing.el)

        syncComponentMap({
            container,
            configs: [{ key: 'foo' }],
            selector: 'test',
            prev: new Map([['foo', existing]]),
            create: vi.fn(),
            update: vi.fn(),
        })

        expect(existing.createElement).not.toHaveBeenCalled()
    })

    it('calls createElement when el is NOT in correct parent (bug contract)', () => {
        const parentA = document.createElement('div')
        const parentB = document.createElement('div')
        const p1 = document.createElement('div')
        parentA.appendChild(p1)
        const container = makeContainer({ foo: p1 })
        const existing = makeInstance('foo')
        existing.el = document.createElement('div')
        parentB.appendChild(existing.el)

        syncComponentMap({
            container,
            configs: [{ key: 'foo' }],
            selector: 'test',
            prev: new Map([['foo', existing]]),
            create: vi.fn(),
            update: vi.fn(),
        })

        expect(existing.createElement).toHaveBeenCalledTimes(1)
    })

    it('destroys orphans in prev that are not in configs', () => {
        const orphan = makeInstance('old')
        orphan.el = document.createElement('div')
        const container = makeContainer()

        syncComponentMap({
            container,
            configs: [],
            selector: 'test',
            prev: new Map([['old', orphan]]),
            create: vi.fn(),
            update: vi.fn(),
        })

        expect(orphan.destroy).toHaveBeenCalledTimes(1)
    })

    it('replaces placeholder with createElement output', () => {
        const p1 = document.createElement('div')
        const parent = document.createElement('div')
        parent.appendChild(p1)
        const container = makeContainer({ foo: p1 })
        const inst = makeInstance('foo')

        syncComponentMap({
            container,
            configs: [{ key: 'foo' }],
            selector: 'test',
            prev: new Map(),
            create: () => inst,
            update: vi.fn(),
        })

        expect(p1.parentNode).toBeNull()
        expect(inst.el.parentNode).toBe(parent)
    })
})

describe('syncKnobs', () => {
    it('creates OrKnobs with correct config', () => {
        const p1 = document.createElement('div')
        const container = makeContainer({ vol: p1 })

        const result = syncKnobs({
            container,
            configs: [{ key: 'vol', val: 0.8, label: 'Volume' }],
            selector: 'or-knob',
            prev: new Map(),
            paramMeta: { vol: { min: 0, max: 1, step: 0.01 } },
        })

        const knob = result.get('vol')
        expect(knob).toBeDefined()
        expect(knob.getValue()).toBe(0.8)
    })

    it('reuses existing OrKnobs via setValue (keep-alive)', () => {
        const p1 = document.createElement('div')
        const parent = document.createElement('div')
        parent.appendChild(p1)
        const container = makeContainer({ vol: p1 })

        const existing = makeInstance('vol')
        existing.el = document.createElement('div')
        parent.appendChild(existing.el)

        const result = syncKnobs({
            container,
            configs: [{ key: 'vol', val: 0.9, label: 'Volume' }],
            selector: 'or-knob',
            prev: new Map([['vol', existing]]),
            paramMeta: { vol: { min: 0, max: 1, step: 0.01 } },
        })

        expect(result.get('vol')).toBe(existing)
        expect(existing.setValue).toHaveBeenCalledWith(0.9)
    })

    it('falls back to auto-derived min/max/step when paramMeta is absent', () => {
        const p1 = document.createElement('div')
        const container = makeContainer({ mix: p1 })

        const result = syncKnobs({
            container,
            configs: [{ key: 'mix', val: 0.5, label: 'Mix' }],
            selector: 'or-knob',
            prev: new Map(),
        })

        const knob = result.get('mix')
        expect(knob).toBeDefined()
        expect(knob.getValue()).toBe(0.5)
    })

    it('destroys orphaned OrKnobs', () => {
        const orphan = makeInstance('old')
        orphan.el = document.createElement('div')
        const container = makeContainer()

        syncKnobs({
            container,
            configs: [],
            selector: 'or-knob',
            prev: new Map([['old', orphan]]),
        })

        expect(orphan.destroy).toHaveBeenCalledTimes(1)
    })
})
