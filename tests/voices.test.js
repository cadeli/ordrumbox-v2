import { describe, it, expect, beforeEach, vi } from 'vitest'
import BaseVoice from '../src/audio/voices/base_voice.js'
import SampleVoice from '../src/audio/voices/sample_voice.js'
import SynthVoice from '../src/audio/voices/synth_voice.js'
import WorkletSynthVoice from '../src/audio/voices/worklet_synth_voice.js'
import VoiceFactory from '../src/audio/voices/voice_factory.js'
import { appState } from '../src/state/app_state.js'
import { serviceRegistry } from '../src/state/service_registry.js'
import WorkletLoader from '../src/audio/worklets/loader.js'

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

// ─── Mock helpers ────────────────────────────────────────────────────────────

function makeParam(initial = 0) {
    return {
        value: initial,
        setValueAtTime: vi.fn(),
        setTargetAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
        cancelScheduledValues: vi.fn(),
        connect: vi.fn(),
    }
}

function makeNode(extra = {}) {
    return {
        connect: vi.fn(),
        disconnect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        onended: null,
        ...extra,
    }
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
        // Worklet-based strip exposes voicesInput as the entry point and uses
        // _lfoGains (native gain nodes driven by worklet LFO nodes) for
        // per-track modulation sources.
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

// Minimal FlatNote for SampleVoice
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

// Minimal generatedSound for SynthVoice
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
        SynthVoice.lastPitchV1 = undefined
        SynthVoice.lastPitchV2 = undefined
        SynthVoice.lastPitchV3 = undefined
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
        // gainEnvelope.gain.cancelScheduledValues should NOT be called
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
            // serviceRegistry.transport.tick = 0, nbBars default 4, freq=1, min=0, max=12
            // → phase=0, sin(0)=0, (0+1)/2=0.5, 0 + 0.5*12 = 6 semitones
            // → playbackRate = 2^(6/12) = sqrt(2) ≈ 1.4142
            const flatNote = makeFlatNote({ fpitch: 1 })
            flatNote.track.pitchLfo = { freq: 1, min: 0, max: 12, phase: 0 }
            voice.setup(flatNote, 1.0)
            // No extra centMult gain should be created (no more LFO → centMult → detune)
            expect(ctx.createGain.mock.calls.length).toBe(1) // just the gainEnvelope
            // playbackRate should be 2^(6/12) ≈ 1.4142
            const expectedRate = Math.pow(2, 6 / 12)
            expect(voice.snd.playbackRate.setTargetAtTime).toHaveBeenCalledWith(
                expect.closeTo(expectedRate, 5),
                1.0,
                expect.any(Number)
            )
        })

        it('setup does not connect panLfo at the voice level (worklet handles it)', () => {
            // Pan LFO is applied at the strip level (worklet replace semantics),
            // not via _lfoGains.panLfo.connect() in the voice.
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

// ─── SynthVoice ──────────────────────────────────────────────────────────────

describe('SynthVoice', () => {
    let ctx, strip, lfo, generatedSound, voice

    beforeEach(() => {
        ctx = createMockAudioCtx()
        strip = createMockStrip()
        lfo = createMockLfo()
        generatedSound = makeGeneratedSound()
        SynthVoice.lastPitchV1 = undefined
        SynthVoice.lastPitchV2 = undefined
        SynthVoice.lastPitchV3 = undefined
        voice = new SynthVoice(ctx, strip, generatedSound, lfo, 'BASS1')
    })

    it('constructor initializes fields correctly', () => {
        expect(voice.generatedSound).toBe(generatedSound)
        expect(voice.soundKey).toBe('BASS1')
        expect(voice.masterLfo).toBe(lfo)
        expect(voice.oscNodes).toEqual([])
    })

    it('setup creates oscillator nodes for each active VCO', () => {
        const flatNote = makeFlatNote({ fpitch: 1 })
        voice.setup(flatNote, 1.0)
        // vco1 active, vco2/vco3 null → 1 osc
        expect(voice.oscNodes.length).toBe(1)
    })

    it('setup with 3 VCOs creates 3 oscillators', () => {
        generatedSound.vco2 = { wave: 'square', octave: 1, detune: 5, gain: 0.5 }
        generatedSound.vco3 = { wave: 'sawtooth', octave: -1, detune: -5, gain: 0.3 }
        const v = new SynthVoice(ctx, strip, generatedSound, lfo, 'BASS1')
        v.setup(makeFlatNote(), 1.0)
        expect(v.oscNodes.length).toBe(3)
    })

    it('setup creates gain, panner, 2 filters nodes', () => {
        voice.setup(makeFlatNote(), 1.0)
        expect(ctx.createGain).toHaveBeenCalled()
        expect(ctx.createStereoPanner).toHaveBeenCalled()
        expect(ctx.createBiquadFilter).toHaveBeenCalled()
        // noise buffer is only created when noiseMix > 0
        expect(voice.noiseNode).toBeNull()
    })

    it('setup stores lastPitchV1 as static for glide', () => {
        voice.setup(makeFlatNote({ fpitch: 1 }), 1.0)
        expect(SynthVoice.lastPitchV1).toBeDefined()
        expect(typeof SynthVoice.lastPitchV1).toBe('number')
    })

    it('setup applies glide when slideTime > 0 and lastPitch is set', () => {
        SynthVoice.lastPitchV1 = 220
        generatedSound.slide = 50 // 50ms
        voice.setup(makeFlatNote({ fpitch: 1.5 }), 1.0)
        // The osc frequency should be ramped, setValueAtTime called with lastPitch
        const oscSetCalls = voice.oscNodes[0].osc.frequency.setValueAtTime.mock.calls
        expect(oscSetCalls.some(([val]) => val === 220)).toBe(true)
    })

    it('start calls osc.start and osc.stop', () => {
        voice.setup(makeFlatNote(), 1.0)
        voice.start(1.0)
        expect(voice.oscNodes[0].osc.start).toHaveBeenCalledWith(1.0)
        expect(voice.oscNodes[0].osc.stop).toHaveBeenCalled()
    })

    it('start also starts the noise node when noiseMix > 0', () => {
        const noisySound = makeGeneratedSound({ noise: { mix: 0.3, filterType: 'highpass', filterFreq: 1000, filterQ: 1 } })
        const noisyVoice = new SynthVoice(ctx, strip, noisySound, lfo, 'BASS1')
        noisyVoice.setup(makeFlatNote(), 1.0)
        noisyVoice.start(1.0)
        expect(noisyVoice.noiseNode.start).toHaveBeenCalledWith(1.0)
        expect(noisyVoice.noiseNode.stop).toHaveBeenCalled()
    })

    it('stop when already stopped is a no-op', () => {
        voice.setup(makeFlatNote(), 1.0)
        voice.stopped = true
        voice.stop(2.0)
        expect(voice.gainEnv.gain.cancelScheduledValues).not.toHaveBeenCalled()
    })

    it('stop cancels gain schedule and ramps to zero', () => {
        voice.setup(makeFlatNote(), 1.0)
        voice.stop(2.0)
        expect(voice.gainEnv.gain.cancelScheduledValues).toHaveBeenCalledWith(2.0)
        expect(voice.gainEnv.gain.exponentialRampToValueAtTime).toHaveBeenCalled()
    })

    it('stop also stops oscillators (and noise node when present)', () => {
        const noisySound = makeGeneratedSound({ noise: { mix: 0.3, filterType: 'highpass', filterFreq: 1000, filterQ: 1 } })
        const noisyVoice = new SynthVoice(ctx, strip, noisySound, lfo, 'BASS1')
        noisyVoice.setup(makeFlatNote(), 1.0)
        noisyVoice.stop(2.0)
        expect(noisyVoice.oscNodes[0].osc.stop).toHaveBeenCalled()
        expect(noisyVoice.noiseNode.stop).toHaveBeenCalled()
    })

    // ── computeLfoDepth ──────────────────────────────────────────────

    describe('computeLfoDepth', () => {
        it.each([
            // multiplier class 1000 (filter cutoff envelope / freq)
            ['FLT', 1, 1000],
            ['VCO1', 1, 1000],
            ['filter.freq', 1, 1000],
            ['filter.filterEnvelopeAmount', 1, 1000],
            ['noise.filterFreq', 1, 1000],
            // multiplier class 24 (Q)
            ['filter.Q', 1, 24],
            ['noise.filterQ', 1, 24],
            // multiplier class 100 (detune cents)
            ['vco1.detune', 1, 100],
            ['vco2.detune', 1, 100],
            ['vco3.detune', 1, 100],
            // multiplier class 1200 (octave semitones)
            ['vco1.octave', 1, 1200],
            ['vco2.octave', 1, 1200],
            ['vco3.octave', 1, 1200],
            // pass-through (depth * 1)
            ['masterVolume', 0.5, 0.5],
            ['vco1.gain', 0.5, 0.5],
            ['noise.mix', 0.5, 0.5],
            // unknown target → 0
            ['UNKNOWN_TARGET', 1, 0],
        ])('target=%s depth=%s returns %s', (target, depth, expected) => {
            generatedSound.lfo.depth = depth
            voice = new SynthVoice(ctx, strip, generatedSound, lfo, 'X')
            expect(voice.computeLfoDepth(target)).toBe(expected)
        })
    })

    // ── connectLfoTarget ─────────────────────────────────────────────

    describe('connectLfoTarget', () => {
        it('returns early when masterLfo is null', () => {
            const v = new SynthVoice(ctx, strip, generatedSound, null, 'X')
            v.setup(makeFlatNote(), 1.0)
            expect(() => v.connectLfoTarget('FLT')).not.toThrow()
        })

        it('returns early for target = NOT', () => {
            voice.setup(makeFlatNote(), 1.0)
            expect(() => voice.connectLfoTarget('NOT')).not.toThrow()
        })

        it.each([
            // [target, audioParam-selector on the voice]
            ['FLT', (v) => v.voiceFilter1.frequency,          (v) => v.voiceFilter2.frequency],
            ['masterVolume', (v) => v.gainEnv.gain,            null],
            ['noise.mix', (v) => v.noiseGain.gain,             null],
            ['noise.filterFreq', (v) => v.noiseFilter.frequency, null],
        ])('target=%s routes lfoGain to the expected AudioParam', (target, primary, secondary) => {
            generatedSound.lfo.target = target
            voice = new SynthVoice(ctx, strip, generatedSound, lfo, 'X')
            voice.setup(makeFlatNote(), 1.0)
            expect(voice.lfoGain.connect).toHaveBeenCalledWith(primary(voice))
            if (secondary) {
                expect(voice.lfoGain.connect).toHaveBeenCalledWith(secondary(voice))
            }
        })
    })

    // ── updateGeneratedSound ─────────────────────────────────────────

    describe('updateGeneratedSound', () => {
        it('updates noiseGain when mix changes (noise must be active at setup)', () => {
            const noisySound = makeGeneratedSound({ noise: { mix: 0.2, filterType: 'highpass', filterFreq: 1000, filterQ: 1 } })
            const noisyVoice = new SynthVoice(ctx, strip, noisySound, lfo, 'BASS1')
            noisyVoice.setup(makeFlatNote(), 1.0)
            const next = makeGeneratedSound({ noise: { mix: 0.4, filterType: 'highpass', filterFreq: 1000, filterQ: 1 } })
            noisyVoice.updateGeneratedSound(next, 1.5)
            expect(noisyVoice.noiseGain.gain.setTargetAtTime).toHaveBeenCalledWith(0.4, 1.5, expect.any(Number))
        })

        it('updates filter type and frequency', () => {
            voice.setup(makeFlatNote(), 1.0)
            const next = makeGeneratedSound({ filter: { type: 'highpass', freq: 80, Q: 2, filterEnvelopeAmount: 0 } })
            voice.updateGeneratedSound(next, 1.5)
            expect(voice.voiceFilter1.type).toBe('highpass')
            expect(voice.voiceFilter1.frequency.setTargetAtTime).toHaveBeenCalled()
        })

        it('updates masterVolume when it changes', () => {
            voice.setup(makeFlatNote(), 1.0)
            const next = makeGeneratedSound({ masterVolume: 0.4 })
            voice.updateGeneratedSound(next, 1.5)
            expect(voice.gainEnv.gain.setTargetAtTime).toHaveBeenCalled()
        })

        it('updates osc wave type', () => {
            voice.setup(makeFlatNote(), 1.0)
            const next = makeGeneratedSound({ vco1: { wave: 'square', octave: 0, detune: 0, gain: 1 } })
            voice.updateGeneratedSound(next, 1.5)
            expect(voice.oscNodes[0].osc.type).toBe('square')
        })

        it('handles lfoTarget change and reconnects', () => {
            generatedSound.lfo.target = 'NOT'
            voice.setup(makeFlatNote(), 1.0)
            const next = makeGeneratedSound({ lfo: { wave: 'triangle', freq: 2, depth: 0.3, target: 'FLT' } })
            expect(() => voice.updateGeneratedSound(next, 1.5)).not.toThrow()
        })
    })
})

// ─── VoiceFactory ─────────────────────────────────────────────────────────────

describe('VoiceFactory', () => {
    let ctx, mixer, sounds, generatedSounds, factory

    beforeEach(() => {
        ctx = createMockAudioCtx()
        SynthVoice.lastPitchV1 = undefined
        SynthVoice.lastPitchV2 = undefined
        SynthVoice.lastPitchV3 = undefined

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

    it('returns SynthVoice for a soft synth track', async () => {
        const flatNote = makeFlatNote()
        flatNote.track.useSoftSynth = true
        flatNote.track.synthSoundKey = 'BASS1'
        const voice = await factory.createVoice(flatNote)
        expect(voice).toBeInstanceOf(SynthVoice)
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

    it('returns null for SynthVoice when generatedSound key is missing', async () => {
        const flatNote = makeFlatNote()
        flatNote.track.useSoftSynth = true
        flatNote.track.synthSoundKey = 'NONEXISTENT_KEY'
        const voice = await factory.createVoice(flatNote)
        expect(voice).toBeNull()
    })

    it('uses synthSoundKey = BASS1 as default when not specified', async () => {
        const flatNote = makeFlatNote()
        flatNote.track.useSoftSynth = true
        // no synthSoundKey set → defaults to 'BASS1'
        const voice = await factory.createVoice(flatNote)
        expect(voice).toBeInstanceOf(SynthVoice)
    })

    it('calls mixer.getOrCreateStrip with the track name', async () => {
        await factory.createVoice(makeFlatNote())
        expect(mixer.getOrCreateStrip).toHaveBeenCalledWith('KICK')
    })

    // ─── Worklet drop-in ────────────────────────────────────────────────────

    function makeSoftSynthFlatNote() {
        const flatNote = makeFlatNote()
        flatNote.track.useSoftSynth = true
        flatNote.track.synthSoundKey = 'BASS1'
        return flatNote
    }

    it('uses native SynthVoice when workletStatus is unknown', async () => {
        appState.workletStatus = 'unknown'
        const voice = await factory.createVoice(makeSoftSynthFlatNote())
        expect(voice).toBeInstanceOf(SynthVoice)
        expect(voice).not.toBeInstanceOf(WorkletSynthVoice)
    })

    it('uses WorkletSynthVoice when workletStatus is active and config is simple', async () => {
        appState.workletStatus = 'active'
        const voice = await factory.createVoice(makeSoftSynthFlatNote())
        expect(voice).toBeInstanceOf(WorkletSynthVoice)
    })

    it('falls back to native SynthVoice when LFO target is set', async () => {
        appState.workletStatus = 'active'
        generatedSounds.BASS1.lfo.target = 'VCO1'
        const voice = await factory.createVoice(makeSoftSynthFlatNote())
        expect(voice).toBeInstanceOf(SynthVoice)
    })

    it('falls back to native SynthVoice when LFO target is FLT', async () => {
        appState.workletStatus = 'active'
        generatedSounds.BASS1.lfo.target = 'FLT'
        const voice = await factory.createVoice(makeSoftSynthFlatNote())
        expect(voice).toBeInstanceOf(SynthVoice)
    })

    it('falls back to native SynthVoice when slide > 0 (no glide support in worklet)', async () => {
        appState.workletStatus = 'active'
        generatedSounds.BASS1.slide = 50
        const voice = await factory.createVoice(makeSoftSynthFlatNote())
        expect(voice).toBeInstanceOf(SynthVoice)
    })

    it('falls back to native SynthVoice when filter envelope amount > 0', async () => {
        appState.workletStatus = 'active'
        generatedSounds.BASS1.filter.filterEnvelopeAmount = 0.5
        const voice = await factory.createVoice(makeSoftSynthFlatNote())
        expect(voice).toBeInstanceOf(SynthVoice)
    })

    it('uses native SynthVoice when workletStatus is unavailable', async () => {
        appState.workletStatus = 'unavailable'
        const voice = await factory.createVoice(makeSoftSynthFlatNote())
        expect(voice).toBeInstanceOf(SynthVoice)
    })

    describe('WorkletSynthVoice postMessage protocol', () => {
        beforeEach(() => {
            appState.workletStatus = 'active'
        })

        it('setup() sends an update with the synth config', async () => {
            const voice = await factory.createVoice(makeSoftSynthFlatNote())
            voice.setup(makeSoftSynthFlatNote(), 0)
            const updateArg = lastPostByType('update')
            expect(updateArg).toBeDefined()
            expect(updateArg.osc1Wave).toBe(0)  // sine
            expect(updateArg.attack).toBe(0.01)
            expect(updateArg.decay).toBe(0.1)
            expect(updateArg.filterType).toBe(0)  // lowpass
        })

        it('start() sends a trigger', async () => {
            const voice = await factory.createVoice(makeSoftSynthFlatNote())
            voice.setup(makeSoftSynthFlatNote(), 0)
            voice.start(1.5)
            expect(lastPostByType('trigger')).toEqual({ type: 'trigger', startTime: 1.5 })
        })

        it('stop() sends a release', async () => {
            const voice = await factory.createVoice(makeSoftSynthFlatNote())
            voice.setup(makeSoftSynthFlatNote(), 0)
            voice.start(0)
            voice.stop(2.0)
            expect(lastPostByType('release')).toEqual({ type: 'release', releaseTime: 2.0 })
        })

        it('stop() is idempotent', async () => {
            const voice = await factory.createVoice(makeSoftSynthFlatNote())
            voice.setup(makeSoftSynthFlatNote(), 0)
            voice.start(0)
            voice.stop(1.0)
            voice.stop(1.0)
            const releases = postMessageMock.mock.calls.filter(c => c[0].type === 'release')
            expect(releases).toHaveLength(1)
        })

        it('maps wave names to int waveform ids', async () => {
            generatedSounds.BASS1.vco1.wave = 'square'
            generatedSounds.BASS1.vco2 = { wave: 'triangle', gain: 0.5, detune: 0, octave: 0 }
            const voice = await factory.createVoice(makeSoftSynthFlatNote())
            voice.setup(makeSoftSynthFlatNote(), 0)
            const updateArg = lastPostByType('update')
            expect(updateArg.osc1Wave).toBe(3)   // square
            expect(updateArg.osc2Wave).toBe(1)   // triangle
        })

        it('maps filter type names to int ids', async () => {
            generatedSounds.BASS1.filter.type = 'bandpass'
            const voice = await factory.createVoice(makeSoftSynthFlatNote())
            voice.setup(makeSoftSynthFlatNote(), 0)
            const updateArg = lastPostByType('update')
            expect(updateArg.filterType).toBe(2)  // bandpass
        })

        it('computes velocity = noteVelo * masterVolume * accentMultiplier', async () => {
            generatedSounds.BASS1.masterVolume = 0.5
            const note = makeSoftSynthFlatNote()
            note.note.velocity = 0.8
            const voice = await factory.createVoice(note)
            voice.setup(note, 0)
            const updateArg = lastPostByType('update')
            // noteVelo = 0.8 * 0.25 = 0.2; masterVolume = 0.5; velocity > 0.5 not accented (0.2)
            // expected: 0.2 * 0.5 * 1.0 = 0.1
            expect(updateArg.velocity).toBeCloseTo(0.1, 5)
        })

        it('enforces minimum attack/release (prevents audio discontinuities)', async () => {
            generatedSounds.BASS1.enveloppe.attack = 0.0001
            generatedSounds.BASS1.enveloppe.release = 0.0001
            const voice = await factory.createVoice(makeSoftSynthFlatNote())
            voice.setup(makeSoftSynthFlatNote(), 0)
            const updateArg = lastPostByType('update')
            expect(updateArg.attack).toBeGreaterThanOrEqual(0.003)
            expect(updateArg.release).toBeGreaterThanOrEqual(0.008)
        })

        it('cleanup() does NOT throw and disconnects the worklet node via parent', async () => {
            const voice = await factory.createVoice(makeSoftSynthFlatNote())
            voice.setup(makeSoftSynthFlatNote(), 0)
            const node = voice.workletNode
            expect(() => voice.cleanup()).not.toThrow()
            // The parent BaseVoice.cleanup() iterates this.nodes and calls disconnect()
            expect(node.disconnect).toHaveBeenCalled()
            expect(voice.nodes.length).toBe(0)  // parent clears the array
        })

        it('registers the worklet node in BaseVoice.nodes (parent cleanup handles it)', async () => {
            const voice = await factory.createVoice(makeSoftSynthFlatNote())
            voice.setup(makeSoftSynthFlatNote(), 0)
            expect(voice.nodes).toContain(voice.workletNode)
        })
    })
})
