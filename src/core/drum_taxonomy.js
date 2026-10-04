/**
 * The drum taxonomy: one row per instrument, saying where it sits in the stereo
 * field and which coarse type it belongs to.
 *
 * These used to be three independent vocabularies — TRACK_NAME_TO_INDEX
 * (names), DRUM_TYPES (types) and detectTrackType() (substring rules) — so
 * "CHH" was index 5 for panning but type HAT everywhere else, and nothing in
 * the code said so. Both readers now come from TRACK_KINDS.
 */

/** name → pan slot + coarse type. */
export const TRACK_KINDS = {
    KICK: { panIndex: 0, type: 'KICK' },
    SNARE: { panIndex: 1, type: 'SNARE' },
    TOM: { panIndex: 2, type: 'PERC' },
    CLAP: { panIndex: 3, type: 'CLAP' },
    COWBELL: { panIndex: 4, type: 'COWBELL' },
    CHH: { panIndex: 5, type: 'HAT' },
    OHH: { panIndex: 6, type: 'HAT' },
    CRASH: { panIndex: 7, type: 'PERC' },
}

/** pan slot → stereo position. */
export const PAN_MAP = [0, 0.3, 0.5, -0.4, 0.4, -0.3, -0.2, 1]

/** Coarse types a track can belong to (everything but the melodic ones). */
export const DRUM_TYPES = new Set(['KICK', 'SNARE', 'HAT', 'CLAP', 'COWBELL', 'PERC'])

/** Track types treated as melodic (auto-generate + empty-track pruning). */
export const MELODIC_TYPES = new Set(['BASS', 'PIANO', 'ORGAN'])

/** name → pan slot, derived from TRACK_KINDS. */
export const TRACK_NAME_TO_INDEX = Object.fromEntries(
    Object.entries(TRACK_KINDS).map(([name, kind]) => [name, kind.panIndex]),
)

/**
 * @param {number} trackTypeIndex - a TRACK_NAME_TO_INDEX slot
 * @returns {number} stereo position, 0 when the slot is unknown
 */
export function computeTrackPan(trackTypeIndex) {
    return PAN_MAP[trackTypeIndex] ?? 0
}

/**
 * Default pan of a track, from its NAME ("KICK", "OHH", …).
 *
 * @param {string} trackName - a track name, NOT a detectTrackType() result
 * @returns {number} stereo position, 0 when the name is not in the table
 */
export function getPanFromTrackName(trackName) {
    const idx = TRACK_NAME_TO_INDEX[trackName]
    return idx !== undefined ? computeTrackPan(idx) : 0
}

/**
 * Coarse type of a track. The TRACK_KINDS table answers for the canonical
 * names; anything else ("808 KICK", "SYNTH BASS") goes through the substring
 * rules below, which is why this cannot be a plain lookup.
 *
 * @param {string} name
 * @returns {string}
 */
export function detectTrackType(name) {
    const n = name.toUpperCase()
    const exact = TRACK_KINDS[n]
    if (exact) return exact.type
    if (n.includes('KICK') || n.includes('BD')) return 'KICK'
    if (n.includes('SNARE') || n.includes('SD')) return 'SNARE'
    if (n.includes('OHH') || n.includes('HAT') || n.includes('CHH')) return 'HAT'
    if (n.includes('CLAP') || n.includes('CLP') || n.includes('CP')) return 'CLAP'
    if (n.includes('BASS')) return 'BASS'
    if (n.includes('PIANO')) return 'PIANO'
    if (n.includes('COWBELL') || n.includes('COW')) return 'COWBELL'
    if (n.includes('ORGAN')) return 'ORGAN'
    if (n.includes('SYNTH')) return 'BASS'
    return 'PERC'
}

/**
 * @param {{name?: string}} track
 * @returns {boolean} true for BASS, PIANO and ORGAN
 */
export function isMelodicTrack(track) {
    return MELODIC_TYPES.has(detectTrackType(track?.name))
}
