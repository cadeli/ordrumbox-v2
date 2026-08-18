import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('ServiceRegistry', () => {
    let ServiceRegistry, serviceRegistry

    beforeEach(async () => {
        const mod = await import('../src/state/service_registry.js')
        ServiceRegistry = mod.ServiceRegistry
        serviceRegistry = mod.serviceRegistry
        serviceRegistry.reset()
    })

    it('constructor sets all defaults to null', () => {
        const reg = new ServiceRegistry()
        expect(reg.cmd).toBeNull()
        expect(reg.patterns).toBeNull()
        expect(reg.midiManager).toBeNull()
        expect(reg.resourcesLoader).toBeNull()
        expect(reg.seq).toBeNull()
        expect(reg.autoGenerate).toBeNull()
        expect(reg.autoAssign).toBeNull()
        expect(reg.wavExporter).toBeNull()
        expect(reg.audioCtx).toBeNull()
        expect(reg.audioEngine).toBeNull()
        expect(reg.transport).toBeNull()
        expect(reg.exportLoopsCount).toBe(1)
    })

    it('reset restores defaults', () => {
        serviceRegistry.cmd = { mock: true }
        serviceRegistry.audioCtx = { mock: true }
        serviceRegistry.exportLoopsCount = 5
        serviceRegistry.reset()
        expect(serviceRegistry.cmd).toBeNull()
        expect(serviceRegistry.audioCtx).toBeNull()
        expect(serviceRegistry.exportLoopsCount).toBe(1)
    })

    it('alias getter/setter: cmd', () => {
        serviceRegistry.cmd = { test: 1 }
        expect(serviceRegistry.cmd).toEqual({ test: 1 })
        expect(serviceRegistry.cmd).toBe(serviceRegistry.cmd)
    })

    it('alias getter/setter: patterns', () => {
        serviceRegistry.patterns = { p: 1 }
        expect(serviceRegistry.patterns).toEqual({ p: 1 })
    })

    it('alias getter/setter: resourcesLoader', () => {
        serviceRegistry.resourcesLoader = { r: 1 }
        expect(serviceRegistry.resourcesLoader).toEqual({ r: 1 })
    })

    it('alias getter/setter: seq', () => {
        serviceRegistry.seq = { s: 1 }
        expect(serviceRegistry.seq).toEqual({ s: 1 })
    })

    it('alias getter/setter: autoGenerate', () => {
        serviceRegistry.autoGenerate = { ag: 1 }
        expect(serviceRegistry.autoGenerate).toEqual({ ag: 1 })
    })

    it('alias getter/setter: autoAssign', () => {
        serviceRegistry.autoAssign = { aa: 1 }
        expect(serviceRegistry.autoAssign).toEqual({ aa: 1 })
    })

    it('alias getter/setter: wavExporter', () => {
        serviceRegistry.wavExporter = { w: 1 }
        expect(serviceRegistry.wavExporter).toEqual({ w: 1 })
    })

    it('all default keys are present', () => {
        const keys = Object.keys(ServiceRegistry.DEFAULTS)
        expect(keys).toContain('cmd')
        expect(keys).toContain('patterns')
        expect(keys).toContain('midiManager')
        expect(keys).toContain('resourcesLoader')
        expect(keys).toContain('seq')
        expect(keys).toContain('autoGenerate')
        expect(keys).toContain('autoAssign')
        expect(keys).toContain('wavExporter')
        expect(keys).toContain('audioCtx')
        expect(keys).toContain('audioEngine')
        expect(keys).toContain('transport')
        expect(keys).toContain('exportLoopsCount')
    })

    it('reset does not leak properties from previous state', () => {
        serviceRegistry.cmd = { a: 1 }
        serviceRegistry.reset()
        expect(serviceRegistry.cmd).toBeNull()
        expect(serviceRegistry).not.toHaveProperty('extraProp')
    })
})

describe('lazyService', () => {
    let serviceRegistry

    beforeEach(async () => {
        const mod = await import('../src/state/service_registry.js')
        serviceRegistry = mod.serviceRegistry
        serviceRegistry.reset()
    })

    it('getAutoAssignService creates instance once', async () => {
        const { getAutoAssignService } = await import('../src/state/service_registry.js')
        const s1 = await getAutoAssignService()
        expect(s1).toBeDefined()
        expect(serviceRegistry.autoAssign).toBe(s1)
    })

    it('getAutoGenerateService creates instance once', async () => {
        const { getAutoGenerateService } = await import('../src/state/service_registry.js')
        const s1 = await getAutoGenerateService()
        expect(s1).toBeDefined()
        expect(serviceRegistry.autoGenerate).toBe(s1)
    })

    it('lazyService reuses existing instance', async () => {
        const { getAutoAssignService } = await import('../src/state/service_registry.js')
        serviceRegistry.autoAssign = { reused: true }
        const s = await getAutoAssignService()
        expect(s).toEqual({ reused: true })
    })
})
