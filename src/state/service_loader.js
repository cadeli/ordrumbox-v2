import { serviceRegistry } from './service_registry.js'

const LAZY_SERVICES = Object.freeze({
    autoGenerator: () => import('../logic/generators/auto_generator.js'),
    autoAssign: () => import('../logic/services/auto_assign.js'),
    midiManager: () => import('../logic/midi/midi.js'),
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

async function lazyService(key) {
    const factory = LAZY_SERVICES[key]
    if (!factory) throw new Error(`Unknown lazy service: ${key}`)
    if (serviceRegistry[key]) return serviceRegistry[key]

    const inFlight = pendingServices.get(key)
    if (inFlight) return inFlight

    const build = (async () => {
        const { default: Cls } = await factory()
        // Another caller may have won the race while we were importing.
        if (!serviceRegistry[key]) serviceRegistry[key] = new Cls()
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

export const getAutoGeneratorService = () => lazyService('autoGenerator')

export const getAutoAssignService = () => lazyService('autoAssign')

export const getMidiManagerService = () => lazyService('midiManager')

export const getHistoryService = () => lazyService('history')
