// tests/synth_editor_preset_section.test.js
/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { appState } from '../src/state/app_state.js'
import { serviceRegistry } from '../src/state/service_registry.js'
import { soundRegistry } from '../src/state/sound_registry.js'
import { playbackEvents } from '../src/state/playback_events.js'

let SynthEditor

beforeEach(async () => {
    document.body.innerHTML = ''
    appState.reset()
    serviceRegistry.reset()
    soundRegistry.reset()
    SynthEditor = (await import('../src/ui/synth_editor.js')).default
})

function makeGeneratedSound(overrides = {}) {
    return {
        groups: [
            {
                key: 'op1',
                label: 'Op 1',
                waveform: 'sine',
                frequency: 440,
                gain: 0.5,
                detune: 0,
                ...overrides
            }
        ],
        envelope: { attack: 10, decay: 200, sustain: 0.5, release: 100 },
        filter: { type: 'lowpass', freq: 8000, q: 1 }
    }
}

function makeTrack(overrides = {}) {
    return {
        name: 'KICK',
        notes: [],
        nbBeats: 4,
        stepsPerBeat: 4,
        loopAtStep: 16,
        mute: false,
        soundId: '',
        useAutoAssignSound: true,
        useSoftSynth: true,
        synthSoundKey: 'BASS1',
        ...overrides
    }
}

function setupEditor(track) {
    const host = {
        _track: track,
        track: track,
        container: document.createElement('div'),
        sync: vi.fn(),
        _appState: appState
    }
    const deps = {
        playbackEvents: playbackEvents,
        serviceRegistry: serviceRegistry,
        soundRegistry: soundRegistry
    }
    const editor = new SynthEditor(host, deps)
    editor.createDOM()
    return { editor, host }
}

