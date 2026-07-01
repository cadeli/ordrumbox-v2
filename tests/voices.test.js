import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import BaseVoice from '../src/audio/voices/base_voice.js'
import SampleVoice from '../src/audio/voices/sample_voice.js'
import WorkletSynthVoice from '../src/audio/voices/worklet_synth_voice.js'
import VoiceFactory from '../src/audio/voices/voice_factory.js'
import { appState } from '../src/state/app_state.js'
import { serviceRegistry } from '../src/state/service_registry.js'
import WorkletLoader from '../src/audio/worklets/loader.js'
import { computeOscFrequency, computeNoteRatio } from '../src/audio/math.js'
import { C3_FREQ, LFO_FREQ_OFFSET, MIN_NOTE_RATIO } from '../src/core/constants.js'
import { makeParam, makeNode } from './helpers/worklet_mocks.js'

const postMessageMock = vi.fn()
const workletNodeMock = {
    port: { postMessage: postMessageMock },
    connect: vi.fn(),
    disconnect: vi.fn(),
}

vi.spyOn(WorkletLoader, 'isSupported').mockReturnValue(true)
vi.spyOn(WorkletLoader, 'ensureLoaded').mockResolvedValue(true)
vi.spyOn(WorkletLoader, 'createNode').mockImplementation(() => workletNodeMock)

beforeEach(() => {
    postMessageMock.mockClear()
    workletNodeMock.connect.mockClear()
    workletNodeMock.disconnect.mockClear()
})

function lastPostByType(type) {
    const matches = postMessageMock.mock.calls.map(c => c[0]).filter(m => m?.type === type)
    return matches.at(-1)
}

function createMockAudioCtx() {
    const sampleRate = 44100

    return {
        currentTime: 1.0,
        sampleRate,
        createGain: vi.fn(() => ({ ...makeNode(), gain: makeParam(1) })),
        createOscillator: vi.fn(() => ({
            ...makeNode(),
            type: 'sine',
            frequency: makeParam(440),
            detune: makeParam(0),
        })),
        createBiquadFilter: vi.fn(() => ({
            ...makeNode(),
            type: 'lowpass',
            frequency: makeParam(350),
            Q: makeParam(1),
        })),
        createStereoPanner: vi.fn(() => ({ ...makeNode(), pan: makeParam(0) })),
        createBufferSource: vi.fn(() => ({
            ...makeNode(),
            buffer: null,
            loop: false,
            playbackRate: makeParam(1),
            detune: makeParam(0),
            onended: null,
        })),
        createBuffer: vi.fn((ch, len, sr) => ({
            numberOfChannels: ch,
            length: len,
            sampleRate: sr,
            getChannelData: vi.fn(() => new Float32Array(len)),
        })),
    }
}

function createMockStrip() {
    return {
        voicesInput: makeNode(),
        _lfoGains: {
            pitchLfo: { ...makeNode(), gain: makeParam() },
            panLfo:   { ...makeNode(), gain: makeParam() },
        },
    }
}

function createMockLfo() {
    return {
        type: 'sine',
        frequency: makeParam(0),
        connect: vi.fn(),
        disconnect: vi.fn(),
    }
}

function makeFlatNote(overrides = {}) {
    return {
        soundId: 'snd_kick',
        fpitch: 1,
        pan: 0,
        note: { velocity: 0.8 },
        track: {
            name: 'KICK',
            useSoftSynth: false,
            sampleLength: 0.5,
            pitchLfo: null,
            panLfo: null,
            soundId: 'snd_kick',
        },
        ...overrides,
    }
}

function makeGeneratedSound(overrides = {}) {
    return {
        masterVolume: 0.8,
        slide: 0,
        vco1: { wave: 'sine', octave: 0, detune: 0, gain: 1 },
        vco2: null,
        vco3: null,
        enveloppe: { attack: 0.01, decay: 0.1, sustain: 0.7, release: 0.2 },
        filter: { type: 'lowpass', freq: 50, Q: 1, filterEnvelopeAmount: 0 },
        noise: { mix: 0, filterType: 'highpass', filterFreq: 1000, filterQ: 1 },
        lfo: { wave: 'sine', freq: 1, depth: 0.5, target: 'NOT' },
        ...overrides,
    }
}

