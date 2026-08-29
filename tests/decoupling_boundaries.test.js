/**
 * @vitest-environment node
 * Static verification tests — ensure decoupling boundaries are maintained.
 * These grep source files to prevent layer violations from being reintroduced.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const SRC = resolve(import.meta.dirname, '../src')

function readSrc(relPath) {
    return readFileSync(resolve(SRC, relPath), 'utf-8')
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

    it('song_service.js does not import any ui/ panel modules', () => {
        const src = readSrc('logic/services/song_service.js')
        expect(src).not.toMatch(/import.*\.\.\/ui\/(?!components\/panel_helpers)/)
    })

    it('song_panel.js does not import idb directly', () => {
        const src = readSrc('ui/song_panel.js')
        expect(src).not.toMatch(/import.*core\/idb/)
    })

    it('cmd_notes.js does not import appState', () => {
        const src = readSrc('logic/commands/cmd/cmd_notes.js')
        expect(src).not.toMatch(/import.*app_state/)
    })

    it('cmd_tracks.js does not import serviceRegistry', () => {
        const src = readSrc('logic/commands/cmd/cmd_tracks.js')
        expect(src).not.toMatch(/import.*service_registry/)
    })
})
