/**
 * Concrete type of every service held by the registry, one typedef per key.
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

export const serviceRegistry = new ServiceRegistry()
