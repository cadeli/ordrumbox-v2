import { describe, it, expect, vi, beforeEach } from 'vitest'
import { soundRegistry } from '../src/state/sound_registry.js'
import { serviceRegistry } from '../src/state/service_registry.js'
import { downloadJson } from '../src/ui/components/panel_helpers.js'
import { cacheDrumkits, cacheGeneratedSounds } from '../src/cache/idb_cache.js'

vi.mock('../src/ui/components/panel_helpers.js', () => ({
    downloadJson: vi.fn(),
}))

vi.mock('../src/cache/idb_cache.js', async (importOriginal) => {
    const actual = await importOriginal()
    return {
        ...actual,
        cacheDrumkits: vi.fn(() => Promise.resolve()),
        cacheGeneratedSounds: vi.fn(() => Promise.resolve()),
    }
})

// ─── Helpers: replicate the exact import/export logic from tools_panel.js ──

function simulateExportDrumkit() {
    const drumkits = soundRegistry.drumkitList
    if (!drumkits || drumkits.length === 0) return false
    downloadJson(drumkits, 'ordrumbox-drumkits.json')
    return true
}

function simulateExportSynth() {
    const sounds = soundRegistry.generatedSounds
    if (!sounds || Object.keys(sounds).length === 0) return false
    downloadJson(sounds, 'ordrumbox-synth-sounds.json')
    return true
}

function simulateImportDrumkit(jsonString) {
    const data = JSON.parse(jsonString)
    if (!Array.isArray(data)) throw new Error('expected a JSON array')
    for (const kit of data) {
        if (!kit.name || !Array.isArray(kit.instruments)) {
            throw new Error('missing name or instruments')
        }
    }
    for (const kit of data) {
        const existing = soundRegistry.drumkitList.findIndex(k => k.name === kit.name)
        if (existing !== -1) {
            soundRegistry.drumkitList[existing] = kit
        } else {
            soundRegistry.drumkitList.push(kit)
        }
    }
    cacheDrumkits(soundRegistry.drumkitList)
}

function simulateImportSynth(jsonString) {
    const data = JSON.parse(jsonString)
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw new Error('expected a JSON object')
    }
    Object.assign(soundRegistry.generatedSounds, data)
    cacheGeneratedSounds(soundRegistry.generatedSounds)
    serviceRegistry.audioEngine?.updateGeneratedSounds?.(soundRegistry.generatedSounds)
}

// ─── Drumkit export ──────────────────────────────────────────────────────

describe('Drumkit export', () => {
    beforeEach(() => {
        soundRegistry.reset()
        downloadJson.mockClear()
    })

    it('exports drumkitList as JSON array', () => {
        soundRegistry.drumkitList.push(
            { name: 'kit_a', infos: 'A', desc: '', instruments: [{ display_name: 'kick', key: 'KICK', url: 'a.wav' }] },
            { name: 'kit_b', infos: 'B', desc: '', instruments: [] },
        )

        simulateExportDrumkit()

        expect(downloadJson).toHaveBeenCalledOnce()
        expect(downloadJson.mock.calls[0][1]).toBe('ordrumbox-drumkits.json')
        const exported = downloadJson.mock.calls[0][0]
        expect(exported).toHaveLength(2)
        expect(exported[0].name).toBe('kit_a')
        expect(exported[1].name).toBe('kit_b')
    })

    it('does not export when drumkitList is empty', () => {
        const ok = simulateExportDrumkit()
        expect(ok).toBe(false)
        expect(downloadJson).not.toHaveBeenCalled()
    })
})

// ─── Drumkit import ──────────────────────────────────────────────────────

