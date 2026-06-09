import { describe, it, expect, beforeEach, vi } from 'vitest'
import MfSound from '../src/audio/sound.js'

// ─── Mock helpers ─────────────────────────────────────────────────────────────

function makeParam(v = 0) {
    return {
        value: v,
        setValueAtTime: vi.fn(),
        setTargetAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        cancelScheduledValues: vi.fn(),
        connect: vi.fn(),
    }
}

function makeNode(extra = {}) {
    return { connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null, ...extra }
}

function makeAudioCtx() {
    const sampleRate = 44100
    return {
        currentTime: 1.0,
        sampleRate,
        createGain: vi.fn(() => ({ ...makeNode(), gain: makeParam(1) })),
        createBiquadFilter: vi.fn(() => ({ ...makeNode(), type: 'lowpass', frequency: makeParam(350), Q: makeParam(1) })),
        createStereoPanner: vi.fn(() => ({ ...makeNode(), pan: makeParam(0) })),
        createOscillator: vi.fn(() => ({ ...makeNode(), type: 'sine', frequency: makeParam(440), detune: makeParam(0) })),
        createBufferSource: vi.fn(() => ({ ...makeNode(), buffer: null, loop: false, playbackRate: makeParam(1), detune: makeParam(0) })),
        createBuffer: vi.fn((ch, len, sr) => ({ numberOfChannels: ch, length: len, sampleRate: sr, getChannelData: vi.fn(() => new Float32Array(len)) })),
        createWaveShaper: vi.fn(() => ({ ...makeNode(), curve: null, oversample: '4x' })),
        createConvolver: vi.fn(() => ({ ...makeNode(), buffer: null })),
        createDelay: vi.fn(() => ({ ...makeNode(), delayTime: makeParam(0.25) })),
    }
}

function makeStrip() {
    return {
        filter1: { ...makeNode(), frequency: makeParam(), Q: makeParam(), type: 'allpass' },
        filter2: { ...makeNode(), frequency: makeParam(), Q: makeParam(), type: 'allpass' },
        output: { ...makeNode(), gain: makeParam(1) },
        pan: { ...makeNode(), pan: makeParam(0) },
        lfos: {
            pitchLfo: { osc: { frequency: makeParam(), type: 'sine', ...makeNode() }, gain: { ...makeNode(), gain: makeParam(0) } },
            velocityLfo: { osc: { frequency: makeParam(), ...makeNode() }, gain: { ...makeNode(), gain: makeParam(0) } },
            panLfo: { osc: { frequency: makeParam(), ...makeNode() }, gain: { ...makeNode(), gain: makeParam(0) } },
            filterFreqLfo: { osc: { frequency: makeParam(), ...makeNode() }, gain: { ...makeNode(), gain: makeParam(0) } },
            filterQLfo: { osc: { frequency: makeParam(), ...makeNode() }, gain: { ...makeNode(), gain: makeParam(0) } },
        },
        updateFilter: vi.fn(),
        updateSaturation: vi.fn(),
        updateReverb: vi.fn(),
        updateDelay: vi.fn(),
        updateLfo: vi.fn(),
    }
}

function makeMixer(strip = null) {
    const s = strip ?? makeStrip()
    return {
        analyser: {},
        getOrCreateStrip: vi.fn(() => s),
        lfo: { type: 'sine', frequency: makeParam(0), connect: vi.fn() },
        _strip: s,
    }
}

function makeVoice() {
    return {
        setup: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        updateGeneratedSound: vi.fn(),
        onEnded: null,
        stopped: false,
        soundKey: 'BASS1',
    }
}

function makeVoiceFactory(voice = null) {
    const v = voice ?? makeVoice()
    return {
        createVoice: vi.fn(() => v),
        generatedSounds: {},
        _voice: v,
    }
}

