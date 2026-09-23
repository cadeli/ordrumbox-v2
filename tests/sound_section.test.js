/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import SoundSection from '../src/ui/track_editor/sound_section.js'

vi.mock('../src/logic/services/auto_assign.js', () => {
    const mockAutoAssignTrackSounds = vi.fn()
    const MockAutoAssign = vi.fn().mockImplementation(function () {
        this.autoAssignTrackSounds = mockAutoAssignTrackSounds
    })
    return { default: MockAutoAssign }
})

function makeMockEditor(overrides = {}) {
    return {
        _track: {
            name: 'KICK',
            soundId: 'kick_1.wav',
            useSoftSynth: false,
            useAutoAssignSound: true,
            mono: false,
            ...overrides.track,
        },
        _soundRegistry: {
            sounds: {
                'kick_1.wav': { url: 'kick_1.wav', key: 'KICK', kit_name: '808', display_name: 'Kick' },
                'snare_1.wav': { url: 'snare_1.wav', key: 'SNARE', kit_name: '808', display_name: 'Snare' },
            },
            drumkitList: [
                {
                    name: '808',
                    instruments: [
                        { key: 'KICK', url: 'kick_1.wav', display_name: 'Kick' },
                        { key: 'SNARE', url: 'snare_1.wav', display_name: 'Snare' },
                    ],
                },
            ],
            generatedSounds: { BASS1: {}, PIANO: {} },
        },
        _appState: { selectedDrumkitNum: 0 },
        _serviceRegistry: {
            cmd: { changeTrackName: vi.fn(), changeTrackSound: vi.fn() },
            resourcesLoader: { loadSample: vi.fn() },
        },
        _playbackEvents: { batch: vi.fn((fn) => fn()), emit: vi.fn() },
        synthEditor: { getGeneratedSoundKeys: vi.fn(() => ['BASS1', 'PIANO']), ensureGeneratedSoundsLoaded: vi.fn() },
        resourcesLoader: { loadSample: vi.fn() },
        sync: vi.fn(),
        esc: (s) => s,
        ...overrides,
    }
}

import AutoAssign from '../src/logic/services/auto_assign.js'

