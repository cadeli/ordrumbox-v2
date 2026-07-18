export class ServiceRegistry {
    static DEFAULTS = {
        mfCmd: null, mfPatterns: null, midiManager: null,
        mfResourcesLoader: null, mfSeq: null, mfAutoGenerate: null,
        mfAutoAssign: null, mfWavExporter: null, audioCtx: null,
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
    lazyService('mfAutoGenerate', () => import('../logic/generators/auto_generate.js'))

export const getAutoAssignService = () =>
    lazyService('mfAutoAssign', () => import('../logic/services/auto_assign.js'))

export const getMidiManagerService = () =>
    lazyService('midiManager', () => import('../logic/midi/midi.js'))
