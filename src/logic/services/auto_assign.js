import { appState as _appState } from '../../state/app_state.js'
import { soundRegistry as _soundRegistry } from '../../state/sound_registry.js'
import InstrumentsManager from './instruments_manager.js'
import Utils from '../../core/utils.js'
import { NOT_FOUND } from '../../core/constants.js'

export default class MfAutoAssign {
    static TAG = "MFAUTOASSIGN"
    static NOT_FOUND = NOT_FOUND
    constructor({ appState, soundRegistry } = {}) {
        this._appState = appState ?? _appState
        this._soundRegistry = soundRegistry ?? _soundRegistry
    }

    autoAssignSounds = (pattern) => {
        if (Object.keys(this._soundRegistry.sounds).length > 0) {
            Object.values(pattern.tracks).forEach((track, indexTrack) => {
                if (track.useAutoAssignSound === true && track.useSoftSynth === false) {
                    this.autoAssignTrackSounds(track, indexTrack)
                }
            })
        } else {
            console.warn("MfAutoAssign::autoAssignSounds no sounds")
        }
    }

    autoAssignTrackSounds = (track) => {
        const validInstrumentIds = InstrumentsManager.DATA?.instruments?.map(i => i.id) ?? []
        if (!validInstrumentIds.includes(track.name)) {
            const instrumentsManager = new InstrumentsManager()
            const foundInstrument = instrumentsManager.findInstrumentFromFileName(track.name)
            const newName = foundInstrument?.id
            if (newName && validInstrumentIds.includes(newName)) {
                console.warn(`Renaming track '${track.name}' to '${newName}' for auto-assign`)
                track.name = newName
            } 
        }
        
        const drumkitList = this._soundRegistry.drumkitList
        const selectedIdx = this._appState.selectedDrumkitNum
        if (!drumkitList || drumkitList.length <= selectedIdx) return

        const selDrumkitName = drumkitList[selectedIdx].name
        
        let soundId = this.getSoundIdFromKitAndTrackname(selDrumkitName, track.name)
        if (soundId == NOT_FOUND) {
            soundId = this.getSoundIdFromTrackname(track.name)
        }
        if (soundId == NOT_FOUND) {
            soundId = this.findSoundEquivalence(soundId, selDrumkitName, track)
        }
        if (soundId == NOT_FOUND) {
            soundId = Utils.getRandomKey(this._soundRegistry.sounds)
        }
        
        if (soundId === null || soundId === "" || soundId === NOT_FOUND) {
            console.error(`autoAssignTrackSounds :: No SoundID for track ${track.name}`)
            track.soundId = "NOT_DEFINED"
        } else {
            track.soundId = soundId
        }
    }

    findSoundEquivalence = (soundId, selDrumkitName, track) => {
        if (soundId !== NOT_FOUND) return soundId;

        const equivalences = {
            "RIDE": ["OHH", "CRASH"],
            "COW": ["COWBELL", "RIMSHOT"],
            "TOM": ["MTOM", "LTOM", "HTOM", "BASS", "MELO", "PERC"],
            "CRASH": ["RIDE", "CONGAS", "OHH"],
            "COWBELL": ["RIMSHOT", "RIDE", "TIMBAL", "LTOM", "COW"],
            "RIMSHOT": ["CLAP", "SNARE", "HIT", "SD"],
            "CLAP": ["LWOODBLOCK", "MELO", "RIMSHOT", "HIT", "HTOM", "SNARE"],
            "OHH": ["TAMBOURINE", "SGUIRO", "CHH", "RIDE"],
            "BASS": ["TOM", "KICK"],
            "MELO": ["PIANO", "SYNTH"],
            "SYNTHLEAD": ["ORGAN","PIANO", "SYNTH"],
            "STRINGS":["ORGAN","PIANO"],
            "HIT": ["CLAP", "RIMSHOT", "SNARE"],
            "PERC": ["TOM", "COWBELL", "CLAP"]
        };

        const replacements = equivalences[track.name];

        if (replacements) {
            for (const targetKey of replacements) {
                let candidateId = this.getSoundIdFromKitAndTrackname(selDrumkitName, targetKey);
                if (candidateId !== NOT_FOUND) {
                    return candidateId;
                }
                candidateId = this.getSoundIdFromTrackname( targetKey);
                if (candidateId !== NOT_FOUND) {
                    return candidateId;
                }
            }
        }
        return soundId;
    }

    getSoundIdFromKitAndTrackname = (drumkitName, trackName) => {
        let ret = NOT_FOUND
        for (const [key, value] of Object.entries(this._soundRegistry.sounds)) {
            if (value.kit_name === drumkitName) {
                //Allow trackName like KICK_01
                if (trackName.toUpperCase().trim().includes(value.key.toUpperCase().trim())) {
                    //console.log("getSoundIdFromKitAndTrackname match for track:", trackName, " kit:", drumkitName, " key:", sound.key)
                    ret = key
                    return ret
                }
            }
        }
        // if (ret === NOT_FOUND) {
        //     console.warn("getSoundIdFromKitAndTrackname No match for track:", trackName, " kit:", this.getKitAsText(drumkitName))
        // }
        return ret
    }

    getSoundIdFromTrackname = (trackName) => {
        let ret = NOT_FOUND
        for (const [key, sound] of Object.entries(this._soundRegistry.sounds)) {
            // console.log("getSoundIdFromAnyKitAndTrackname test for track:", trackName.toUpperCase(), " sound:", sound.key, " url:", sound.url)  
            if (trackName.toUpperCase().trim().includes(sound.key.toUpperCase().trim())) {
               // console.log("getSoundIdFromAnyKitAndTrackname match for track:", trackName.toUpperCase(),  " sound:", sound.url)
                ret = key
                return ret
            }
        }
        // if (ret === NOT_FOUND) {
        //     console.warn("getSoundIdFromAnyKitAndTrackname No match for track:", trackName)
        // }
        return ret
    }



    getKitAsText = (drumkitName) => {
        const debugtxt = Object.values(this._soundRegistry.sounds)
            .filter(sound => sound && sound.kit_name === drumkitName)
            .map(sound => `${sound.key}`)
            .join(",");

        return ` <${drumkitName} : ${debugtxt}> `;
    }



}
