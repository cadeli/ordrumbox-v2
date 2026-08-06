const LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 }

let currentLevel = LEVELS.WARN
let isEnabled = true
const suppressedTags = new Set()

const levelName = (lvl) => Object.keys(LEVELS).find(k => LEVELS[k] === lvl) ?? '?'

function log(lvl, tag, ...args) {
    if (!isEnabled || lvl < currentLevel) return
    if (suppressedTags.has(tag)) return
    const method = lvl <= LEVELS.INFO ? 'log' : (lvl === LEVELS.WARN ? 'warn' : 'error')
    console[method](`[${levelName(lvl)}:${tag}]`, ...args)
}

export const logger = {
    LEVELS,
    setLevel: (lvl) => { currentLevel = lvl },
    setEnabled: (v) => { isEnabled = v },
    suppressTags: (tags) => { tags.forEach(t => suppressedTags.add(t)) },
    allowTags: (tags) => { tags.forEach(t => suppressedTags.delete(t)) },
    debug: (tag, ...args) => log(LEVELS.DEBUG, tag, ...args),
    info: (tag, ...args) => log(LEVELS.INFO, tag, ...args),
    warn: (tag, ...args) => log(LEVELS.WARN, tag, ...args),
    error: (tag, ...args) => log(LEVELS.ERROR, tag, ...args),
}

/**
 * Returns `value` if not nullish, otherwise logs a warning and returns `fallback`.
 * @template T
 * @param {T | null | undefined} value
 * @param {T} fallback
 * @param {string} tag   – logger tag (e.g. 'AudioEngine')
 * @param {string} msg   – warning message
 * @returns {T}
 */
export function nameOr(value, fallback, tag, msg) {
    if (value != null) return value
    logger.warn(tag, msg)
    return fallback
}
