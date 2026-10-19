// src/core/legacy_keys.js
//
// Legacy key compatibility has been dropped: persisted and file data is expected
// to use the current spellings only. The functions below are kept as no-ops for
// callers that still reference them.

/** @returns {boolean} */
export function migrateLegacyTrackKeys(_track) {
    return false
}

/** @returns {boolean} */
export function migrateLegacyClipKeys(_clip) {
    return false
}

/** @returns {boolean} */
export function migrateLegacySongKeys(_song) {
    return false
}
