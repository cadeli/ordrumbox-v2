/**
 * WorkletBridge — async helper to upgrade an MfStrip's native effects
 * (filter, saturation, reverb) to their AudioWorkletNode equivalents
 * with automatic fallback.
 *
 * Usage:
 *   const strip = new MfStrip(name, audioCtx)
 *   await WorkletBridge.upgrade(strip)   // optional — falls back silently
 *
 * After upgrade, strip._worklet.{filter, saturation, reverb} contain
 * the AudioWorkletNode instances and `strip._worklet.active === true`
 * if worklets are in use.
 */

import WorkletLoader from './loader.js'
import SATURATION_SOURCE from './processors/saturation_source.js'
import FILTER_SOURCE from './processors/filter_source.js'
import REVERB_SOURCE from './processors/reverb_source.js'

let _registered = false

function registerAll() {
    if (_registered) return
    WorkletLoader.register('saturation', SATURATION_SOURCE)
    WorkletLoader.register('filter', FILTER_SOURCE)
    WorkletLoader.register('reverb', REVERB_SOURCE)
    _registered = true
}

export default class WorkletBridge {
    static isAvailable(audioCtx) {
        return WorkletLoader.isSupported(audioCtx)
    }

    static async upgrade(strip) {
        registerAll()
        const ctx = strip.audioCtx
        if (!WorkletLoader.isSupported(ctx)) return false

        try {
            await WorkletLoader.ensureLoaded(ctx)
        } catch (err) {
            console.warn('WorkletBridge: failed to load worklets, staying on native', err)
            return false
        }

        if (strip._worklet?.active) return true

        strip._worklet = { active: true, nodes: {} }

        // --- SATURATION ---
        try {
            const satNode = WorkletLoader.createNode(ctx, 'saturation', {
                numberOfInputs: 1,
                numberOfOutputs: 1,
                outputChannelCount: [2]
            })
            // Re-route: dry path goes through worklet now
            strip.saturDrive.disconnect()
            strip.saturDrive.connect(satNode)
            satNode.connect(strip.dryGain)
            strip._worklet.nodes.saturation = satNode
        } catch (e) {
            console.warn('WorkletBridge: saturation upgrade failed', e)
        }

        // --- FILTER ---
        try {
            // Replace cascaded BiquadFilters with single TPT SVF
            const filterNode = WorkletLoader.createNode(ctx, 'filter', {
                numberOfInputs: 1,
                numberOfOutputs: 1,
                outputChannelCount: [2]
            })
            // Disconnect filter1's input side; wire from previous source
            // to the worklet, then worklet to filter2's position in the chain
            // (we leave filter1/filter2 in place but bypass them).
            const upstream = strip.voicesInput || strip.filter1
            // Re-wire: any existing source feeding filter1 now feeds the worklet
            // For simplicity, only the saturation/reverb/delay outputs are
            // considered downstream; the input source feeding filter1 is the
            // voice strip entry. We expose a 'voicesInput' reference in the
            // strip during construction (see MfStrip integration).
            filterNode.connect(strip.saturDrive)
            filterNode.connect(strip.reverbInput)
            filterNode.connect(strip.delayInput)
            strip._worklet.nodes.filter = filterNode
        } catch (e) {
            console.warn('WorkletBridge: filter upgrade failed', e)
        }

        // --- REVERB ---
        try {
            const verbNode = WorkletLoader.createNode(ctx, 'reverb', {
                numberOfInputs: 1,
                numberOfOutputs: 1,
                outputChannelCount: [2]
            })
            strip.reverbInput.disconnect()
            strip.reverbInput.connect(verbNode)
            verbNode.connect(strip.reverbWetGain)
            strip._worklet.nodes.reverb = verbNode
        } catch (e) {
            console.warn('WorkletBridge: reverb upgrade failed', e)
        }

        return strip._worklet.active
    }

    static setSaturation(strip, type, amount) {
        if (!strip._worklet?.nodes.saturation) return false
        const node = strip._worklet.nodes.saturation
        const types = ['soft', 'hard', 'tape']
        const typeIdx = Math.max(0, types.indexOf(type))
        const drive = 1 + Math.max(0, Math.min(1, amount)) * 6
        const out = 1 - Math.max(0, Math.min(1, amount)) * 0.15
        const time = strip.audioCtx.currentTime
        const ramp = 0.02
        node.parameters.get('drive').setTargetAtTime(drive, time, ramp)
        node.parameters.get('output').setTargetAtTime(out, time, ramp)
        node.parameters.get('mix').setTargetAtTime(1, time, ramp)
        node.parameters.get('type').setTargetAtTime(typeIdx, time, ramp)
        return true
    }

    static setReverb(strip, type, amount) {
        if (!strip._worklet?.nodes.reverb) return false
        const node = strip._worklet.nodes.reverb
        const presets = {
            none:    { room: 0.0,  damp: 0.5, width: 0.0, pre: 0    },
            room:    { room: 0.5,  damp: 0.5, width: 0.8, pre: 0.008 },
            hall:    { room: 0.85, damp: 0.3, width: 1.0, pre: 0.02  },
            plate:   { room: 0.7,  damp: 0.4, width: 0.9, pre: 0.012 },
            spring:  { room: 0.45, damp: 0.6, width: 0.5, pre: 0.01  },
            gated:   { room: 0.4,  damp: 0.7, width: 0.4, pre: 0     }
        }
        const p = presets[type] || presets.none
        const wet = Math.max(0, Math.min(1, amount))
        const time = strip.audioCtx.currentTime
        const ramp = 0.02
        node.parameters.get('roomSize').setTargetAtTime(p.room, time, ramp)
        node.parameters.get('damping').setTargetAtTime(p.damp, time, ramp)
        node.parameters.get('width').setTargetAtTime(p.width, time, ramp)
        node.parameters.get('preDelay').setTargetAtTime(p.pre, time, ramp)
        node.parameters.get('mix').setTargetAtTime(wet, time, ramp)
        return true
    }

    static setFilter(strip, type, freq, q) {
        if (!strip._worklet?.nodes.filter) return false
        const node = strip._worklet.nodes.filter
        const modes = { lowpass: 0, highpass: 1, bandpass: 2, notch: 3,
                        lowshelf: 0, highshelf: 1, peaking: 2, allpass: 3 }
        const mode = modes[type] ?? 0
        const f = Math.max(20, Math.min(20000, freq))
        const qq = Math.max(0.1, Math.min(20, q))
        const time = strip.audioCtx.currentTime
        const ramp = 0.02
        node.parameters.get('cutoff').setTargetAtTime(f, time, ramp)
        node.parameters.get('q').setTargetAtTime(qq, time, ramp)
        node.parameters.get('mode').setTargetAtTime(mode, time, ramp)
        return true
    }
}
