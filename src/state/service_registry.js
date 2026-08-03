export class ServiceRegistry {
    static DEFAULTS = {
        mfCmd: null, mfPatterns: null, midiManager: null,
        mfResourcesLoader: null, mfSeq: null, mfAutoGenerate: null,
        mfAutoAssign: null, mfWavExporter: null, audioCtx: null,
        audioEngine: null, transport: null, exportLoopsCount: 1,
    }

    constructor() { Object.assign(this, ServiceRegistry.DEFAULTS) }

    // Clean modern aliases without 'mf' prefix
    get cmd() { return this.mfCmd }
    set cmd(v) { this.mfCmd = v }

    get patterns() { return this.mfPatterns }
    set patterns(v) { this.mfPatterns = v }

    get resourcesLoader() { return this.mfResourcesLoader }
    set resourcesLoader(v) { this.mfResourcesLoader = v }

    get seq() { return this.mfSeq }
    set seq(v) { this.mfSeq = v }

    get autoGenerate() { return this.mfAutoGenerate }
    set autoGenerate(v) { this.mfAutoGenerate = v }

    get autoAssign() { return this.mfAutoAssign }
    set autoAssign(v) { this.mfAutoAssign = v }

    get wavExporter() { return this.mfWavExporter }
    set wavExporter(v) { this.mfWavExporter = v }

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
