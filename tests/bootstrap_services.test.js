import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { serviceRegistry } from '../src/state/service_registry.js'

describe('bootstrap/services', () => {
    beforeEach(() => {
        serviceRegistry.reset()
        vi.clearAllMocks()
    })

    afterEach(() => {
        serviceRegistry.reset()
    })

    it('assigns core services on the registry', async () => {
        await import('../src/bootstrap/services.js')

        expect(serviceRegistry.cmd).toBeTruthy()
        expect(typeof serviceRegistry.cmd.setSelectedPatternNum).toBe('function')
        expect(serviceRegistry.resourcesLoader).toBeTruthy()
        expect(typeof serviceRegistry.resourcesLoader.loadSong).toBe('function')
        expect(serviceRegistry.seq).toBeTruthy()
        expect(typeof serviceRegistry.seq.toggleStartStop).toBe('function')
        expect(serviceRegistry.patterns).toBeTruthy()
        expect(typeof serviceRegistry.patterns.applyFlatNotes).toBe('function')
        expect(serviceRegistry.history).toBeTruthy()
    })

    it('is idempotent on re-import (module cache)', async () => {
        await import('../src/bootstrap/services.js')
        const cmd = serviceRegistry.cmd
        await import('../src/bootstrap/services.js')
        expect(serviceRegistry.cmd).toBe(cmd)
    })
})
