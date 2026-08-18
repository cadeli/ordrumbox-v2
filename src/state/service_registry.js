export class ServiceRegistry {
    static DEFAULTS = {
        cmd: null, patterns: null, midiManager: null,
        resourcesLoader: null, seq: null, autoGenerate: null,
        autoAssign: null, wavExporter: null, audioCtx: null,
        audioEngine: null, transport: null, exportLoopsCount: 1,
    }

    constructor() { Object.assign(this, ServiceRegistry.DEFAULTS) }

    reset() { Object.assign(this, ServiceRegistry.DEFAULTS) }
}

export const serviceRegistry = new ServiceRegistry()

async function lazyService(key, importFn) {
    if (!serviceRegistry[key]) {
        const { default: Cls } = await importFn()
        serviceRegistry[key] = new Cls()
    }
    return serviceRegistry[key]
}

export const getAutoGenerateService = () =>
    lazyService('autoGenerate', () => import('../logic/generators/auto_generate.js'))

export const getAutoAssignService = () =>
    lazyService('autoAssign', () => import('../logic/services/auto_assign.js'))

export const getMidiManagerService = () =>
    lazyService('midiManager', () => import('../logic/midi/midi.js'))
