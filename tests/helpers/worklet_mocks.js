/**
 * Shared mocks for AudioWorklet-based audio modules.
 *
 * Centralises the AudioParam / AudioWorkletNode / AudioContext stubs used by
 * tests that exercise worklet-backed classes (MfStrip, MfSound, …) without a
 * real AudioContext.
 */
import { vi } from 'vitest'
import WorkletLoader from '../../src/audio/worklets/loader.js'

/**
 * AudioParam-shaped mock. The worklet strips/voices drive parameters via
 * `setTargetAtTime`, `setValueAtTime`, etc. — each is a vi.fn() so tests can
 * inspect the calls without a real AudioContext.
 */
export function makeParam(v = 0) {
    return {
        value: v,
        setValueAtTime: vi.fn(),
        setTargetAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
        cancelScheduledValues: vi.fn(),
        connect: vi.fn(),
    }
}

/**
 * Generic audio-node mock (GainNode, AudioNode, etc.) with the few methods the
 * strips/voices actually call (`connect`, `disconnect`, `start`, `stop`).
 */
export function makeNode(extra = {}) {
    return { connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), ...extra }
}

/**
 * Names of every AudioParam exposed by the unified `strip` worklet node.
 * Kept in sync with src/audio/worklets/processors/strip_source.js.
 */
export const STRIP_PARAM_NAMES = [
    'cutoff', 'q', 'filterMode',
    'satType', 'satDrive', 'satOut', 'satMix',
    'revRoom', 'revDamp', 'revWidth', 'revMix',
    'dlyTimeL', 'dlyTimeR', 'dlyFb', 'dlyMix', 'dlyMode',
    'volume', 'pan',
    'lfoPitchMix', 'lfoVeloMix', 'lfoPanMix', 'lfoCutMix', 'lfoQMix',
    'lfoPitchFreq', 'lfoPitchWave', 'lfoPitchDepth', 'lfoPitchBias',
    'lfoVeloFreq', 'lfoVeloWave', 'lfoVeloDepth', 'lfoVeloBias',
    'lfoPanFreq', 'lfoPanWave', 'lfoPanDepth', 'lfoPanBias',
    'lfoCutFreq', 'lfoCutWave', 'lfoCutDepth', 'lfoCutBias',
    'lfoQFreq', 'lfoQWave', 'lfoQDepth', 'lfoQBias',
]

/**
 * Build an AudioWorkletNode mock for the unified `strip` processor.
 * Returns a node whose `parameters` Map contains one makeParam() per
 * STRIP_PARAM_NAMES entry.
 */
export function makeStripWorkletNode() {
    const params = new Map()
    for (const name of STRIP_PARAM_NAMES) params.set(name, makeParam())
    return { ...makeNode(), parameters: params }
}

/**
 * Install vi.spyOn mocks for WorkletLoader:
 *   - isSupported → true
 *   - ensureLoaded → resolves true
 *   - createNode   → returns a per-name cached mock node
 *
 * The `strip` processor is auto-wired to a full STRIP_PARAM_NAMES node; other
 * processor names receive a bare node.
 */
export function installWorkletMocks() {
    const nodes = {}
    vi.spyOn(WorkletLoader, 'isSupported').mockReturnValue(true)
    vi.spyOn(WorkletLoader, 'ensureLoaded').mockResolvedValue(true)
    vi.spyOn(WorkletLoader, 'createNode').mockImplementation((_ctx, name) => {
        if (!nodes[name]) {
            nodes[name] = name === 'strip' ? makeStripWorkletNode() : makeNode()
        }
        return nodes[name]
    })
    return nodes
}