// ─── BaseVoice ────────────────────────────────────────────────────────────────

describe('BaseVoice', () => {
    let ctx, strip, voice

    beforeEach(() => {
        ctx = createMockAudioCtx()
        strip = createMockStrip()
        voice = new BaseVoice(ctx, strip)
    })

    it('initializes with audioCtx, strip, stopped=false and empty nodes', () => {
        expect(voice.audioCtx).toBe(ctx)
        expect(voice.strip).toBe(strip)
        expect(voice.stopped).toBe(false)
        expect(voice.nodes).toEqual([])
    })

    it('setup() throws - must be overridden', () => {
        expect(() => voice.setup({}, 0)).toThrow('setup() must be implemented by subclass')
    })

    it('start() throws - must be overridden', () => {
        expect(() => voice.start(0)).toThrow('start() must be implemented by subclass')
    })

    it('stop() sets stopped = true', () => {
        voice.stop(1)
        expect(voice.stopped).toBe(true)
    })

    it('registerNode adds to nodes list and returns the node', () => {
        const node = makeNode()
        const result = voice.registerNode(node)
        expect(voice.nodes).toContain(node)
        expect(result).toBe(node)
    })

    it('cleanup disconnects all registered nodes and clears the list', () => {
        const n1 = makeNode()
        const n2 = makeNode()
        voice.registerNode(n1)
        voice.registerNode(n2)
        voice.cleanup()
        expect(n1.disconnect).toHaveBeenCalled()
        expect(n2.disconnect).toHaveBeenCalled()
        expect(voice.nodes).toEqual([])
    })

    it('cleanup tolerates disconnect errors gracefully', () => {
        const badNode = { disconnect: vi.fn(() => { throw new Error('already disconnected') }) }
        voice.registerNode(badNode)
        expect(() => voice.cleanup()).not.toThrow()
    })

    it('connectToStripInput connects sourceNode to strip.voicesInput', () => {
        const source = makeNode()
        voice.connectToStripInput(source)
        expect(source.connect).toHaveBeenCalledWith(strip.voicesInput)
    })

    it('connectToStripInput does nothing when sourceNode is null', () => {
        expect(() => voice.connectToStripInput(null)).not.toThrow()
    })

    it('connectToStripInput does nothing when strip is null', () => {
        const voiceNoStrip = new BaseVoice(ctx, null)
        const source = makeNode()
        expect(() => voiceNoStrip.connectToStripInput(source)).not.toThrow()
    })
})

// ─── SampleVoice ─────────────────────────────────────────────────────────────

