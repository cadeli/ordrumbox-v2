import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, statSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = join(__dirname, '..')
const DRUMKITS_JSON = join(PROJECT_ROOT, 'assets/data/drumkits.json')
const KITS_DIR = join(PROJECT_ROOT, 'assets/kits')

describe('drumkits.json validation', () => {
    let drumkits

    it('drumkits.json exists and is valid JSON', () => {
        expect(existsSync(DRUMKITS_JSON)).toBe(true)
        const raw = readFileSync(DRUMKITS_JSON, 'utf-8')
        drumkits = JSON.parse(raw)
        expect(Array.isArray(drumkits)).toBe(true)
        expect(drumkits.length).toBeGreaterThan(0)
    })

    it('each kit has required fields', () => {
        drumkits.forEach((kit, i) => {
            expect(kit.name, `kit[${i}].name`).toBeDefined()
            expect(typeof kit.name, `kit[${i}].name type`).toBe('string')
            expect(kit.name.length, `kit[${i}].name empty`).toBeGreaterThan(0)
            expect(Array.isArray(kit.instruments), `kit[${i}].instruments`).toBe(true)
            expect(kit.instruments.length, `kit[${i}].instruments empty`).toBeGreaterThan(0)
        })
    })

    it('each instrument has required fields', () => {
        drumkits.forEach((kit, ki) => {
            kit.instruments.forEach((inst, ii) => {
                expect(inst.key, `kit[${ki}].instruments[${ii}].key`).toBeDefined()
                expect(typeof inst.key, `kit[${ki}].instruments[${ii}].key type`).toBe('string')
                expect(inst.url, `kit[${ki}].instruments[${ii}].url`).toBeDefined()
                expect(typeof inst.url, `kit[${ki}].instruments[${ii}].url type`).toBe('string')
            })
        })
    })

    it('each kit name is unique', () => {
        const names = drumkits.map(k => k.name)
        const unique = new Set(names)
        expect(names.length).toBe(unique.size)
    })

    it('no duplicate keys within a kit', () => {
        drumkits.forEach((kit, ki) => {
            const keys = kit.instruments.map(i => i.key.toUpperCase())
            const unique = new Set(keys)
            if (keys.length !== unique.size) {
                const dupes = keys.filter((k, idx) => keys.indexOf(k) !== idx)
                throw new Error(`Kit "${kit.name}" has duplicate keys: ${[...new Set(dupes)].join(', ')}`)
            }
        })
    })

    it('all referenced WAV files exist on disk', () => {
        const missing = []
        drumkits.forEach((kit, ki) => {
            kit.instruments.forEach((inst, ii) => {
                const filePath = join(KITS_DIR, inst.url)
                if (!existsSync(filePath)) {
                    missing.push(`${kit.name}/${inst.key} -> ${inst.url}`)
                }
            })
        })
        if (missing.length > 0) {
            throw new Error(`Missing WAV files (${missing.length}):\n${missing.join('\n')}`)
        }
    })

    it('no WAV file is referenced by multiple kits with different paths', () => {
        const urlMap = new Map()
        const conflicts = []
        drumkits.forEach((kit) => {
            kit.instruments.forEach((inst) => {
                const key = `${kit.name}:${inst.key.toUpperCase()}`
                if (urlMap.has(key)) {
                    conflicts.push(`${key} referenced twice`)
                }
                urlMap.set(key, inst.url)
            })
        })
        expect(conflicts.length).toBe(0)
    })

    it('all WAV files are valid (>0 bytes)', () => {
        const empty = []
        drumkits.forEach((kit) => {
            kit.instruments.forEach((inst) => {
                const filePath = join(KITS_DIR, inst.url)
                if (existsSync(filePath)) {
                    const stats = statSync(filePath)
                    if (stats.size === 0) {
                        empty.push(`${kit.name}/${inst.key} -> ${inst.url}`)
                    }
                }
            })
        })
        if (empty.length > 0) {
            throw new Error(`Empty WAV files (${empty.length}):\n${empty.join('\n')}`)
        }
    })
})
