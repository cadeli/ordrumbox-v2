const LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 }

let currentLevel = LEVELS.WARN
let isEnabled = true
const suppressedTags = new Set()
const tagLevels = new Map()

const levelName = (lvl) => Object.keys(LEVELS).find((k) => LEVELS[k] === lvl) ?? '?'

/**
 * Normalizes a level given either as a LEVELS value or as its name
 * ('debug' | 'info' | 'warn' | 'error', case-insensitive).
 * @param {string|number} lvl
 * @returns {number|null} null when the value is not a known level
 */
function toLevel(lvl) {
    if (typeof lvl === 'number') return lvl
    const name = String(lvl).trim().toUpperCase()
    return Object.prototype.hasOwnProperty.call(LEVELS, name) ? LEVELS[name] : null
}

function log(lvl, tag, ...args) {
    if (!isEnabled || lvl < (tagLevels.get(tag) ?? currentLevel)) return
    if (suppressedTags.has(tag)) return
    const method = lvl <= LEVELS.INFO ? 'log' : lvl === LEVELS.WARN ? 'warn' : 'error'
    console[method](`[${levelName(lvl)}:${tag}]`, ...args)
}

export const logger = {
    LEVELS,
    setLevel: (lvl) => {
        const level = toLevel(lvl)
        if (level !== null) currentLevel = level
    },
    setEnabled: (v) => {
        isEnabled = v
    },
    suppressTags: (tags) => {
        tags.forEach((t) => suppressedTags.add(t))
    },
    allowTags: (tags) => {
        tags.forEach((t) => suppressedTags.delete(t))
    },
    /**
     * Opens one tag to `lvl` without touching the global level, so an
     * informational tag stays visible while the rest of the console stays quiet.
     * @param {string} tag
     * @param {string|number} lvl - 'debug' | 'info' | 'warn' | 'error' or a LEVELS value
     */
    setTagLevel: (tag, lvl) => {
        const level = toLevel(lvl)
        if (level !== null) tagLevels.set(tag, level)
    },
    clearTagLevel: (tag) => {
        tagLevels.delete(tag)
    },
    clearTagLevels: () => {
        tagLevels.clear()
    },
    /** @returns {Record<string, number>} tag -> level, for tags opened above the global level */
    getTagLevels: () => Object.fromEntries(tagLevels),
    /**
     * Whether a message would be printed — to skip building it when muted.
     * @param {string} tag
     * @param {string|number} lvl
     * @returns {boolean}
     */
    wouldLog: (tag, lvl) => {
        const level = toLevel(lvl)
        if (level === null || !isEnabled || suppressedTags.has(tag)) return false
        return level >= (tagLevels.get(tag) ?? currentLevel)
    },
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
 * @param {string} tag   - logger tag (e.g. 'Engine')
 * @param {string} msg   - warning message
 * @returns {T}
 */
export function valueOrFallback(value, fallback, tag, msg) {
    if (value != null) return value
    logger.warn(tag, msg)
    return fallback
}