describe('PresetSection', () => {
    describe('getGeneratedSoundKeys', () => {
        it('returns sorted keys from generatedSounds', () => {
            soundRegistry.generatedSounds = {
                SYNTH1: makeGeneratedSound(),
                BASS1: makeGeneratedSound(),
                ALPHA: makeGeneratedSound()
            }
            const { editor } = setupEditor(makeTrack())
            const keys = editor.getGeneratedSoundKeys()
            expect(keys).toEqual(['ALPHA', 'BASS1', 'SYNTH1'])
        })

        it('returns empty array when no generated sounds', () => {
            soundRegistry.generatedSounds = {}
            const { editor } = setupEditor(makeTrack())
            expect(editor.getGeneratedSoundKeys()).toEqual([])
        })
    })

    describe('loadPreset', () => {
        it('loads a preset into _draft and _original', () => {
            const sound = makeGeneratedSound()
            soundRegistry.generatedSounds = { BASS1: sound }
            const { editor } = setupEditor(makeTrack())
            editor.showPanel()

            const result = editor.presets.loadPreset('BASS1')
            expect(result).toBe(true)
            expect(editor.editKey).toBe('BASS1')
            expect(editor.draft).toBeDefined()
            expect(editor.original).toBeDefined()
        })

        it('returns false for non-existent preset', () => {
            soundRegistry.generatedSounds = {}
            const { editor } = setupEditor(makeTrack())
            const result = editor.presets.loadPreset('DOES_NOT_EXIST')
            expect(result).toBe(false)
        })
    })

    describe('commitSound', () => {
        it('writes to soundRegistry.generatedSounds', () => {
            soundRegistry.generatedSounds = {}
            serviceRegistry.audioEngine = { updateGeneratedSounds: vi.fn() }
            const { editor } = setupEditor(makeTrack())

            const sound = makeGeneratedSound()
            editor.presets.commitSound('NEW_PRESET', sound)

            expect(soundRegistry.generatedSounds['NEW_PRESET']).toBeDefined()
            expect(serviceRegistry.audioEngine.updateGeneratedSounds).toHaveBeenCalled()
        })
    })

    describe('newPreset', () => {
        it('creates a new preset with default name', () => {
            soundRegistry.generatedSounds = { BASS1: makeGeneratedSound() }
            serviceRegistry.audioEngine = { updateGeneratedSounds: vi.fn() }
            const { editor } = setupEditor(makeTrack())
            editor.showPanel()

            editor.presets.newPreset()

            expect(editor.editKey).toBe('new_preset')
            expect(soundRegistry.generatedSounds['new_preset']).toBeDefined()
            expect(editor.draft).toBeDefined()
        })

        it('increments name if new_preset already exists', () => {
            soundRegistry.generatedSounds = {
                BASS1: makeGeneratedSound(),
                new_preset: makeGeneratedSound()
            }
            serviceRegistry.audioEngine = { updateGeneratedSounds: vi.fn() }
            const { editor } = setupEditor(makeTrack())
            editor.showPanel()

            editor.presets.newPreset()

            expect(editor.editKey).toBe('new_preset_1')
        })
    })

    describe('duplicatePreset', () => {
        it('creates a copy with _copy suffix', () => {
            soundRegistry.generatedSounds = { BASS1: makeGeneratedSound() }
            serviceRegistry.audioEngine = { updateGeneratedSounds: vi.fn() }
            const { editor } = setupEditor(makeTrack())
            editor.showPanel()
            editor.presets.loadPreset('BASS1')

            editor.presets.duplicatePreset()

            expect(editor.editKey).toBe('BASS1_copy')
            expect(soundRegistry.generatedSounds['BASS1_copy']).toBeDefined()
        })

        it('does nothing when no preset is loaded', () => {
            soundRegistry.generatedSounds = { BASS1: makeGeneratedSound() }
            const { editor } = setupEditor(makeTrack())
            editor.draft = null
            editor.editKey = null
            expect(() => editor.presets.duplicatePreset()).not.toThrow()
        })
    })

    describe('deletePreset', () => {
        it('removes preset from registry', () => {
            soundRegistry.generatedSounds = {
                BASS1: makeGeneratedSound(),
                BASS2: makeGeneratedSound()
            }
            serviceRegistry.audioEngine = { updateGeneratedSounds: vi.fn() }
            const { editor } = setupEditor(makeTrack())
            editor.showPanel()
            editor.presets.loadPreset('BASS1')

            editor.presets.deletePreset()

            expect(soundRegistry.generatedSounds['BASS1']).toBeUndefined()
        })

        it('refuses to delete the last preset', () => {
            soundRegistry.generatedSounds = { BASS1: makeGeneratedSound() }
            serviceRegistry.audioEngine = { updateGeneratedSounds: vi.fn() }
            const { editor } = setupEditor(makeTrack())
            editor.showPanel()
            editor.presets.loadPreset('BASS1')

            editor.presets.deletePreset()

            expect(soundRegistry.generatedSounds['BASS1']).toBeDefined()
        })

        it('navigates to neighbor after delete', () => {
            soundRegistry.generatedSounds = {
                A: makeGeneratedSound(),
                B: makeGeneratedSound(),
                C: makeGeneratedSound()
            }
            serviceRegistry.audioEngine = { updateGeneratedSounds: vi.fn() }
            const { editor } = setupEditor(makeTrack())
            editor.showPanel()
            editor.presets.loadPreset('B')

            editor.presets.deletePreset()

            expect(editor.editKey).not.toBe('B')
            expect(editor.editKey).not.toBeNull()
        })
    })

    describe('selectPreset', () => {
        it('loads preset by key from dropdown', () => {
            soundRegistry.generatedSounds = {
                BASS1: makeGeneratedSound(),
                SYNTH1: makeGeneratedSound()
            }
            const { editor } = setupEditor(makeTrack())
            editor.showPanel()
            editor.presets.loadPreset('BASS1')

            editor.presets.selectPreset('SYNTH1')

            expect(editor.editKey).toBe('SYNTH1')
        })

        it('ignores selection of same preset', () => {
            soundRegistry.generatedSounds = { BASS1: makeGeneratedSound() }
            const { editor } = setupEditor(makeTrack())
            editor.showPanel()
            editor.presets.loadPreset('BASS1')
            const draftBefore = editor.draft

            editor.presets.selectPreset('BASS1')

            expect(editor.draft).toBe(draftBefore)
        })

        it('ignores empty key', () => {
            soundRegistry.generatedSounds = { BASS1: makeGeneratedSound() }
            const { editor } = setupEditor(makeTrack())
            editor.showPanel()
            editor.presets.loadPreset('BASS1')
            const draftBefore = editor.draft

            editor.presets.selectPreset('')

            expect(editor.draft).toBe(draftBefore)
        })
    })

    describe('navigatePreset', () => {
        it('navigates to next preset', () => {
            soundRegistry.generatedSounds = {
                A: makeGeneratedSound(),
                B: makeGeneratedSound(),
                C: makeGeneratedSound()
            }
            const { editor } = setupEditor(makeTrack())
            editor.showPanel()
            editor.presets.loadPreset('A')

            editor.presets.navigatePreset(1)

            expect(editor.editKey).toBe('B')
        })

        it('navigates to previous preset', () => {
            soundRegistry.generatedSounds = {
                A: makeGeneratedSound(),
                B: makeGeneratedSound(),
                C: makeGeneratedSound()
            }
            const { editor } = setupEditor(makeTrack())
            editor.showPanel()
            editor.presets.loadPreset('B')

            editor.presets.navigatePreset(-1)

            expect(editor.editKey).toBe('A')
        })

        it('wraps around from last to first', () => {
            soundRegistry.generatedSounds = {
                A: makeGeneratedSound(),
                B: makeGeneratedSound()
            }
            const { editor } = setupEditor(makeTrack())
            editor.showPanel()
            editor.presets.loadPreset('B')

            editor.presets.navigatePreset(1)

            expect(editor.editKey).toBe('A')
        })

        it('wraps around from first to last', () => {
            soundRegistry.generatedSounds = {
                A: makeGeneratedSound(),
                B: makeGeneratedSound()
            }
            const { editor } = setupEditor(makeTrack())
            editor.showPanel()
            editor.presets.loadPreset('A')

            editor.presets.navigatePreset(-1)

            expect(editor.editKey).toBe('B')
        })

        it('does nothing when no presets exist', () => {
            soundRegistry.generatedSounds = {}
            const { editor } = setupEditor(makeTrack())
            expect(() => editor.presets.navigatePreset(1)).not.toThrow()
        })
    })

    describe('randomizePreset', () => {
        it('modifies draft values', () => {
            soundRegistry.generatedSounds = { BASS1: makeGeneratedSound() }
            serviceRegistry.audioEngine = { updateGeneratedSounds: vi.fn() }
            const { editor } = setupEditor(makeTrack())
            editor.showPanel()
            editor.presets.loadPreset('BASS1')

            const draftBefore = JSON.stringify(editor.draft)
            editor.presets.randomizePreset()
            const draftAfter = JSON.stringify(editor.draft)

            expect(draftAfter).not.toBe(draftBefore)
        })

        it('does nothing when no draft is loaded', () => {
            const { editor } = setupEditor(makeTrack())
            editor.draft = null
            expect(() => editor.presets.randomizePreset()).not.toThrow()
        })
    })

    describe('renderFooter', () => {
        it('renders preset select and action buttons', async () => {
            soundRegistry.generatedSounds = { BASS1: makeGeneratedSound() }
            const { editor } = setupEditor(makeTrack())
            await editor.showPanel()

            const footer = editor.panel.querySelector('.ss-footer')
            expect(footer).not.toBeNull()

            const select = footer.querySelector('.ss-preset-select')
            expect(select).not.toBeNull()

            const options = select.querySelectorAll('option')
            expect(options.length).toBeGreaterThanOrEqual(2)
        })

        it('includes delete, new, duplicate, revert, export, import buttons', async () => {
            soundRegistry.generatedSounds = { BASS1: makeGeneratedSound() }
            const { editor } = setupEditor(makeTrack())
            await editor.showPanel()

            const footer = editor.panel.querySelector('.ss-footer')
            expect(footer.querySelector('[data-action="synth-delete"]')).not.toBeNull()
            expect(footer.querySelector('[data-action="synth-new"]')).not.toBeNull()
            expect(footer.querySelector('[data-action="synth-duplicate"]')).not.toBeNull()
            expect(footer.querySelector('[data-action="synth-revert"]')).not.toBeNull()
            expect(footer.querySelector('[data-action="synth-export"]')).not.toBeNull()
            expect(footer.querySelector('[data-action="synth-import"]')).not.toBeNull()
        })
    })

    describe('ensureGeneratedSoundsLoaded', () => {
        it('loads from resourcesLoader when empty', async () => {
            soundRegistry.generatedSounds = {}
            serviceRegistry.resourcesLoader = {
                loadGeneratedSounds: vi.fn().mockResolvedValue(undefined)
            }
            serviceRegistry.audioEngine = { updateGeneratedSounds: vi.fn() }

            const { editor } = setupEditor(makeTrack())
            await editor.ensureGeneratedSoundsLoaded()

            expect(serviceRegistry.resourcesLoader.loadGeneratedSounds).toHaveBeenCalled()
        })

        it('skips loading when presets already exist', async () => {
            soundRegistry.generatedSounds = { BASS1: makeGeneratedSound() }
            serviceRegistry.resourcesLoader = {
                loadGeneratedSounds: vi.fn()
            }

            const { editor } = setupEditor(makeTrack())
            await editor.ensureGeneratedSoundsLoaded()

            expect(serviceRegistry.resourcesLoader.loadGeneratedSounds).not.toHaveBeenCalled()
        })
    })
})
