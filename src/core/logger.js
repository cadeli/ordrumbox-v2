const LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 }

let currentLevel = LEVELS.WARN
let isEnabled = true

const levelName = (lvl) => Object.keys(LEVELS).find(k => LEVELS[k] === lvl) ?? '?'

function log(lvl, tag, ...args) {
    if (!isEnabled || lvl < currentLevel) return
    const method = lvl <= LEVELS.INFO ? 'log' : (lvl === LEVELS.WARN ? 'warn' : 'error')
    console[method](`[${levelName(lvl)}:${tag}]`, ...args)
}

export const logger = {
    setLevel: (lvl) => { currentLevel = lvl },
    setEnabled: (v) => { isEnabled = v },
    debug: (tag, ...args) => log(LEVELS.DEBUG, tag, ...args),
    info: (tag, ...args) => log(LEVELS.INFO, tag, ...args),
    warn: (tag, ...args) => log(LEVELS.WARN, tag, ...args),
    error: (tag, ...args) => log(LEVELS.ERROR, tag, ...args),
}
