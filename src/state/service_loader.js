import { serviceRegistry } from './service_registry.js'

const LAZY_SERVICES = Object.freeze({
    autoGenerate: () => import('../logic/generators/auto_generate.js'),
    autoAssign: () => import('../logic/services/auto_assign.js'),
    midiManager: () => import('../logic/midi/midi.js'),
    history: () => import('../logic/history_manager.js'),
})

async function lazyService(key) {
    const factory = LAZY_SERVICES[key]
    if (!factory) throw new Error(`Unknown lazy service: ${key}`)
    if (!serviceRegistry[key]) {
        const { default: Cls } = await factory()
        serviceRegistry[key] = new Cls()
    }
    return serviceRegistry[key]
}

export const getService = (key) => lazyService(key)

export const getAutoGenerateService = () => lazyService('autoGenerate')

export const getAutoAssignService = () => lazyService('autoAssign')

export const getMidiManagerService = () => lazyService('midiManager')

export const getHistoryService = () => lazyService('history')
