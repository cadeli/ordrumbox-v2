export class ServiceRegistry {
    static DEFAULTS = {
        cmd: null,
        flatNotes: null,
        midiManager: null,
        resourcesLoader: null,
        seq: null,
        autoGenerator: null,
        autoAssign: null,
        wavExporter: null,
        audioCtx: null,
        audioEngine: null,
        transport: null,
        viewManager: null,
        history: null,
    }

    // Declared for TypeScript consumers (Object.assign is not modelled by tsc).
    /** @type {any} */
    cmd
    /** @type {any} */
    flatNotes
    /** @type {any} */
    midiManager
    /** @type {any} */
    resourcesLoader
    /** @type {any} */
    seq
    /** @type {any} */
    autoGenerator
    /** @type {any} */
    autoAssign
    /** @type {any} */
    wavExporter
    /** @type {any} */
    audioCtx
    /** @type {any} */
    audioEngine
    /** @type {any} */
    transport
    /** @type {any} */
    viewManager
    /** @type {any} */
    history

    constructor() {
        Object.assign(this, ServiceRegistry.DEFAULTS)
    }

    /**
     * Assign a known service key. Throws on unknown keys so typos
     * cannot silently create non-resettable properties.
     */
    register(key, value) {
        if (!(key in ServiceRegistry.DEFAULTS)) {
            throw new Error(`Unknown service key: ${key}`)
        }
        this[key] = value
        return value
    }

    reset() {
        Object.assign(this, ServiceRegistry.DEFAULTS)
    }
}

export const serviceRegistry = new ServiceRegistry()