describe('SampleVoice', () => {
    let ctx, strip, buffer, voice

    beforeEach(() => {
        ctx = createMockAudioCtx()
        strip = createMockStrip()
        buffer = ctx.createBuffer(1, 1024, 44100)
        voice = new SampleVoice(ctx, strip, buffer)
    })

    it('constructor initializes correctly', () => {
        expect(voice.buffer).toBe(buffer)
        expect(voice.snd).toBeNull()
        expect(voice.gainEnvelope).toBeNull()
        expect(voice.panNode).toBeNull()
    })

    it('setup creates buffer source, gain and panner nodes', () => {
        const flatNote = makeFlatNote()
        voice.setup(flatNote, 1.0)

        expect(ctx.createBufferSource).toHaveBeenCalled()
        expect(ctx.createGain).toHaveBeenCalled()
        expect(ctx.createStereoPanner).toHaveBeenCalled()
    })

    it('setup registers exactly 3 nodes', () => {
        voice.setup(makeFlatNote(), 1.0)
        expect(voice.nodes.length).toBe(3)
    })

    it('setup sets the buffer on snd', () => {
        voice.setup(makeFlatNote(), 1.0)
        expect(voice.snd.buffer).toBe(buffer)
    })

    it('setup applies pitch via playbackRate.setTargetAtTime', () => {
        voice.setup(makeFlatNote({ fpitch: 1.5 }), 1.0)
        expect(voice.snd.playbackRate.setTargetAtTime).toHaveBeenCalledWith(1.5, 1.0, expect.any(Number))
    })

    it('setup applies pan via pan.setValueAtTime', () => {
        voice.setup(makeFlatNote({ pan: 0.3 }), 1.0)
        expect(voice.panNode.pan.setValueAtTime).toHaveBeenCalledWith(0.3, 1.0)
    })

    it('start calls snd.start and snd.stop', () => {
        voice.setup(makeFlatNote(), 1.0)
        voice.start(1.0)
        expect(voice.snd.start).toHaveBeenCalledWith(1.0)
        expect(voice.snd.stop).toHaveBeenCalled()
    })

    it('stop when already stopped is a no-op', () => {
        voice.setup(makeFlatNote(), 1.0)
        voice.stopped = true
        voice.stop(1.5)
        expect(voice.gainEnvelope.gain.cancelScheduledValues).not.toHaveBeenCalled()
    })

    it('stop cancels gain schedule and ramps down', () => {
        voice.setup(makeFlatNote(), 1.0)
        voice.stop(2.0)
        expect(voice.gainEnvelope.gain.cancelScheduledValues).toHaveBeenCalledWith(2.0)
        expect(voice.gainEnvelope.gain.exponentialRampToValueAtTime).toHaveBeenCalled()
    })

    it('stop also stops the snd source', () => {
        voice.setup(makeFlatNote(), 1.0)
        voice.stop(2.0)
        expect(voice.snd.stop).toHaveBeenCalled()
    })

    it('stop sets stopped = true via BaseVoice', () => {
        voice.setup(makeFlatNote(), 1.0)
        voice.stop(2.0)
        expect(voice.stopped).toBe(true)
    })

    describe('with LFO connections (replace semantics)', () => {
        beforeEach(() => {
            serviceRegistry.transport = { isRunning: true, tick: 0, bpm: 120 }
        })

        it('setup replaces fpitch with the pitchLFO value (in semitones, snapshot at note start)', () => {
            const flatNote = makeFlatNote({ fpitch: 1 })
            flatNote.track.pitchLfo = { freq: 1, min: 0, max: 12, phase: 0.25 }
            voice.setup(flatNote, 1.0, { tick: 0, nbTicks: 128 })
            expect(ctx.createGain.mock.calls.length).toBe(1)
            const expectedRate = Math.pow(2, 6 / 12)
            expect(voice.snd.playbackRate.setTargetAtTime).toHaveBeenCalledWith(
                expect.closeTo(expectedRate, 5),
                1.0,
                expect.any(Number)
            )
        })

        it('setup does not connect panLfo at the voice level (worklet handles it)', () => {
            const flatNote = makeFlatNote()
            flatNote.track.panLfo = { freq: 1, depth: 0.3 }
            voice.setup(flatNote, 1.0)
            expect(strip._lfoGains.panLfo.connect).not.toHaveBeenCalled()
        })

        it('setup does not throw when pitchLfo is set but no LFO infrastructure is available', () => {
            strip._lfoGains.pitchLfo = null
            const flatNote = makeFlatNote()
            flatNote.track.pitchLfo = { freq: 2 }
            expect(() => voice.setup(flatNote, 1.0)).not.toThrow()
        })
    })
})

// ─── WorkletSynthVoice parameter coverage ────────────────────────────────────

