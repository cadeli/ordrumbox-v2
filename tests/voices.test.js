import { describe, it, expect, beforeEach, vi } from 'vitest'
import BaseVoice from '../src/audio/voices/base_voice.js'
import SampleVoice from '../src/audio/voices/sample_voice.js'
import SynthVoice from '../src/audio/voices/synth_voice.js'
import VoiceFactory from '../src/audio/voices/voice_factory.js'

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
        filter1: { ...makeNode(), frequency: makeParam(), Q: makeParam() },
        lfos: {
            pitchLfo: { gain: { ...makeNode(), gain: makeParam() } },
            panLfo: { gain: { ...makeNode(), gain: makeParam() } },
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

    it('connectToStripInput connects sourceNode to strip.filter1', () => {
        const source = makeNode()
        voice.connectToStripInput(source)
        expect(source.connect).toHaveBeenCalledWith(strip.filter1)
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

    describe('with LFO connections', () => {
        it('setup connects pitchLfo when track.pitchLfo is set', () => {
            const flatNote = makeFlatNote()
            flatNote.track.pitchLfo = { freq: 2, depth: 0.5 }
            voice.setup(flatNote, 1.0)
            // A centMult gain node should have been created (extra createGain call)
            expect(ctx.createGain.mock.calls.length).toBeGreaterThan(1)
        })

        it('setup connects panLfo when track.panLfo is set', () => {
            const flatNote = makeFlatNote()
            flatNote.track.panLfo = { freq: 1, depth: 0.3 }
            voice.setup(flatNote, 1.0)
            expect(strip.lfos.panLfo.gain.connect).toHaveBeenCalled()
        })

        it('setup does not connect pitchLfo if strip.lfos.pitchLfo is absent', () => {
            strip.lfos.pitchLfo = null
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

    it('setup creates gain, panner, 2 filters, noise nodes', () => {
        voice.setup(makeFlatNote(), 1.0)
        expect(ctx.createGain).toHaveBeenCalled()
        expect(ctx.createStereoPanner).toHaveBeenCalled()
        expect(ctx.createBiquadFilter).toHaveBeenCalled()
        expect(ctx.createBufferSource).toHaveBeenCalled() // noise
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

    it('start also starts the noise node', () => {
        voice.setup(makeFlatNote(), 1.0)
        voice.start(1.0)
        expect(voice.noiseNode.start).toHaveBeenCalledWith(1.0)
        expect(voice.noiseNode.stop).toHaveBeenCalled()
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

    it('stop also stops oscillators and noise node', () => {
        voice.setup(makeFlatNote(), 1.0)
        voice.stop(2.0)
        expect(voice.oscNodes[0].osc.stop).toHaveBeenCalled()
        expect(voice.noiseNode.stop).toHaveBeenCalled()
    })

    // ── computeLfoDepth ──────────────────────────────────────────────

    describe('computeLfoDepth', () => {
        it.each([
            ['filter.freq', 1000],
            ['filter.filterEnvelopeAmount', 1000],
            ['noise.filterFreq', 1000],
        ])('target=%s returns LFO_GAIN_MULTIPLIER * depth', (target) => {
            generatedSound.lfo.depth = 1
            voice = new SynthVoice(ctx, strip, generatedSound, lfo, 'X')
            expect(voice.computeLfoDepth(target)).toBe(1000)
        })

        it.each([['filter.Q', 24], ['noise.filterQ', 24]])(
            'target=%s returns 24 * depth', (target) => {
                generatedSound.lfo.depth = 1
                voice = new SynthVoice(ctx, strip, generatedSound, lfo, 'X')
                expect(voice.computeLfoDepth(target)).toBe(24)
            })

        it.each([['vco1.detune', 100], ['vco2.detune', 100], ['vco3.detune', 100]])(
            'target=%s returns 100 * depth', (target) => {
                generatedSound.lfo.depth = 1
                voice = new SynthVoice(ctx, strip, generatedSound, lfo, 'X')
                expect(voice.computeLfoDepth(target)).toBe(100)
            })

        it.each([['vco1.octave', 1200], ['vco2.octave', 1200], ['vco3.octave', 1200]])(
            'target=%s returns 1200 * depth', (target) => {
                generatedSound.lfo.depth = 1
                voice = new SynthVoice(ctx, strip, generatedSound, lfo, 'X')
                expect(voice.computeLfoDepth(target)).toBe(1200)
            })

        it.each([['masterVolume', 0.5], ['vco1.gain', 0.5], ['noise.mix', 0.5]])(
            'target=%s returns depth directly', (target) => {
                generatedSound.lfo.depth = 0.5
                voice = new SynthVoice(ctx, strip, generatedSound, lfo, 'X')
                expect(voice.computeLfoDepth(target)).toBe(0.5)
            })

        it('unknown target returns 0', () => {
            generatedSound.lfo.depth = 1
            voice = new SynthVoice(ctx, strip, generatedSound, lfo, 'X')
            expect(voice.computeLfoDepth('UNKNOWN_TARGET')).toBe(0)
        })
    })

    // ── connectLfoTarget ─────────────────────────────────────────────

    describe('connectLfoTarget', () => {
        it('returns early when masterLfo is null', () => {
            const v = new SynthVoice(ctx, strip, generatedSound, null, 'X')
            v.setup(makeFlatNote(), 1.0)
            expect(() => v.connectLfoTarget('NOT')).not.toThrow()
        })

        it('returns early for target = NOT', () => {
            voice.setup(makeFlatNote(), 1.0)
            expect(() => voice.connectLfoTarget('NOT')).not.toThrow()
        })

        it('filter.freq target connects lfoGain to both filter frequencies', () => {
            generatedSound.lfo.target = 'filter.freq'
            voice = new SynthVoice(ctx, strip, generatedSound, lfo, 'X')
            voice.setup(makeFlatNote(), 1.0)
            expect(voice.lfoGain.connect).toHaveBeenCalledWith(voice.voiceFilter1.frequency)
            expect(voice.lfoGain.connect).toHaveBeenCalledWith(voice.voiceFilter2.frequency)
        })

        it('masterVolume target connects lfoGain to gainEnv.gain', () => {
            generatedSound.lfo.target = 'masterVolume'
            voice = new SynthVoice(ctx, strip, generatedSound, lfo, 'X')
            voice.setup(makeFlatNote(), 1.0)
            expect(voice.lfoGain.connect).toHaveBeenCalledWith(voice.gainEnv.gain)
        })

        it('noise.mix target connects to noiseGain.gain', () => {
            generatedSound.lfo.target = 'noise.mix'
            voice = new SynthVoice(ctx, strip, generatedSound, lfo, 'X')
            voice.setup(makeFlatNote(), 1.0)
            expect(voice.lfoGain.connect).toHaveBeenCalledWith(voice.noiseGain.gain)
        })

        it('noise.filterFreq target connects to noiseFilter.frequency', () => {
            generatedSound.lfo.target = 'noise.filterFreq'
            voice = new SynthVoice(ctx, strip, generatedSound, lfo, 'X')
            voice.setup(makeFlatNote(), 1.0)
            expect(voice.lfoGain.connect).toHaveBeenCalledWith(voice.noiseFilter.frequency)
        })
    })

    // ── updateGeneratedSound ─────────────────────────────────────────

    describe('updateGeneratedSound', () => {
        it('updates noiseGain when mix changes', () => {
            voice.setup(makeFlatNote(), 1.0)
            const next = makeGeneratedSound({ noise: { mix: 0.4, filterType: 'highpass', filterFreq: 1000, filterQ: 1 } })
            voice.updateGeneratedSound(next, 1.5)
            expect(voice.noiseGain.gain.setTargetAtTime).toHaveBeenCalledWith(0.4, 1.5, expect.any(Number))
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
            const next = makeGeneratedSound({ lfo: { wave: 'triangle', freq: 2, depth: 0.3, target: 'filter.freq' } })
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

    it('returns SampleVoice for a sample track', () => {
        const flatNote = makeFlatNote()
        const voice = factory.createVoice(flatNote)
        expect(voice).toBeInstanceOf(SampleVoice)
    })

    it('returns SynthVoice for a soft synth track', () => {
        const flatNote = makeFlatNote()
        flatNote.track.useSoftSynth = true
        flatNote.track.synthSoundKey = 'BASS1'
        const voice = factory.createVoice(flatNote)
        expect(voice).toBeInstanceOf(SynthVoice)
    })

    it('returns null when mixer returns no strip', () => {
        mixer.getOrCreateStrip.mockReturnValue(null)
        const voice = factory.createVoice(makeFlatNote())
        expect(voice).toBeNull()
    })

    it('returns null for SampleVoice when no soundBuffer is found', () => {
        const flatNote = makeFlatNote({ soundId: 'missing_sound' })
        flatNote.track.soundId = 'also_missing'
        const voice = factory.createVoice(flatNote)
        expect(voice).toBeNull()
    })

    it('falls back to track.soundId when flatNote.soundId has no buffer', () => {
        sounds['snd_snare'] = { buffer: ctx.createBuffer(1, 512, 44100) }
        const flatNote = makeFlatNote({ soundId: 'missing_sound' })
        flatNote.track.soundId = 'snd_snare'
        const voice = factory.createVoice(flatNote)
        expect(voice).toBeInstanceOf(SampleVoice)
    })

    it('returns null for SynthVoice when generatedSound key is missing', () => {
        const flatNote = makeFlatNote()
        flatNote.track.useSoftSynth = true
        flatNote.track.synthSoundKey = 'NONEXISTENT_KEY'
        const voice = factory.createVoice(flatNote)
        expect(voice).toBeNull()
    })

    it('uses synthSoundKey = BASS1 as default when not specified', () => {
        const flatNote = makeFlatNote()
        flatNote.track.useSoftSynth = true
        // no synthSoundKey set → defaults to 'BASS1'
        const voice = factory.createVoice(flatNote)
        expect(voice).toBeInstanceOf(SynthVoice)
    })

    it('calls mixer.getOrCreateStrip with the track name', () => {
        factory.createVoice(makeFlatNote())
        expect(mixer.getOrCreateStrip).toHaveBeenCalledWith('KICK')
    })
})
