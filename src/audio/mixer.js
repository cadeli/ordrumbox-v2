import MfStrip from './strip.js';
import WorkletLoader from './worklets/loader.js';
import MASTER_BUS_SOURCE from './worklets/processors/master_bus_source.js';

// Register master bus processor at module load (idempotent)
WorkletLoader.register('master-bus', MASTER_BUS_SOURCE);

export default class MfMixer {
    static TAG = "MFMIXER";

    constructor(audioCtx) {
        this.audioCtx = audioCtx;
        this.trackName = "all";
        this.strips = {};

        this.analyser  = null;
        this.busInput  = null;   // GainNode — all strip pans connect here
        this.busWorklet = null;  // master-bus AudioWorkletNode
    }

    /**
     * Async factory — loads the master-bus worklet then wires the graph.
     * Use this instead of calling start() on a synchronously constructed mixer.
     */
    static async create(audioCtx) {
        const mixer = new MfMixer(audioCtx);
        await WorkletLoader.ensureLoaded(audioCtx);
        await mixer._init();
        return mixer;
    }

    // ─── Internal setup ─────────────────────────────────────────────────────────

    _init() {
        const ctx = this.audioCtx;

        this.analyser = ctx.createAnalyser();
        this.analyser.fftSize = 1024;
        this.gFftData  = new Uint8Array(this.analyser.frequencyBinCount);
        this.dataArray = new Uint8Array(this.analyser.fftSize);

        this.busInput = ctx.createGain();

        this.busWorklet = WorkletLoader.createNode(ctx, 'master-bus', {
            numberOfInputs: 1,
            numberOfOutputs: 1,
            outputChannelCount: [2],
        });

        // strips → busInput → master-bus worklet → analyser → destination
        this.busInput.connect(this.busWorklet);
        this.busWorklet.connect(this.analyser);
        this.analyser.connect(ctx.destination);
    }

    // ─── Lifecycle ──────────────────────────────────────────────────────────────

    /**
     * start() is kept for compatibility with AudioEngine (which calls mixer.start()).
     * The heavy lifting now happens in the async factory; start() is a no-op if
     * already initialised, or triggers a sync-safe reconnect.
     */
    start = () => {
        // Already initialised via create() — nothing to do.
        // If the engine created the mixer synchronously (legacy / tests),
        // the nodes will be null; init synchronously as best-effort.
        if (!this.busInput) {
            const ctx = this.audioCtx;
            this.analyser = ctx.createAnalyser();
            this.analyser.fftSize = 1024;
            this.gFftData  = new Uint8Array(this.analyser.frequencyBinCount);
            this.dataArray = new Uint8Array(this.analyser.fftSize);
            this.busInput  = ctx.createGain();
            // Without worklets loaded synchronously we can't create the worklet node;
            // strips will have no bus until ensureLoaded resolves. This path is only
            // hit in tests that don't use the async factory.
        }
    }

    stop = () => {
        this.deleteStrips();

        const nodes = [this.busWorklet, this.busInput, this.analyser];
        for (const node of nodes) {
            if (!node) continue;
            try { node.disconnect(); } catch (e) { console.error(e); }
        }

        this.busWorklet = null;
        this.busInput   = null;
        this.analyser   = null;
        this.gFftData   = null;
        this.dataArray  = null;
    }

    // ─── Strip management ────────────────────────────────────────────────────────

    /**
     * Adds a strip asynchronously. Returns a Promise<MfStrip>.
     */
    addStrip = async (name) => {
        if (this.strips[name]) return this.strips[name];

        const strip = await MfStrip.create(name, this.audioCtx);
        this.strips[name] = strip;

        if (strip.pan && this.busInput) {
            strip.pan.connect(this.busInput);
        }

        return strip;
    }

    getOrCreateStrip = async (name) => {
        if (!this.strips[name]) {
            await this.addStrip(name);
        }
        return this.strips[name];
    }

    deleteStrips = () => {
        for (const name of Object.keys(this.strips)) {
            if (this.strips[name]?.delete) {
                this.strips[name].delete();
            }
            delete this.strips[name];
        }
        this.strips = {};
    }

    setBpm = (bpm) => {
        for (const strip of Object.values(this.strips)) {
            strip.setBpm(bpm);
        }
    }

    // ─── Master bus control ──────────────────────────────────────────────────────

    setMasterBus = (options = {}) => {
        if (!this.busWorklet) return;
        const time  = this.audioCtx.currentTime;
        const ramp  = 0.02;
        const params = this.busWorklet.parameters;
        const set = (name, val) => {
            if (val !== undefined && params.get(name)) {
                params.get(name).setTargetAtTime(val, time, ramp);
            }
        };

        set('lowcut',        options.lowcut);
        set('hicut',         options.hicut);
        set('master',        options.master);
        set('compThreshold', options.threshold);
        set('compRatio',     options.ratio);
        set('compKnee',      options.knee);
        set('compAttack',    options.attack);
        set('compRelease',   options.release);
        set('compMakeup',    options.makeup);
        if (options.bypass !== undefined && params.get('bypass')) {
            params.get('bypass').setTargetAtTime(options.bypass ? 1 : 0, time, ramp);
        }
    }
}
