export class ServiceRegistry {
    static DEFAULTS = {
        cmd: null,
        patterns: null,
        midiManager: null,
        resourcesLoader: null,
        seq: null,
        autoGenerate: null,
        autoAssign: null,
        wavExporter: null,
        audioCtx: null,
        audioEngine: null,
        transport: null,
        viewManager: null,
        history: null,
    }

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
