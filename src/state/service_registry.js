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

export async function getAutoGenerateService() {
    if (!serviceRegistry.mfAutoGenerate) {
        const { default: MfAutoGenerate } = await import('../logic/generators/auto_generate.js')
        serviceRegistry.mfAutoGenerate = new MfAutoGenerate()
    }
    return serviceRegistry.mfAutoGenerate
}

export async function getAutoAssignService() {
    if (!serviceRegistry.mfAutoAssign) {
        const { default: MfAutoAssign } = await import('../logic/services/auto_assign.js')
        serviceRegistry.mfAutoAssign = new MfAutoAssign()
    }
    return serviceRegistry.mfAutoAssign
}

export async function getMidiManagerService() {
    if (!serviceRegistry.midiManager) {
        const { default: MfMidi } = await import('../logic/midi/midi.js')
        serviceRegistry.midiManager = new MfMidi()
    }
    return serviceRegistry.midiManager
}
