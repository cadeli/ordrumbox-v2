import { appState as _appState } from '../../state/app_state.js'
import { soundRegistry as _soundRegistry } from '../../state/sound_registry.js'
import InstrumentsManager from './instruments_manager.js'
import Utils from '../../core/utils.js'
import { NOT_FOUND } from '../../core/constants.js'
import { logger } from '../../core/logger.js'

const TAG = 'MFAUTOASSIGN'

export default class MfAutoAssign {
    static TAG = TAG
    static NOT_FOUND = NOT_FOUND
    constructor({ appState, soundRegistry } = {}) {
        this._appState = appState ?? _appState
        this._soundRegistry = soundRegistry ?? _soundRegistry
    }

    autoAssignSounds = (pattern) => {
        if (Object.keys(this._soundRegistry.sounds).length > 0) {
            const drumkitList = this._soundRegistry.drumkitList
            const selectedIdx = this._appState.selectedDrumkitNum
            const kitName = drumkitList?.[selectedIdx]?.name ?? '?'
            logger.warn(TAG, `── Auto-assign: kit="${kitName}", pattern="${pattern?.name ?? '?'}" ──`)
            Utils.getTracksArray(pattern).forEach((track, indexTrack) => {
                if (track.useAutoAssignSound === true && track.useSoftSynth === false) {
                    this.autoAssignTrackSounds(track, indexTrack)
                }
            })
        }
    }

    autoAssignTrackSounds = (track) => {
        const originalName = track.name

        const validInstrumentIds = InstrumentsManager.DATA?.instruments?.map(i => i.id) ?? []
        if (!validInstrumentIds.includes(track.name)) {
            const instrumentsManager = new InstrumentsManager()
            const foundInstrument = instrumentsManager.findInstrumentFromFileName(track.name)
            const newName = foundInstrument?.id
            if (newName && validInstrumentIds.includes(newName)) {
                logger.warn(TAG, `  renomme "${originalName}" → "${newName}" (findInstrumentFromFileName)`)
                track.name = newName
            } 
        }
        
        const drumkitList = this._soundRegistry.drumkitList
        const selectedIdx = this._appState.selectedDrumkitNum
        if (!drumkitList || drumkitList.length <= selectedIdx) return

        const selDrumkitName = drumkitList[selectedIdx].name
        
        let soundId = this.getSoundIdFromKitAndTrackname(selDrumkitName, track.name)
        if (soundId !== NOT_FOUND) {
            const matchedKey = this._soundRegistry.sounds[soundId]?.key
            const url = this._soundRegistry.sounds[soundId]?.url
            const method = matchedKey === track.name
                ? `nom exact`
                : `contains (key="${matchedKey}")`
            logger.warn(TAG, `  ${originalName} [${selDrumkitName}] => ${url}  (${method}, tier1: même kit)`)
            track.soundId = soundId
            return
        }

        soundId = this.getSoundIdFromTrackname(track.name)
        if (soundId !== NOT_FOUND) {
            const matchedKey = this._soundRegistry.sounds[soundId]?.key
            const url = this._soundRegistry.sounds[soundId]?.url
            const matchedKit = this._soundRegistry.sounds[soundId]?.kit_name
            const method = matchedKey === track.name
                ? `nom exact`
                : `contains (key="${matchedKey}")`
            logger.warn(TAG, `  ${originalName} [${selDrumkitName}] => ${url}  (${method}, tier2: autre kit "${matchedKit}")`)
            track.soundId = soundId
            return
        }

        const eqResult = this.findSoundEquivalence(soundId, selDrumkitName, track)
        if (eqResult !== NOT_FOUND) {
            const matchedKey = this._soundRegistry.sounds[eqResult]?.key
            const url = this._soundRegistry.sounds[eqResult]?.url
            const matchedKit = this._soundRegistry.sounds[eqResult]?.kit_name
            const inSameKit = matchedKit === selDrumkitName
            logger.warn(TAG, `🟡 ${originalName} [${selDrumkitName}] => ${url}  (substitution vers key="${matchedKey}", ${inSameKit ? 'même kit' : `autre kit "${matchedKit}"`}, tier3)`)
            track.soundId = eqResult
            return
        }

        soundId = Utils.getRandomKey(this._soundRegistry.sounds)
        if (soundId !== null && soundId !== "" && soundId !== NOT_FOUND) {
            const url = this._soundRegistry.sounds[soundId]?.url
            logger.warn(TAG, `🔴 ${originalName} [${selDrumkitName}] => ${url}  (aléatoire, tier4)`)
            track.soundId = soundId
        } else {
            logger.warn(TAG, `🔴 ${originalName} [${selDrumkitName}] => NOT_DEFINED  (aucun match)`)
            track.soundId = "NOT_DEFINED"
        }
    }

    findSoundEquivalence = (soundId, selDrumkitName, track) => {
        if (soundId !== NOT_FOUND) return soundId;

        const instData = InstrumentsManager.DATA?.instruments?.find(i => i.id === track.name)
        const replacements = instData?.subst ? Object.values(instData.subst) : null

        if (replacements) {
            for (const targetKey of replacements) {
                let candidateId = this.getSoundIdFromKitAndTrackname(selDrumkitName, targetKey);
                if (candidateId !== NOT_FOUND) {
                    return candidateId;
                }
                candidateId = this.getSoundIdFromTrackname(targetKey);
                if (candidateId !== NOT_FOUND) {
                    return candidateId;
                }

                // Try matching via instrument synonyms (e.g., RIMSHOT has "CL" which matches "CLAP")
                const targetInst = InstrumentsManager.DATA?.instruments?.find(i => i.id === targetKey);
                if (targetInst?.name?.syn) {
                    for (const syn of targetInst.name.syn) {
                        // Use simple string synonyms (not regex patterns)
                        if (!syn.includes('.') && !syn.includes('*') && !syn.includes('^') && !syn.includes('$')) {
                            // Check if any sound key includes this synonym (reverse direction)
                            candidateId = this.getSoundIdByKeyContaining(selDrumkitName, syn);
                            if (candidateId !== NOT_FOUND) return candidateId;
                            candidateId = this.getSoundIdByKeyContaining(null, syn);
                            if (candidateId !== NOT_FOUND) return candidateId;
                        }
                    }
                }
            }
        }
        return soundId;
    }

    getSoundIdByKeyContaining = (drumkitName, searchStr) => {
        const upperSearch = searchStr.toUpperCase().trim()
        if (!upperSearch) return NOT_FOUND
        for (const [key, value] of Object.entries(this._soundRegistry.sounds)) {
            if (drumkitName && value.kit_name !== drumkitName) continue
            if (value.key?.toUpperCase().includes(upperSearch)) {
                return key
            }
        }
        return NOT_FOUND
    }

    getSoundIdFromKitAndTrackname = (drumkitName, trackName) => {
        let ret = NOT_FOUND
        for (const [key, value] of Object.entries(this._soundRegistry.sounds)) {
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
        for (const [key, sound] of Object.entries(this._soundRegistry.sounds)) {
            if (trackName.toUpperCase().trim().includes(sound.key.toUpperCase().trim())) {
                ret = key
                return ret
            }
        }
        return ret
    }


}
