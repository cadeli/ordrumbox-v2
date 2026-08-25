export class ServiceRegistry {
    static DEFAULTS = {
        cmd: null, patterns: null, midiManager: null,
        resourcesLoader: null, seq: null, autoGenerate: null,
        autoAssign: null, wavExporter: null, audioCtx: null,
        audioEngine: null, transport: null, exportLoopsCount: 1,
        viewManager: null, history: null,
    }

    constructor() { Object.assign(this, ServiceRegistry.DEFAULTS) }

    reset() { Object.assign(this, ServiceRegistry.DEFAULTS) }
}

export const serviceRegistry = new ServiceRegistry()
