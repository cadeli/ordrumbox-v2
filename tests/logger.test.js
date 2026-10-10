/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { logger } from '../src/core/logger.js'
import { applyLogSearchParams, exposeLoggerOnWindow } from '../src/core/log_config.js'

describe('logger levels', () => {
    let logSpy
    let warnSpy

    beforeEach(() => {
        logger.setLevel(logger.LEVELS.WARN)
        logger.clearTagLevels()
        logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
        warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    })

    afterEach(() => {
        vi.restoreAllMocks()
        logger.clearTagLevels()
        logger.setLevel(logger.LEVELS.ERROR) // default set by tests/setup.js
    })

    it('keeps info and debug silent at the default WARN level', () => {
        logger.debug('X', 'debug')
        logger.info('X', 'info')
        expect(logSpy).not.toHaveBeenCalled()

        logger.warn('X', 'warn')
        expect(warnSpy).toHaveBeenCalledWith('[WARN:X]', 'warn')
    })

    it('opens one tag to info without lowering the global level', () => {
        logger.setTagLevel('AutoAssign', 'info')

        logger.info('AutoAssign', 'report')
        logger.info('Other', 'hidden')
        expect(logSpy).toHaveBeenCalledTimes(1)
        expect(logSpy).toHaveBeenCalledWith('[INFO:AutoAssign]', 'report')

        logger.debug('AutoAssign', 'still hidden')
        expect(logSpy).toHaveBeenCalledTimes(1)

        logger.warn('Other', 'still a warning')
        expect(warnSpy).toHaveBeenCalledWith('[WARN:Other]', 'still a warning')
    })

    it('accepts a numeric level and level names in any case', () => {
        logger.setTagLevel('A', logger.LEVELS.DEBUG)
        logger.setTagLevel('B', 'debug')

        logger.debug('A', 'a')
        logger.debug('B', 'b')
        expect(logSpy).toHaveBeenCalledTimes(2)
    })

    it('ignores unknown level names', () => {
        logger.setTagLevel('A', 'loud')
        expect(logger.getTagLevels()).toEqual({})

        logger.info('A', 'hidden')
        expect(logSpy).not.toHaveBeenCalled()
    })

    it('wouldLog tells whether a message is worth building', () => {
        expect(logger.wouldLog('X', logger.LEVELS.WARN)).toBe(true)
        expect(logger.wouldLog('X', logger.LEVELS.INFO)).toBe(false)

        logger.setTagLevel('X', 'info')
        expect(logger.wouldLog('X', 'info')).toBe(true)
        expect(logger.wouldLog('X', 'debug')).toBe(false)
        expect(logger.wouldLog('Y', 'info')).toBe(false)
        expect(logger.wouldLog('X', 'loud')).toBe(false)
    })

    it('falls back to the global level once the tag is cleared', () => {
        logger.setTagLevel('A', 'debug')
        logger.clearTagLevel('A')
        logger.debug('A', 'hidden')

        logger.setTagLevel('A', 'debug')
        logger.setTagLevel('B', 'debug')
        logger.clearTagLevels()
        logger.debug('A', 'hidden too')

        expect(logSpy).not.toHaveBeenCalled()
        expect(logger.getTagLevels()).toEqual({})
    })
})

describe('log config', () => {
    afterEach(() => {
        logger.clearTagLevels()
        logger.setLevel(logger.LEVELS.ERROR)
        delete /** @type {any} */ (window).logger
    })

    it('reads ?log= with and without an explicit level', () => {
        applyLogSearchParams('?log=AutoAssign:info,MidiImport:debug,Sound')

        expect(logger.getTagLevels()).toEqual({
            AutoAssign: logger.LEVELS.INFO,
            MidiImport: logger.LEVELS.DEBUG,
            Sound: logger.LEVELS.INFO,
        })
    })

    it('does nothing when the URL carries no log param', () => {
        applyLogSearchParams('?foo=1')
        applyLogSearchParams('')
        expect(logger.getTagLevels()).toEqual({})
    })

    it('exposes the logger as window.logger in dev builds', () => {
        exposeLoggerOnWindow()
        expect(/** @type {any} */ (window).logger).toBe(logger)
    })
})
