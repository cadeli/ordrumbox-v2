import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import BaseVoice from '../src/audio/voices/base_voice.js'
import SampleVoice from '../src/audio/voices/sample_voice.js'
import SynthVoice from '../src/audio/voices/synth_voice.js'
import WorkletSynthVoice from '../src/audio/voices/worklet_synth_voice.js'
import VoiceFactory from '../src/audio/voices/voice_factory.js'
import { appState } from '../src/state/app_state.js'
import { serviceRegistry } from '../src/state/service_registry.js'
import WorkletLoader from '../src/audio/worklets/loader.js'
import { computeOscFrequency, computeNoteRatio } from '../src/audio/math.js'
import { C3_FREQ, LFO_FREQ_OFFSET, MIN_NOTE_RATIO } from '../src/core/constants.js'

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
            // serviceRegistry.transport.tick = 0, freq=1, min=0, max=12, phase=0.25
            // → phase 0.25 maps to p=0 in getLfoWaveformValue, sin(0)=0
            // → (0+1)/2=0.5, 0 + 0.5*12 = 6 semitones
            // → playbackRate = 2^(6/12) = sqrt(2) ≈ 1.4142
            const flatNote = makeFlatNote({ fpitch: 1 })
            flatNote.track.pitchLfo = { freq: 1, min: 0, max: 12, phase: 0.25 }
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
        voice = new SynthVoice(ctx, strip, generatedSound, 'BASS1')
    })

    it('constructor initializes fields correctly', () => {
        expect(voice.generatedSound).toBe(generatedSound)
        expect(voice.soundKey).toBe('BASS1')
        expect(voice.masterLfo).toBeNull()
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
        const v = new SynthVoice(ctx, strip, generatedSound, 'BASS1')
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
        const noisyVoice = new SynthVoice(ctx, strip, noisySound, 'BASS1')
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
        const noisyVoice = new SynthVoice(ctx, strip, noisySound, 'BASS1')
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
            voice = new SynthVoice(ctx, strip, generatedSound, 'X')
            expect(voice.computeLfoDepth(target)).toBe(expected)
        })
    })

    // ── connectLfoTarget ─────────────────────────────────────────────

    describe('connectLfoTarget', () => {
        it('returns early when masterLfo is null', () => {
            const v = new SynthVoice(ctx, strip, generatedSound, 'X')
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
            voice = new SynthVoice(ctx, strip, generatedSound, 'X')
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
            const noisyVoice = new SynthVoice(ctx, strip, noisySound, 'BASS1')
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

// ─── SynthVoice parameter coverage ──────────────────────────────────────────

describe('SynthVoice parameter coverage', () => {
    let ctx, strip

    beforeEach(() => {
        ctx = createMockAudioCtx()
        strip = createMockStrip()
        SynthVoice.lastPitchV1 = undefined
        SynthVoice.lastPitchV2 = undefined
        SynthVoice.lastPitchV3 = undefined
    })

    afterEach(() => {
        appState.workletStatus = 'unknown'
    })

    it('passes VCO wave, gain, octave and detune to oscillator nodes', () => {
        const gs = makeGeneratedSound({
            vco1: { wave: 'square', gain: 0.5, octave: -1, detune: 10 },
            vco2: { wave: 'triangle', gain: 0.3, octave: 2, detune: -50 },
            vco3: { wave: 'sawtooth', gain: 0.7, octave: 0, detune: 0 },
        })
        const voice = new SynthVoice(ctx, strip, gs, 'test')
        voice.setup(makeFlatNote({ fpitch: 1 }), 1.0)

        expect(voice.vcoSlots[0].osc.type).toBe('square')
        expect(voice.vcoSlots[0].gain.gain.value).toBe(0.5)
        expect(voice.vcoSlots[1].osc.type).toBe('triangle')
        expect(voice.vcoSlots[1].gain.gain.value).toBe(0.3)
        expect(voice.vcoSlots[2].osc.type).toBe('sawtooth')
        expect(voice.vcoSlots[2].gain.gain.value).toBe(0.7)
    })

    it('passes filter type, frequency and Q to filter nodes', () => {
        const gs = makeGeneratedSound({
            filter: { type: 'bandpass', freq: 100, Q: 3, filterEnvelopeAmount: 0 },
        })
        const voice = new SynthVoice(ctx, strip, gs, 'test')
        voice.setup(makeFlatNote(), 1.0)

        const filti = vi.mocked(ctx.createBiquadFilter)
        // Two filter nodes are created for the stereo pair
        const f1 = filti.mock.results[0].value
        const f2 = filti.mock.results[1].value
        expect(f1.type).toBe('bandpass')
        expect(f2.type).toBe('bandpass')
    })

    it('uses masterVolume and note velocity in peak gain', () => {
        const gs = makeGeneratedSound({ masterVolume: 0.4, enveloppe: { attack: 0.01, decay: 0.1, sustain: 0.7, release: 0.2 } })
        const voice = new SynthVoice(ctx, strip, gs, 'test')
        // note velocity 0.6 → noteVelo = 0.6 * 0.25 = 0.15 → peakGain = 0.15 * 0.4 * 1.0 = 0.06
        voice.setup(makeFlatNote({ note: { velocity: 0.6 } }), 1.0)

        expect(voice.gainEnv.gain.linearRampToValueAtTime).toHaveBeenCalledWith(
            0.06, expect.any(Number)
        )
    })

    it('creates ADSR gain ramps matching envelope parameters', () => {
        const gs = makeGeneratedSound({
            enveloppe: { attack: 0.02, decay: 0.15, sustain: 0.5, release: 0.1 },
            masterVolume: 0.8,
        })
        const voice = new SynthVoice(ctx, strip, gs, 'test')
        const flatNote = makeFlatNote({ note: { velocity: 1.0 } })
        voice.setup(flatNote, 1.0)

        // noteVelo = 1.0 * 0.25 = 0.25, not accented (0.25 < 0.5)
        // peakGain = 0.25 * 0.8 * 1.0 = 0.2
        // attack ramp: 0 -> 0.2 at time 1.0 + 0.02
        expect(voice.gainEnv.gain.linearRampToValueAtTime).toHaveBeenCalledWith(
            0.2, 1.02
        )
        // decay ramp: 0.2 -> 0.1 at time 1.02 + 0.15 = 1.17
        expect(voice.gainEnv.gain.linearRampToValueAtTime).toHaveBeenCalledWith(
            0.1, 1.17
        )
        // release ramp: 0.1 -> MIN at releaseStart + 0.1
        expect(voice.gainEnv.gain.linearRampToValueAtTime).toHaveBeenCalledWith(
            0.001, voice.releaseStart + 0.1
        )
    })

    it('creates noise subsystem when noise.mix > 0', () => {
        const gs = makeGeneratedSound({
            noise: { mix: 0.3, filterType: 'lowpass', filterFreq: 2000, filterQ: 2 },
        })
        const voice = new SynthVoice(ctx, strip, gs, 'test')
        voice.setup(makeFlatNote(), 1.0)

        expect(voice.noiseNode).toBeDefined()
        expect(voice.noiseGain).toBeDefined()
        expect(voice.noiseFilter).toBeDefined()
        expect(voice.noiseGain.gain.value).toBe(0.3)
        expect(voice.noiseFilter.type).toBe('lowpass')
    })

    it('creates LFO subsystem when lfo.target is set', () => {
        const gs = makeGeneratedSound({
            lfo: { wave: 'triangle', freq: 3, depth: 0.7, target: 'FLT' },
        })
        const voice = new SynthVoice(ctx, strip, gs, 'test')
        voice.setup(makeFlatNote(), 1.0)

        expect(voice.masterLfo).toBeDefined()
        expect(voice.masterLfo.type).toBe('triangle')
        expect(voice.masterLfo.frequency.value).toBe(3 + LFO_FREQ_OFFSET)
        expect(voice.lfoGain.gain.value).toBe(700) // depth(0.7) * FLT multiplier(1000)
    })

    it('connects lfoGain to target AudioParam when LFO target is FLT', () => {
        const gs = makeGeneratedSound({
            lfo: { wave: 'sine', freq: 2, depth: 0.5, target: 'FLT' },
        })
        const voice = new SynthVoice(ctx, strip, gs, 'test')
        voice.setup(makeFlatNote(), 1.0)

        // FLT routes lfoGain to voiceFilter1.frequency and voiceFilter2.frequency
        expect(voice.lfoGain.connect).toHaveBeenCalledWith(voice.voiceFilter1.frequency)
        expect(voice.lfoGain.connect).toHaveBeenCalledWith(voice.voiceFilter2.frequency)
    })

    it('applies glide when slide > 0 and lastPitch is set', () => {
        SynthVoice.lastPitchV1 = 220
        const gs = makeGeneratedSound({
            slide: 80,
            vco1: { wave: 'sine', gain: 1, octave: 0, detune: 0 },
        })
        const voice = new SynthVoice(ctx, strip, gs, 'test')
        voice.setup(makeFlatNote({ fpitch: 2 }), 1.0)

        // Should ramp from lastPitch(220) to computeOscFrequency(noteRatio=2, octave=0, detune=0)
        const expectedTarget = computeOscFrequency(2, 0, 0)
        expect(voice.oscNodes[0].osc.frequency.setValueAtTime).toHaveBeenCalledWith(220, 1.0)
        expect(voice.oscNodes[0].osc.frequency.linearRampToValueAtTime).toHaveBeenCalledWith(
            expectedTarget, 1.08
        )
    })

    it('applies filter envelope ramp when filterEnvelopeAmount > 0', () => {
        const gs = makeGeneratedSound({
            filter: { type: 'lowpass', freq: 50, Q: 1, filterEnvelopeAmount: 0.6 },
            enveloppe: { attack: 0.01, decay: 0.1, sustain: 0.7, release: 0.2 },
        })
        const voice = new SynthVoice(ctx, strip, gs, 'test')
        voice.setup(makeFlatNote({ fpitch: 1 }), 1.0)

        // When filterEnvelopeAmount > 0, filter frequency ramps
        expect(voice.voiceFilter1.frequency.linearRampToValueAtTime).toHaveBeenCalled()
        expect(voice.voiceFilter2.frequency.linearRampToValueAtTime).toHaveBeenCalled()
    })
})

describe('WorkletSynthVoice parameter coverage', () => {
    beforeEach(() => {
        postMessageMock.mockClear()
        appState.workletStatus = 'active'
    })

    afterEach(() => {
        appState.workletStatus = 'unknown'
    })

    it('sends all 23 synth fields in the update message with correct values', async () => {
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
        expect(msg.osc1Wave).toBe(3)  // square
        expect(msg.osc2Wave).toBe(1)  // triangle
        expect(msg.osc3Wave).toBe(2)  // sawtooth

        // Noise
        expect(msg.noiseMix).toBe(0.15)

        // Filter
        expect(msg.filterType).toBe(2) // bandpass
        expect(msg.filterFreq).toBe(800)
        expect(msg.filterQ).toBe(2.5)

        // Envelope
        expect(msg.attack).toBeGreaterThanOrEqual(0.003)
        expect(msg.decay).toBe(0.08)
        expect(msg.sustain).toBe(0.4)
        expect(msg.release).toBeGreaterThanOrEqual(0.008)

        // Master and pan
        expect(msg.master).toBe(1.0)
        expect(msg.pan).toBe(-0.3)

        // Velocity: noteVelo=0.7*0.25=0.175, masterVolume=0.6, accentMult=1 (0.175<0.5)
        // peak = 0.175 * 0.6 * 1.0 = 0.105
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
        expect(msg.attack).toBe(0.003) // clamped to MIN_ATTACK
        expect(msg.release).toBe(0.008) // clamped to MIN_RELEASE
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
            await voice.setup(makeSoftSynthFlatNote(), 0)
            const updateArg = lastPostByType('update')
            expect(updateArg).toBeDefined()
            expect(updateArg.osc1Wave).toBe(0)  // sine
            expect(updateArg.attack).toBe(0.01)
            expect(updateArg.decay).toBe(0.1)
            expect(updateArg.filterType).toBe(0)  // lowpass
        })

        it('start() sends a trigger', async () => {
            const voice = await factory.createVoice(makeSoftSynthFlatNote())
            await voice.setup(makeSoftSynthFlatNote(), 0)
            voice.start(1.5)
            expect(lastPostByType('trigger')).toEqual({ type: 'trigger', startTime: 1.5 })
        })

        it('stop() sends a release', async () => {
            const voice = await factory.createVoice(makeSoftSynthFlatNote())
            await voice.setup(makeSoftSynthFlatNote(), 0)
            voice.start(0)
            voice.stop(2.0)
            expect(lastPostByType('release')).toEqual({ type: 'release', releaseTime: 2.0 })
        })

        it('stop() is idempotent', async () => {
            const voice = await factory.createVoice(makeSoftSynthFlatNote())
            await voice.setup(makeSoftSynthFlatNote(), 0)
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
            await voice.setup(makeSoftSynthFlatNote(), 0)
            const updateArg = lastPostByType('update')
            expect(updateArg.osc1Wave).toBe(3)   // square
            expect(updateArg.osc2Wave).toBe(1)   // triangle
        })

        it('maps filter type names to int ids', async () => {
            generatedSounds.BASS1.filter.type = 'bandpass'
            const voice = await factory.createVoice(makeSoftSynthFlatNote())
            await voice.setup(makeSoftSynthFlatNote(), 0)
            const updateArg = lastPostByType('update')
            expect(updateArg.filterType).toBe(2)  // bandpass
        })

        it('computes velocity = noteVelo * masterVolume * accentMultiplier', async () => {
            generatedSounds.BASS1.masterVolume = 0.5
            const note = makeSoftSynthFlatNote()
            note.note.velocity = 0.8
            const voice = await factory.createVoice(note)
            await voice.setup(note, 0)
            const updateArg = lastPostByType('update')
            // noteVelo = 0.8 * 0.25 = 0.2; masterVolume = 0.5; velocity > 0.5 not accented (0.2)
            // expected: 0.2 * 0.5 * 1.0 = 0.1
            expect(updateArg.velocity).toBeCloseTo(0.1, 5)
        })

        it('enforces minimum attack/release (prevents audio discontinuities)', async () => {
            generatedSounds.BASS1.enveloppe.attack = 0.0001
            generatedSounds.BASS1.enveloppe.release = 0.0001
            const voice = await factory.createVoice(makeSoftSynthFlatNote())
            await voice.setup(makeSoftSynthFlatNote(), 0)
            const updateArg = lastPostByType('update')
            expect(updateArg.attack).toBeGreaterThanOrEqual(0.003)
            expect(updateArg.release).toBeGreaterThanOrEqual(0.008)
        })

        it('cleanup() does NOT throw and disconnects the worklet node via parent', async () => {
            const voice = await factory.createVoice(makeSoftSynthFlatNote())
            await voice.setup(makeSoftSynthFlatNote(), 0)
            const node = voice.workletNode
            expect(() => voice.cleanup()).not.toThrow()
            // The parent BaseVoice.cleanup() iterates this.nodes and calls disconnect()
            expect(node.disconnect).toHaveBeenCalled()
            expect(voice.nodes.length).toBe(0)  // parent clears the array
        })

        it('registers the worklet node in BaseVoice.nodes (parent cleanup handles it)', async () => {
            const voice = await factory.createVoice(makeSoftSynthFlatNote())
            await voice.setup(makeSoftSynthFlatNote(), 0)
            expect(voice.nodes).toContain(voice.workletNode)
        })
    })
})