describe('WorkletSynthVoice parameter coverage', () => {
    beforeEach(() => {
        postMessageMock.mockClear()
        appState.workletStatus = 'active'
    })

    afterEach(() => {
        appState.workletStatus = 'unknown'
    })

    it('sends all synth fields in the update message with correct values', async () => {
        const ctx = createMockAudioCtx()
        const strip = createMockStrip()
        const gs = makeGeneratedSound({
            masterVolume: 0.6,
            slide: 0,
            vco1: { wave: 'square', gain: 0.7, octave: 1, detune: 20 },
            vco2: { wave: 'triangle', gain: 0.4, octave: -1, detune: -30 },
            vco3: { wave: 'sawtooth', gain: 0.5, octave: 0, detune: 5 },
            filter: { type: 'bandpass', freq: 800, Q: 2.5, filterEnvelopeAmount: 0 },
            noise: { mix: 0.15, filterType: 'highpass', filterFreq: 3000, filterQ: 0.8 },
            enveloppe: { attack: 0.005, decay: 0.08, sustain: 0.4, release: 0.15 },
            lfo: { wave: 'sine', freq: 0, depth: 0, target: 'NOT' },
        })
        const voice = new WorkletSynthVoice(ctx, strip, gs, 'test')
        const flatNote = makeFlatNote({ fpitch: 1.5, pan: -0.3, note: { velocity: 0.7 } })
        flatNote.track.useSoftSynth = true
        await voice.setup(flatNote, 1.0)

        const msg = lastPostByType('update')
        expect(msg).toBeDefined()

        const nr = computeNoteRatio(1.5)
        expect(msg.osc1Freq).toBeCloseTo(computeOscFrequency(nr, 1, 20), 1)
        expect(msg.osc2Freq).toBeCloseTo(computeOscFrequency(nr, -1, -30), 1)
        expect(msg.osc3Freq).toBeCloseTo(computeOscFrequency(nr, 0, 5), 1)
        expect(msg.osc1Gain).toBe(0.7)
        expect(msg.osc2Gain).toBe(0.4)
        expect(msg.osc3Gain).toBe(0.5)
        expect(msg.osc1Detune).toBe(20)
        expect(msg.osc2Detune).toBe(-30)
        expect(msg.osc3Detune).toBe(5)
        expect(msg.osc1Wave).toBe(3)
        expect(msg.osc2Wave).toBe(1)
        expect(msg.osc3Wave).toBe(2)

        expect(msg.noiseMix).toBe(0.15)

        expect(msg.filterType).toBe(2)
        expect(msg.filterFreq).toBe(800)
        expect(msg.filterQ).toBe(2.5)

        expect(msg.attack).toBeGreaterThanOrEqual(0.003)
        expect(msg.decay).toBe(0.08)
        expect(msg.sustain).toBe(0.4)
        expect(msg.release).toBeGreaterThanOrEqual(0.008)

        expect(msg.master).toBe(1.0)
        expect(msg.pan).toBe(-0.3)

        expect(msg.velocity).toBeCloseTo(0.105, 4)
    })

    it('sends minimum attack and release when envelope values are near zero', async () => {
        const ctx = createMockAudioCtx()
        const strip = createMockStrip()
        const gs = makeGeneratedSound({
            enveloppe: { attack: 0.0005, decay: 0.01, sustain: 0.5, release: 0.0005 },
        })
        const voice = new WorkletSynthVoice(ctx, strip, gs, 'test')
        const flatNote = makeFlatNote()
        flatNote.track.useSoftSynth = true
        await voice.setup(flatNote, 1.0)

        const msg = lastPostByType('update')
        expect(msg.attack).toBe(0.003)
        expect(msg.release).toBe(0.008)
    })

    it('includes all parameter keys from the worklet processor descriptor', async () => {
        const ctx = createMockAudioCtx()
        const strip = createMockStrip()
        const gs = makeGeneratedSound()
        const voice = new WorkletSynthVoice(ctx, strip, gs, 'test')
        const flatNote = makeFlatNote()
        flatNote.track.useSoftSynth = true
        await voice.setup(flatNote, 1.0)

        const msg = lastPostByType('update')
        const expectedKeys = [
            'osc1Freq', 'osc2Freq', 'osc3Freq',
            'osc1Gain', 'osc2Gain', 'osc3Gain',
            'osc1Detune', 'osc2Detune', 'osc3Detune',
            'osc1Wave', 'osc2Wave', 'osc3Wave',
            'noiseMix',
            'filterType', 'filterFreq', 'filterQ',
            'attack', 'decay', 'sustain', 'release',
            'master', 'pan', 'velocity',
            'lfo1Target', 'lfo1Wave', 'lfo1Freq', 'lfo1Depth',
            'lfo2Target', 'lfo2Wave', 'lfo2Freq', 'lfo2Depth',
            'slide', 'filterEnvAmt',
        ]
        for (const key of expectedKeys) {
            expect(msg).toHaveProperty(key)
        }
        expect(Object.keys(msg).filter(k => k !== 'type')).toHaveLength(expectedKeys.length)
    })
})

// ─── VoiceFactory ─────────────────────────────────────────────────────────────

