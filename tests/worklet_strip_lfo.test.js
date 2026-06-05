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

    it('uses the replace formula for vol: (1-veloMix)*volume + veloMix*vLfo (no more 2^vLfo)', () => {
        expect(STRIP_SOURCE).toContain('veloMix * vLfo')
        expect(STRIP_SOURCE).not.toContain('Math.pow(2, vLfo)')
    })

    it('uses the replace formula for pan: (1-panMix)*pan + panMix*pLfo', () => {
        expect(STRIP_SOURCE).toContain('panMix * pLfo')
    })

    it('uses the replace formula for cutoff: (1-cutMix)*cutoff + cutMix*cLfo', () => {
        expect(STRIP_SOURCE).toContain('cutMix * cLfo')
    })

    it('uses the replace formula for Q: (1-qMix)*q + qMix*qLfo', () => {
        expect(STRIP_SOURCE).toContain('qMix * qLfo')
    })

    it('LFO formula in worklet matches the helper: bias + ((raw+1)*0.5)*depth', () => {
        // The helper in audio/math.js uses this exact formula.
        // The worklet inlines the same formula for DSP.
        expect(STRIP_SOURCE).toContain('b + ((raw + 1) * 0.5) * d')
    })

    it('pitch LFO output on port 1 uses mix*lfo (replace)', () => {
        // pitchLfoOut[0][i] = pitchMix * pLfo so that the voice sees 0 when LFO off
        // and the LFO value (in semitones) when on.
        expect(STRIP_SOURCE).toContain('pitchMix * lfoVal')
    })
})
