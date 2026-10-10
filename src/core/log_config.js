import { logger } from './logger.js'

/**
 * Reads the `?log=` query parameter and opens the listed tags to a level, so an
 * informational tag can be watched from the first boot without touching the
 * global level (which stays WARN).
 *
 * Format: `?log=AutoAssign:info,MidiImport:debug` — the `:level` part is
 * optional and defaults to `info`.
 *
 * @param {string} [search] - a query string, defaults to the current URL
 */
export function applyLogSearchParams(search = globalThis.location?.search ?? '') {
    const raw = new URLSearchParams(search).get('log')
    if (!raw) return
    raw.split(',').forEach((entry) => {
        const [rawTag, rawLevel] = entry.split(':')
        const tag = rawTag?.trim()
        if (!tag) return
        logger.setTagLevel(tag, rawLevel?.trim() || 'info')
    })
}

/**
 * Exposes the logger as `window.logger` in dev builds, to open a tag from the
 * browser console (`window.logger.setTagLevel('AutoAssign', 'info')`).
 * Production builds keep it private.
 */
export function exposeLoggerOnWindow() {
    if (!import.meta.env?.DEV) return
    if (typeof window === 'undefined') return
    const win = /** @type {Window & { logger?: typeof logger }} */ (window)
    win.logger = logger
}
