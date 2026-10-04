import { describe, it, expect, beforeEach, vi } from 'vitest'
import Strip from '../src/audio/strip.js'
import WorkletLoader from '../src/audio/worklets/loader.js'
import { makeParam, makeNode, installWorkletMocks } from './helpers/worklet_mocks.js'
import * as notify from '../src/core/notify.js'

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeAudioCtx() {
    return {
        currentTime: 1.0,
        sampleRate: 44100,
        createGain: vi.fn(() => ({ ...makeNode(), gain: makeParam(1) })),
        createStereoPanner: vi.fn(() => ({ ...makeNode(), pan: makeParam(0) })),
        createAnalyser: vi.fn(() => ({
            fftSize: 256,
            frequencyBinCount: 128,
            connect: vi.fn(() => {}),
            disconnect: vi.fn(() => {}),
            getByteTimeDomainData: vi.fn(() => {}),
        })),
    }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Strip (Unified Worklet)', () => {
    let ctx

    beforeEach(() => {
        ctx = makeAudioCtx()
        installWorkletMocks()
        // The unknown-enum test trips reportUserError on purpose, which logs
        // its cause outside production.
        vi.spyOn(console, 'warn').mockImplementation(() => {})
    })

    it('create() instantiates the unified strip worklet node', async () => {
        const strip = await Strip.create('KICK', ctx)
        expect(strip.stripNode).toBeDefined()
        expect(WorkletLoader.createNode).toHaveBeenCalledWith(ctx, 'strip', expect.any(Object))
    })

    it('output and pan are wrappers around stripNode parameters', async () => {
        const strip = await Strip.create('KICK', ctx)
        expect(strip.output.gain).toBe(strip.stripNode.parameters.get('volume'))
        expect(strip.pan.pan).toBe(strip.stripNode.parameters.get('pan'))
    })

    it('updateFilter sets cutoff, filterMode and allpass-high-cutoff', async () => {
        const strip = await Strip.create('KICK', ctx)
        const params = strip.stripNode.parameters
        strip.updateFilter('highpass', 1000, 1)
        expect(params.get('cutoff').setTargetAtTime).toHaveBeenCalled()
        expect(params.get('filterMode').setTargetAtTime).toHaveBeenCalledWith(1, expect.any(Number), expect.any(Number))

        // allpass sets cutoff to 20000 (fully open).
        strip.updateFilter('allpass')
        expect(params.get('cutoff').setTargetAtTime).toHaveBeenCalledWith(20000, expect.any(Number), expect.any(Number))
    })

    it('updateFilter skips cutoff when freq is undefined', async () => {
        const strip = await Strip.create('KICK', ctx)
        const params = strip.stripNode.parameters
        params.get('cutoff').setTargetAtTime.mockClear()
        strip.updateFilter('lowpass', undefined, 1)
        expect(params.get('cutoff').setTargetAtTime).not.toHaveBeenCalled()
        expect(params.get('q').setTargetAtTime).toHaveBeenCalled()
        expect(params.get('filterMode').setTargetAtTime).toHaveBeenCalled()
    })

    it('updateFilter skips q when q is undefined', async () => {
        const strip = await Strip.create('KICK', ctx)
        const params = strip.stripNode.parameters
        params.get('q').setTargetAtTime.mockClear()
        strip.updateFilter('lowpass', 1000, undefined)
        expect(params.get('q').setTargetAtTime).not.toHaveBeenCalled()
        expect(params.get('cutoff').setTargetAtTime).toHaveBeenCalled()
        expect(params.get('filterMode').setTargetAtTime).toHaveBeenCalled()
    })

    it('updateFilter skips both cutoff and q when both are undefined', async () => {
        const strip = await Strip.create('KICK', ctx)
        const params = strip.stripNode.parameters
        params.get('cutoff').setTargetAtTime.mockClear()
        params.get('q').setTargetAtTime.mockClear()
        strip.updateFilter('lowpass', undefined, undefined)
        expect(params.get('cutoff').setTargetAtTime).not.toHaveBeenCalled()
        expect(params.get('q').setTargetAtTime).not.toHaveBeenCalled()
        expect(params.get('filterMode').setTargetAtTime).toHaveBeenCalled()
    })

    it('updateFilter passes physical Hz/Q directly to worklet', async () => {
        const strip = await Strip.create('KICK', ctx)
        const params = strip.stripNode.parameters

        strip.updateFilter('lowpass', 20, 0.707)
        expect(params.get('cutoff').setTargetAtTime).toHaveBeenCalledWith(20, expect.any(Number), expect.any(Number))
        expect(params.get('q').setTargetAtTime).toHaveBeenCalledWith(0.707, expect.any(Number), expect.any(Number))

        params.get('cutoff').setTargetAtTime.mockClear()
        params.get('q').setTargetAtTime.mockClear()

        strip.updateFilter('lowpass', 20000, 18.707)
        expect(params.get('cutoff').setTargetAtTime).toHaveBeenCalledWith(20000, expect.any(Number), expect.any(Number))
        expect(params.get('q').setTargetAtTime).toHaveBeenCalledWith(18.707, expect.any(Number), expect.any(Number))

        params.get('cutoff').setTargetAtTime.mockClear()
        params.get('q').setTargetAtTime.mockClear()

        strip.updateFilter('lowpass', 1000, 5)
        expect(params.get('cutoff').setTargetAtTime).toHaveBeenCalledWith(1000, expect.any(Number), expect.any(Number))
        expect(params.get('q').setTargetAtTime).toHaveBeenCalledWith(5, expect.any(Number), expect.any(Number))
    })

    it('updateSaturation sets satMix and satDrive', async () => {
        const strip = await Strip.create('KICK', ctx)
        strip.updateSaturation('soft', 0.5)
        const params = strip.stripNode.parameters
        expect(params.get('satMix').setTargetAtTime).toHaveBeenCalledWith(1, expect.any(Number), expect.any(Number))
        expect(params.get('satDrive').setTargetAtTime).toHaveBeenCalledWith(4, expect.any(Number), expect.any(Number))
    })

    it('updateReverb sets revMix and roomSize', async () => {
        const strip = await Strip.create('KICK', ctx)
        strip.updateReverb('room', 0.5)
        const params = strip.stripNode.parameters
        expect(params.get('revMix').setTargetAtTime).toHaveBeenCalledWith(0.5, expect.any(Number), expect.any(Number))
        expect(params.get('revRoom').setTargetAtTime).toHaveBeenCalled()
    })

    it('updateDelay sets dlyMix and delay times', async () => {
        const strip = await Strip.create('KICK', ctx)
        strip.updateDelay('tape', 1, 0.5)
        const params = strip.stripNode.parameters
        expect(params.get('dlyMix').setTargetAtTime).toHaveBeenCalledWith(0.5, expect.any(Number), expect.any(Number))
        expect(params.get('dlyTimeL').setTargetAtTime).toHaveBeenCalled()
    })

    // The DSP modes are 0 = Slap, 1 = Tape, 2 = PingPong (strip_source.js). 'none'
    // is a type that silences the send, not a mode: DELAY_MODES used to map it to
    // 0, i.e. a slap, and only the 'none' guard above kept it from sounding.
    it.each([
        ['slap', 0],
        ['tape', 1],
        ['pingpong', 2],
    ])('updateDelay maps %s to DSP mode %i', async (type, mode) => {
        const strip = await Strip.create('KICK', ctx)
        strip.updateDelay(type, 1, 0.5)
        expect(strip.stripNode.parameters.get('dlyMode').setTargetAtTime).toHaveBeenCalledWith(
            mode,
            expect.any(Number),
            expect.any(Number),
        )
    })

    it("updateDelay 'none' silences the send and never picks a DSP mode", async () => {
        const strip = await Strip.create('KICK', ctx)
        strip.updateDelay('none', 1, 0.5)
        const params = strip.stripNode.parameters
        expect(params.get('dlyMix').setTargetAtTime).toHaveBeenCalledWith(0, expect.any(Number), expect.any(Number))
        expect(params.get('dlyMode').setTargetAtTime).not.toHaveBeenCalled()
    })

    it('delete disconnects the stripNode and cleans up', async () => {
        const strip = await Strip.create('KICK', ctx)
        const node = strip.stripNode
        strip.delete()
        expect(node.disconnect).toHaveBeenCalled()
        expect(strip.stripNode).toBeNull()
        expect(strip.voicesInput.disconnect).toHaveBeenCalled()
    })

    // P1 guard: unknown enum values must surface to the user instead of being
    // silently swapped for a default. The trap this pins down is the reverse
    // mistake — reporting a LEGITIMATE value. 'allpass' is the schema default
    // for "filter off" (track_schema.js) and what fx_section toggles back to,
    // so it must never reach reportUserError; a real song using it used to
    // raise a bogus toast and resolve to lowpass.
    it('updateFilter does not report the legitimate "allpass" (filter off) type', async () => {
        const spy = vi.spyOn(notify, 'reportUserError')
        notify.resetUserErrorReports()
        const strip = await Strip.create('KICK', ctx)

        for (const type of ['allpass', 'lowpass', 'highpass', 'bandpass', 'notch']) {
            strip.updateFilter(type)
        }

        expect(spy).not.toHaveBeenCalled()
    })

    it('updateFilter reports a genuinely unknown type and falls back', async () => {
        const spy = vi.spyOn(notify, 'reportUserError')
        notify.resetUserErrorReports()
        const strip = await Strip.create('KICK', ctx)
        const params = strip.stripNode.parameters

        strip.updateFilter('off')

        expect(spy).toHaveBeenCalledTimes(1)
        expect(spy.mock.calls[0][0]).toBe('Strip.enum')
        // Falls back to lowpass (FILTER_MODES.lowpass === 0).
        expect(params.get('filterMode').setTargetAtTime).toHaveBeenCalledWith(0, expect.any(Number), expect.any(Number))
        expect(strip.currentFilterType).toBe('lowpass')
    })
})
