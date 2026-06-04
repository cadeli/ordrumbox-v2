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
import DELAY_SOURCE from './processors/delay_source.js'
import LFO_SOURCE from './processors/lfo_source.js'
import MASTER_BUS_SOURCE from './processors/master_bus_source.js'

let _registered = false

function registerAll() {
    if (_registered) return
    WorkletLoader.register('saturation', SATURATION_SOURCE)
    WorkletLoader.register('filter', FILTER_SOURCE)
    WorkletLoader.register('reverb', REVERB_SOURCE)
    WorkletLoader.register('delay', DELAY_SOURCE)
    WorkletLoader.register('lfo', LFO_SOURCE)
    WorkletLoader.register('master-bus', MASTER_BUS_SOURCE)
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

        // --- DELAY ---
        try {
            const delayNode = WorkletLoader.createNode(ctx, 'delay', {
                numberOfInputs: 1,
                numberOfOutputs: 1,
                outputChannelCount: [2]
            })
            strip.delayInput.disconnect()
            strip.delayInput.connect(delayNode)
            delayNode.connect(strip.delayWetGain)
            strip._worklet.nodes.delay = delayNode
        } catch (e) {
            console.warn('WorkletBridge: delay upgrade failed', e)
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

    static setDelay(strip, type, timeSeconds, amount) {
        if (!strip._worklet?.nodes.delay) return false
        const node = strip._worklet.nodes.delay
        const modes = { none: 0, slap: 0, tape: 1, pingpong: 2 }
        const mode = modes[type] ?? 0
        const wet = Math.max(0, Math.min(1, amount))
        const t = strip.audioCtx.currentTime
        const ramp = 0.02
        // Pingpong uses cross-channel time
        const isPP = mode >= 1.5
        const tL = isPP ? timeSeconds * 0.667 : timeSeconds
        const tR = isPP ? timeSeconds * 1.0   : timeSeconds
        node.parameters.get('timeL').setTargetAtTime(tL, t, ramp)
        node.parameters.get('timeR').setTargetAtTime(tR, t, ramp)
        node.parameters.get('mode').setTargetAtTime(mode, t, ramp)
        node.parameters.get('mix').setTargetAtTime(wet, t, ramp)
        // Default feedback for non-none modes
        const fb = type === 'none' ? 0 : 0.4
        node.parameters.get('feedback').setTargetAtTime(fb, t, ramp)
        node.parameters.get('filter').setTargetAtTime(5000, t, ramp)
        node.parameters.get('saturation').setTargetAtTime(0.1, t, ramp)
        return true
    }

    /**
     * Upgrade an MfMixer's master bus (compressor + EQ + master gain) to
     * a single AudioWorkletNode. Strips must be re-added or the connection
     * will be lost; this method assumes the mixer has been freshly started
     * or that strips will be reconnected externally.
     */
    static async upgradeMixer(mixer) {
        registerAll()
        const ctx = mixer.audioCtx
        if (!WorkletLoader.isSupported(ctx)) return false

        try {
            await WorkletLoader.ensureLoaded(ctx)
        } catch (err) {
            console.warn('WorkletBridge: failed to load worklets, staying on native', err)
            return false
        }

        if (mixer._workletActive) return true

        try {
            const bus = WorkletLoader.createNode(ctx, 'master-bus', {
                numberOfInputs: 1,
                numberOfOutputs: 1,
                outputChannelCount: [2]
            })
            mixer.busWorklet = bus
            mixer._workletActive = true
            return true
        } catch (e) {
            console.warn('WorkletBridge: master bus upgrade failed', e)
            return false
        }
    }

    static setMasterBus(mixer, options = {}) {
        if (!mixer?.busWorklet) return false
        const node = mixer.busWorklet
        const time = mixer.audioCtx.currentTime
        const ramp = 0.02
        const params = node.parameters
        if (options.lowcut  !== undefined && params.get('lowcut'))  params.get('lowcut').setTargetAtTime(options.lowcut,  time, ramp)
        if (options.hicut   !== undefined && params.get('hicut'))   params.get('hicut').setTargetAtTime(options.hicut,   time, ramp)
        if (options.master  !== undefined && params.get('master'))  params.get('master').setTargetAtTime(options.master,  time, ramp)
        if (options.threshold !== undefined && params.get('compThreshold')) params.get('compThreshold').setTargetAtTime(options.threshold, time, ramp)
        if (options.ratio     !== undefined && params.get('compRatio'))     params.get('compRatio').setTargetAtTime(options.ratio,     time, ramp)
        if (options.knee      !== undefined && params.get('compKnee'))      params.get('compKnee').setTargetAtTime(options.knee,      time, ramp)
        if (options.attack    !== undefined && params.get('compAttack'))    params.get('compAttack').setTargetAtTime(options.attack,    time, ramp)
        if (options.release   !== undefined && params.get('compRelease'))   params.get('compRelease').setTargetAtTime(options.release,   time, ramp)
        if (options.makeup    !== undefined && params.get('compMakeup'))    params.get('compMakeup').setTargetAtTime(options.makeup,    time, ramp)
        if (options.bypass    !== undefined && params.get('bypass'))        params.get('bypass').setTargetAtTime(options.bypass ? 1 : 0, time, ramp)
        return true
    }
}