describe('Drumkit import', () => {
    beforeEach(() => {
        soundRegistry.reset()
        cacheDrumkits.mockClear()
    })

    it('imports new kits into drumkitList and caches', async () => {
        const json = JSON.stringify([
            { name: 'imported', infos: '', desc: '', instruments: [{ display_name: 'hat', key: 'CHH', url: 'h.wav' }] },
        ])
        simulateImportDrumkit(json)

        expect(soundRegistry.drumkitList).toHaveLength(1)
        expect(soundRegistry.drumkitList[0].name).toBe('imported')
        expect(cacheDrumkits).toHaveBeenCalledWith(soundRegistry.drumkitList)
    })

    it('merges (overwrites) existing kit by name', async () => {
        soundRegistry.drumkitList.push(
            { name: 'kit_a', infos: 'old', desc: '', instruments: [{ display_name: 'kick', key: 'KICK', url: 'old.wav' }] },
        )

        const json = JSON.stringify([
            { name: 'kit_a', infos: 'new', desc: '', instruments: [{ display_name: 'snare', key: 'SNARE', url: 'new.wav' }] },
        ])
        simulateImportDrumkit(json)

        expect(soundRegistry.drumkitList).toHaveLength(1)
        expect(soundRegistry.drumkitList[0].infos).toBe('new')
        expect(soundRegistry.drumkitList[0].instruments[0].key).toBe('SNARE')
    })

    it('adds new kit and keeps existing ones', async () => {
        soundRegistry.drumkitList.push(
            { name: 'existing', infos: '', desc: '', instruments: [] },
        )

        const json = JSON.stringify([
            { name: 'new_kit', infos: '', desc: '', instruments: [{ display_name: 'clap', key: 'CLAP', url: 'c.wav' }] },
        ])
        simulateImportDrumkit(json)

        expect(soundRegistry.drumkitList).toHaveLength(2)
        expect(soundRegistry.drumkitList[0].name).toBe('existing')
        expect(soundRegistry.drumkitList[1].name).toBe('new_kit')
    })

    it('throws on non-array JSON', () => {
        expect(() => simulateImportDrumkit('{"not":"array"}')).toThrow('expected a JSON array')
    })

    it('throws on kit missing name', () => {
        const json = JSON.stringify([{ instruments: [] }])
        expect(() => simulateImportDrumkit(json)).toThrow('missing name or instruments')
    })

    it('throws on kit missing instruments', () => {
        const json = JSON.stringify([{ name: 'no_instruments' }])
        expect(() => simulateImportDrumkit(json)).toThrow('missing name or instruments')
    })
})

// ─── Synth export ────────────────────────────────────────────────────────

describe('Synth export', () => {
    beforeEach(() => {
        soundRegistry.reset()
        downloadJson.mockClear()
    })

    it('exports generatedSounds as JSON object', () => {
        Object.assign(soundRegistry.generatedSounds, {
            BASS0: { masterVolume: 0.35, vco1: { wave: 'sawtooth' } },
            LEAD: { masterVolume: 0.6, vco1: { wave: 'square' } },
        })

        simulateExportSynth()

        expect(downloadJson).toHaveBeenCalledOnce()
        expect(downloadJson.mock.calls[0][1]).toBe('ordrumbox-synth-sounds.json')
        const exported = downloadJson.mock.calls[0][0]
        expect(Object.keys(exported)).toHaveLength(2)
        expect(exported.BASS0.vco1.wave).toBe('sawtooth')
        expect(exported.LEAD.vco1.wave).toBe('square')
    })

    it('does not export when generatedSounds is empty', () => {
        const ok = simulateExportSynth()
        expect(ok).toBe(false)
        expect(downloadJson).not.toHaveBeenCalled()
    })
})

// ─── Synth import ────────────────────────────────────────────────────────

describe('Synth import', () => {
    beforeEach(() => {
        soundRegistry.reset()
        cacheGeneratedSounds.mockClear()
        serviceRegistry.audioEngine = { updateGeneratedSounds: vi.fn() }
    })

    it('imports new synth sounds and caches', async () => {
        const json = JSON.stringify({
            SNARE_SYNTH: { masterVolume: 0.5, vco1: { wave: 'sine' } },
        })
        simulateImportSynth(json)

        expect(Object.keys(soundRegistry.generatedSounds)).toHaveLength(1)
        expect(soundRegistry.generatedSounds.SNARE_SYNTH.masterVolume).toBe(0.5)
        expect(cacheGeneratedSounds).toHaveBeenCalledWith(soundRegistry.generatedSounds)
    })

    it('merges (overwrites) existing sound by key', async () => {
        Object.assign(soundRegistry.generatedSounds, {
            BASS0: { masterVolume: 0.1, vco1: { wave: 'sine' } },
        })

        const json = JSON.stringify({
            BASS0: { masterVolume: 0.9, vco1: { wave: 'sawtooth' } },
        })
        simulateImportSynth(json)

        expect(Object.keys(soundRegistry.generatedSounds)).toHaveLength(1)
        expect(soundRegistry.generatedSounds.BASS0.masterVolume).toBe(0.9)
        expect(soundRegistry.generatedSounds.BASS0.vco1.wave).toBe('sawtooth')
    })

    it('adds new sound and keeps existing ones', async () => {
        Object.assign(soundRegistry.generatedSounds, {
            BASS0: { masterVolume: 0.35 },
        })

        const json = JSON.stringify({
            LEAD: { masterVolume: 0.6, vco1: { wave: 'square' } },
        })
        simulateImportSynth(json)

        expect(Object.keys(soundRegistry.generatedSounds)).toHaveLength(2)
        expect(soundRegistry.generatedSounds.BASS0.masterVolume).toBe(0.35)
        expect(soundRegistry.generatedSounds.LEAD.vco1.wave).toBe('square')
    })

    it('notifies audioEngine after import', async () => {
        const json = JSON.stringify({ PAD: { masterVolume: 0.4 } })
        simulateImportSynth(json)

        expect(serviceRegistry.audioEngine.updateGeneratedSounds).toHaveBeenCalledWith(soundRegistry.generatedSounds)
    })

    it('throws on array JSON', () => {
        expect(() => simulateImportSynth('[1,2,3]')).toThrow('expected a JSON object')
    })

    it('throws on null JSON', () => {
        expect(() => simulateImportSynth('null')).toThrow('expected a JSON object')
    })
})

