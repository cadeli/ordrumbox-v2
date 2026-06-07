/**
 * @vitest-environment jsdom
 *
 * Strip worklet tests: validate the unified strip_source.js exposes the LFO
 * mix parameters and uses the replace formula (final = (1-mix)*base + mix*lfo).
 */
import { describe, it, expect } from 'vitest'
import STRIP_SOURCE from '../src/audio/worklets/processors/strip_source.js'

describe('StripProcessor source (LFO replace semantics)', () => {
    it('declares 5 LFO mix AudioParams: pitch/velo/pan/cut/q', () => {
        const expected = ['lfoPitchMix', 'lfoVeloMix', 'lfoPanMix', 'lfoCutMix', 'lfoQMix']
        for (const name of expected) {
            expect(STRIP_SOURCE).toContain(`name: '${name}'`)
        }
    })

    it('uses the replace formula for vol: (1-lVMix)*volume + lVMix*vLfo (no more 2^vLfo)', () => {
        expect(STRIP_SOURCE).toContain('lVMix * vLfo')
        expect(STRIP_SOURCE).not.toContain('Math.pow(2, vLfo)')
    })

    it('uses the replace formula for pan: (1-lPMix)*pan + lPMix*pLfo', () => {
        expect(STRIP_SOURCE).toContain('lPMix * pLfo')
    })

    it('uses the replace formula for cutoff: (1-lCutMix)*cutoff + lCutMix*cLfo', () => {
        expect(STRIP_SOURCE).toContain('lCutMix * cLfo')
    })

    it('uses the replace formula for Q: (1-lQMix)*q + lQMix*qLfo', () => {
        expect(STRIP_SOURCE).toContain('lQMix * qLfo')
    })

    it('LFO formula in worklet matches the helper: bias + ((raw+1)*0.5)*depth', () => {
        // The helper in audio/math.js uses this exact formula.
        // The worklet inlines the same formula for DSP.
        expect(STRIP_SOURCE).toContain('b + ((raw + 1) * 0.5) * d')
    })

    it('pitch LFO output on port 1 uses mix*lfo (replace)', () => {
        // pitchLfoOut[0][i] = lPitchMix * pitchVal so that the voice sees 0
        // when LFO off and the LFO value (in semitones) when on.
        expect(STRIP_SOURCE).toContain('lPitchMix * pitchVal')
    })
})
