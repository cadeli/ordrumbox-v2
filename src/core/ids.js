// src/core/ids.js
//
// Stable identifiers. These live in `core` rather than `model/song_schema.js`
// because `core/idb.js` needs them for its migration and may not import the
// model layer (see the layer allow-lists in tests/module_graph.test.js).
// `model/song_schema.js` re-exports them so callers have one import site.

/**
 * Slugify a name into an id: lowercase, alphanumerics and dashes, no leading or
 * trailing dash. Returns '' when the name has nothing sluggable (e.g. "***"), so
 * the caller can fall back to a generated id.
 * @param {any} value
 * @returns {string}
 */
export function slugify(value) {
    return String(value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48)
}

/**
 * Return `candidate` if `taken` does not already contain it, else append the
 * smallest `-2`, `-3`… suffix that is free.
 * @param {string} candidate
 * @param {Set<string>} taken mutated with the returned id
 * @returns {string}
 */
export function uniqueId(candidate, taken) {
    const base = candidate || 'pattern'
    if (!taken.has(base)) {
        taken.add(base)
        return base
    }
    for (let n = 2; ; n++) {
        const id = `${base}-${n}`
        if (!taken.has(id)) {
            taken.add(id)
            return id
        }
    }
}

/**
 * Ensure a pattern carries a stable `id`.
 *
 * Only ever *fills in* a missing id: an existing one is left untouched even if
 * the pattern is renamed later. That immutability is what makes a saved
 * arrangement survive a rename, a delete, or an undo.
 * @param {{ id?: string, name?: string }} pattern
 * @param {Set<string>} taken ids already in use in this library
 * @returns {string} the pattern's id
 */
export function ensurePatternId(pattern, taken) {
    if (typeof pattern.id === 'string' && pattern.id.trim()) {
        const id = pattern.id.trim()
        taken.add(id)
        return id
    }
    const id = uniqueId(slugify(pattern.name), taken)
    pattern.id = id
    return id
}
