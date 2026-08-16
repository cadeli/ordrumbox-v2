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
        expect(reg.mfCmd).toBeNull()
        expect(reg.mfPatterns).toBeNull()
        expect(reg.midiManager).toBeNull()
        expect(reg.mfResourcesLoader).toBeNull()
        expect(reg.mfSeq).toBeNull()
        expect(reg.mfAutoGenerate).toBeNull()
        expect(reg.mfAutoAssign).toBeNull()
        expect(reg.mfWavExporter).toBeNull()
        expect(reg.audioCtx).toBeNull()
        expect(reg.audioEngine).toBeNull()
        expect(reg.transport).toBeNull()
        expect(reg.exportLoopsCount).toBe(1)
    })

    it('reset restores defaults', () => {
        serviceRegistry.mfCmd = { mock: true }
        serviceRegistry.audioCtx = { mock: true }
        serviceRegistry.exportLoopsCount = 5
        serviceRegistry.reset()
        expect(serviceRegistry.mfCmd).toBeNull()
        expect(serviceRegistry.audioCtx).toBeNull()
        expect(serviceRegistry.exportLoopsCount).toBe(1)
    })

    it('alias getter/setter: cmd', () => {
        serviceRegistry.cmd = { test: 1 }
        expect(serviceRegistry.mfCmd).toEqual({ test: 1 })
        expect(serviceRegistry.cmd).toBe(serviceRegistry.mfCmd)
    })

    it('alias getter/setter: patterns', () => {
        serviceRegistry.patterns = { p: 1 }
        expect(serviceRegistry.mfPatterns).toEqual({ p: 1 })
    })

    it('alias getter/setter: resourcesLoader', () => {
        serviceRegistry.resourcesLoader = { r: 1 }
        expect(serviceRegistry.mfResourcesLoader).toEqual({ r: 1 })
    })

    it('alias getter/setter: seq', () => {
        serviceRegistry.seq = { s: 1 }
        expect(serviceRegistry.mfSeq).toEqual({ s: 1 })
    })

    it('alias getter/setter: autoGenerate', () => {
        serviceRegistry.autoGenerate = { ag: 1 }
        expect(serviceRegistry.mfAutoGenerate).toEqual({ ag: 1 })
    })

    it('alias getter/setter: autoAssign', () => {
        serviceRegistry.autoAssign = { aa: 1 }
        expect(serviceRegistry.mfAutoAssign).toEqual({ aa: 1 })
    })

    it('alias getter/setter: wavExporter', () => {
        serviceRegistry.wavExporter = { w: 1 }
        expect(serviceRegistry.mfWavExporter).toEqual({ w: 1 })
    })

    it('all default keys are present', () => {
        const keys = Object.keys(ServiceRegistry.DEFAULTS)
        expect(keys).toContain('mfCmd')
        expect(keys).toContain('mfPatterns')
        expect(keys).toContain('midiManager')
        expect(keys).toContain('mfResourcesLoader')
        expect(keys).toContain('mfSeq')
        expect(keys).toContain('mfAutoGenerate')
        expect(keys).toContain('mfAutoAssign')
        expect(keys).toContain('mfWavExporter')
        expect(keys).toContain('audioCtx')
        expect(keys).toContain('audioEngine')
        expect(keys).toContain('transport')
        expect(keys).toContain('exportLoopsCount')
    })

    it('reset does not leak properties from previous state', () => {
        serviceRegistry.mfCmd = { a: 1 }
        serviceRegistry.reset()
        expect(serviceRegistry.mfCmd).toBeNull()
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
        expect(serviceRegistry.mfAutoAssign).toBe(s1)
    })

    it('getAutoGenerateService creates instance once', async () => {
        const { getAutoGenerateService } = await import('../src/state/service_registry.js')
        const s1 = await getAutoGenerateService()
        expect(s1).toBeDefined()
        expect(serviceRegistry.mfAutoGenerate).toBe(s1)
    })

    it('lazyService reuses existing instance', async () => {
        const { getAutoAssignService } = await import('../src/state/service_registry.js')
        serviceRegistry.mfAutoAssign = { reused: true }
        const s = await getAutoAssignService()
        expect(s).toEqual({ reused: true })
    })
})