function makeFlatNote(overrides = {}) {
    return {
        track: {
            name: 'KICK',
            useSoftSynth: false,
            mono: false,
            velocity: 0.8,
            pan: 0,
            bars: 4,
            barQuantize: 4,
        },
        note: { velocity: 0.8, pitch: 0 },
        pan: 0,
        fpitch: 1,
        ...overrides,
    }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('MfSound', () => {
    let ctx, mixer, sounds, generatedSounds, sound

    beforeEach(() => {
        ctx    = makeAudioCtx()
        mixer  = makeMixer()
        sounds = { snd_kick: { buffer: ctx.createBuffer(1, 1024, 44100) } }
        generatedSounds = { BASS1: { vco1: { wave: 'sine', octave: 0, detune: 0, gain: 1 }, masterVolume: 0.8, slide: 0 } }
        sound  = new MfSound(ctx, mixer, sounds, generatedSounds)
        sound.voiceFactory = makeVoiceFactory()
    })

    // ── constructor ───────────────────────────────────────────────────

    it('initialises with empty activeVoices WeakMap and activeSynthVoices Set', () => {
        expect(sound.activeSynthVoices).toBeInstanceOf(Set)
        expect(sound.activeSynthVoices.size).toBe(0)
    })

    // ── getStrip ──────────────────────────────────────────────────────

    it('getStrip returns null when track has no name', async () => {
        expect(await sound.getStrip({ name: '' })).toBeNull()
    })
    it('getStrip returns null when track is null', async () => {
        expect(await sound.getStrip(null)).toBeNull()
    })
    it('getStrip calls mixer.getOrCreateStrip with track name', async () => {
        await sound.getStrip({ name: 'KICK' })
        expect(mixer.getOrCreateStrip).toHaveBeenCalledWith('KICK')
    })

    // ── registerVoice / stopPreviousVoice ─────────────────────────────

    it('registerVoice stores voice for mono track', () => {
        const track = { name: 'KICK', mono: true }
        const voice = makeVoice()
        sound.registerVoice(track, voice)
        // voice stored in WeakMap — verify via stopPreviousVoice
        sound.stopPreviousVoice(track, 1.0)
        expect(voice.stop).toHaveBeenCalledWith(1.0)
    })
    // ── registerSynthVoice ────────────────────────────────────────────

    it('registerSynthVoice adds voice to activeSynthVoices', () => {
        const voice = makeVoice()
        sound.registerSynthVoice(voice)
        expect(sound.activeSynthVoices.has(voice)).toBe(true)
    })
    it('onEnded removes voice from activeSynthVoices', () => {
        const voice = makeVoice()
        sound.registerSynthVoice(voice)
        voice.onEnded()
        expect(sound.activeSynthVoices.has(voice)).toBe(false)
    })
    // ── stopVoice ─────────────────────────────────────────────────────

    it('stopVoice calls voice.stop(time)', () => {
        const voice = makeVoice()
        sound.stopVoice(voice, 2.0)
        expect(voice.stop).toHaveBeenCalledWith(2.0)
    })
    // ── play ──────────────────────────────────────────────────────────

    it('play returns early when mixer has no analyser', async () => {
        sound.mixer = { analyser: null, getOrCreateStrip: vi.fn() }
        await sound.play(makeFlatNote(), 1.0)
        expect(sound.voiceFactory.createVoice).not.toHaveBeenCalled()
    })
    it('play calls playSample for non-synth track', async () => {
        const playSampleSpy = vi.spyOn(sound, 'playSample')
        await sound.play(makeFlatNote(), 1.0)
        expect(playSampleSpy).toHaveBeenCalled()
    })
    it('play calls playGenerated for useSoftSynth=true', async () => {
        const playGeneratedSpy = vi.spyOn(sound, 'playGenerated')
        const fn = makeFlatNote({ track: { name: 'BASS', useSoftSynth: true, mono: false, velocity: 0.8, pan: 0, bars: 4, barQuantize: 4 } })
        await sound.play(fn, 1.0)
        expect(playGeneratedSpy).toHaveBeenCalled()
    })
    // ── playSample ────────────────────────────────────────────────────

    it('playSample calls voice.setup and voice.start', async () => {
        await sound.playSample(makeFlatNote(), 1.0)
        const v = sound.voiceFactory._voice
        expect(v.setup).toHaveBeenCalled()
        expect(v.start).toHaveBeenCalledWith(1.0)
    })
    it('playSample does nothing when strip is null', async () => {
        mixer.getOrCreateStrip.mockReturnValue(null)
        await sound.playSample(makeFlatNote(), 1.0)
        expect(sound.voiceFactory.createVoice).not.toHaveBeenCalled()
    })
    it('playSample registers voice for mono track', async () => {
        const fn = makeFlatNote({ track: { name: 'KICK', useSoftSynth: false, mono: true, velocity: 0.8, pan: 0, bars: 4, barQuantize: 4 } })
        await sound.playSample(fn, 1.0)
        // voice should have been stored — trigger stop via stopPreviousVoice
        sound.stopPreviousVoice(fn.track, 2.0)
        expect(sound.voiceFactory._voice.stop).toHaveBeenCalledWith(2.0)
    })

    // ── playGenerated ─────────────────────────────────────────────────

    it('playGenerated calls loadGeneratedsounds when generatedSounds is empty', async () => {
        sound.generatedSounds = {}
        const loadFn = vi.fn()
        const loadSpy = vi.spyOn(sound, 'loadGeneratedsounds')
        await sound.playGenerated(makeFlatNote(), 1.0, loadFn)
        expect(loadSpy).toHaveBeenCalled()
    })
    it('playGenerated plays voice when generatedSounds is populated', async () => {
        const fn = makeFlatNote({ track: { name: 'BASS', useSoftSynth: true, mono: false, velocity: 0.8, pan: 0, bars: 4, barQuantize: 4 } })
        await sound.playGenerated(fn, 1.0)
        expect(sound.voiceFactory._voice.start).toHaveBeenCalledWith(1.0)
    })
    it('playGenerated returns early when strip is null', async () => {
        mixer.getOrCreateStrip.mockReturnValue(null)
        await expect(sound.playGenerated(makeFlatNote(), 1.0)).resolves.not.toThrow()
    })

    // ── loadGeneratedsounds ───────────────────────────────────────────

    it('loadGeneratedsounds is no-op when already loading', () => {
        sound.generatedSoundsLoading = true
        const loadFn = vi.fn()
        sound.loadGeneratedsounds(makeFlatNote(), 1.0, loadFn)
        expect(loadFn).not.toHaveBeenCalled()
    })
    it('loadGeneratedsounds is no-op when already failed', () => {
        sound.generatedSoundsLoadFailed = true
        const loadFn = vi.fn()
        sound.loadGeneratedsounds(makeFlatNote(), 1.0, loadFn)
        expect(loadFn).not.toHaveBeenCalled()
    })
    it('loadGeneratedsounds calls loadFn when provided', () => {
        sound.generatedSounds = {}
        const loadFn = vi.fn(() => Promise.resolve())
        sound.loadGeneratedsounds(makeFlatNote(), 1.0, loadFn)
        expect(loadFn).toHaveBeenCalled()
    })

    // ── updateStripFromTrack ──────────────────────────────────────────

    it('updateStripFromTrack calls strip.updateFilter when filterType is set', () => {
        const strip = makeStrip()
        sound.updateStripFromTrack(strip, { name: 'KICK', filterType: 'lowpass', filterFreq: 0.5, filterQ: 0.5 }, 1.0)
        expect(strip.updateFilter).toHaveBeenCalledWith('lowpass', 0.5, 0.5)
    })
    it('updateStripFromTrack calls strip.updateReverb with 0 when reverbOn=false', () => {
        const strip = makeStrip()
        sound.updateStripFromTrack(strip, { name: 'KICK', reverbType: 'room', reverbOn: false, reverbAmount: 0.5 }, 1.0)
        expect(strip.updateReverb).toHaveBeenCalledWith('room', 0)
    })
    it('updateStripFromTrack calls strip.updateReverb with amount when reverbOn=true', () => {
        const strip = makeStrip()
        sound.updateStripFromTrack(strip, { name: 'KICK', reverbType: 'room', reverbOn: true, reverbAmount: 0.4 }, 1.0)
        expect(strip.updateReverb).toHaveBeenCalledWith('room', 0.4)
    })
    it('updateStripFromTrack calls strip.updateDelay with 0 when delayOn=false', () => {
        const strip = makeStrip()
        sound.updateStripFromTrack(strip, { name: 'KICK', delayType: 'tape', delayOn: false, delayAmount: 0.3 }, 1.0)
        expect(strip.updateDelay).toHaveBeenCalledWith('tape', undefined, 0)
    })
    it('updateStripFromTrack calls strip.updateLfo for pitchLfo', () => {
        const strip = makeStrip()
        const pitchLfo = { freq: 2, min: 0, max: 0.5 }
        sound.updateStripFromTrack(strip, { name: 'KICK', pitchLfo }, 1.0)
        expect(strip.updateLfo).toHaveBeenCalledWith('pitchLfo', pitchLfo)
    })
    it('updateStripFromTrack applies track velocity to strip.output.gain', () => {
        const strip = makeStrip()
        sound.updateStripFromTrack(strip, { name: 'KICK', velocity: 0.6 }, 1.0)
        expect(strip.output.gain.setTargetAtTime).toHaveBeenCalledWith(0.6, 1.0, expect.any(Number))
    })
    it('updateStripFromTrack uses default velocity when track.velocity is undefined', () => {
        const strip = makeStrip()
        sound.updateStripFromTrack(strip, { name: 'KICK' }, 1.0)
        expect(strip.output.gain.setTargetAtTime).toHaveBeenCalled()
    })
    it('updateStripFromTrack calls strip.updateSaturation with 0 when saturationOn=false', () => {
        const strip = makeStrip()
        sound.updateStripFromTrack(strip, { name: 'KICK', saturationType: 'soft', saturationOn: false, saturationAmount: 0.5 }, 1.0)
        expect(strip.updateSaturation).toHaveBeenCalledWith('soft', 0)
    })

    // ── updateGeneratedSounds ─────────────────────────────────────────

    it('updateGeneratedSounds merges new sounds into generatedSounds', () => {
        sound.updateGeneratedSounds({ BASS2: { vco1: { wave: 'square' } } })
        expect(sound.generatedSounds).toHaveProperty('BASS1')
        expect(sound.generatedSounds).toHaveProperty('BASS2')
    })
    it('updateGeneratedSounds calls updateGeneratedSound on active synth voices', () => {
        const voice = makeVoice()
        sound.activeSynthVoices.add(voice)
        sound.updateGeneratedSounds({ BASS1: { masterVolume: 0.5 } })
        expect(voice.updateGeneratedSound).toHaveBeenCalledWith({ masterVolume: 0.5 }, expect.any(Number))
    })
    it('updateGeneratedSounds skips voice whose soundKey is not in the update', () => {
        const voice = { ...makeVoice(), soundKey: 'DRUM1' }
        sound.activeSynthVoices.add(voice)
        sound.updateGeneratedSounds({ BASS1: { masterVolume: 0.3 } })
        expect(voice.updateGeneratedSound).not.toHaveBeenCalled()
    })

    // ── _playVoice ────────────────────────────────────────────────────

    it('_playVoice returns null when strip is null', async () => {
        mixer.getOrCreateStrip.mockReturnValue(null)
        const result = await sound._playVoice(makeFlatNote(), 1.0)
        expect(result).toBeNull()
    })

    it('_playVoice calls updateStripFromTrack and stopPreviousVoice', async () => {
        const updateSpy = vi.spyOn(sound, 'updateStripFromTrack')
        const stopSpy = vi.spyOn(sound, 'stopPreviousVoice')
        await sound._playVoice(makeFlatNote(), 1.0)
        expect(updateSpy).toHaveBeenCalled()
        expect(stopSpy).toHaveBeenCalled()
    })

    it('_playVoice creates, sets up and starts voice', async () => {
        const voice = await sound._playVoice(makeFlatNote(), 1.0)
        expect(voice.setup).toHaveBeenCalled()
        expect(voice.start).toHaveBeenCalledWith(1.0)
    })

    it('_playVoice registers voice for mono track', async () => {
        const fn = makeFlatNote({ track: { name: 'KICK', useSoftSynth: false, mono: true, velocity: 0.8, pan: 0, bars: 4, barQuantize: 4 } })
        await sound._playVoice(fn, 1.0)
        sound.stopPreviousVoice(fn.track, 2.0)
        expect(sound.voiceFactory._voice.stop).toHaveBeenCalledWith(2.0)
    })

    it('_playVoice syncs voiceFactory.generatedSounds when opts.syncGeneratedSounds=true', async () => {
        await sound._playVoice(makeFlatNote(), 1.0, { syncGeneratedSounds: true })
        expect(sound.voiceFactory.generatedSounds).toBe(sound.generatedSounds)
    })

    it('_playVoice returns null on error without re-throwing', async () => {
        sound.mixer.getOrCreateStrip.mockRejectedValue(new Error('boom'))
        const result = await sound._playVoice(makeFlatNote(), 1.0)
        expect(result).toBeNull()
    })

    // ── updateStripFromTrack caching ──────────────────────────────────

    it('updateStripFromTrack skips second call with same _version (cache hit)', () => {
        const strip = makeStrip()
        const track = { name: 'KICK', _version: 1, filterType: 'lowpass', filterFreq: 0.5, filterQ: 0.7 }
        sound.updateStripFromTrack(strip, track, 1.0)
        const firstCallCount = strip.updateFilter.mock.calls.length
        sound.updateStripFromTrack(strip, track, 1.0)
        expect(strip.updateFilter.mock.calls.length).toBe(firstCallCount)
    })

    it('updateStripFromTrack re-applies when _version changes', () => {
        const strip = makeStrip()
        const track = { name: 'KICK', _version: 1, filterType: 'lowpass', filterFreq: 0.5, filterQ: 0.7 }
        sound.updateStripFromTrack(strip, track, 1.0)
        track._version = 2
        sound.updateStripFromTrack(strip, track, 1.0)
        expect(strip.updateFilter).toHaveBeenCalledTimes(2)
    })

    it('invalidateStripCache forces re-apply on next call', () => {
        const strip = makeStrip()
        const track = { name: 'KICK', _version: 1, filterType: 'lowpass', filterFreq: 0.5, filterQ: 0.7 }
        sound.updateStripFromTrack(strip, track, 1.0)
        const firstCallCount = strip.updateFilter.mock.calls.length
        sound.invalidateStripCache('KICK')
        sound.updateStripFromTrack(strip, track, 1.0)
        expect(strip.updateFilter.mock.calls.length).toBeGreaterThan(firstCallCount)
    })
})
