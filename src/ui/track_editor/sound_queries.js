// src/ui/track_editor/sound_queries.js
// Pure sound queries over the editor's registries (drumkit list, sounds).
// Module functions (not section methods) so tests can call them directly
// without widening SoundSection's public surface.

/**
 * @param {import('../track_editor.js').default} editor
 * @returns {string} name of the selected drumkit, or '' when none
 */
export function getSelectedDrumkitName(editor) {
    return editor.soundRegistry.drumkitList[editor.appState.selectedDrumkitIdx]?.name ?? ''
}

/**
 * Every sample of every kit, copied and tagged with its kit name.
 *
 * The tag is a no-op now that entries carry `kitName` themselves — it used to be
 * the ONLY place kitName existed, which is why reading it off a raw entry gave
 * undefined and the sound section showed no kit at all.
 *
 * @param {import('../track_editor.js').default} editor
 * @returns {Array<import('../../state/sound_registry.js').SoundEntry>}
 */
export function getAllKitSamples(editor) {
    return editor.soundRegistry.drumkitList.flatMap((kit) =>
        kit.instruments.map((s) => ({ ...s, kitName: s.kitName ?? kit.name })),
    )
}

/**
 * Selected kit first, then by kit name, then by display name.
 * @param {import('../track_editor.js').default} editor
 * @param {Array<import('../../state/sound_registry.js').SoundEntry>} samples
 * @returns {Array<import('../../state/sound_registry.js').SoundEntry>} new sorted array
 */
export function sortSamplesForCurrentKit(editor, samples) {
    const selectedKitName = getSelectedDrumkitName(editor)
    return [...samples].sort((a, b) => {
        const aSelected = a.kitName === selectedKitName ? 0 : 1
        const bSelected = b.kitName === selectedKitName ? 0 : 1
        if (aSelected !== bSelected) return aSelected - bSelected
        const kitCompare = String(a.kitName ?? '').localeCompare(String(b.kitName ?? ''))
        if (kitCompare !== 0) return kitCompare
        const sortKeyA = a.display_name ?? a.url ?? ''
        const sortKeyB = b.display_name ?? b.url ?? ''
        return sortKeyA.localeCompare(sortKeyB)
    })
}

/**
 * @param {import('../track_editor.js').default} editor
 * @param {string} instrumentId
 * @returns {Array<import('../../state/sound_registry.js').SoundEntry>} sorted samples of that instrument
 */
export function getSamplesForInstrument(editor, instrumentId) {
    return sortSamplesForCurrentKit(
        editor,
        getAllKitSamples(editor).filter((s) => s.key === instrumentId),
    )
}

/**
 * @param {import('../track_editor.js').default} editor
 * @param {string} instrumentId
 * @returns {import('../../state/sound_registry.js').SoundEntry|null} first sample of that instrument, or null
 */
export function getPreferredSampleForInstrument(editor, instrumentId) {
    return getSamplesForInstrument(editor, instrumentId)[0] ?? null
}

/**
 * @param {import('../track_editor.js').default} editor
 * @returns {string} resolved sound URL (falls back to the raw sound id)
 */
export function getCurrentSoundUrl(editor) {
    const track = editor.track
    const soundId = track.soundId ?? ''
    return editor.soundRegistry.sounds[soundId]?.url ?? soundId
}

/**
 * Instrument id of the current sound, or the track name, or the first id.
 * @param {import('../track_editor.js').default} editor
 * @param {Array<string>} instrumentIds
 * @param {Set<string>} keysWithSamples
 * @returns {string} the instrument ID (e.g. 'KICK'), NOT a display name
 */
export function getCurrentInstrumentId(editor, instrumentIds, keysWithSamples) {
    const track = editor.track
    const sr = editor.soundRegistry
    const soundKey = sr.sounds[getCurrentSoundUrl(editor)]?.key
    if (soundKey && keysWithSamples.has(soundKey)) return soundKey
    if (keysWithSamples.has(track.name)) return track.name
    return instrumentIds[0] ?? 'KICK'
}
