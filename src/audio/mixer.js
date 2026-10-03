import Strip from './strip.js'
import WorkletLoader from './worklets/loader.js'
import MASTER_BUS_SOURCE from './worklets/processors/master_bus_source.js'
import { logger } from '../core/logger.js'
import { soundRegistry } from '../state/sound_registry.js'
import { reportUserError } from '../core/notify.js'

// Register master bus processor at module load (idempotent)
WorkletLoader.register('master-bus', MASTER_BUS_SOURCE)

export default class Mixer {
    static TAG = 'Mixer'

    #pendingStrips = new Map()

    constructor(audioCtx) {
        this.audioCtx = audioCtx
        this.strips = {}

        this.analyser = null
        this.busInput = null // GainNode — all strip pans connect here
        this.busWorklet = null // master-bus AudioWorkletNode
        /** @type {boolean} true when the master-bus worklet could not be created */
        this.degraded = false
    }

    /**
     * Async factory — loads the master-bus worklet then wires the graph.
     */
    static async create(audioCtx) {
        const mixer = new Mixer(audioCtx)
        try {
            // ensureLoaded() resolving false used to be ignored: start() then
            // wired no bus, so nothing reached ctx.destination and the app was
            // mute with no error anywhere. start() still runs (it builds the
            // graph objects the UI needs), then the missing bus is reported.
            await WorkletLoader.ensureLoaded(audioCtx)
            mixer.start()
            if (!mixer.busWorklet) {
                mixer.degraded = true
                reportUserError('Mixer.masterBus', 'Master audio engine unavailable — no sound', {
                    cause: new Error('master-bus worklet not created'),
                })
            }
            return mixer
        } catch (err) {
            logger.error('Mixer', 'Mixer::create failed', err)
            mixer.degraded = true
            reportUserError('Mixer.masterBus', 'Master audio engine unavailable — no sound', { cause: err })
            return mixer
        }
    }

    // ─── Lifecycle ──────────────────────────────────────────────────────────────

    start = () => {
        const ctx = this.audioCtx

        if (!this.analyser) {
            this.analyser = ctx.createAnalyser()
            this.analyser.fftSize = 4096
            this.gFftData = new Uint8Array(this.analyser.frequencyBinCount)
            this.dataArray = new Uint8Array(this.analyser.fftSize)
        }
        if (!this.busInput) {
            this.busInput = ctx.createGain()
        }
        if (!this.transportClock) {
            this.transportClock = ctx.createConstantSource()
            this.transportClock.offset.value = 0
        }
        // Recreate the master-bus worklet only if the worklets have already
        // been loaded onto this context. Cold-start (worklets still loading)
        // skips this — create() handles that case. The strips are re-added
        // lazily by getOrCreateStrip() on the next note.
        if (!this.busWorklet && WorkletLoader.isContextReady(ctx)) {
            this.busWorklet = WorkletLoader.createNode(ctx, 'master-bus', {
                numberOfInputs: 1,
                numberOfOutputs: 1,
                outputChannelCount: [2],
            })
        }

        // Wire the bus only when every link is present.
        // Always disconnect first — Web Audio connect() accumulates duplicate
        // connections which double the signal each time.
        if (this.busInput && this.busWorklet && this.analyser) {
            try {
                this.busInput.disconnect()
            } catch (_) {
                /* no-op */
            }
            try {
                this.busWorklet.disconnect()
            } catch (_) {
                /* no-op */
            }
            try {
                this.analyser.disconnect()
            } catch (_) {
                /* no-op */
            }
            this.busInput.connect(this.busWorklet)
            this.busWorklet.connect(this.analyser)
            this.analyser.connect(ctx.destination)

            try {
                this.transportClock.start()
            } catch (_) {
                /* no-op */
            }

            this.#applySavedMasterSettings()
        }
    }