describe('SoundSection', () => {
    let section

    beforeEach(() => {
        vi.clearAllMocks()
    })

    describe('render()', () => {
        it('returns empty string when track is null', () => {
            const editor = makeMockEditor()
            editor._track = null
            section = new SoundSection(editor)
            expect(section.render()).toBe('')
        })

        it('renders selects when track exists', () => {
            const editor = makeMockEditor()
            section = new SoundSection(editor)
            const html = section.render()
            expect(html).toContain('data-sound="instrument"')
            expect(html).toContain('data-sound="sample"')
            expect(html).toContain('data-sound="generated"')
            expect(html).toContain('data-key="mono"')
            expect(html).toContain('data-action="toggle-auto"')
        })

        it('renders correct instrument options', () => {
            const editor = makeMockEditor()
            section = new SoundSection(editor)
            const html = section.render()
            expect(html).toContain('KICK')
            expect(html).toContain('SNARE')
        })

        it('renders correct sample options for current instrument', () => {
            const editor = makeMockEditor()
            section = new SoundSection(editor)
            const html = section.render()
            expect(html).toContain('kick_1.wav')
        })

        it('shows no-samples message when matchingSounds is empty', () => {
            const editor = makeMockEditor({ track: { name: 'TOM', soundId: 'unknown_sound' } })
            editor._soundRegistry.sounds = {}
            editor._soundRegistry.drumkitList = []
            section = new SoundSection(editor)
            const html = section.render()
            expect(html).toContain('— no samples —')
        })

        it('handles useSoftSynth=true with existing generated key', () => {
            const editor = makeMockEditor({ track: { useSoftSynth: true, synthSoundKey: 'BASS1' } })
            section = new SoundSection(editor)
            const html = section.render()
            expect(html).toContain('data-sound="generated"')
        })

        it('handles useSoftSynth=true with missing generated key adds it to options', () => {
            const editor = makeMockEditor({ track: { useSoftSynth: true, synthSoundKey: 'UNKNOWN_KEY' } })
            editor.synthEditor.getGeneratedSoundKeys.mockReturnValue(['BASS1', 'PIANO'])
            section = new SoundSection(editor)
            const html = section.render()
            expect(html).toContain('UNKNOWN_KEY')
        })

        it('defaults currentGeneratedSound to BASS1 when useSoftSynth=true and no synthSoundKey', () => {
            const editor = makeMockEditor({ track: { useSoftSynth: true } })
            section = new SoundSection(editor)
            const html = section.render()
            expect(html).toContain('BASS1')
        })

        it('sets currentGeneratedSound to none when useSoftSynth=false', () => {
            const editor = makeMockEditor()
            section = new SoundSection(editor)
            const html = section.render()
            expect(html).toContain('>none<')
        })

        it('renders mono ON when track.mono is true', () => {
            const editor = makeMockEditor({ track: { mono: true } })
            section = new SoundSection(editor)
            const html = section.render()
            expect(html).toContain('active')
            expect(html).toContain('ON')
        })

        it('renders mono OFF when track.mono is false', () => {
            const editor = makeMockEditor()
            section = new SoundSection(editor)
            const html = section.render()
            expect(html).toContain('>OFF<')
        })

        it('shows auto led ON class when useAutoAssignSound is true', () => {
            const editor = makeMockEditor()
            section = new SoundSection(editor)
            const html = section.render()
            expect(html).toContain('lfo-led on')
            expect(html).toContain('Disable')
        })

        it('shows auto led OFF class when useAutoAssignSound is false', () => {
            const editor = makeMockEditor({ track: { useAutoAssignSound: false } })
            section = new SoundSection(editor)
            const html = section.render()
            expect(html).not.toContain('lfo-led on')
            expect(html).toContain('Enable')
        })

        it('renders multiple drumkits in sample list', () => {
            const editor = makeMockEditor()
            editor._soundRegistry.drumkitList.push({
                name: 'TRAP',
                instruments: [{ key: 'KICK', url: 'trap_kick.wav', display_name: 'Trap Kick' }],
            })
            editor._soundRegistry.sounds['trap_kick.wav'] = {
                url: 'trap_kick.wav',
                key: 'KICK',
                kit_name: 'TRAP',
                display_name: 'Trap Kick',
            }
            section = new SoundSection(editor)
            const html = section.render()
            expect(html).toContain('kick_1.wav')
            expect(html).toContain('trap_kick.wav')
        })
    })

    describe('onInstrumentChange()', () => {
        it('calls changeTrackName with new name', async () => {
            const editor = makeMockEditor()
            section = new SoundSection(editor)
            await section.onInstrumentChange({ value: 'SNARE' })
            expect(editor._serviceRegistry.cmd.changeTrackName).toHaveBeenCalledWith(editor._track, 'SNARE')
        })

        it('loads sample if buffer is missing', async () => {
            const editor = makeMockEditor()
            editor._soundRegistry.sounds['kick_1.wav'].buffer = undefined
            section = new SoundSection(editor)
            await section.onInstrumentChange({ value: 'KICK' })
            expect(editor.resourcesLoader.loadSample).toHaveBeenCalled()
        })

        it('does not load sample if buffer exists', async () => {
            const editor = makeMockEditor()
            editor._soundRegistry.sounds['kick_1.wav'].buffer = {}
            section = new SoundSection(editor)
            await section.onInstrumentChange({ value: 'KICK' })
            expect(editor.resourcesLoader.loadSample).not.toHaveBeenCalled()
        })

        it('calls changeTrackSound with first sample url', async () => {
            const editor = makeMockEditor()
            section = new SoundSection(editor)
            await section.onInstrumentChange({ value: 'SNARE' })
            expect(editor._serviceRegistry.cmd.changeTrackSound).toHaveBeenCalledWith(editor._track, 'snare_1.wav')
        })

        it('calls sync after change', async () => {
            const editor = makeMockEditor()
            section = new SoundSection(editor)
            await section.onInstrumentChange({ value: 'KICK' })
            expect(editor.sync).toHaveBeenCalled()
        })

        it('emits trackParamChange and patternChange events', async () => {
            const editor = makeMockEditor()
            section = new SoundSection(editor)
            await section.onInstrumentChange({ value: 'KICK' })
            expect(editor._playbackEvents.batch).toHaveBeenCalled()
            expect(editor._playbackEvents.emit).toHaveBeenCalledWith('trackParamChange', editor._track)
            expect(editor._playbackEvents.emit).toHaveBeenCalledWith('patternChange', [editor._track])
        })

        it('does not call changeTrackSound when no sample found for instrument', async () => {
            const editor = makeMockEditor({ track: { name: 'NONE' } })
            section = new SoundSection(editor)
            await section.onInstrumentChange({ value: 'NONE' })
            expect(editor._serviceRegistry.cmd.changeTrackSound).not.toHaveBeenCalled()
        })
    })

    describe('onSampleChange()', () => {
        it('calls changeTrackSound with the selected url', async () => {
            const editor = makeMockEditor()
            section = new SoundSection(editor)
            await section.onSampleChange({ value: 'snare_1.wav' })
            expect(editor._serviceRegistry.cmd.changeTrackSound).toHaveBeenCalledWith(editor._track, 'snare_1.wav')
        })

        it('searches kits and loads sample if buffer is missing', async () => {
            const editor = makeMockEditor()
            editor._soundRegistry.sounds['snare_1.wav'].buffer = undefined
            section = new SoundSection(editor)
            await section.onSampleChange({ value: 'snare_1.wav' })
            expect(editor._serviceRegistry.resourcesLoader.loadSample).toHaveBeenCalled()
        })

        it('does not load sample if buffer already exists', async () => {
            const editor = makeMockEditor()
            editor._soundRegistry.sounds['snare_1.wav'].buffer = new Float32Array(100)
            section = new SoundSection(editor)
            await section.onSampleChange({ value: 'snare_1.wav' })
            expect(editor._serviceRegistry.resourcesLoader.loadSample).not.toHaveBeenCalled()
        })

        it('emits trackParamChange and patternChange events', async () => {
            const editor = makeMockEditor()
            section = new SoundSection(editor)
            await section.onSampleChange({ value: 'kick_1.wav' })
            expect(editor._playbackEvents.batch).toHaveBeenCalled()
            expect(editor._playbackEvents.emit).toHaveBeenCalledWith('trackParamChange', editor._track)
            expect(editor._playbackEvents.emit).toHaveBeenCalledWith('patternChange', [editor._track])
        })

        it('loads sample from kit resourcesLoader when not found in sounds registry', async () => {
            const editor = makeMockEditor()
            delete editor._soundRegistry.sounds['new_sample.wav']
            editor._soundRegistry.drumkitList[0].instruments.push({
                key: 'HIT',
                url: 'new_sample.wav',
                display_name: 'Hit',
            })
            section = new SoundSection(editor)
            await section.onSampleChange({ value: 'new_sample.wav' })
            expect(editor._serviceRegistry.resourcesLoader.loadSample).toHaveBeenCalledWith(
                { key: 'HIT', url: 'new_sample.wav', display_name: 'Hit' },
                '808',
            )
        })
    })

    describe('onGeneratedChange()', () => {
        it('sets useSoftSynth=false when key is none', async () => {
            const editor = makeMockEditor({ track: { useSoftSynth: true, synthSoundKey: 'BASS1' } })
            section = new SoundSection(editor)
            await section.onGeneratedChange({ value: 'none' })
            expect(editor._track.useSoftSynth).toBe(false)
        })

        it('sets useSoftSynth=true and synthSoundKey when key is not none', async () => {
            const editor = makeMockEditor()
            section = new SoundSection(editor)
            await section.onGeneratedChange({ value: 'BASS1' })
            expect(editor._track.useSoftSynth).toBe(true)
            expect(editor._track.synthSoundKey).toBe('BASS1')
        })

        it('sets useAutoAssignSound=false when selecting a synth key', async () => {
            const editor = makeMockEditor()
            section = new SoundSection(editor)
            await section.onGeneratedChange({ value: 'PIANO' })
            expect(editor._track.useAutoAssignSound).toBe(false)
        })

        it('calls ensureGeneratedSoundsLoaded if key not in generatedSounds', async () => {
            const editor = makeMockEditor()
            editor._soundRegistry.generatedSounds = {}
            section = new SoundSection(editor)
            await section.onGeneratedChange({ value: 'BASS1' })
            expect(editor.synthEditor.ensureGeneratedSoundsLoaded).toHaveBeenCalled()
        })

        it('does not call ensureGeneratedSoundsLoaded if key already exists', async () => {
            const editor = makeMockEditor()
            section = new SoundSection(editor)
            await section.onGeneratedChange({ value: 'BASS1' })
            expect(editor.synthEditor.ensureGeneratedSoundsLoaded).not.toHaveBeenCalled()
        })

        it('calls sync after change', async () => {
            const editor = makeMockEditor()
            section = new SoundSection(editor)
            await section.onGeneratedChange({ value: 'BASS1' })
            expect(editor.sync).toHaveBeenCalled()
        })

        it('emits trackParamChange and patternChange events', async () => {
            const editor = makeMockEditor()
            section = new SoundSection(editor)
            await section.onGeneratedChange({ value: 'BASS1' })
            expect(editor._playbackEvents.batch).toHaveBeenCalled()
            expect(editor._playbackEvents.emit).toHaveBeenCalledWith('trackParamChange', editor._track)
            expect(editor._playbackEvents.emit).toHaveBeenCalledWith('patternChange', [editor._track])
        })
    })

    describe('toggleAuto()', () => {
        it('toggles useAutoAssignSound from true to false', () => {
            const editor = makeMockEditor()
            section = new SoundSection(editor)
            section.toggleAuto()
            expect(editor._track.useAutoAssignSound).toBe(false)
        })

        it('toggles useAutoAssignSound from false to true', () => {
            const editor = makeMockEditor({ track: { useAutoAssignSound: false } })
            section = new SoundSection(editor)
            section.toggleAuto()
            expect(editor._track.useAutoAssignSound).toBe(true)
        })

        it('sets useSoftSynth=false when enabling auto', () => {
            const editor = makeMockEditor({
                track: { useAutoAssignSound: false, useSoftSynth: true, synthSoundKey: 'BASS1' },
            })
            section = new SoundSection(editor)
            section.toggleAuto()
            expect(editor._track.useSoftSynth).toBe(false)
        })

        it('sets synthSoundKey=null when enabling auto', () => {
            const editor = makeMockEditor({
                track: { useAutoAssignSound: false, useSoftSynth: true, synthSoundKey: 'BASS1' },
            })
            section = new SoundSection(editor)
            section.toggleAuto()
            expect(editor._track.synthSoundKey).toBeNull()
        })

        it('creates AutoAssign and calls autoAssignTrackSounds when enabling', () => {
            const editor = makeMockEditor({ track: { useAutoAssignSound: false } })
            section = new SoundSection(editor)
            section.toggleAuto()
            expect(AutoAssign).toHaveBeenCalled()
            const instance = AutoAssign.mock.results[0].value
            expect(instance.autoAssignTrackSounds).toHaveBeenCalledWith(editor._track)
        })

        it('does not create AutoAssign when disabling', () => {
            AutoAssign.mockClear()
            const editor = makeMockEditor()
            section = new SoundSection(editor)
            section.toggleAuto()
            expect(AutoAssign).not.toHaveBeenCalled()
        })

        it('calls sync after toggle', () => {
            const editor = makeMockEditor()
            section = new SoundSection(editor)
            section.toggleAuto()
            expect(editor.sync).toHaveBeenCalled()
        })

        it('emits trackParamChange and patternChange events', () => {
            const editor = makeMockEditor()
            section = new SoundSection(editor)
            section.toggleAuto()
            expect(editor._playbackEvents.batch).toHaveBeenCalled()
            expect(editor._playbackEvents.emit).toHaveBeenCalledWith('trackParamChange', editor._track)
            expect(editor._playbackEvents.emit).toHaveBeenCalledWith('patternChange', [editor._track])
        })
    })

    describe('_getSelectedDrumkitName()', () => {
        it('returns correct kit name for selected index', () => {
            const editor = makeMockEditor()
            section = new SoundSection(editor)
            expect(section._getSelectedDrumkitName()).toBe('808')
        })

        it('returns empty string when drumkitList is empty', () => {
            const editor = makeMockEditor()
            editor._soundRegistry.drumkitList = []
            section = new SoundSection(editor)
            expect(section._getSelectedDrumkitName()).toBe('')
        })

        it('returns correct name for different index', () => {
            const editor = makeMockEditor()
            editor._soundRegistry.drumkitList.push({ name: 'TRAP' })
            editor._appState.selectedDrumkitNum = 1
            section = new SoundSection(editor)
            expect(section._getSelectedDrumkitName()).toBe('TRAP')
        })
    })

    describe('_getAllKitSamples()', () => {
        it('flattens all kits into a single array', () => {
            const editor = makeMockEditor()
            editor._soundRegistry.drumkitList.push({
                name: 'TRAP',
                instruments: [{ key: 'HIT', url: 'trap_hit.wav', display_name: 'Trap Hit' }],
            })
            section = new SoundSection(editor)
            const samples = section._getAllKitSamples()
            expect(samples).toHaveLength(3)
            expect(samples.map((s) => s.url)).toContain('kick_1.wav')
            expect(samples.map((s) => s.url)).toContain('snare_1.wav')
            expect(samples.map((s) => s.url)).toContain('trap_hit.wav')
        })

        it('adds kitName to each sample', () => {
            const editor = makeMockEditor()
            section = new SoundSection(editor)
            const samples = section._getAllKitSamples()
            expect(samples.every((s) => s.kitName === '808')).toBe(true)
        })

        it('returns empty array when no kits exist', () => {
            const editor = makeMockEditor()
            editor._soundRegistry.drumkitList = []
            section = new SoundSection(editor)
            expect(section._getAllKitSamples()).toEqual([])
        })
    })

    describe('_sortSamplesForCurrentKit()', () => {
        it('sorts samples from selected kit first', () => {
            const editor = makeMockEditor()
            editor._soundRegistry.drumkitList = [
                { name: 'TRAP', instruments: [{ key: 'KICK', url: 'trap_kick.wav', display_name: 'Trap Kick' }] },
                { name: '808', instruments: [{ key: 'KICK', url: 'kick_1.wav', display_name: 'Kick' }] },
            ]
            editor._soundRegistry.sounds['trap_kick.wav'] = {
                url: 'trap_kick.wav',
                key: 'KICK',
                kit_name: 'TRAP',
                display_name: 'Trap Kick',
            }
            editor._appState.selectedDrumkitNum = 1
            section = new SoundSection(editor)
            const samples = section._getAllKitSamples()
            const sorted = section._sortSamplesForCurrentKit(samples)
            expect(sorted[0].kitName).toBe('808')
            expect(sorted[1].kitName).toBe('TRAP')
        })

        it('sorts by kit name alphabetically when both are not selected', () => {
            const editor = makeMockEditor()
            editor._soundRegistry.drumkitList = [
                { name: 'ZOOM', instruments: [{ key: 'KICK', url: 'z_kick.wav', display_name: 'Z Kick' }] },
                { name: 'ALPHA', instruments: [{ key: 'KICK', url: 'a_kick.wav', display_name: 'A Kick' }] },
            ]
            editor._soundRegistry.sounds['z_kick.wav'] = {
                url: 'z_kick.wav',
                key: 'KICK',
                kit_name: 'ZOOM',
                display_name: 'Z Kick',
            }
            editor._soundRegistry.sounds['a_kick.wav'] = {
                url: 'a_kick.wav',
                key: 'KICK',
                kit_name: 'ALPHA',
                display_name: 'A Kick',
            }
            editor._appState.selectedDrumkitNum = 0
            section = new SoundSection(editor)
            const samples = section._getAllKitSamples()
            const sorted = section._sortSamplesForCurrentKit(samples)
            expect(sorted[0].kitName).toBe('ZOOM')
            expect(sorted[1].kitName).toBe('ALPHA')
        })

        it('sorts by display_name within same kit', () => {
            const editor = makeMockEditor()
            editor._soundRegistry.drumkitList = [
                {
                    name: '808',
                    instruments: [
                        { key: 'KICK', url: 'b_kick.wav', display_name: 'B Kick' },
                        { key: 'KICK', url: 'a_kick.wav', display_name: 'A Kick' },
                    ],
                },
            ]
            editor._soundRegistry.sounds['b_kick.wav'] = {
                url: 'b_kick.wav',
                key: 'KICK',
                kit_name: '808',
                display_name: 'B Kick',
            }
            editor._soundRegistry.sounds['a_kick.wav'] = {
                url: 'a_kick.wav',
                key: 'KICK',
                kit_name: '808',
                display_name: 'A Kick',
            }
            section = new SoundSection(editor)
            const samples = section._getAllKitSamples()
            const sorted = section._sortSamplesForCurrentKit(samples)
            expect(sorted[0].display_name).toBe('A Kick')
            expect(sorted[1].display_name).toBe('B Kick')
        })
    })

    describe('_getSamplesForInstrument()', () => {
        it('filters samples by instrument key', () => {
            const editor = makeMockEditor()
            section = new SoundSection(editor)
            const samples = section._getSamplesForInstrument('SNARE')
            expect(samples).toHaveLength(1)
            expect(samples[0].key).toBe('SNARE')
        })

        it('returns empty array when no samples match', () => {
            const editor = makeMockEditor()
            section = new SoundSection(editor)
            const samples = section._getSamplesForInstrument('TOM')
            expect(samples).toHaveLength(0)
        })

        it('returns multiple samples when several kits have the same instrument', () => {
            const editor = makeMockEditor()
            editor._soundRegistry.drumkitList.push({
                name: 'TRAP',
                instruments: [{ key: 'SNARE', url: 'trap_snare.wav', display_name: 'Trap Snare' }],
            })
            editor._soundRegistry.sounds['trap_snare.wav'] = {
                url: 'trap_snare.wav',
                key: 'SNARE',
                kit_name: 'TRAP',
                display_name: 'Trap Snare',
            }
            section = new SoundSection(editor)
            const samples = section._getSamplesForInstrument('SNARE')
            expect(samples).toHaveLength(2)
        })
    })

    describe('_getPreferredSampleForInstrument()', () => {
        it('returns first sample for the instrument', () => {
            const editor = makeMockEditor()
            section = new SoundSection(editor)
            const sample = section._getPreferredSampleForInstrument('KICK')
            expect(sample).toBeDefined()
            expect(sample.key).toBe('KICK')
        })

        it('returns null when no samples match', () => {
            const editor = makeMockEditor()
            section = new SoundSection(editor)
            expect(section._getPreferredSampleForInstrument('TOM')).toBeNull()
        })
    })

    describe('_getCurrentSoundUrl()', () => {
        it('returns url when soundId maps to a sound entry', () => {
            const editor = makeMockEditor()
            section = new SoundSection(editor)
            expect(section._getCurrentSoundUrl()).toBe('kick_1.wav')
        })

        it('returns soundId directly when not found in sounds registry', () => {
            const editor = makeMockEditor({ track: { soundId: 'unknown_id' } })
            section = new SoundSection(editor)
            expect(section._getCurrentSoundUrl()).toBe('unknown_id')
        })

        it('returns empty string when soundId is empty', () => {
            const editor = makeMockEditor({ track: { soundId: '' } })
            section = new SoundSection(editor)
            expect(section._getCurrentSoundUrl()).toBe('')
        })
    })

    describe('_getSoundInfo()', () => {
        it('returns synthSoundKey when useSoftSynth is true', () => {
            const editor = makeMockEditor({ track: { useSoftSynth: true, synthSoundKey: 'BASS1' } })
            section = new SoundSection(editor)
            expect(section._getSoundInfo()).toBe('BASS1')
        })

        it('returns null when useSoftSynth is true but synthSoundKey is null', () => {
            const editor = makeMockEditor({ track: { useSoftSynth: true, synthSoundKey: null } })
            section = new SoundSection(editor)
            expect(section._getSoundInfo()).toBeNull()
        })

        it('returns kit/name for sample path', () => {
            const editor = makeMockEditor()
            section = new SoundSection(editor)
            expect(section._getSoundInfo()).toBe('808/Kick')
        })

        it('returns null when sound is not found in registry', () => {
            const editor = makeMockEditor({ track: { soundId: 'nonexistent' } })
            section = new SoundSection(editor)
            expect(section._getSoundInfo()).toBeNull()
        })

        it('returns just name when kit_name is empty', () => {
            const editor = makeMockEditor()
            editor._soundRegistry.sounds['kick_1.wav'].kit_name = ''
            section = new SoundSection(editor)
            expect(section._getSoundInfo()).toBe('Kick')
        })
    })

    describe('_getCurrentInstrumentName()', () => {
        it('returns sound key when it matches an instrument with samples', () => {
            const editor = makeMockEditor()
            section = new SoundSection(editor)
            const ids = ['KICK', 'SNARE']
            const keys = new Set(['KICK', 'SNARE'])
            expect(section._getCurrentInstrumentName(ids, keys)).toBe('KICK')
        })

        it('falls back to track.name when sound key not in keysWithSamples', () => {
            const editor = makeMockEditor({ track: { name: 'SNARE', soundId: 'unknown_sound' } })
            editor._soundRegistry.sounds = {}
            section = new SoundSection(editor)
            const ids = ['KICK', 'SNARE']
            const keys = new Set(['KICK', 'SNARE'])
            expect(section._getCurrentInstrumentName(ids, keys)).toBe('SNARE')
        })

        it('falls back to first instrument id when neither matches', () => {
            const editor = makeMockEditor({ track: { name: 'TOM', soundId: 'unknown_sound' } })
            editor._soundRegistry.sounds = {}
            section = new SoundSection(editor)
            const ids = ['KICK', 'SNARE']
            const keys = new Set(['KICK', 'SNARE'])
            expect(section._getCurrentInstrumentName(ids, keys)).toBe('KICK')
        })

        it('returns KICK as final fallback when instrumentIds is empty', () => {
            const editor = makeMockEditor({ track: { name: 'TOM', soundId: 'unknown_sound' } })
            editor._soundRegistry.sounds = {}
            section = new SoundSection(editor)
            const ids = []
            const keys = new Set(['KICK', 'SNARE'])
            expect(section._getCurrentInstrumentName(ids, keys)).toBe('KICK')
        })
    })
})
