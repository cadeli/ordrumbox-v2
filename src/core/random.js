/**
 * Random picks — the single place `list[Math.floor(Math.random() * list.length)]`
 * is written. Range draws (`Math.floor(Math.random() * N) + min`) are NOT here:
 * they pick a number, not a member of a collection.
 */

/**
 * One item of a list, chosen uniformly at random.
 *
 * @template T
 * @param {readonly T[]|null|undefined} list
 * @returns {T|null} an item of the list, null when the list is empty
 */
export function pickRandom(list) {
    if (!list || list.length === 0) return null
    return list[Math.floor(Math.random() * list.length)]
}

/**
 * One key of an object, chosen uniformly at random (a scale, a palette, a map
 * of presets…).
 *
 * @param {object} obj
 * @returns {string|null} a key of `obj`, null when the object has no key
 */
export function pickRandomKey(obj) {
    return pickRandom(Object.keys(obj ?? {}))
}
