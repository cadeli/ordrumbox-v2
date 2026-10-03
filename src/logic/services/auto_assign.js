import { appState as _appState } from '../../state/app_state.js'
import { soundRegistry as soundRegistrySingleton } from '../../state/sound_registry.js'
import InstrumentsManager, { instrumentsManager } from './instrument_manager/index.js'
import Utils from '../../core/utils.js'
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
        if (Object.keys(this.#soundRegistry.sounds).length > 0) {
            const drumkitList = this.#soundRegistry.drumkitList
            const selectedIdx = this.#appState.selectedDrumkitIdx
            const kitName = drumkitList?.[selectedIdx]?.name ?? '?'
            logger.warn(TAG, `── Auto-assign: kit="${kitName}", pattern="${pattern?.name ?? '?'}" ──`)
            Utils.getTracksArray(pattern).forEach((track) => {
                if (track.useAutoAssignSound === true && track.useSoftSynth === false) {
                    this.autoAssignTrackSounds(track)
                }
            })
        }
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

        let soundId = this.getSoundIdFromKitAndTrackname(selectedDrumkitName, track.name)
        if (soundId !== NOT_FOUND) {
            const matchedKey = this.#soundRegistry.sounds[soundId]?.key
            const url = this.#soundRegistry.sounds[soundId]?.url
            const method = matchedKey === track.name ? `exact match` : `contains (key="${matchedKey}")`
            logger.warn(TAG, `  ${originalName} [${selectedDrumkitName}] => ${url}  (${method}, tier1: same kit)`)
            track.soundId = soundId
            return
        }

        soundId = this.getSoundIdFromTrackname(track.name)
        if (soundId !== NOT_FOUND) {
            const matchedKey = this.#soundRegistry.sounds[soundId]?.key
            const url = this.#soundRegistry.sounds[soundId]?.url
            const matchedKit = this.#soundRegistry.sounds[soundId]?.kit_name
            const method = matchedKey === track.name ? `exact match` : `contains (key="${matchedKey}")`
            logger.warn(
                TAG,
                `  ${originalName} [${selectedDrumkitName}] => ${url}  (${method}, tier2: other kit "${matchedKit}")`,
            )
            track.soundId = soundId
            return
        }

        const eqResult = this.findSoundEquivalence(soundId, selectedDrumkitName, track)
        if (eqResult !== NOT_FOUND) {
            const matchedKey = this.#soundRegistry.sounds[eqResult]?.key
            const url = this.#soundRegistry.sounds[eqResult]?.url
            const matchedKit = this.#soundRegistry.sounds[eqResult]?.kit_name
            const inSameKit = matchedKit === selectedDrumkitName
            logger.warn(
                TAG,
                `🟡 ${originalName} [${selectedDrumkitName}] => ${url}  (substitution to key="${matchedKey}", ${inSameKit ? 'same kit' : `other kit "${matchedKit}"`}, tier3)`,
            )
            track.soundId = eqResult
            return
        }

        soundId = Utils.getRandomKey(this.#soundRegistry.sounds)
        if (soundId !== null && soundId !== '' && soundId !== NOT_FOUND) {
            const url = this.#soundRegistry.sounds[soundId]?.url
            logger.warn(TAG, `🔴 ${originalName} [${selectedDrumkitName}] => ${url}  (random, tier4)`)
            track.soundId = soundId
        } else {
            logger.warn(TAG, `🔴 ${originalName} [${selectedDrumkitName}] => NOT_DEFINED  (no match)`)
            track.soundId = 'NOT_DEFINED'
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
                let candidateId = this.getSoundIdFromKitAndTrackname(selectedDrumkitName, targetKey)
                if (candidateId !== NOT_FOUND) {
                    return candidateId
                }
                candidateId = this.getSoundIdFromTrackname(targetKey)
                if (candidateId !== NOT_FOUND) {
                    return candidateId
                }

                // Try matching via instrument synonyms (e.g., RIMSHOT has "CL" which matches "CLAP")
                const targetInst = InstrumentsManager.DATA?.instruments?.find((i) => i.id === targetKey)
                if (targetInst?.name?.syn) {
                    for (const syn of targetInst.name.syn) {
                        // Use simple string synonyms (not regex patterns)
                        if (!syn.includes('.') && !syn.includes('*') && !syn.includes('^') && !syn.includes('$')) {
                            // Check if any sound key includes this synonym (reverse direction)
                            candidateId = this.getSoundIdByKeyContaining(selectedDrumkitName, syn)
                            if (candidateId !== NOT_FOUND) return candidateId
                            candidateId = this.getSoundIdByKeyContaining(null, syn)
                            if (candidateId !== NOT_FOUND) return candidateId
                        }
                    }
                }
            }
        }
        // no substitution matched: the caller keeps the sentinel and auto-assigns
        return notFoundId
    }

    getSoundIdByKeyContaining = (drumkitName, searchStr) => {
        const upperSearch = searchStr.toUpperCase().trim()
        if (!upperSearch) return NOT_FOUND
        for (const [key, value] of Object.entries(this.#soundRegistry.sounds)) {
            if (drumkitName && value.kit_name !== drumkitName) continue
            if (value.key?.toUpperCase().includes(upperSearch)) {
                return key
            }
        }
        return NOT_FOUND
    }

    getSoundIdFromKitAndTrackname = (drumkitName, trackName) => {
        let ret = NOT_FOUND
        for (const [key, value] of Object.entries(this.#soundRegistry.sounds)) {
            if (value.kit_name === drumkitName) {
                if (trackName.toUpperCase().trim().includes(value.key.toUpperCase().trim())) {
                    ret = key
                    return ret
                }
            }
        }
        return ret
    }

    getSoundIdFromTrackname = (trackName) => {
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