describe('VoiceFactory', () => {
    let ctx, mixer, sounds, generatedSounds, factory

    beforeEach(() => {
        ctx = createMockAudioCtx()

        const strip = createMockStrip()
        mixer = {
            getOrCreateStrip: vi.fn(() => strip),
            lfo: createMockLfo(),
        }

        const buffer = ctx.createBuffer(1, 1024, 44100)
        sounds = {
            snd_kick: { buffer },
        }

        generatedSounds = {
            BASS1: makeGeneratedSound(),
        }

        factory = new VoiceFactory(ctx, mixer, sounds, generatedSounds)
    })

    it('returns SampleVoice for a sample track', async () => {
        const flatNote = makeFlatNote()
        const voice = await factory.createVoice(flatNote)
        expect(voice).toBeInstanceOf(SampleVoice)
    })

    it('returns WorkletSynthVoice for a soft synth track', async () => {
        const flatNote = makeFlatNote()
        flatNote.track.useSoftSynth = true
        flatNote.track.synthSoundKey = 'BASS1'
        const voice = await factory.createVoice(flatNote)
        expect(voice).toBeInstanceOf(WorkletSynthVoice)
    })

    it('returns null when mixer returns no strip', async () => {
        mixer.getOrCreateStrip.mockReturnValue(null)
        const voice = await factory.createVoice(makeFlatNote())
        expect(voice).toBeNull()
    })

    it('returns null for SampleVoice when no soundBuffer is found', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const flatNote = makeFlatNote({ soundId: 'missing_sound' })
        flatNote.track.soundId = 'also_missing'
        const voice = await factory.createVoice(flatNote)
        expect(voice).toBeNull()
        warnSpy.mockRestore()
    })

    it('falls back to track.soundId when flatNote.soundId has no buffer', async () => {
        sounds['snd_snare'] = { buffer: ctx.createBuffer(1, 512, 44100) }
        const flatNote = makeFlatNote({ soundId: 'missing_sound' })
        flatNote.track.soundId = 'snd_snare'
        const voice = await factory.createVoice(flatNote)
        expect(voice).toBeInstanceOf(SampleVoice)
    })

    it('returns null for WorkletSynthVoice when generatedSound key is missing', async () => {
        const flatNote = makeFlatNote()
        flatNote.track.useSoftSynth = true
        flatNote.track.synthSoundKey = 'NONEXISTENT_KEY'
        const voice = await factory.createVoice(flatNote)
        expect(voice).toBeNull()
    })

    it('uses synthSoundKey = BASS1 as default when not specified', async () => {
        const flatNote = makeFlatNote()
        flatNote.track.useSoftSynth = true
        const voice = await factory.createVoice(flatNote)
        expect(voice).toBeInstanceOf(WorkletSynthVoice)
    })

    it('calls mixer.getOrCreateStrip with the track name', async () => {
        await factory.createVoice(makeFlatNote())
        expect(mixer.getOrCreateStrip).toHaveBeenCalledWith('KICK')
    })

    it('always creates WorkletSynthVoice for soft synth (worklet-only path)', async () => {
        const flatNote = makeFlatNote()
        flatNote.track.useSoftSynth = true
        flatNote.track.synthSoundKey = 'BASS1'
        const voice = await factory.createVoice(flatNote)
        expect(voice).toBeInstanceOf(WorkletSynthVoice)
    })

    describe('WorkletSynthVoice postMessage protocol', () => {
        it('setup() sends an update with the synth config', async () => {
            const flatNote = makeFlatNote()
            flatNote.track.useSoftSynth = true
            flatNote.track.synthSoundKey = 'BASS1'
            const voice = await factory.createVoice(flatNote)
            await voice.setup(flatNote, 0)
            const updateArg = lastPostByType('update')
            expect(updateArg).toBeDefined()
            expect(updateArg.osc1Wave).toBe(0)
            expect(updateArg.attack).toBe(0.01)
            expect(updateArg.decay).toBe(0.1)
            expect(updateArg.filterType).toBe(0)
        })

        it('start() sends a trigger', async () => {
            const flatNote = makeFlatNote()
            flatNote.track.useSoftSynth = true
            flatNote.track.synthSoundKey = 'BASS1'
            const voice = await factory.createVoice(flatNote)
            await voice.setup(flatNote, 0)
            voice.start(1.5)
            expect(lastPostByType('trigger')).toEqual({ type: 'trigger', startTime: 1.5 })
        })

        it('stop() sends a release', async () => {
            const flatNote = makeFlatNote()
            flatNote.track.useSoftSynth = true
            flatNote.track.synthSoundKey = 'BASS1'
            const voice = await factory.createVoice(flatNote)
            await voice.setup(flatNote, 0)
            voice.start(0)
            voice.stop(2.0)
            expect(lastPostByType('release')).toEqual({ type: 'release', releaseTime: 2.0 })
        })

        it('stop() is idempotent', async () => {
            const flatNote = makeFlatNote()
            flatNote.track.useSoftSynth = true
            flatNote.track.synthSoundKey = 'BASS1'
            const voice = await factory.createVoice(flatNote)
            await voice.setup(flatNote, 0)
            voice.start(0)
            voice.stop(1.0)
            voice.stop(1.0)
            const releases = postMessageMock.mock.calls.filter(c => c[0].type === 'release')
            expect(releases).toHaveLength(1)
        })

        it('maps wave names to int waveform ids', async () => {
            generatedSounds.BASS1.vco1.wave = 'square'
            generatedSounds.BASS1.vco2 = { wave: 'triangle', gain: 0.5, detune: 0, octave: 0 }
            const flatNote = makeFlatNote()
            flatNote.track.useSoftSynth = true
            flatNote.track.synthSoundKey = 'BASS1'
            const voice = await factory.createVoice(flatNote)
            await voice.setup(flatNote, 0)
            const updateArg = lastPostByType('update')
            expect(updateArg.osc1Wave).toBe(3)
            expect(updateArg.osc2Wave).toBe(1)
        })

        it('maps filter type names to int ids', async () => {
            generatedSounds.BASS1.filter.type = 'bandpass'
            const flatNote = makeFlatNote()
            flatNote.track.useSoftSynth = true
            flatNote.track.synthSoundKey = 'BASS1'
            const voice = await factory.createVoice(flatNote)
            await voice.setup(flatNote, 0)
            const updateArg = lastPostByType('update')
            expect(updateArg.filterType).toBe(2)
        })

        it('computes velocity = noteVelo * masterVolume * accentMultiplier', async () => {
            generatedSounds.BASS1.masterVolume = 0.5
            const note = makeFlatNote()
            note.track.useSoftSynth = true
            note.track.synthSoundKey = 'BASS1'
            note.note.velocity = 0.8
            const voice = await factory.createVoice(note)
            await voice.setup(note, 0)
            const updateArg = lastPostByType('update')
            expect(updateArg.velocity).toBeCloseTo(0.1, 5)
        })

        it('enforces minimum attack/release (prevents audio discontinuities)', async () => {
            generatedSounds.BASS1.enveloppe.attack = 0.0001
            generatedSounds.BASS1.enveloppe.release = 0.0001
            const flatNote = makeFlatNote()
            flatNote.track.useSoftSynth = true
            flatNote.track.synthSoundKey = 'BASS1'
            const voice = await factory.createVoice(flatNote)
            await voice.setup(flatNote, 0)
            const updateArg = lastPostByType('update')
            expect(updateArg.attack).toBeGreaterThanOrEqual(0.003)
            expect(updateArg.release).toBeGreaterThanOrEqual(0.008)
        })

        it('cleanup() does NOT throw and disconnects the worklet node via parent', async () => {
            const flatNote = makeFlatNote()
            flatNote.track.useSoftSynth = true
            flatNote.track.synthSoundKey = 'BASS1'
            const voice = await factory.createVoice(flatNote)
            await voice.setup(flatNote, 0)
            const node = voice.workletNode
            expect(() => voice.cleanup()).not.toThrow()
            expect(node.disconnect).toHaveBeenCalled()
            expect(voice.nodes.length).toBe(0)
        })

        it('registers the worklet node in BaseVoice.nodes (parent cleanup handles it)', async () => {
            const flatNote = makeFlatNote()
            flatNote.track.useSoftSynth = true
            flatNote.track.synthSoundKey = 'BASS1'
            const voice = await factory.createVoice(flatNote)
            await voice.setup(flatNote, 0)
            expect(voice.nodes).toContain(voice.workletNode)
        })
    })
})
