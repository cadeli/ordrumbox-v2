import { serviceRegistry } from './service_registry.js'

const LAZY_SERVICES = Object.freeze({
    autoGenerator: () => import('../logic/generators/auto_generator.js'),
    autoAssign: () => import('../logic/services/auto_assign.js'),
    midiManager: () => import('../logic/midi/midi_manager.js'),
    history: () => import('../logic/history_manager.js'),
})

/**
 * In-flight constructions, keyed like the registry. The check-then-await-then-set
 * version below built TWO instances when two callers raced (e.g. double-clicking
 * "Enable MIDI"): both saw null, both awaited the import, the second assignment
 * won and the orphaned instance kept its live MIDI access + input handlers — every
 * note fired twice.
 * @type {Map<string, Promise<object>>}
 */
const pendingServices = new Map()

/** @param {string} key - a LAZY_SERVICES key (unknown keys throw at runtime) @param {object} [deps] @returns {Promise<any>} */
async function lazyService(key, deps) {
    const factory = LAZY_SERVICES[key]
    if (!factory) throw new Error(`Unknown lazy service: ${key}`)
    if (serviceRegistry[key]) return serviceRegistry[key]

    const inFlight = pendingServices.get(key)
    if (inFlight) return inFlight

    const build = (async () => {
        const { default: Cls } = await factory()
        // Another caller may have won the race while we were importing.
        if (!serviceRegistry[key]) serviceRegistry[key] = new Cls(deps)
        return serviceRegistry[key]
    })()
    pendingServices.set(key, build)
    try {
        return await build
    } finally {
        pendingServices.delete(key)
    }
}

export const getService = (key) => lazyService(key)

export const getAutoGeneratorService = () =>
    lazyService('autoGenerator', {
        registry: serviceRegistry,
    })

export const getAutoAssignService = () => lazyService('autoAssign')

export const getMidiManagerService = () =>
    lazyService('midiManager', {
        getSeq: () => serviceRegistry.seq,
        getAudioCtx: () => serviceRegistry.audioCtx,
    })

export const getHistoryService = () => lazyService('history')

/**
 * Eagerly builds and assigns the startup services into the registry, in the
 * right dependency order. This is the single composition root for the eager
 * services; call it once from the bootstrap.
 * @returns {Promise<typeof serviceRegistry>}
 */
export async function initServices() {
    const [{ default: ResourcesLoader }, { default: Commander }, { default: Sequencer }, flatNotesService] =
        await Promise.all([
            import('../loader/resources_loader.js'),
            import('../logic/commands/commander.js'),
            import('../logic/sequencer.js'),
            import('../patterns/flat_notes.js'),
        ])
    serviceRegistry.resourcesLoader = new ResourcesLoader()
    serviceRegistry.history = await getHistoryService()
    serviceRegistry.cmd = new Commander({
        history: serviceRegistry.history,
        persistPatterns: () => serviceRegistry.resourcesLoader?.persistPatterns?.(),
        registry: serviceRegistry,
    })
    serviceRegistry.seq = new Sequencer()
    serviceRegistry.flatNotes = flatNotesService
    return serviceRegistry
}
