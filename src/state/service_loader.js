/**
 * Concrete type of every service held by the container, one typedef per key.
 * import() types give consumers real method signatures instead of any: a
 * contract error between engine, UI or persistence becomes a typecheck failure.
 *
 * @typedef {import('../logic/commands/commander.js').default} CmdService
 * @typedef {typeof import('../patterns/flat_notes.js')} FlatNotesService
 * @typedef {import('../logic/midi/midi_manager.js').default} MidiManagerService
 * @typedef {import('../loader/resources_loader.js').default} ResourcesLoaderService
 * @typedef {import('../logic/sequencer.js').default} SeqService
 * @typedef {import('../logic/generators/auto_generator.js').default} AutoGeneratorService
 * @typedef {import('../logic/services/auto_assign.js').default} AutoAssignService
 * @typedef {import('../audio/export/wav_exporter.js').default} WavExporterService
 * @typedef {import('../audio/engine.js').default} AudioEngineService
 * @typedef {import('../logic/transport/transport.js').default} TransportService
 * @typedef {import('../ui/view_manager.js').default} ViewManagerService
 * @typedef {import('../logic/history_manager.js').default} HistoryService
 */

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
    /** @type {CmdService|null} */
    cmd
    /** @type {FlatNotesService|null} */
    flatNotes
    /** @type {MidiManagerService|null} */
    midiManager
    /** @type {ResourcesLoaderService|null} */
    resourcesLoader
    /** @type {SeqService|null} */
    seq
    /** @type {AutoGeneratorService|null} */
    autoGenerator
    /** @type {AutoAssignService|null} */
    autoAssign
    /** @type {WavExporterService|null} */
    wavExporter
    /** @type {AudioContext|null} */
    audioCtx
    /** @type {AudioEngineService|null} */
    audioEngine
    /** @type {TransportService|null} */
    transport
    /** @type {ViewManagerService|null} */
    viewManager
    /** @type {HistoryService|null} */
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

/**
 * The single service container. Composition-root code (bootstrap) and the
 * transitional panel fallbacks read it through getServices(); tests may use the
 * `serviceRegistry` alias below until they migrate to constructor DI.
 * @type {ServiceRegistry}
 */
const services = new ServiceRegistry()

/** @returns {ServiceRegistry} the live service container */
export const getServices = () => services

/**
 * Transitional alias so the existing test suite keeps a familiar handle on the
 * container. Production code should prefer getServices() or the typed getters.
 */
export { services as serviceRegistry }

const LAZY_SERVICES = Object.freeze({
    autoGenerator: () => import('../logic/generators/auto_generator.js'),
    autoAssign: () => import('../logic/services/auto_assign.js'),
    midiManager: () => import('../logic/midi/midi_manager.js'),
    history: () => import('../logic/history_manager.js'),
})

/**
 * In-flight constructions, keyed like the container. The check-then-await-then-set
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
    if (services[key]) return services[key]

    const inFlight = pendingServices.get(key)
    if (inFlight) return inFlight

    const build = (async () => {
        const { default: Cls } = await factory()
        // Another caller may have won the race while we were importing.
        if (!services[key]) services[key] = new Cls(deps)
        return services[key]
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
        registry: services,
    })

export const getAutoAssignService = () => lazyService('autoAssign')

export const getMidiManagerService = () =>
    lazyService('midiManager', {
        getSeq: () => services.seq,
        getAudioCtx: () => services.audioCtx,
    })

export const getHistoryService = () => lazyService('history')

/**
 * Eagerly builds and assigns the startup services into the container, in the
 * right dependency order. This is the single composition root for the eager
 * services; call it once from the bootstrap.
 * @returns {Promise<ServiceRegistry>}
 */
export async function initServices() {
    const [{ default: ResourcesLoader }, { default: Commander }, { default: Sequencer }, flatNotesService] =
        await Promise.all([
            import('../loader/resources_loader.js'),
            import('../logic/commands/commander.js'),
            import('../logic/sequencer.js'),
            import('../patterns/flat_notes.js'),
        ])
    services.resourcesLoader = new ResourcesLoader()
    services.history = await getHistoryService()
    services.cmd = new Commander({
        history: services.history,
        persistPatterns: () => services.resourcesLoader?.persistPatterns?.(),
        registry: services,
    })
    services.seq = new Sequencer()
    services.flatNotes = flatNotesService
    return services
}
