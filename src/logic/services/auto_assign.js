import { appState as _appState } from '../../state/app_state.js'
import { soundRegistry as soundRegistrySingleton } from '../../state/sound_registry.js'
import InstrumentsManager, { instrumentsManager } from './instrument_manager/index.js'
import { getRandomKey } from '../../core/notes.js'
import { getTracksArray } from '../../core/tracks.js'
import { NOT_FOUND } from '../../core/constants.js'
import { logger } from '../../core/logger.js'

const TAG = 'AutoAssign'

export default class AutoAssign {
    static TAG = TAG
    static NOT_FOUND = NOT_FOUND

    #appState
    #soundRegistry

    /**
     * @param {object} [deps]
     * @param {any} [deps.appState]
     * @param {any} [deps.soundRegistry]
     */
    constructor({ appState, soundRegistry } = {}) {
        this.#appState = appState ?? _appState
        this.#soundRegistry = soundRegistry ?? soundRegistrySingleton
    }

    autoAssignSounds = (pattern) => {
        const tracks = getTracksArray(pattern)

        // Soft-synth tracks first, and independently of the drumkits: a track with
        // useSoftSynth and no synthSoundKey used to be left alone here, and
        // VoiceFactory then reported "no synth preset assigned" on EVERY note of it
        // (a silent track plus a toast per note).
        tracks.forEach((track) => {
            if (track.useSoftSynth === true) this.assignSynthPatch(track)
        })

        if (Object.keys(this.#soundRegistry.sounds).length > 0) {
            const drumkitList = this.#soundRegistry.drumkitList
            const selectedIdx = this.#appState.selectedDrumkitIdx
            const kitName = drumkitList?.[selectedIdx]?.name ?? '?'
            logger.warn(TAG, `── Auto-assign: kit="${kitName}", pattern="${pattern?.name ?? '?'}" ──`)
            tracks.forEach((track) => {
                if (track.useAutoAssignSound === true && track.useSoftSynth === false) {
                    this.autoAssignTrackSounds(track)
                }
            })
        }
    }

    /**
     * Gives a soft-synth track a preset to play.
     *
     * Keeps the patch the track already has as long as it exists in the registry
     * (so an explicit choice is never overwritten), and otherwise picks one AT
     * RANDOM — the same last resort the drum path uses when nothing matches.
     *
     * @param {any} track
     * @returns {string|null} the patch key the track ends up with
     */
    assignSynthPatch = (track) => {
        const generated = this.#soundRegistry.generatedSounds ?? {}
        const keys = Object.keys(generated)
        if (keys.length === 0) {
            logger.warn(TAG, `  ${track.name}: no synth preset loaded, soft-synth track left unassigned`)
            return null
        }
        if (track.synthSoundKey && generated[track.synthSoundKey]) return track.synthSoundKey

        const picked = getRandomKey(generated)
        const why = track.synthSoundKey ? `stale "${track.synthSoundKey}"` : 'none'
        track.synthSoundKey = picked
        logger.warn(TAG, `  ${track.name}: synth preset ${why} → ${picked} (random)`)
        return picked
    }

    autoAssignTrackSounds = (track) => {
        const originalName = track.name

        const validInstrumentIds = InstrumentsManager.DATA?.instruments?.map((i) => i.id) ?? []
        if (!validInstrumentIds.includes(track.name)) {
            const foundInstrument = instrumentsManager.findInstrumentFromFileName(track.name)
            const newName = foundInstrument?.id
            if (newName && validInstrumentIds.includes(newName)) {
                logger.warn(TAG, `  renamed "${originalName}" → "${newName}" (findInstrumentFromFileName)`)
                track.name = newName
            }
        }

        const drumkitList = this.#soundRegistry.drumkitList
        const selectedIdx = this.#appState.selectedDrumkitIdx
        if (!drumkitList || drumkitList.length <= selectedIdx) return

        const selectedDrumkitName = drumkitList[selectedIdx].name

        let sampleId = this.getSampleIdFromKitAndTrackname(selectedDrumkitName, track.name)
        if (sampleId !== NOT_FOUND) {
            const matchedKey = this.#soundRegistry.sounds[sampleId]?.key
            const url = this.#soundRegistry.sounds[sampleId]?.url
            const method = matchedKey === track.name ? `exact match` : `contains (key="${matchedKey}")`
            logger.warn(TAG, `  ${originalName} [${selectedDrumkitName}] => ${url}  (${method}, tier1: same kit)`)
            track.sampleId = sampleId
            return
        }

        sampleId = this.getSampleIdFromTrackname(track.name)
        if (sampleId !== NOT_FOUND) {
            const matchedKey = this.#soundRegistry.sounds[sampleId]?.key
            const url = this.#soundRegistry.sounds[sampleId]?.url
            const matchedKit = this.#soundRegistry.sounds[sampleId]?.kitName
            const method = matchedKey === track.name ? `exact match` : `contains (key="${matchedKey}")`
            logger.warn(
                TAG,
                `  ${originalName} [${selectedDrumkitName}] => ${url}  (${method}, tier2: other kit "${matchedKit}")`,
            )
            track.sampleId = sampleId
            return
        }

        const eqResult = this.findSoundEquivalence(sampleId, selectedDrumkitName, track)
        if (eqResult !== NOT_FOUND) {
            const matchedKey = this.#soundRegistry.sounds[eqResult]?.key
            const url = this.#soundRegistry.sounds[eqResult]?.url
            const matchedKit = this.#soundRegistry.sounds[eqResult]?.kitName
            const inSameKit = matchedKit === selectedDrumkitName
            logger.warn(
                TAG,
                `🟡 ${originalName} [${selectedDrumkitName}] => ${url}  (substitution to key="${matchedKey}", ${inSameKit ? 'same kit' : `other kit "${matchedKit}"`}, tier3)`,
            )
            track.sampleId = eqResult
            return
        }

        sampleId = getRandomKey(this.#soundRegistry.sounds)
        if (sampleId !== null && sampleId !== '' && sampleId !== NOT_FOUND) {
            const url = this.#soundRegistry.sounds[sampleId]?.url
            logger.warn(TAG, `🔴 ${originalName} [${selectedDrumkitName}] => ${url}  (random, tier4)`)
            track.sampleId = sampleId
        } else {
            logger.warn(TAG, `🔴 ${originalName} [${selectedDrumkitName}] => NOT_DEFINED  (no match)`)
            track.sampleId = 'NOT_DEFINED'
        }
    }

    /**
     * Resolve the instrument's substitution chain.
     * @param {string} notFoundId always the NOT_FOUND sentinel: the caller only
     *   calls this when it has no sound, so the parameter is the sentinel itself
     */
    findSoundEquivalence = (notFoundId, selectedDrumkitName, track) => {
        if (notFoundId !== NOT_FOUND) return notFoundId

        const instData = InstrumentsManager.DATA?.instruments?.find((i) => i.id === track.name)
        const replacements = instData?.subst ? Object.values(instData.subst) : null

        if (replacements) {
            for (const targetKey of replacements) {
                let candidateId = this.getSampleIdFromKitAndTrackname(selectedDrumkitName, targetKey)
                if (candidateId !== NOT_FOUND) {
                    return candidateId
                }
                candidateId = this.getSampleIdFromTrackname(targetKey)
                if (candidateId !== NOT_FOUND) {
                    return candidateId
                }

                // Try matching via instrument synonyms (e.g., RIMSHOT has "CL" which matches "CLAP")
                const targetInst = InstrumentsManager.DATA?.instruments?.find((i) => i.id === targetKey)
                if (targetInst?.synonyms?.length) {
                    for (const syn of targetInst.synonyms) {
                        // Use simple string synonyms (not regex patterns)
                        if (!syn.includes('.') && !syn.includes('*') && !syn.includes('^') && !syn.includes('$')) {
                            // Check if any sound key includes this synonym (reverse direction)
                            candidateId = this.getSampleIdByKeyContaining(selectedDrumkitName, syn)
                            if (candidateId !== NOT_FOUND) return candidateId
                            candidateId = this.getSampleIdByKeyContaining(null, syn)
                            if (candidateId !== NOT_FOUND) return candidateId
                        }
                    }
                }
            }
        }
        // no substitution matched: the caller keeps the sentinel and auto-assigns
        return notFoundId
    }

    getSampleIdByKeyContaining = (drumkitName, searchStr) => {
        const upperSearch = searchStr.toUpperCase().trim()
        if (!upperSearch) return NOT_FOUND
        for (const [key, value] of Object.entries(this.#soundRegistry.sounds)) {
            if (drumkitName && value.kitName !== drumkitName) continue
            if (value.key?.toUpperCase().includes(upperSearch)) {
                return key
            }
        }
        return NOT_FOUND
    }

    getSampleIdFromKitAndTrackname = (drumkitName, trackName) => {
        let ret = NOT_FOUND
        for (const [key, value] of Object.entries(this.#soundRegistry.sounds)) {
            if (value.kitName === drumkitName) {
                if (trackName.toUpperCase().trim().includes(value.key.toUpperCase().trim())) {
                    ret = key
                    return ret
                }
            }
        }
        return ret
    }

    getSampleIdFromTrackname = (trackName) => {
        let ret = NOT_FOUND
        for (const [key, sound] of Object.entries(this.#soundRegistry.sounds)) {
            if (trackName.toUpperCase().trim().includes(sound.key.toUpperCase().trim())) {
                ret = key
                return ret
            }
        }
        return ret
    }
}
