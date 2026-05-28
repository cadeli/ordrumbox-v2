export class ServiceRegistry {
    constructor() {
        this.mfCmd = null
        this.mfPatterns = null
        this.mfUpdates = null
        this.midiManager = null
        this.mfResourcesLoader = null
        this.mfSeq = null
        this.mfSkelHtml = null
        this.mfComponents = null
        this.mfSliderBox = null
        this.mfRotativeBtn = null
        this.mfSliderBtn = null
        this.mfAutoGenerate = null
        this.mfAutoAssign = null
        this.mfWavExporter = null
        this.patternsDropBox = null
        this.drumkitsDropBox = null
        this.audioCtx = null
        this.audioEngine = null
        this.transport = null
        this.blob = null
        this.exportLoopsCount = 1
    }

    reset() {
        this.mfCmd = null
        this.mfPatterns = null
        this.mfUpdates = null
        this.midiManager = null
        this.mfResourcesLoader = null
        this.mfSeq = null
        this.mfSkelHtml = null
        this.mfComponents = null
        this.mfSliderBox = null
        this.mfRotativeBtn = null
        this.mfSliderBtn = null
        this.mfAutoGenerate = null
        this.mfAutoAssign = null
        this.mfWavExporter = null
        this.patternsDropBox = null
        this.drumkitsDropBox = null
        this.audioCtx = null
        this.audioEngine = null
        this.transport = null
        this.blob = null
        this.exportLoopsCount = 1
    }
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
