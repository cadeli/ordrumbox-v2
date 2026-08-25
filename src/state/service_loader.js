import { serviceRegistry } from './service_registry.js'

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

export const getHistoryService = () =>
    lazyService('history', () => import('../logic/history_manager.js'))
