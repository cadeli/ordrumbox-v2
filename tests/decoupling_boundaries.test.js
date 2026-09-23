/**
 * @vitest-environment node
 * Static verification tests — ensure decoupling boundaries are maintained.
 * These grep source files to prevent layer violations from being reintroduced.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { resolve, join } from 'path'

const SRC = resolve(import.meta.dirname, '../src')

function readSrc(relPath) {
    return readFileSync(resolve(SRC, relPath), 'utf-8')
}

function listSrcFiles(relDir) {
    const out = []
    const abs = resolve(SRC, relDir)
    for (const entry of readdirSync(abs)) {
        const full = join(abs, entry)
        if (statSync(full).isDirectory()) {
            out.push(...listSrcFiles(join(relDir, entry)))
        } else if (entry.endsWith('.js')) {
            out.push(join(relDir, entry).replace(/\\/g, '/'))
        }
    }
    return out
}

describe('Decoupling boundaries', () => {
    it('engine.js does not import appState', () => {
        const src = readSrc('audio/engine.js')
        expect(src).not.toMatch(/import.*app_state/)
    })

    it('sound.js does not import appState', () => {
        const src = readSrc('audio/sound.js')
        expect(src).not.toMatch(/import.*app_state/)
    })

    it('sample_analyzer.js does not import ui/theme', () => {
        const src = readSrc('audio/sample_analyzer.js')
        expect(src).not.toMatch(/import.*ui\/theme/)
    })

    it('song_service.js does not import any ui/ modules', () => {
        const src = readSrc('logic/services/song_service.js')
        expect(src).not.toMatch(/import.*\.\.\/ui\//)
    })

    it('wav_import_service.js does not import any ui/ modules', () => {
        const src = readSrc('logic/services/wav_import_service.js')
        expect(src).not.toMatch(/import.*\.\.\/ui\//)
    })

    it('midi_import_service.js does not import any ui/ modules', () => {
        const src = readSrc('logic/services/midi_import_service.js')
        expect(src).not.toMatch(/import.*\.\.\/ui\//)
    })

    it('song_panel.js does not import idb directly', () => {
        const src = readSrc('ui/song_panel.js')
        expect(src).not.toMatch(/import.*core\/idb/)
    })

    it('cmd_notes.js imports appState only for pattern lookup in desc', () => {
        const src = readSrc('logic/commands/cmd/cmd_notes.js')
        expect(src).toMatch(/import.*app_state/)
    })

    it('cmd_tracks.js does not import serviceRegistry', () => {
        const src = readSrc('logic/commands/cmd/cmd_tracks.js')
        expect(src).not.toMatch(/import.*service_registry/)
    })

    it('non-UI layers do not import ui/ modules', () => {
        const layers = ['logic', 'audio', 'patterns', 'model', 'cache', 'loader', 'core', 'state']
        const violations = []
        for (const layer of layers) {
            const files = listSrcFiles(layer)
            for (const rel of files) {
                const src = readSrc(rel)
                if (rel === 'core/notify.js') continue // notify lives in core, is the toast impl
                if (rel.startsWith('state/')) continue // state is hub, may reference ui helpers rarely — checked below
                if (/from\s+['"][^'"]*\/ui\//.test(src) || /from\s+['"]\.\/ui\//.test(src)) {
                    violations.push(`${layer}/${rel}`)
                }
            }
        }
        expect(violations).toEqual([])
    })

    it('logic/ and audio/ do not import ui/ directly', () => {
        const layers = ['logic', 'audio']
        const violations = []
        for (const layer of layers) {
            for (const rel of listSrcFiles(layer)) {
                const src = readSrc(rel)
                if (/from\s+['"][^'"]*\/ui\//.test(src)) {
                    violations.push(`${layer}/${rel}`)
                }
            }
        }
        expect(violations).toEqual([])
    })

    it('appState holds currentView (session runtime source of truth)', () => {
        const src = readSrc('state/app_state.js')
        expect(src).toMatch(/currentView/)
    })

    it('main.js does not read soundRegistry.settings.session for currentView', () => {
        const src = readSrc('main.js')
        expect(src).not.toMatch(/soundRegistry\.settings\.session/)
    })
})
