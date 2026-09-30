// src/ui/track_editor/sound_queries.js
// Pure sound queries over the editor's registries (drumkit list, sounds).
// Module functions (not section methods) so tests can call them directly
// without widening SoundSection's public surface.

/**
 * @param {import('./track_editor.js').default} editor
 * @returns {string} name of the selected drumkit, or '' when none
 */
export function getSelectedDrumkitName(editor) {
    return editor.soundRegistry.drumkitList[editor.appState.selectedDrumkitIdx]?.name ?? ''
}

/**
 * @param {import('./track_editor.js').default} editor
 * @returns {Array<object>} every sample of every kit, tagged with kitName
 */
export function getAllKitSamples(editor) {
    return editor.soundRegistry.drumkitList.flatMap((kit) => kit.instruments.map((s) => ({ ...s, kitName: kit.name })))
}

/**
 * Selected kit first, then by kit name, then by display name.
 * @param {import('./track_editor.js').default} editor
 * @param {Array<object>} samples
 * @returns {Array<object>} new sorted array
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
 * @param {import('./track_editor.js').default} editor
 * @param {string} instrumentId
 * @returns {Array<object>} sorted samples of that instrument
 */
export function getSamplesForInstrument(editor, instrumentId) {
    return sortSamplesForCurrentKit(
        editor,
        getAllKitSamples(editor).filter((s) => s.key === instrumentId),
    )
}

/**
 * @param {import('./track_editor.js').default} editor
 * @param {string} instrumentId
 * @returns {object|null} first sample of that instrument, or null
 */
export function getPreferredSampleForInstrument(editor, instrumentId) {
    return getSamplesForInstrument(editor, instrumentId)[0] ?? null
}

/**
 * @param {import('./track_editor.js').default} editor
 * @returns {string} resolved sound URL (falls back to the raw sound id)
 */
export function getCurrentSoundUrl(editor) {
    const track = editor.track
    const soundId = track.soundId ?? ''
    return editor.soundRegistry.sounds[soundId]?.url ?? soundId
}

/**
 * Instrument id of the current sound, or the track name, or the first id.
 * @param {import('./track_editor.js').default} editor
 * @param {Array<string>} instrumentIds
 * @param {Set<string>} keysWithSamples
 * @returns {string}
 */
export function getCurrentInstrumentName(editor, instrumentIds, keysWithSamples) {
    const track = editor.track
    const sr = editor.soundRegistry
    const soundKey = sr.sounds[getCurrentSoundUrl(editor)]?.key
    if (soundKey && keysWithSamples.has(soundKey)) return soundKey
    if (keysWithSamples.has(track.name)) return track.name
    return instrumentIds[0] ?? 'KICK'
}