// ─── Full roundtrip: export → import → verify ────────────────────────────

describe('Full drumkit roundtrip', () => {
    beforeEach(() => {
        soundRegistry.reset()
        downloadJson.mockClear()
        cacheDrumkits.mockClear()
    })

    it('export → re-import into fresh registry preserves all data', () => {
        const kits = [
            {
                name: 'RT_KIT',
                infos: 'roundtrip',
                desc: 'test kit',
                instruments: [
                    { display_name: 'kick', key: 'KICK', url: 'rt/kick.wav', peakDb: -3, rootMidi: 36, decay: 5000 },
                    { display_name: 'snare', key: 'SNARE', url: 'rt/snare.wav', peakDb: -6, rootMidi: 38, decay: 3000 },
                ],
            },
        ]

        soundRegistry.drumkitList.push(...kits)
        simulateExportDrumkit()

        const exportedJson = JSON.stringify(downloadJson.mock.calls[0][0])

        soundRegistry.reset()
        simulateImportDrumkit(exportedJson)

        expect(soundRegistry.drumkitList).toHaveLength(1)
        const kit = soundRegistry.drumkitList[0]
        expect(kit.name).toBe('RT_KIT')
        expect(kit.infos).toBe('roundtrip')
        expect(kit.instruments).toHaveLength(2)
        expect(kit.instruments[0]).toEqual({ display_name: 'kick', key: 'KICK', url: 'rt/kick.wav', peakDb: -3, rootMidi: 36, decay: 5000 })
        expect(kit.instruments[1]).toEqual({ display_name: 'snare', key: 'SNARE', url: 'rt/snare.wav', peakDb: -6, rootMidi: 38, decay: 3000 })
    })
})

describe('Full synth roundtrip', () => {
    beforeEach(() => {
        soundRegistry.reset()
        downloadJson.mockClear()
        cacheGeneratedSounds.mockClear()
        serviceRegistry.audioEngine = { updateGeneratedSounds: vi.fn() }
    })

    it('export → re-import into fresh registry preserves all params', () => {
        const sounds = {
            KICK_SYNTH: {
                masterVolume: 0.7,
                noise: { mix: 0.2, filterType: 'lowpass', filterFreq: 500, filterQ: 1 },
                vco1: { gain: 1, octave: -2, detune: 0, wave: 'sine' },
                vco2: { gain: 0, octave: 0, detune: 0, wave: 'sine' },
                vco3: { gain: 0, octave: 0, detune: 0, wave: 'sine' },
                filter: { type: 'lowpass', freq: 300, Q: 10, filterEnvelopeAmount: 0.8 },
                lfo: { target: 'NOT', wave: 'sine', freq: 0, depth: 0 },
                enveloppe: { attack: 0.001, decay: 0.2, sustain: 0, release: 0.1 },
                lfo2: { target: 'NOT', wave: 'sine', freq: 0, depth: 0 },
            },
        }

        Object.assign(soundRegistry.generatedSounds, sounds)
        simulateExportSynth()

        const exportedJson = JSON.stringify(downloadJson.mock.calls[0][0])

        soundRegistry.reset()
        simulateImportSynth(exportedJson)

        const synth = soundRegistry.generatedSounds.KICK_SYNTH
        expect(synth).toBeDefined()
        expect(synth.masterVolume).toBe(0.7)
        expect(synth.vco1.wave).toBe('sine')
        expect(synth.vco1.octave).toBe(-2)
        expect(synth.noise.mix).toBe(0.2)
        expect(synth.filter.freq).toBe(300)
        expect(synth.filter.Q).toBe(10)
        expect(synth.enveloppe.attack).toBe(0.001)
        expect(synth.enveloppe.sustain).toBe(0)
        expect(synth.lfo.target).toBe('NOT')
    })
})
