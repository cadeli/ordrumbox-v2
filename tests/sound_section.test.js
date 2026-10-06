/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import SoundSection from '../src/ui/track_editor/sound_section.js'
import {
    getAllKitSamples,
    getCurrentInstrumentId,
    getCurrentSoundUrl,
    getPreferredSampleForInstrument,
    getSamplesForInstrument,
    getSelectedDrumkitName,
    sortSamplesForCurrentKit,
} from '../src/ui/track_editor/sound_queries.js'

vi.mock('../src/logic/services/auto_assign.js', () => {
    const mockAutoAssignTrackSounds = vi.fn()
    const MockAutoAssign = vi.fn().mockImplementation(function () {
        this.autoAssignTrackSounds = mockAutoAssignTrackSounds
    })
    return { default: MockAutoAssign }
})

function makeMockEditor(overrides = {}) {
    return {
        track: {
            name: 'KICK',
            sampleId: 'kick_1.wav',
            useSoftSynth: false,
            useAutoAssignSound: true,
            mono: false,
            ...overrides.track,
        },
        soundRegistry: {
            sounds: {
                'kick_1.wav': { url: 'kick_1.wav', key: 'KICK', kitName: '808', display_name: 'Kick' },
                'snare_1.wav': { url: 'snare_1.wav', key: 'SNARE', kitName: '808', display_name: 'Snare' },
            },
            drumkitList: [
                {
                    name: '808',
                    // no kitName here on purpose: getAllKitSamples() falls back to
                    // the kit it iterates, which is the path real entries take now
                    // that they carry kitName themselves
                    instruments: [
                        { key: 'KICK', url: 'kick_1.wav', display_name: 'Kick' },
                        { key: 'SNARE', url: 'snare_1.wav', display_name: 'Snare' },
                    ],
                },
            ],
            generatedSounds: { BASS1: {}, PIANO: {} },
        },
        appState: { selectedDrumkitIdx: 0 },
        serviceRegistry: {
            cmd: { changeTrackName: vi.fn(), changeTrackSound: vi.fn() },
            resourcesLoader: { loadSample: vi.fn() },
        },
        playbackEvents: { batch: vi.fn((fn) => fn()), emit: vi.fn() },
        synthEditor: { getGeneratedSoundKeys: vi.fn(() => ['BASS1', 'PIANO']), ensureGeneratedSoundsLoaded: vi.fn() },
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
            editor.track = null
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
            const editor = makeMockEditor({ track: { name: 'TOM', sampleId: 'unknown_sound' } })
            editor.soundRegistry.sounds = {}
            editor.soundRegistry.drumkitList = []
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
            editor.soundRegistry.drumkitList.push({
                name: 'TRAP',
                instruments: [{ key: 'KICK', url: 'trap_kick.wav', display_name: 'Trap Kick' }],
            })
            editor.soundRegistry.sounds['trap_kick.wav'] = {
                url: 'trap_kick.wav',
                key: 'KICK',
                kitName: 'TRAP',
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
            expect(editor.serviceRegistry.cmd.changeTrackName).toHaveBeenCalledWith(editor.track, 'SNARE')
        })

        it('loads sample if buffer is missing', async () => {
            const editor = makeMockEditor()
            editor.soundRegistry.sounds['kick_1.wav'].buffer = undefined
            section = new SoundSection(editor)
            await section.onInstrumentChange({ value: 'KICK' })
            expect(editor.serviceRegistry.resourcesLoader.loadSample).toHaveBeenCalled()
        })

        it('does not load sample if buffer exists', async () => {
            const editor = makeMockEditor()
            editor.soundRegistry.sounds['kick_1.wav'].buffer = {}
            section = new SoundSection(editor)
            await section.onInstrumentChange({ value: 'KICK' })
            expect(editor.serviceRegistry.resourcesLoader.loadSample).not.toHaveBeenCalled()
        })

        it('calls changeTrackSound with first sample url', async () => {
            const editor = makeMockEditor()
            section = new SoundSection(editor)
            await section.onInstrumentChange({ value: 'SNARE' })
            expect(editor.serviceRegistry.cmd.changeTrackSound).toHaveBeenCalledWith(editor.track, 'snare_1.wav')
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
            expect(editor.playbackEvents.batch).toHaveBeenCalled()
            expect(editor.playbackEvents.emit).toHaveBeenCalledWith('trackParamChange', editor.track)
            expect(editor.playbackEvents.emit).toHaveBeenCalledWith('patternChange', [editor.track])
        })

        it('does not call changeTrackSound when no sample found for instrument', async () => {
            const editor = makeMockEditor({ track: { name: 'NONE' } })
            section = new SoundSection(editor)
            await section.onInstrumentChange({ value: 'NONE' })
            expect(editor.serviceRegistry.cmd.changeTrackSound).not.toHaveBeenCalled()
        })
    })

    describe('onSampleChange()', () => {
        it('calls changeTrackSound with the selected url', async () => {
            const editor = makeMockEditor()
            section = new SoundSection(editor)
            await section.onSampleChange({ value: 'snare_1.wav' })
            expect(editor.serviceRegistry.cmd.changeTrackSound).toHaveBeenCalledWith(editor.track, 'snare_1.wav')
        })

        it('searches kits and loads sample if buffer is missing', async () => {
            const editor = makeMockEditor()
            editor.soundRegistry.sounds['snare_1.wav'].buffer = undefined
            section = new SoundSection(editor)
            await section.onSampleChange({ value: 'snare_1.wav' })
            expect(editor.serviceRegistry.resourcesLoader.loadSample).toHaveBeenCalled()
        })

        it('does not load sample if buffer already exists', async () => {
            const editor = makeMockEditor()
            editor.soundRegistry.sounds['snare_1.wav'].buffer = new Float32Array(100)
            section = new SoundSection(editor)
            await section.onSampleChange({ value: 'snare_1.wav' })
            expect(editor.serviceRegistry.resourcesLoader.loadSample).not.toHaveBeenCalled()
        })

        it('emits trackParamChange and patternChange events', async () => {
            const editor = makeMockEditor()
            section = new SoundSection(editor)
            await section.onSampleChange({ value: 'kick_1.wav' })
            expect(editor.playbackEvents.batch).toHaveBeenCalled()
            expect(editor.playbackEvents.emit).toHaveBeenCalledWith('trackParamChange', editor.track)
            expect(editor.playbackEvents.emit).toHaveBeenCalledWith('patternChange', [editor.track])
        })

        it('loads sample from kit resourcesLoader when not found in sounds registry', async () => {
            const editor = makeMockEditor()
            delete editor.soundRegistry.sounds['new_sample.wav']
            editor.soundRegistry.drumkitList[0].instruments.push({
                key: 'HIT',
                url: 'new_sample.wav',
                display_name: 'Hit',
            })
            section = new SoundSection(editor)
            await section.onSampleChange({ value: 'new_sample.wav' })
            expect(editor.serviceRegistry.resourcesLoader.loadSample).toHaveBeenCalledWith(
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
            expect(editor.track.useSoftSynth).toBe(false)
        })

        it('sets useSoftSynth=true and synthSoundKey when key is not none', async () => {
            const editor = makeMockEditor()
            section = new SoundSection(editor)
            await section.onGeneratedChange({ value: 'BASS1' })
            expect(editor.track.useSoftSynth).toBe(true)
            expect(editor.track.synthSoundKey).toBe('BASS1')
        })

        it('sets useAutoAssignSound=false when selecting a synth key', async () => {
            const editor = makeMockEditor()
            section = new SoundSection(editor)
            await section.onGeneratedChange({ value: 'PIANO' })
            expect(editor.track.useAutoAssignSound).toBe(false)
        })

        it('calls ensureGeneratedSoundsLoaded if key not in generatedSounds', async () => {
            const editor = makeMockEditor()
            editor.soundRegistry.generatedSounds = {}
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
            expect(editor.playbackEvents.batch).toHaveBeenCalled()
            expect(editor.playbackEvents.emit).toHaveBeenCalledWith('trackParamChange', editor.track)
            expect(editor.playbackEvents.emit).toHaveBeenCalledWith('patternChange', [editor.track])
        })
    })

    describe('toggleAuto()', () => {
        it('toggles useAutoAssignSound from true to false', () => {
            const editor = makeMockEditor()
            section = new SoundSection(editor)
            section.toggleAuto()
            expect(editor.track.useAutoAssignSound).toBe(false)
        })

        it('toggles useAutoAssignSound from false to true', () => {
            const editor = makeMockEditor({ track: { useAutoAssignSound: false } })
            section = new SoundSection(editor)
            section.toggleAuto()
            expect(editor.track.useAutoAssignSound).toBe(true)
        })

        it('sets useSoftSynth=false when enabling auto', () => {
            const editor = makeMockEditor({
                track: { useAutoAssignSound: false, useSoftSynth: true, synthSoundKey: 'BASS1' },
            })
            section = new SoundSection(editor)
            section.toggleAuto()
            expect(editor.track.useSoftSynth).toBe(false)
        })

        it('sets synthSoundKey=null when enabling auto', () => {
            const editor = makeMockEditor({
                track: { useAutoAssignSound: false, useSoftSynth: true, synthSoundKey: 'BASS1' },
            })
            section = new SoundSection(editor)
            section.toggleAuto()
            expect(editor.track.synthSoundKey).toBeNull()
        })

        it('creates AutoAssign and calls autoAssignTrackSounds when enabling', () => {
            const editor = makeMockEditor({ track: { useAutoAssignSound: false } })
            section = new SoundSection(editor)
            section.toggleAuto()
            expect(AutoAssign).toHaveBeenCalled()
            const instance = AutoAssign.mock.results[0].value
            expect(instance.autoAssignTrackSounds).toHaveBeenCalledWith(editor.track)
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
            expect(editor.playbackEvents.batch).toHaveBeenCalled()
            expect(editor.playbackEvents.emit).toHaveBeenCalledWith('trackParamChange', editor.track)
            expect(editor.playbackEvents.emit).toHaveBeenCalledWith('patternChange', [editor.track])
        })
    })

    describe('getSelectedDrumkitName()', () => {
        it('returns correct kit name for selected index', () => {
            const editor = makeMockEditor()
            section = new SoundSection(editor)
            expect(getSelectedDrumkitName(editor)).toBe('808')
        })

        it('returns empty string when drumkitList is empty', () => {
            const editor = makeMockEditor()
            editor.soundRegistry.drumkitList = []
            section = new SoundSection(editor)
            expect(getSelectedDrumkitName(editor)).toBe('')
        })

        it('returns correct name for different index', () => {
            const editor = makeMockEditor()
            editor.soundRegistry.drumkitList.push({ name: 'TRAP' })
            editor.appState.selectedDrumkitIdx = 1
            section = new SoundSection(editor)
            expect(getSelectedDrumkitName(editor)).toBe('TRAP')
        })
    })

    describe('getAllKitSamples()', () => {
        it('flattens all kits into a single array', () => {
            const editor = makeMockEditor()
            editor.soundRegistry.drumkitList.push({
                name: 'TRAP',
                instruments: [{ key: 'HIT', url: 'trap_hit.wav', display_name: 'Trap Hit' }],
            })
            section = new SoundSection(editor)
            const samples = getAllKitSamples(editor)
            expect(samples).toHaveLength(3)
            expect(samples.map((s) => s.url)).toContain('kick_1.wav')
            expect(samples.map((s) => s.url)).toContain('snare_1.wav')
            expect(samples.map((s) => s.url)).toContain('trap_hit.wav')
        })

        it('adds kitName to each sample', () => {
            const editor = makeMockEditor()
            section = new SoundSection(editor)
            const samples = getAllKitSamples(editor)
            expect(samples.every((s) => s.kitName === '808')).toBe(true)
        })

        it('returns empty array when no kits exist', () => {
            const editor = makeMockEditor()
            editor.soundRegistry.drumkitList = []
            section = new SoundSection(editor)
            expect(getAllKitSamples(editor)).toEqual([])
        })
    })

    describe('sortSamplesForCurrentKit()', () => {
        it('sorts samples from selected kit first', () => {
            const editor = makeMockEditor()
            editor.soundRegistry.drumkitList = [
                { name: 'TRAP', instruments: [{ key: 'KICK', url: 'trap_kick.wav', display_name: 'Trap Kick' }] },
                { name: '808', instruments: [{ key: 'KICK', url: 'kick_1.wav', display_name: 'Kick' }] },
            ]
            editor.soundRegistry.sounds['trap_kick.wav'] = {
                url: 'trap_kick.wav',
                key: 'KICK',
                kitName: 'TRAP',
                display_name: 'Trap Kick',
            }
            editor.appState.selectedDrumkitIdx = 1
            section = new SoundSection(editor)
            const samples = getAllKitSamples(editor)
            const sorted = sortSamplesForCurrentKit(editor, samples)
            expect(sorted[0].kitName).toBe('808')
            expect(sorted[1].kitName).toBe('TRAP')
        })

        it('sorts by kit name alphabetically when both are not selected', () => {
            const editor = makeMockEditor()
            editor.soundRegistry.drumkitList = [
                { name: 'ZOOM', instruments: [{ key: 'KICK', url: 'z_kick.wav', display_name: 'Z Kick' }] },
                { name: 'ALPHA', instruments: [{ key: 'KICK', url: 'a_kick.wav', display_name: 'A Kick' }] },
            ]
            editor.soundRegistry.sounds['z_kick.wav'] = {
                url: 'z_kick.wav',
                key: 'KICK',
                kitName: 'ZOOM',
                display_name: 'Z Kick',
            }
            editor.soundRegistry.sounds['a_kick.wav'] = {
                url: 'a_kick.wav',
                key: 'KICK',
                kitName: 'ALPHA',
                display_name: 'A Kick',
            }
            editor.appState.selectedDrumkitIdx = 0
            section = new SoundSection(editor)
            const samples = getAllKitSamples(editor)
            const sorted = sortSamplesForCurrentKit(editor, samples)
            expect(sorted[0].kitName).toBe('ZOOM')
            expect(sorted[1].kitName).toBe('ALPHA')
        })

        it('sorts by display_name within same kit', () => {
            const editor = makeMockEditor()
            editor.soundRegistry.drumkitList = [
                {
                    name: '808',
                    instruments: [
                        { key: 'KICK', url: 'b_kick.wav', display_name: 'B Kick' },
                        { key: 'KICK', url: 'a_kick.wav', display_name: 'A Kick' },
                    ],
                },
            ]
            editor.soundRegistry.sounds['b_kick.wav'] = {
                url: 'b_kick.wav',
                key: 'KICK',
                kitName: '808',
                display_name: 'B Kick',
            }
            editor.soundRegistry.sounds['a_kick.wav'] = {
                url: 'a_kick.wav',
                key: 'KICK',
                kitName: '808',
                display_name: 'A Kick',
            }
            section = new SoundSection(editor)
            const samples = getAllKitSamples(editor)
            const sorted = sortSamplesForCurrentKit(editor, samples)
            expect(sorted[0].display_name).toBe('A Kick')
            expect(sorted[1].display_name).toBe('B Kick')
        })
    })

    describe('getSamplesForInstrument()', () => {
        it('filters samples by instrument key', () => {
            const editor = makeMockEditor()
            section = new SoundSection(editor)
            const samples = getSamplesForInstrument(editor, 'SNARE')
            expect(samples).toHaveLength(1)
            expect(samples[0].key).toBe('SNARE')
        })

        it('returns empty array when no samples match', () => {
            const editor = makeMockEditor()
            section = new SoundSection(editor)
            const samples = getSamplesForInstrument(editor, 'TOM')
            expect(samples).toHaveLength(0)
        })

        it('returns multiple samples when several kits have the same instrument', () => {
            const editor = makeMockEditor()
            editor.soundRegistry.drumkitList.push({
                name: 'TRAP',
                instruments: [{ key: 'SNARE', url: 'trap_snare.wav', display_name: 'Trap Snare' }],
            })
            editor.soundRegistry.sounds['trap_snare.wav'] = {
                url: 'trap_snare.wav',
                key: 'SNARE',
                kitName: 'TRAP',
                display_name: 'Trap Snare',
            }
            section = new SoundSection(editor)
            const samples = getSamplesForInstrument(editor, 'SNARE')
            expect(samples).toHaveLength(2)
        })
    })

    describe('getPreferredSampleForInstrument()', () => {
        it('returns first sample for the instrument', () => {
            const editor = makeMockEditor()
            section = new SoundSection(editor)
            const sample = getPreferredSampleForInstrument(editor, 'KICK')
            expect(sample).toBeDefined()
            expect(sample.key).toBe('KICK')
        })

        it('returns null when no samples match', () => {
            const editor = makeMockEditor()
            section = new SoundSection(editor)
            expect(getPreferredSampleForInstrument(editor, 'TOM')).toBeNull()
        })
    })

    describe('getCurrentSoundUrl()', () => {
        it('returns url when sampleId maps to a sound entry', () => {
            const editor = makeMockEditor()
            section = new SoundSection(editor)
            expect(getCurrentSoundUrl(editor)).toBe('kick_1.wav')
        })

        it('returns sampleId directly when not found in sounds registry', () => {
            const editor = makeMockEditor({ track: { sampleId: 'unknown_id' } })
            section = new SoundSection(editor)
            expect(getCurrentSoundUrl(editor)).toBe('unknown_id')
        })

        it('returns empty string when sampleId is empty', () => {
            const editor = makeMockEditor({ track: { sampleId: '' } })
            section = new SoundSection(editor)
            expect(getCurrentSoundUrl(editor)).toBe('')
        })
    })

    describe('getSoundInfo()', () => {
        it('returns synthSoundKey when useSoftSynth is true', () => {
            const editor = makeMockEditor({ track: { useSoftSynth: true, synthSoundKey: 'BASS1' } })
            section = new SoundSection(editor)
            expect(section.getSoundInfo()).toBe('BASS1')
        })

        it('returns null when useSoftSynth is true but synthSoundKey is null', () => {
            const editor = makeMockEditor({ track: { useSoftSynth: true, synthSoundKey: null } })
            section = new SoundSection(editor)
            expect(section.getSoundInfo()).toBeNull()
        })

        it('returns kit/name for sample path', () => {
            const editor = makeMockEditor()
            section = new SoundSection(editor)
            // used to be just 'Kick': the kit came from `kit_name` while the UI read kitName
            expect(section.getSoundInfo()).toBe('808/Kick')
        })

        it('returns null when sound is not found in registry', () => {
            const editor = makeMockEditor({ track: { sampleId: 'nonexistent' } })
            section = new SoundSection(editor)
            expect(section.getSoundInfo()).toBeNull()
        })

        it('returns just name when kitName is empty', () => {
            const editor = makeMockEditor()
            editor.soundRegistry.sounds['kick_1.wav'].kitName = ''
            section = new SoundSection(editor)
            expect(section.getSoundInfo()).toBe('Kick')
        })
    })

    describe('getCurrentInstrumentId()', () => {
        it('returns sound key when it matches an instrument with samples', () => {
            const editor = makeMockEditor()
            section = new SoundSection(editor)
            const ids = ['KICK', 'SNARE']
            const keys = new Set(['KICK', 'SNARE'])
            expect(getCurrentInstrumentId(editor, ids, keys)).toBe('KICK')
        })

        it('falls back to track.name when sound key not in keysWithSamples', () => {
            const editor = makeMockEditor({ track: { name: 'SNARE', sampleId: 'unknown_sound' } })
            editor.soundRegistry.sounds = {}
            section = new SoundSection(editor)
            const ids = ['KICK', 'SNARE']
            const keys = new Set(['KICK', 'SNARE'])
            expect(getCurrentInstrumentId(editor, ids, keys)).toBe('SNARE')
        })

        it('falls back to first instrument id when neither matches', () => {
            const editor = makeMockEditor({ track: { name: 'TOM', sampleId: 'unknown_sound' } })
            editor.soundRegistry.sounds = {}
            section = new SoundSection(editor)
            const ids = ['KICK', 'SNARE']
            const keys = new Set(['KICK', 'SNARE'])
            expect(getCurrentInstrumentId(editor, ids, keys)).toBe('KICK')
        })

        it('returns KICK as final fallback when instrumentIds is empty', () => {
            const editor = makeMockEditor({ track: { name: 'TOM', sampleId: 'unknown_sound' } })
            editor.soundRegistry.sounds = {}
            section = new SoundSection(editor)
            const ids = []
            const keys = new Set(['KICK', 'SNARE'])
            expect(getCurrentInstrumentId(editor, ids, keys)).toBe('KICK')
        })
    })
})