    #applySavedMasterSettings = () => {
        const m = soundRegistry.settings?.master
        if (!m) return
        this.setMasterBus({
            master: m.volume,
            preGain: m.preGain,
            lowcut: m.lowcut,
            hicut: m.hicut,
            bypass: m.compBypass,
            threshold: m.threshold,
            ratio: m.ratio,
            attack: m.attack,
            release: m.release,
            knee: m.knee,
            makeup: m.makeup,
        })
    }

    stop = () => {
        this.deleteStrips()

        const nodes = [this.busWorklet, this.busInput, this.analyser, this.transportClock]
        for (const node of nodes) {
            if (!node) continue
            try {
                node.disconnect()
            } catch (e) {
                logger.error('Mixer', e)
            }
            if (node === this.transportClock) {
                try {
                    node.stop()
                } catch (_) {
                    /* no-op */
                }
            }
        }

        this.busWorklet = null
        this.busInput = null
        this.analyser = null
        this.transportClock = null
        this.gFftData = null
        this.dataArray = null
    }

    // ─── Strip management ────────────────────────────────────────────────────────

    /**
     * Adds a strip asynchronously. Returns a Promise<Strip>.
     * Deduplicates concurrent calls for the same name via a pending
     * promise cache — prevents orphaned strips from double-creation races.
     */
    addStrip = async (name) => {
        if (this.strips[name]) return this.strips[name]

        if (this.#pendingStrips.has(name)) return this.#pendingStrips.get(name)

        // Re-initialise bus nodes if they were torn down by stop().
        if (!this.busInput) this.start()

        const p = (async () => {
            try {
                const strip = await Strip.create(name, this.audioCtx, this)
                this.strips[name] = strip
                if (strip.pan && this.busInput) {
                    strip.pan.connect(this.busInput)
                }
                return strip
            } finally {
                this.#pendingStrips.delete(name)
            }
        })()

        this.#pendingStrips.set(name, p)
        return p
    }

    getOrCreateStrip = async (name) => {
        if (!this.strips[name]) {
            await this.addStrip(name)
        }
        return this.strips[name]
    }

    deleteStrips = () => {
        for (const name of Object.keys(this.strips)) {
            if (this.strips[name]?.delete) {
                this.strips[name].delete()
            }
            delete this.strips[name]
        }
    }

    setBpm = (bpm) => {
        for (const strip of Object.values(this.strips)) {
            strip.setBpm(bpm)
        }
    }

    // ─── Master bus control ──────────────────────────────────────────────────────

    /**
     * @typedef {Object} MasterBusOptions
     * @property {number} [lowcut]    High-pass filter frequency
     * @property {number} [hicut]     Low-pass filter frequency
     * @property {number} [master]    Master output gain (0-1)
     * @property {number} [threshold] Compressor threshold (dB)
     * @property {number} [ratio]     Compressor ratio
     * @property {number} [knee]      Compressor knee (dB)
     * @property {number} [attack]    Compressor attack (s)
     * @property {number} [release]   Compressor release (s)
     * @property {number} [makeup]    Compressor makeup gain (dB)
     * @property {number} [preGain]   Gain in dB applied BEFORE the compressor (there is
     *                                 no limiter in the chain: pre-gain -> compressor
     *                                 -> highpass -> lowpass -> master gain)
     * @property {boolean} [bypass]   Bypasses that whole block — pre-gain, compressor
     *                                 AND both filters, not the compressor alone
     */

    /** @param {MasterBusOptions} options */
    setMasterBus = (options = {}) => {
        if (!this.busWorklet) {
            // The master controls are persisted from settings.master: without
            // this the sliders look applied and reload "remembered" values that
            // never reached the audio graph.
            reportUserError('Mixer.masterBus.set', 'Master controls are inactive — audio engine unavailable')
            return
        }
        const time = this.audioCtx.currentTime
        const ramp = 0.02
        const params = this.busWorklet.parameters
        const set = (name, val) => {
            if (val !== undefined && params.get(name)) {
                params.get(name).setTargetAtTime(val, time, ramp)
            }
        }

        set('lowcut', options.lowcut)
        set('hicut', options.hicut)
        set('master', options.master)
        set('compThreshold', options.threshold)
        set('compRatio', options.ratio)
        set('compKnee', options.knee)
        set('compAttack', options.attack)
        set('compRelease', options.release)
        set('compMakeup', options.makeup)
        set('preGain', options.preGain)
        if (options.bypass !== undefined && params.get('bypass')) {
            params.get('bypass').setTargetAtTime(options.bypass ? 1 : 0, time, ramp)
        }
    }
}
